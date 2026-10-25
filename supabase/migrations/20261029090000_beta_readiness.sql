-- =============================================================================
-- PL8 — Milestone 5: beta readiness
--   * in-app notifications (written only by database triggers)
--   * push notifications through the free Expo Push Service (sent with
--     pg_net when available; never contain message text)
--   * reports + moderation (remove content, suspend accounts) with reasons
--     sent to the affected person (EU Digital Services Act)
--   * account deletion and "download my data"
--   * retention clean-up (pg_cron when available) and storage clean-up list
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Optional Supabase extensions (skipped quietly where unavailable, e.g. tests)
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    execute 'create extension if not exists pg_net';
  exception when others then
    raise notice 'pg_net not available: push notifications are queued but not sent';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Account suspension (moderation)
-- -----------------------------------------------------------------------------
alter table public.profiles add column suspended_at timestamptz; -- not user-writable (explicit column grants)

create function private.is_suspended(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.suspended_at is not null from public.profiles p where p.id = uid), false);
$$;
revoke execute on function private.is_suspended(uuid) from public, anon;
grant execute on function private.is_suspended(uuid) to authenticated;

-- Suspended accounts disappear for everyone else.
drop policy profiles_select_visible on public.profiles;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (suspended_at is null and not private.is_blocked_between((select auth.uid()), id))
  );

create or replace function private.can_see_content(viewer uuid, owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select viewer = owner
      or (
        not private.is_blocked_between(viewer, owner)
        and not private.is_suspended(owner)
        and (not private.is_profile_private(owner) or private.is_following(viewer, owner))
      );
$$;

-- -----------------------------------------------------------------------------
-- Settings: push on/off
-- -----------------------------------------------------------------------------
alter table public.user_settings add column push_enabled boolean not null default true;
grant update (push_enabled) on public.user_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Push tokens + outbox
-- -----------------------------------------------------------------------------
create table public.push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant select, delete on public.push_tokens to authenticated;
create policy push_tokens_select_own on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- A phone's token belongs to whoever is signed in on it right now.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if (select count(*) from public.push_tokens t where t.user_id = uid) >= 10 then
    delete from public.push_tokens t
     where t.token = (select t2.token from public.push_tokens t2 where t2.user_id = uid order by t2.updated_at limit 1);
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create table private.push_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  tokens     text[] not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  request_id bigint
);
create index push_outbox_user_time on private.push_outbox (user_id, created_at desc);

create function private.send_push(outbox_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item private.push_outbox;
  payload jsonb;
  req bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return; -- queued only (local tests / pg_net disabled)
  end if;
  select * into item from private.push_outbox o where o.id = outbox_id;
  select jsonb_agg(jsonb_build_object(
           'to', t, 'title', item.title, 'body', item.body, 'data', item.data, 'sound', 'default'))
    into payload from unnest(item.tokens) t;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    into req
    using 'https://exp.host/--/api/v2/push/send', payload,
          '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  update private.push_outbox o set sent_at = now(), request_id = req where o.id = outbox_id;
exception when others then
  raise warning 'push send failed: %', sqlerrm; -- never break the user's action
end;
$$;

-- Queue a push in the recipient's language. Respects the push switch.
create function private.queue_push(recipient uuid, text_de text, text_en text, data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  settings public.user_settings;
  tokens text[];
  new_id bigint;
begin
  select * into settings from public.user_settings s where s.user_id = recipient;
  if not found or not settings.push_enabled then
    return;
  end if;
  select array_agg(t.token) into tokens from public.push_tokens t where t.user_id = recipient;
  if tokens is null then
    return;
  end if;
  insert into private.push_outbox (user_id, tokens, title, body, data)
  values (recipient, tokens, 'PL8', case when settings.locale = 'en' then text_en else text_de end, data)
  returning id into new_id;
  perform private.send_push(new_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create type public.notification_type as enum (
  'follow', 'follow_request', 'follow_accepted', 'like', 'comment',
  'verification_approved', 'verification_rejected', 'plate_transferred', 'plate_revoked',
  'report_resolved', 'content_removed'
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete cascade,
  type         public.notification_type not null,
  post_id      uuid references public.posts (id) on delete cascade,
  vehicle_id   uuid references public.vehicles (id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default clock_timestamp()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_own on public.notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (actor_id is null or not private.is_blocked_between((select auth.uid()), actor_id))
  );
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- Push texts per type ({name} = actor's display name).
create function private.push_text(kind public.notification_type, actor_name text, lang text)
returns text
language sql immutable set search_path = ''
as $$
  select replace(
    case lang
      when 'en' then case kind
        when 'follow' then '{name} started following you'
        when 'follow_request' then '{name} wants to follow you'
        when 'follow_accepted' then '{name} accepted your follow request'
        when 'like' then '{name} liked your post'
        when 'comment' then '{name} commented on your post'
        when 'verification_approved' then 'Your plate is verified. You can now make it findable in PL8 Search.'
        when 'verification_rejected' then 'Your plate verification was not approved.'
        when 'plate_transferred' then 'Your plate was verified for another vehicle and removed from yours.'
        when 'plate_revoked' then 'The PL8 team removed your plate.'
        when 'report_resolved' then 'Your report was reviewed. Thank you.'
        when 'content_removed' then 'Some of your content was removed for breaking the community rules.'
      end
      else case kind
        when 'follow' then '{name} folgt dir jetzt'
        when 'follow_request' then '{name} möchte dir folgen'
        when 'follow_accepted' then '{name} hat deine Folgeanfrage angenommen'
        when 'like' then '{name} gefällt dein Beitrag'
        when 'comment' then '{name} hat deinen Beitrag kommentiert'
        when 'verification_approved' then 'Dein Kennzeichen ist verifiziert. Du kannst es jetzt in der PL8 Suche auffindbar machen.'
        when 'verification_rejected' then 'Deine Kennzeichen-Verifizierung wurde nicht bestätigt.'
        when 'plate_transferred' then 'Dein Kennzeichen wurde für ein anderes Fahrzeug verifiziert und von deinem entfernt.'
        when 'plate_revoked' then 'Das PL8-Team hat dein Kennzeichen entfernt.'
        when 'report_resolved' then 'Deine Meldung wurde geprüft. Danke!'
        when 'content_removed' then 'Ein Inhalt von dir wurde wegen eines Verstoßes gegen die Community-Regeln entfernt.'
      end
    end,
    '{name}', coalesce(actor_name, 'PL8'));
$$;

create function private.notify(
  recipient uuid,
  actor uuid,
  kind public.notification_type,
  p_post uuid default null,
  p_vehicle uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor_name text;
begin
  if recipient is null or recipient = actor then
    return;
  end if;
  if actor is not null and private.is_blocked_between(recipient, actor) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, vehicle_id, data)
  values (recipient, actor, kind, p_post, p_vehicle, p_data);

  select p.display_name into actor_name from public.profiles p where p.id = actor;
  perform private.queue_push(
    recipient,
    private.push_text(kind, actor_name, 'de'),
    private.push_text(kind, actor_name, 'en'),
    jsonb_strip_nulls(jsonb_build_object('type', kind, 'post_id', p_post, 'vehicle_id', p_vehicle)) || p_data
  );
end;
$$;
revoke execute on function private.notify(uuid, uuid, public.notification_type, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.queue_push(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.send_push(bigint) from public, anon, authenticated;

-- Follow / request triggers. Accepting a request tells the requester.
create function private.on_follow_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('pl8.follow_accepted', true) = 'on' then
    perform private.notify(new.follower_id, new.followee_id, 'follow_accepted');
  else
    perform private.notify(new.followee_id, new.follower_id, 'follow');
  end if;
  return null;
end;
$$;
create trigger follows_notify after insert on public.follows
for each row execute function private.on_follow_insert();

create function private.on_follow_request_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.target_id, new.requester_id, 'follow_request');
  else
    delete from public.notifications n
     where n.type = 'follow_request' and n.recipient_id = old.target_id and n.actor_id = old.requester_id;
  end if;
  return null;
end;
$$;
create trigger follow_requests_notify after insert or delete on public.follow_requests
for each row execute function private.on_follow_request_change();

create or replace function public.respond_follow_request(p_requester uuid, p_accept boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  delete from public.follow_requests r where r.requester_id = p_requester and r.target_id = uid;
  if not found then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if p_accept and not private.is_blocked_between(uid, p_requester) then
    perform set_config('pl8.follow_accepted', 'on', true);
    insert into public.follows (follower_id, followee_id) values (p_requester, uid) on conflict do nothing;
    perform set_config('pl8.follow_accepted', 'off', true);
  end if;
end;
$$;

create or replace function private.accept_requests_when_public()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    perform set_config('pl8.follow_accepted', 'on', true);
    insert into public.follows (follower_id, followee_id)
    select r.requester_id, r.target_id from public.follow_requests r where r.target_id = new.id
    on conflict do nothing;
    perform set_config('pl8.follow_accepted', 'off', true);
    delete from public.follow_requests r where r.target_id = new.id;
  end if;
  return null;
end;
$$;

-- Likes (one notification per person and post; unliking removes it)
create function private.on_like_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    delete from public.notifications n
     where n.type = 'like' and n.actor_id = new.user_id and n.post_id = new.post_id;
    select p.author_id into author from public.posts p where p.id = new.post_id;
    perform private.notify(author, new.user_id, 'like', new.post_id);
  else
    delete from public.notifications n
     where n.type = 'like' and n.actor_id = old.user_id and n.post_id = old.post_id;
  end if;
  return null;
end;
$$;
create trigger likes_notify after insert or delete on public.likes
for each row execute function private.on_like_change();

-- Comments
create function private.on_comment_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    select p.author_id into author from public.posts p where p.id = new.post_id;
    perform private.notify(author, new.author_id, 'comment', new.post_id, null,
                           jsonb_build_object('comment_id', new.id, 'excerpt', left(new.body, 80)));
  else
    delete from public.notifications n where n.type = 'comment' and n.data ->> 'comment_id' = old.id::text;
  end if;
  return null;
end;
$$;
create trigger comments_notify after insert or delete on public.comments
for each row execute function private.on_comment_change();

-- Plate verification outcomes
create function private.on_claim_status_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'verified' then
      perform private.notify(new.user_id, null, 'verification_approved', null, new.vehicle_id);
    elsif new.status = 'rejected' then
      perform private.notify(new.user_id, null, 'verification_rejected', null, new.vehicle_id);
    elsif new.status = 'revoked' and new.revoke_reason = 'transfer' then
      perform private.notify(new.user_id, null, 'plate_transferred', null, new.vehicle_id);
    elsif new.status = 'revoked' and new.revoke_reason = 'admin' then
      perform private.notify(new.user_id, null, 'plate_revoked', null, new.vehicle_id);
    end if;
  end if;
  return null;
end;
$$;
create trigger plate_claims_notify after update of status on private.plate_claims
for each row execute function private.on_claim_status_change();

-- New messages: push only (the inbox already shows them). Never includes the
-- message text. At most one push per conversation every 30 seconds.
create function private.on_message_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
  sender_name text;
  conv_status public.conversation_status;
begin
  recipient := private.other_participant(new.conversation_id, new.sender_id);
  if recipient is null or new.sender_id is null then
    return null;
  end if;
  if exists (
    select 1 from private.push_outbox o
    where o.user_id = recipient and o.data ->> 'conversation_id' = new.conversation_id::text
      and o.created_at > now() - interval '30 seconds'
  ) then
    return null;
  end if;
  select p.display_name into sender_name from public.profiles p where p.id = new.sender_id;
  select c.status into conv_status from public.conversations c where c.id = new.conversation_id;
  perform private.queue_push(
    recipient,
    case when conv_status = 'request' then sender_name || ' möchte dir schreiben' else 'Neue Nachricht von ' || sender_name end,
    case when conv_status = 'request' then sender_name || ' wants to message you' else 'New message from ' || sender_name end,
    jsonb_build_object('type', 'message', 'conversation_id', new.conversation_id)
  );
  return null;
end;
$$;
create trigger messages_push after insert on public.messages
for each row execute function private.on_message_insert();

create function public.mark_notifications_read()
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.notifications n set read_at = now()
   where n.recipient_id = (select auth.uid()) and n.read_at is null;
$$;

-- Notification list with actor details (blocked actors left out).
create function public.my_notifications(p_before timestamptz default null, p_limit int default 30)
returns table (
  notification_id     uuid,
  type                text,
  actor_username      text,
  actor_display_name  text,
  actor_avatar_path   text,
  post_id             uuid,
  vehicle_id          uuid,
  data                jsonb,
  read                boolean,
  created_at          timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.type::text, a.username, a.display_name, a.avatar_path, n.post_id, n.vehicle_id, n.data,
         n.read_at is not null, n.created_at
  from public.notifications n
  left join public.profiles a on a.id = n.actor_id
  where n.recipient_id = (select auth.uid())
    and (n.actor_id is null or (not private.is_blocked_between(n.recipient_id, n.actor_id) and a.suspended_at is null))
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create function public.unread_notification_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.notifications n
  left join public.profiles a on a.id = n.actor_id
  where n.recipient_id = (select auth.uid()) and n.read_at is null
    and (n.actor_id is null or (not private.is_blocked_between(n.recipient_id, n.actor_id) and a.suspended_at is null));
$$;

-- -----------------------------------------------------------------------------
-- Reports and moderation
-- -----------------------------------------------------------------------------
create type public.report_target as enum ('user', 'post', 'comment', 'message', 'vehicle');
create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'nudity', 'violence', 'impersonation', 'privacy', 'illegal', 'other'
);
create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_type     public.report_target not null,
  target_id       uuid not null,
  target_owner_id uuid references public.profiles (id) on delete set null,
  reason          public.report_reason not null,
  details         text not null default '' check (char_length(details) <= 1000),
  status          public.report_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  handled_by      uuid references auth.users (id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create unique index reports_one_open_per_reporter on public.reports (reporter_id, target_type, target_id)
  where status = 'open';
create index reports_queue_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

alter table public.reports enable row level security;
revoke all on public.reports from public, anon, authenticated;
grant select on public.reports to authenticated;
create policy reports_select_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Report something you can see. Returns the report id (an existing open one
-- if you already reported it).
create function public.report_content(p_type public.report_target, p_target uuid, p_reason public.report_reason, p_details text default '')
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  new_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;

  case p_type
    when 'user' then
      select p.id into owner from public.profiles p where p.id = p_target;
    when 'post' then
      select p.author_id into owner from public.posts p
       where p.id = p_target and private.can_view_post(uid, p.id);
    when 'comment' then
      select c.author_id into owner from public.comments c
       where c.id = p_target and private.can_view_post(uid, c.post_id);
    when 'message' then
      -- Participants may report even after blocking the sender.
      select m.sender_id into owner from public.messages m
       join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = uid
       where m.id = p_target;
    when 'vehicle' then
      select v.owner_id into owner from public.vehicles v
       where v.id = p_target and (private.can_view_vehicle(uid, v.id) or private.can_view_vehicle_media(uid, v.id::text));
  end case;

  if owner is null then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if owner = uid then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, details)
  values (uid, p_type, p_target, owner, p_reason, left(btrim(coalesce(p_details, '')), 1000))
  on conflict (reporter_id, target_type, target_id) where status = 'open' do nothing
  returning id into new_id;

  if new_id is null then
    select r.id into new_id from public.reports r
     where r.reporter_id = uid and r.target_type = p_type and r.target_id = p_target and r.status = 'open';
  end if;
  return new_id;
end;
$$;

create function public.my_reports()
returns table (report_id uuid, target_type text, reason text, status text, created_at timestamptz, handled_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.target_type::text, r.reason::text, r.status::text, r.created_at, r.handled_at
  from public.reports r where r.reporter_id = (select auth.uid())
  order by r.created_at desc;
$$;

-- What a moderator needs to judge a report.
create function private.report_preview(p_type public.report_target, p_target uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case p_type
    when 'user' then (select jsonb_build_object('username', p.username, 'display_name', p.display_name,
                       'bio', p.bio, 'avatar_path', p.avatar_path, 'suspended', p.suspended_at is not null)
                      from public.profiles p where p.id = p_target)
    when 'post' then (select jsonb_build_object('caption', p.caption, 'removed', p.is_removed,
                       'media_paths', coalesce((select jsonb_agg(m.storage_path order by m.position) from public.post_media m where m.post_id = p.id), '[]'::jsonb))
                      from public.posts p where p.id = p_target)
    when 'comment' then (select jsonb_build_object('body', c.body, 'post_id', c.post_id)
                         from public.comments c where c.id = p_target)
    when 'message' then (select jsonb_build_object('body', m.body, 'sent_at', m.created_at)
                         from public.messages m where m.id = p_target)
    when 'vehicle' then (select jsonb_build_object('make', v.make, 'model', v.model, 'restricted', v.is_restricted,
                          'photo_paths', coalesce((select jsonb_agg(i.storage_path order by i.position) from public.vehicle_images i where i.vehicle_id = v.id), '[]'::jsonb))
                         from public.vehicles v where v.id = p_target)
  end;
$$;
revoke execute on function private.report_preview(public.report_target, uuid) from public, anon, authenticated;

create function public.admin_reports_queue()
returns table (
  report_id      uuid,
  target_type    text,
  target_id      uuid,
  reason         text,
  details        text,
  created_at     timestamptz,
  reporter_username text,
  owner_id       uuid,
  owner_username text,
  open_reports   integer,
  preview        jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select r.id, r.target_type::text, r.target_id, r.reason::text, r.details, r.created_at,
         rp.username, r.target_owner_id, op.username,
         (select count(*)::int from public.reports r2
           where r2.target_type = r.target_type and r2.target_id = r.target_id and r2.status = 'open'),
         private.report_preview(r.target_type, r.target_id)
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles op on op.id = r.target_owner_id
  where r.status = 'open'
  order by r.created_at;
end;
$$;

-- Resolve a report: 'dismiss', 'remove' (the reported content) or
-- 'suspend' (the owner's account). All open reports on the same target are
-- closed with the same outcome. Reporter and affected person are told.
create function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rep public.reports;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  outcome public.report_status;
  r record;
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'remove', 'suspend') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  select * into rep from public.reports x where x.id = p_report for update;
  if not found or rep.status <> 'open' then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if rep.target_owner_id = uid then
    raise exception 'PL8_SELF_REVIEW' using errcode = '42501';
  end if;
  if p_action <> 'dismiss' and (note is null or char_length(note) < 3) then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  if p_action = 'remove' then
    case rep.target_type
      when 'post' then update public.posts p set is_removed = true where p.id = rep.target_id;
      when 'comment' then delete from public.comments c where c.id = rep.target_id;
      when 'message' then delete from public.messages m where m.id = rep.target_id;
      when 'vehicle' then update public.vehicles v set is_restricted = true where v.id = rep.target_id;
      when 'user' then raise exception 'PL8_INVALID_STATE' using errcode = 'P0001'; -- use 'suspend'
    end case;
    perform private.notify(rep.target_owner_id, null, 'content_removed', null, null,
                           jsonb_build_object('target_type', rep.target_type, 'reason', rep.reason, 'note', note));
  elsif p_action = 'suspend' then
    update public.profiles p set suspended_at = now() where p.id = rep.target_owner_id;
    update public.vehicles v set is_restricted = true where v.owner_id = rep.target_owner_id;
    update auth.users u set banned_until = 'infinity' where u.id = rep.target_owner_id;
  end if;

  outcome := case when p_action = 'dismiss' then 'dismissed'::public.report_status else 'actioned'::public.report_status end;

  for r in
    update public.reports x
       set status = outcome, resolution_note = note, handled_by = uid, handled_at = now()
     where x.target_type = rep.target_type and x.target_id = rep.target_id and x.status = 'open'
    returning x.reporter_id
  loop
    perform private.notify(r.reporter_id, null, 'report_resolved', null, null, jsonb_build_object('outcome', outcome));
  end loop;

  insert into private.admin_actions (admin_id, action, target_type, target_id, reason, metadata)
  values (uid, 'report_' || p_action, rep.target_type::text, rep.target_id, note,
          jsonb_build_object('report_id', rep.id, 'reason', rep.reason, 'owner_id', rep.target_owner_id));
end;
$$;

create function public.admin_unsuspend_user(p_user uuid, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  update public.profiles p set suspended_at = null where p.id = p_user;
  -- Vehicles come back, except ones a moderator removed on their own.
  update public.vehicles v set is_restricted = false
   where v.owner_id = p_user
     and not exists (select 1 from private.admin_actions a
                      where a.action = 'report_remove' and a.target_type = 'vehicle' and a.target_id = v.id);
  update auth.users u set banned_until = null where u.id = p_user;
  insert into private.admin_actions (admin_id, action, target_type, target_id, reason)
  values (uid, 'user_unsuspended', 'user', p_user, p_note);
end;
$$;

-- Moderators can see and delete files in every bucket (to review reports and
-- clean up orphans).
create policy admin_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('post-media', 'vehicle-photos', 'avatars') and private.is_admin((select auth.uid())));
create policy admin_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('post-media', 'vehicle-photos', 'avatars', 'verification-evidence')
         and private.is_admin((select auth.uid())));

-- Files nothing points to any more (deleted accounts, drafts, replaced photos).
create function public.admin_orphaned_files(p_limit int default 500)
returns table (bucket text, path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select o.bucket_id, o.name
  from storage.objects o
  where o.created_at < now() - interval '1 day'
    and (
      (o.bucket_id = 'post-media'
        and not exists (select 1 from public.post_media m where m.storage_path = o.name))
      or (o.bucket_id = 'vehicle-photos'
        and not exists (select 1 from public.vehicle_images i where i.storage_path = o.name))
      or (o.bucket_id = 'avatars'
        and not exists (select 1 from public.profiles p where p.avatar_path = o.name))
      or (o.bucket_id = 'verification-evidence'
        and not exists (
          select 1 from private.verification_requests r
          where r.id = private.try_uuid((storage.foldername(o.name))[2])
            and r.status in ('awaiting_evidence', 'submitted')))
    )
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-- -----------------------------------------------------------------------------
-- Account deletion. The app deletes the user's files through the Storage API
-- first (owners may delete their own files), then calls this.
-- Everything linked to the account is removed by ON DELETE CASCADE; messages
-- the person sent stay for the other side but lose their sender.
-- -----------------------------------------------------------------------------
create function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  update storage.objects o set owner = null where o.owner = uid;
  delete from auth.users u where u.id = uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Right of access: everything PL8 stores about you, as JSON.
-- -----------------------------------------------------------------------------
create function public.export_my_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (select (select auth.uid()) as id)
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                from auth.users u, me where u.id = me.id),
    'consent', (select to_jsonb(c) - 'user_id' from private.user_consents c, me where c.user_id = me.id),
    'profile', (select to_jsonb(p) from public.profiles p, me where p.id = me.id),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s, me where s.user_id = me.id),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(v) || jsonb_build_object(
                   'photos', (select coalesce(jsonb_agg(i.storage_path), '[]'::jsonb) from public.vehicle_images i where i.vehicle_id = v.id)))
                 from public.vehicles v, me where v.owner_id = me.id), '[]'::jsonb),
    'plates', coalesce((select jsonb_agg(jsonb_build_object('plate', c.plate, 'country', c.country, 'status', c.status,
                   'discoverable', c.discoverable, 'show_owner', c.show_owner, 'created_at', c.created_at, 'verified_at', c.verified_at))
                 from private.plate_claims c, me where c.user_id = me.id), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'caption', p.caption, 'published_at', p.published_at,
                   'photos', (select coalesce(jsonb_agg(m.storage_path), '[]'::jsonb) from public.post_media m where m.post_id = p.id)))
                 from public.posts p, me where p.author_id = me.id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('post_id', c.post_id, 'body', c.body, 'created_at', c.created_at))
                 from public.comments c, me where c.author_id = me.id), '[]'::jsonb),
    'likes', coalesce((select jsonb_agg(jsonb_build_object('post_id', l.post_id, 'created_at', l.created_at))
                 from public.likes l, me where l.user_id = me.id), '[]'::jsonb),
    'saved_posts', coalesce((select jsonb_agg(s.post_id) from public.saved_posts s, me where s.user_id = me.id), '[]'::jsonb),
    'following', coalesce((select jsonb_agg(p.username) from public.follows f join public.profiles p on p.id = f.followee_id, me
                 where f.follower_id = me.id), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(p.username) from public.follows f join public.profiles p on p.id = f.follower_id, me
                 where f.followee_id = me.id), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(p.username) from public.blocks b join public.profiles p on p.id = b.blocked_id, me
                 where b.blocker_id = me.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id,
                   'from_me', m.sender_id = me.id, 'body', m.body, 'sent_at', m.created_at) order by m.created_at)
                 from public.messages m
                 join public.conversation_participants cp on cp.conversation_id = m.conversation_id, me
                 where cp.user_id = me.id), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('target_type', r.target_type, 'reason', r.reason,
                   'status', r.status, 'created_at', r.created_at))
                 from public.reports r, me where r.reporter_id = me.id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'created_at', n.created_at))
                 from public.notifications n, me where n.recipient_id = me.id), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Retention (runs daily via pg_cron when available)
-- -----------------------------------------------------------------------------
create function private.run_retention()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications n
   where (n.read_at is not null and n.created_at < now() - interval '90 days')
      or n.created_at < now() - interval '180 days';
  delete from private.push_outbox o where o.created_at < now() - interval '7 days';
  delete from private.search_log l where l.created_at < now() - interval '30 days';
  delete from private.claim_log l where l.created_at < now() - interval '30 days';
  -- Unfinished drafts (upload interrupted)
  delete from public.posts p where p.published_at is null and p.created_at < now() - interval '1 day';
  update private.verification_requests r set status = 'expired'
   where r.status = 'awaiting_evidence' and r.created_at < now() - interval '7 days';
  -- Closed reports are kept one year as a record of moderation decisions.
  delete from public.reports r where r.status <> 'open' and r.handled_at < now() - interval '365 days';
end;
$$;
revoke execute on function private.run_retention() from public, anon, authenticated;

do $$
begin
  begin
    execute 'create extension if not exists pg_cron';
    execute $cron$select cron.schedule('pl8-retention', '17 3 * * *', 'select private.run_retention()')$cron$;
  exception when others then
    raise notice 'pg_cron not available: run select private.run_retention() manually or enable pg_cron';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants + realtime
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.register_push_token(text, text)',
    'public.mark_notifications_read()',
    'public.my_notifications(timestamptz, int)',
    'public.unread_notification_count()',
    'public.report_content(public.report_target, uuid, public.report_reason, text)',
    'public.my_reports()',
    'public.admin_reports_queue()',
    'public.admin_resolve_report(uuid, text, text)',
    'public.admin_unsuspend_user(uuid, text)',
    'public.admin_orphaned_files(int)',
    'public.delete_my_account()',
    'public.export_my_data()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

revoke all on all tables in schema private from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
