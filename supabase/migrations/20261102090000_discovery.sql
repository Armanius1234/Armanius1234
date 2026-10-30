-- PL8 — Milestone 8: discovery
--
--   * search people by username or name
--   * search cars by make / model / generation (never shows plates)
--   * suggested people (followed by people you follow, same car make, popular)
--   * @mentions in posts and comments, with a notification
--
-- Every result follows the same visibility rules as the rest of the app
-- (blocks, suspensions, missing consent, private profiles).
-- -----------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'mention';

-- -----------------------------------------------------------------------------
-- Fast "contains" search: trigram indexes, if pg_trgm is available (it is on
-- Supabase). Without it the searches still work, just without the index.
-- -----------------------------------------------------------------------------
do $$
declare
  trgm_schema text;
begin
  begin
    execute 'create extension if not exists pg_trgm with schema extensions';
  exception when others then
    begin
      execute 'create extension if not exists pg_trgm';
    exception when others then
      raise notice 'pg_trgm not available: searches work without the trigram index';
    end;
  end;
  select n.nspname into trgm_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if trgm_schema is not null then
    execute format('create index if not exists profiles_username_trgm on public.profiles using gin (username %I.gin_trgm_ops)', trgm_schema);
    execute format('create index if not exists profiles_display_name_trgm on public.profiles using gin (lower(display_name) %I.gin_trgm_ops)', trgm_schema);
    execute format($i$create index if not exists vehicles_search_trgm on public.vehicles
                      using gin (lower(make || ' ' || model || ' ' || coalesce(generation, '')) %I.gin_trgm_ops)$i$, trgm_schema);
  end if;
end;
$$;

-- LIKE pattern from user text: \, % and _ are taken literally.
create function private.like_escape(t text)
returns text
language sql immutable set search_path = ''
as $$
  select replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_');
$$;
revoke execute on function private.like_escape(text) from public, anon;
grant execute on function private.like_escape(text) to authenticated;

-- -----------------------------------------------------------------------------
-- People search
-- -----------------------------------------------------------------------------
create function public.search_people(p_query text, p_limit int default 20)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_path    text,
  is_private     boolean,
  follower_count integer,
  i_follow       boolean
)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q text := lower(btrim(coalesce(p_query, '')));
  pat text;
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
  picked uuid[] := '{}';
  cur refcursor;
  r_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  q := ltrim(q, '@');
  if char_length(q) < 2 or char_length(q) > 50 then
    return;
  end if;
  pat := '%' || private.like_escape(q) || '%';

  -- Best matches first (exact name, then names starting with it, then the
  -- most followed); the visibility check runs one person at a time until the
  -- page is full (a common word can match thousands of people).
  open cur for
    select p.id from public.profiles p
    where (p.username like pat or lower(p.display_name) like pat)
      and p.suspended_at is null
    order by (p.username = q) desc,
             (p.username like private.like_escape(q) || '%') desc,
             p.follower_count desc,
             p.username;
  loop
    fetch cur into r_id;
    exit when not found;
    if not private.is_blocked_between(uid, r_id) then
      picked := picked || r_id;
      exit when cardinality(picked) >= n;
    end if;
  end loop;
  close cur;

  return query
  select p.id, p.username, p.display_name, p.avatar_path, p.is_private, p.follower_count,
         private.is_following(uid, p.id)
  from unnest(picked) with ordinality as x(id, ord)
  join public.profiles p on p.id = x.id
  order by x.ord;
end;
$$;

-- -----------------------------------------------------------------------------
-- Car search: every word must appear in "make model generation".
-- Checks visibility one car at a time and stops when the page is full.
-- -----------------------------------------------------------------------------
create function public.search_vehicles(p_query text, p_limit int default 20)
returns table (
  vehicle_id         uuid,
  make               text,
  model              text,
  generation         text,
  model_year         smallint,
  is_verified        boolean,
  cover_path         text,
  owner_username     text,
  owner_display_name text
)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q text := lower(btrim(coalesce(p_query, '')));
  words text[];
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
  picked uuid[] := '{}';
  cur refcursor;
  r_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if char_length(q) < 2 or char_length(q) > 60 then
    return;
  end if;
  words := (select array_agg(w) from (
              select w from unnest(regexp_split_to_array(q, '\s+')) w where w <> '' limit 4) x);

  open cur for
    select v.id from public.vehicles v
    where v.visibility = 'public' and not v.is_restricted
      and lower(v.make || ' ' || v.model || ' ' || coalesce(v.generation, ''))
          like '%' || private.like_escape(words[1]) || '%'
      and not exists (
        select 1 from unnest(words) w
        where lower(v.make || ' ' || v.model || ' ' || coalesce(v.generation, ''))
              not like '%' || private.like_escape(w) || '%')
    order by (lower(v.make) = words[1]) desc, v.is_verified desc, v.model_year desc, v.id;
  loop
    fetch cur into r_id;
    exit when not found;
    if private.can_view_vehicle(uid, r_id) then
      picked := picked || r_id;
      exit when cardinality(picked) >= n;
    end if;
  end loop;
  close cur;

  return query
  select v.id, v.make, v.model, v.generation, v.model_year, v.is_verified,
         (select i.storage_path from public.vehicle_images i
           where i.vehicle_id = v.id order by i.position, i.created_at limit 1),
         o.username, o.display_name
  from unnest(picked) with ordinality as x(id, ord)
  join public.vehicles v on v.id = x.id
  join public.profiles o on o.id = v.owner_id
  order by x.ord;
end;
$$;

-- -----------------------------------------------------------------------------
-- Suggested people
--   1. followed by people you follow (the more, the higher)
--   2. driving the same make as one of your cars
--   3. popular public accounts (so new members see someone)
-- Never: yourself, people you follow or asked to follow, blocked, locked.
-- -----------------------------------------------------------------------------
create function public.suggested_people(p_limit int default 10)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_path    text,
  is_private     boolean,
  reason         text,
  mutual_count   integer,
  mutual_example text,
  shared_make    text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n int := least(greatest(coalesce(p_limit, 10), 1), 30);
  found_count int := 0;
  r record;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Ranked candidates (cheap), then the visibility check one at a time.
  for r in
    with mine as (select f.followee_id as id from public.follows f where f.follower_id = uid),
    fof as (
      select f2.followee_id as id, count(*)::int as mutual, min(m.username) as example
      from public.follows f1
      join public.follows f2 on f2.follower_id = f1.followee_id
      join public.profiles m on m.id = f1.followee_id
      where f1.follower_id = uid
        and m.suspended_at is null  -- a suspended account is never named
      group by f2.followee_id
    ),
    my_makes as (select distinct lower(v.make) as make from public.vehicles v where v.owner_id = uid),
    same_make as (
      select v.owner_id as id, min(v.make) as make
      from public.vehicles v join my_makes mm on mm.make = lower(v.make)
      where v.visibility = 'public' and not v.is_restricted
      group by v.owner_id
    ),
    popular as (
      select p.id from public.profiles p
      where not p.is_private and p.suspended_at is null
      order by p.follower_count desc, p.created_at
      limit 100
    ),
    candidates as (
      select c.id,
             coalesce(max(fof.mutual), 0) as mutual,
             max(fof.example) as example,
             max(sm.make) as make
      from (select id from fof union select id from same_make union select id from popular) c
      left join fof on fof.id = c.id
      left join same_make sm on sm.id = c.id
      group by c.id
    )
    select p.id, p.username, p.display_name, p.avatar_path, p.is_private,
           c.mutual, c.example, c.make
    from candidates c
    join public.profiles p on p.id = c.id
    where p.id <> uid
      and p.suspended_at is null
      and not exists (select 1 from mine where mine.id = p.id)
      and not exists (select 1 from public.follow_requests fr where fr.requester_id = uid and fr.target_id = p.id)
    order by c.mutual * 10 + (case when c.make is not null then 5 else 0 end) desc,
             p.follower_count desc, p.username
  loop
    continue when private.is_blocked_between(uid, r.id);
    user_id := r.id;
    username := r.username;
    display_name := r.display_name;
    avatar_path := r.avatar_path;
    is_private := r.is_private;
    reason := case when r.mutual > 0 then 'followed_by' when r.make is not null then 'same_make' else 'popular' end;
    mutual_count := r.mutual;
    mutual_example := r.example;
    shared_make := r.make;
    return next;
    found_count := found_count + 1;
    exit when found_count >= n;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- @mentions
-- -----------------------------------------------------------------------------
-- Usernames written as @name in a text (at most 5, lowercase, no duplicates).
-- "@" right after a letter or digit (e-mail addresses) does not count.
create function private.mentioned_usernames(t text)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array(
    select distinct lower(m[1])
    from regexp_matches(coalesce(t, ''), '(?:^|[^A-Za-z0-9_.@])@([A-Za-z0-9][A-Za-z0-9._]{1,28}[A-Za-z0-9])', 'g') as m
    limit 5), '{}'::text[]);
$$;
revoke execute on function private.mentioned_usernames(text) from public, anon, authenticated;

-- Notifies people newly mentioned in a post caption or comment. Only people who
-- can see the post (and its author) are told; nobody is told twice.
create function private.notify_mentions(p_author uuid, p_text text, p_old_text text, p_post uuid, p_comment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  post_author uuid;
  name text;
  target uuid;
begin
  select p.author_id into post_author from public.posts p where p.id = p_post;
  foreach name in array private.mentioned_usernames(p_text) loop
    continue when name = any(private.mentioned_usernames(p_old_text));
    select pr.id into target from public.profiles pr where pr.username = name;
    continue when target is null or target = p_author;
    -- The post's author already gets a "comment" notification for comments.
    continue when p_comment is not null and target = post_author;
    continue when not private.can_see_content(target, post_author)
               or not private.can_see_content(target, p_author);
    continue when exists (
      select 1 from public.notifications n
      where n.type = 'mention' and n.recipient_id = target and n.actor_id = p_author and n.post_id = p_post
        and (n.data ->> 'comment_id') is not distinct from p_comment::text);
    perform private.notify(target, p_author, 'mention', p_post, null,
      jsonb_strip_nulls(jsonb_build_object('comment_id', p_comment, 'excerpt', left(p_text, 80))));
  end loop;
end;
$$;
revoke execute on function private.notify_mentions(uuid, text, text, uuid, uuid) from public, anon, authenticated;

create function private.on_post_mentions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published_at is null or new.is_removed then
    return null;
  end if;
  perform private.notify_mentions(
    new.author_id, new.caption,
    case when tg_op = 'UPDATE' and old.published_at is not null then old.caption else '' end,
    new.id, null);
  return null;
end;
$$;
revoke execute on function private.on_post_mentions() from public, anon, authenticated;
create trigger posts_mentions after insert or update of published_at, caption on public.posts
for each row execute function private.on_post_mentions();

create function private.on_comment_mentions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_mentions(new.author_id, new.body, '', new.post_id, new.id);
  else
    delete from public.notifications n where n.type = 'mention' and n.data ->> 'comment_id' = old.id::text;
  end if;
  return null;
end;
$$;
revoke execute on function private.on_comment_mentions() from public, anon, authenticated;
create trigger comments_mentions after insert or delete on public.comments
for each row execute function private.on_comment_mentions();

-- Deleting a comment removes its mention notifications (indexed lookup).
create index notifications_comment_ref_idx on public.notifications ((data ->> 'comment_id'));

-- Push: mentions follow the "comments" switch. Text for the new type.
create or replace function private.queue_push(recipient uuid, text_de text, text_en text, data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  settings public.user_settings;
  tokens text[];
  new_id bigint;
  kind text := data ->> 'type';
begin
  select * into settings from public.user_settings s where s.user_id = recipient;
  if not found or not settings.push_enabled then
    return;
  end if;
  if (kind = 'like' and not settings.push_likes)
     or (kind in ('comment', 'mention') and not settings.push_comments)
     or (kind in ('follow', 'follow_request', 'follow_accepted') and not settings.push_follows)
     or (kind = 'message' and not settings.push_messages) then
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
revoke execute on function private.queue_push(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function private.push_text(kind public.notification_type, actor_name text, lang text)
returns text
language sql immutable set search_path = ''
as $$
  select replace(
    case lang
      when 'en' then case kind::text
        when 'follow' then '{name} started following you'
        when 'follow_request' then '{name} wants to follow you'
        when 'follow_accepted' then '{name} accepted your follow request'
        when 'like' then '{name} liked your post'
        when 'comment' then '{name} commented on your post'
        when 'mention' then '{name} mentioned you'
        when 'verification_approved' then 'Your plate is verified. You can now make it findable in PL8 Search.'
        when 'verification_rejected' then 'Your plate verification was not approved.'
        when 'plate_transferred' then 'Your plate was verified for another vehicle and removed from yours.'
        when 'plate_revoked' then 'The PL8 team removed your plate.'
        when 'report_resolved' then 'Your report was reviewed. Thank you.'
        when 'content_removed' then 'Some of your content was removed for breaking the community rules.'
        when 'account_suspended' then 'Your PL8 account was suspended. Open the app to see why and to appeal.'
        when 'appeal_decided' then 'Your appeal was reviewed. Open the app to see the result.'
      end
      else case kind::text
        when 'follow' then '{name} folgt dir jetzt'
        when 'follow_request' then '{name} möchte dir folgen'
        when 'follow_accepted' then '{name} hat deine Folgeanfrage angenommen'
        when 'like' then '{name} gefällt dein Beitrag'
        when 'comment' then '{name} hat deinen Beitrag kommentiert'
        when 'mention' then '{name} hat dich erwähnt'
        when 'verification_approved' then 'Dein Kennzeichen ist verifiziert. Du kannst es jetzt in der PL8 Suche auffindbar machen.'
        when 'verification_rejected' then 'Deine Kennzeichen-Verifizierung wurde nicht bestätigt.'
        when 'plate_transferred' then 'Dein Kennzeichen wurde für ein anderes Fahrzeug verifiziert und von deinem entfernt.'
        when 'plate_revoked' then 'Das PL8-Team hat dein Kennzeichen entfernt.'
        when 'report_resolved' then 'Deine Meldung wurde geprüft. Danke!'
        when 'content_removed' then 'Ein Inhalt von dir wurde wegen eines Verstoßes gegen die Community-Regeln entfernt.'
        when 'account_suspended' then 'Dein PL8-Konto wurde gesperrt. Öffne die App, um den Grund zu sehen und Einspruch einzulegen.'
        when 'appeal_decided' then 'Dein Einspruch wurde geprüft. Öffne die App für das Ergebnis.'
      end
    end,
    '{name}', coalesce(actor_name, 'PL8'));
$$;

-- -----------------------------------------------------------------------------
-- Unread notification badge: the app shows "99+" above 99, so counting stops
-- at 100 (a popular member with hundreds of unread comments made the full
-- count slow: ~90 ms in scripts/perf-db.sh).
--
-- It hides the same notifications as private.is_blocked_between (blocked
-- either way, or one side locked), written as one query: calling that
-- function once per notification still took ~25 ms for 100 rows.
-- A locked recipient (suspended, or no consent yet) still counts the
-- notifications without an actor, e.g. "your account was suspended".
-- -----------------------------------------------------------------------------
create or replace function public.unread_notification_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from (
    select 1 from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    where n.recipient_id = (select auth.uid()) and n.read_at is null
      and (n.actor_id is null or (
        not (select private.is_locked(auth.uid()))
        and a.suspended_at is null
        and exists (select 1 from private.user_consents c where c.user_id = n.actor_id)
        and not exists (
          select 1 from public.blocks bl
          where (bl.blocker_id = n.recipient_id and bl.blocked_id = n.actor_id)
             or (bl.blocker_id = n.actor_id and bl.blocked_id = n.recipient_id))))
    limit 100) x;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.search_people(text, int)',
    'public.search_vehicles(text, int)',
    'public.suggested_people(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
