-- =============================================================================
-- PL8 — Milestone 4: messaging
--   * one-to-one conversations (one per pair of people)
--   * message requests: people you don't follow land in "Requests"; they can
--     send ONE message until you accept (replying also accepts)
--   * the recipient's messaging_policy is enforced:
--       everyone  → anyone may send a request
--       followers → only people the recipient follows may write
--       nobody    → nobody new may start a conversation
--   * blocking hides conversations and stops sending, both ways
--   * unread counts via last_read_at; realtime via the supabase_realtime
--     publication (Realtime applies the same RLS as normal reads)
-- Messages are private to the two participants. They are not end-to-end
-- encrypted (stated in the privacy policy).
-- =============================================================================

create type public.conversation_status as enum ('request', 'active', 'declined');

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references public.profiles (id) on delete set null,
  -- "<smaller uuid>:<larger uuid>" keeps one conversation per pair.
  pair_key        text not null unique,
  status          public.conversation_status not null default 'request',
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  -- '-infinity' = never read. Times use clock_timestamp() so that several
  -- actions inside one transaction still get distinct, ordered times.
  last_read_at    timestamptz not null default '-infinity',
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint messages_body check (char_length(btrim(body)) between 1 and 2000 and body = btrim(body))
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- The other person in a conversation.
create function private.other_participant(cid uuid, me uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.user_id from public.conversation_participants p
  where p.conversation_id = cid and p.user_id <> me
  limit 1;
$$;
revoke execute on function private.other_participant(uuid, uuid) from public, anon;
grant execute on function private.other_participant(uuid, uuid) to authenticated;

-- Participant, and nobody blocked anybody.
create function private.can_access_conversation(uid uuid, cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = cid and p.user_id = uid
  )
  and not coalesce(private.is_blocked_between(uid, private.other_participant(cid, uid)), false);
$$;
revoke execute on function private.can_access_conversation(uuid, uuid) from public, anon;
grant execute on function private.can_access_conversation(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: read-only for participants; every write goes through the RPCs below.
-- -----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from public, anon, authenticated;
revoke all on public.conversation_participants from public, anon, authenticated;
revoke all on public.messages from public, anon, authenticated;
grant select on public.conversations, public.conversation_participants, public.messages to authenticated;
-- Unsend your own message.
grant delete on public.messages to authenticated;

create policy conversations_select on public.conversations
  for select to authenticated
  using (private.can_access_conversation((select auth.uid()), id));

create policy participants_select on public.conversation_participants
  for select to authenticated
  using (private.can_access_conversation((select auth.uid()), conversation_id));

create policy messages_select on public.messages
  for select to authenticated
  using (private.can_access_conversation((select auth.uid()), conversation_id));

create policy messages_delete_own on public.messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Open (or find) the conversation with someone. Applies their messaging policy.
create function public.start_conversation(p_target uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  key text;
  existing public.conversations;
  policy public.messaging_policy;
  they_follow_me boolean;
  new_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_target = uid then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target)
     or private.is_blocked_between(uid, p_target) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;

  key := least(uid::text, p_target::text) || ':' || greatest(uid::text, p_target::text);
  perform pg_advisory_xact_lock(hashtextextended('conv:' || key, 0));

  select * into existing from public.conversations c where c.pair_key = key;
  if found then
    -- A declined request cannot be reopened by the person who sent it.
    if existing.status = 'declined' and existing.created_by = uid then
      raise exception 'PL8_MESSAGING_CLOSED' using errcode = 'P0001';
    end if;
    if existing.status = 'declined' then
      update public.conversations c set status = 'active', created_by = uid where c.id = existing.id;
    end if;
    return existing.id;
  end if;

  select s.messaging_policy into policy from public.user_settings s where s.user_id = p_target;
  they_follow_me := private.is_following(p_target, uid);

  if coalesce(policy, 'everyone') = 'nobody'
     or (policy = 'followers' and not they_follow_me) then
    raise exception 'PL8_MESSAGING_CLOSED' using errcode = 'P0001';
  end if;

  if (select count(*) from public.conversations c
       where c.created_by = uid and c.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.conversations (created_by, pair_key, status)
  values (uid, key, case when they_follow_me then 'active'::public.conversation_status else 'request'::public.conversation_status end)
  returning id into new_id;

  insert into public.conversation_participants (conversation_id, user_id, last_read_at)
  values (new_id, uid, clock_timestamp()), (new_id, p_target, '-infinity');
  return new_id;
end;
$$;

-- Send a message. While a request is pending, its sender may send one message.
-- When the recipient replies, the request is accepted.
create function public.send_message(p_conversation uuid, p_body text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  conv public.conversations;
  body text := btrim(coalesce(p_body, ''));
  new_id uuid;
begin
  if not private.can_access_conversation(uid, p_conversation) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if char_length(body) not between 1 and 2000 then
    raise exception 'PL8_INVALID_MESSAGE' using errcode = 'P0001';
  end if;

  select * into conv from public.conversations c where c.id = p_conversation for update;

  if conv.status = 'declined' then
    raise exception 'PL8_MESSAGING_CLOSED' using errcode = 'P0001';
  end if;
  if conv.status = 'request' then
    if conv.created_by = uid then
      if exists (select 1 from public.messages m where m.conversation_id = p_conversation and m.sender_id = uid) then
        raise exception 'PL8_REQUEST_PENDING' using errcode = 'P0001';
      end if;
    else
      update public.conversations c set status = 'active' where c.id = p_conversation;
    end if;
  end if;

  if (select count(*) from public.messages m
       where m.sender_id = uid and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (p_conversation, uid, body)
  returning id into new_id;
  update public.conversations c set last_message_at = clock_timestamp() where c.id = p_conversation;
  update public.conversation_participants p set last_read_at = clock_timestamp()
   where p.conversation_id = p_conversation and p.user_id = uid;
  return new_id;
end;
$$;

-- Accept or decline a request addressed to you.
create function public.respond_message_request(p_conversation uuid, p_accept boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  conv public.conversations;
begin
  if not private.can_access_conversation(uid, p_conversation) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  select * into conv from public.conversations c where c.id = p_conversation for update;
  if conv.status <> 'request' or conv.created_by = uid then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  update public.conversations c
     set status = case when p_accept then 'active'::public.conversation_status else 'declined'::public.conversation_status end
   where c.id = p_conversation;
end;
$$;

create function public.mark_conversation_read(p_conversation uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.conversation_participants p
     set last_read_at = clock_timestamp()
   where p.conversation_id = p_conversation and p.user_id = (select auth.uid());
$$;

-- Your inbox: one row per conversation with the other person, the latest
-- message, the unread count and whether it is a request waiting for you.
-- Conversations with blocked people and empty ones are left out.
create function public.my_conversations()
returns table (
  conversation_id     uuid,
  status              text,
  is_request_for_me   boolean,
  other_id            uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_path   text,
  last_message        text,
  last_message_mine   boolean,
  last_message_at     timestamptz,
  unread_count        integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id,
         c.status::text,
         (c.status = 'request' and c.created_by is distinct from me.user_id),
         o.id, o.username, o.display_name, o.avatar_path,
         lm.body, lm.sender_id = me.user_id, c.last_message_at,
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.sender_id is distinct from me.user_id
             and m.created_at > me.last_read_at)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other_p
    on other_p.conversation_id = c.id and other_p.user_id <> me.user_id
  join public.profiles o on o.id = other_p.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and c.status <> 'declined'
    and c.last_message_at is not null
    and not private.is_blocked_between(me.user_id, o.id)
    -- A request only appears for the recipient once it has a message.
  order by c.last_message_at desc;
$$;

-- Unread messages in accepted conversations (for the tab badge).
create function public.unread_message_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(x.unread_count), 0)::int
  from public.my_conversations() x
  where x.status = 'active';
$$;

-- Details of one conversation for the chat screen.
create function public.conversation_info(p_conversation uuid)
returns table (
  conversation_id    uuid,
  status             text,
  is_request_for_me  boolean,
  i_sent_request     boolean,
  other_id           uuid,
  other_username     text,
  other_display_name text,
  other_avatar_path  text,
  other_last_read_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not private.can_access_conversation(uid, p_conversation) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  return query
  select c.id, c.status::text,
         c.status = 'request' and c.created_by is distinct from uid,
         c.status = 'request' and c.created_by = uid,
         o.id, o.username, o.display_name, o.avatar_path, op.last_read_at
  from public.conversations c
  join public.conversation_participants op on op.conversation_id = c.id and op.user_id <> uid
  join public.profiles o on o.id = op.user_id
  where c.id = p_conversation;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.start_conversation(uuid)',
    'public.send_message(uuid, text)',
    'public.respond_message_request(uuid, boolean)',
    'public.mark_conversation_read(uuid)',
    'public.my_conversations()',
    'public.unread_message_count()',
    'public.conversation_info(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: stream new messages (RLS decides who receives them).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
