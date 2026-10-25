-- =============================================================================
-- PL8 — Milestone 3: social network
--   * follows + follow requests (private accounts)
--   * posts with photos (draft → publish), likes, comments, saved posts
--   * feeds: home (people you follow), discover, profile, saved, single post
--
-- Who may see what is decided in one place: private.can_see_content().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Counters on profiles (maintained by triggers; not writable by users because
-- profile column grants are explicit)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column follower_count  integer not null default 0,
  add column following_count integer not null default 0,
  add column post_count      integer not null default 0;

-- -----------------------------------------------------------------------------
-- Follows
-- -----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);
create index follows_follower_idx on public.follows (follower_id, created_at desc);

create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_requests_not_self check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

create function private.is_following(follower uuid, followee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.follower_id = follower and f.followee_id = followee);
$$;
revoke execute on function private.is_following(uuid, uuid) from public, anon;
grant execute on function private.is_following(uuid, uuid) to authenticated;

-- May `viewer` see content (posts, garage) of `owner`?
-- Yes for yourself; otherwise nobody blocked anybody and the account is
-- public, or the viewer is an approved follower.
create function private.can_see_content(viewer uuid, owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select viewer = owner
      or (
        not private.is_blocked_between(viewer, owner)
        and (not private.is_profile_private(owner) or private.is_following(viewer, owner))
      );
$$;
revoke execute on function private.can_see_content(uuid, uuid) from public, anon;
grant execute on function private.can_see_content(uuid, uuid) to authenticated;

alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;
grant select, delete on public.follows to authenticated;

-- Your own relationships only; lists go through list_follows().
create policy follows_select_own on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
-- Unfollow, or remove a follower.
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

alter table public.follow_requests enable row level security;
revoke all on public.follow_requests from public, anon, authenticated;
grant select, delete on public.follow_requests to authenticated;

create policy follow_requests_select_own on public.follow_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));
create policy follow_requests_delete_own on public.follow_requests
  for delete to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

-- Counters
create function private.follows_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end;
$$;
create trigger follows_count after insert or delete on public.follows
for each row execute function private.follows_count();

-- Blocking ends every relationship between the two people.
create function private.block_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.follows f
   where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
      or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  delete from public.follow_requests r
   where (r.requester_id = new.blocker_id and r.target_id = new.blocked_id)
      or (r.requester_id = new.blocked_id and r.target_id = new.blocker_id);
  return null;
end;
$$;
create trigger blocks_cleanup after insert on public.blocks
for each row execute function private.block_cleanup();

-- Switching a private account to public approves all pending requests.
create function private.accept_requests_when_public()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    insert into public.follows (follower_id, followee_id)
    select r.requester_id, r.target_id from public.follow_requests r where r.target_id = new.id
    on conflict do nothing;
    delete from public.follow_requests r where r.target_id = new.id;
  end if;
  return null;
end;
$$;
create trigger profiles_public_accepts after update of is_private on public.profiles
for each row execute function private.accept_requests_when_public();

-- -----------------------------------------------------------------------------
-- Follow RPCs
-- -----------------------------------------------------------------------------
create function public.follow_user(p_target uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  recent int;
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
  if private.is_following(uid, p_target) then
    return 'following';
  end if;

  select (select count(*) from public.follows f where f.follower_id = uid and f.created_at > now() - interval '24 hours')
       + (select count(*) from public.follow_requests r where r.requester_id = uid and r.created_at > now() - interval '24 hours')
    into recent;
  if recent >= 200 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  if private.is_profile_private(p_target) then
    insert into public.follow_requests (requester_id, target_id) values (uid, p_target)
    on conflict do nothing;
    return 'requested';
  end if;
  insert into public.follows (follower_id, followee_id) values (uid, p_target) on conflict do nothing;
  return 'following';
end;
$$;

-- Unfollow, or withdraw a pending request.
create function public.unfollow_user(p_target uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  delete from public.follows f where f.follower_id = uid and f.followee_id = p_target;
  delete from public.follow_requests r where r.requester_id = uid and r.target_id = p_target;
end;
$$;

create function public.respond_follow_request(p_requester uuid, p_accept boolean)
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
    insert into public.follows (follower_id, followee_id) values (p_requester, uid) on conflict do nothing;
  end if;
end;
$$;

create function public.relationship(p_target uuid)
returns table (following boolean, requested boolean, follows_me boolean, requested_me boolean)
language sql stable security definer set search_path = ''
as $$
  select
    private.is_following((select auth.uid()), p_target),
    exists (select 1 from public.follow_requests r where r.requester_id = (select auth.uid()) and r.target_id = p_target),
    private.is_following(p_target, (select auth.uid())),
    exists (select 1 from public.follow_requests r where r.requester_id = p_target and r.target_id = (select auth.uid()));
$$;

-- Followers or following of a user, newest first. Hidden for private
-- accounts you do not follow. People who blocked you (or you them) are left out.
create function public.list_follows(p_user uuid, p_kind text, p_before timestamptz default null, p_limit int default 30)
returns table (user_id uuid, username text, display_name text, avatar_path text, followed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not private.can_see_content(uid, p_user) then
    raise exception 'PL8_PRIVATE' using errcode = '42501';
  end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_path, f.created_at
  from public.follows f
  join public.profiles p
    on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
    and p_kind in ('followers', 'following')
    and (p_before is null or f.created_at < p_before)
    and not private.is_blocked_between(uid, p.id)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create function public.my_follow_requests()
returns table (user_id uuid, username text, display_name text, avatar_path text, requested_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, r.created_at
  from public.follow_requests r
  join public.profiles p on p.id = r.requester_id
  where r.target_id = (select auth.uid())
  order by r.created_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Garage visibility now includes approved followers of private accounts
-- -----------------------------------------------------------------------------
create or replace function private.can_view_vehicle(viewer uuid, vid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = vid
      and (
        v.owner_id = viewer
        or (v.visibility = 'public' and not v.is_restricted and private.can_see_content(viewer, v.owner_id))
      )
  );
$$;

drop policy vehicles_select_visible on public.vehicles;
create policy vehicles_select_visible on public.vehicles
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (visibility = 'public' and not is_restricted and private.can_see_content((select auth.uid()), owner_id))
  );

-- -----------------------------------------------------------------------------
-- Posts
-- A post is created as a draft, photos are attached, then it is published.
-- -----------------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  vehicle_id    uuid references public.vehicles (id) on delete set null,
  caption       text not null default '',
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  published_at  timestamptz,
  is_removed    boolean not null default false, -- moderators only (Milestone 5)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint posts_caption check (char_length(caption) <= 2200)
);
create index posts_author_idx on public.posts (author_id, published_at desc, id desc);
create index posts_published_idx on public.posts (published_at desc, id desc) where published_at is not null;

create trigger posts_set_updated_at before update on public.posts
for each row execute function private.set_updated_at();

create function private.is_post_author(uid uuid, pid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.posts p where p.id = pid and p.author_id = uid);
$$;
revoke execute on function private.is_post_author(uuid, uuid) from public, anon;
grant execute on function private.is_post_author(uuid, uuid) to authenticated;

create function private.can_view_post(viewer uuid, pid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = pid
      and (
        p.author_id = viewer
        or (p.published_at is not null and not p.is_removed and private.can_see_content(viewer, p.author_id))
      )
  );
$$;
revoke execute on function private.can_view_post(uuid, uuid) from public, anon;
grant execute on function private.can_view_post(uuid, uuid) to authenticated;

create function private.is_draft_of(uid uuid, pid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.posts p where p.id = pid and p.author_id = uid and p.published_at is null);
$$;
revoke execute on function private.is_draft_of(uuid, uuid) from public, anon;
grant execute on function private.is_draft_of(uuid, uuid) to authenticated;

-- A post may only be tagged with one of the author's own vehicles.
create function private.check_post_vehicle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.vehicle_id is not null and not private.owns_vehicle(new.author_id, new.vehicle_id) then
    raise exception 'PL8_NOT_YOUR_VEHICLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_check_vehicle before insert or update of vehicle_id on public.posts
for each row execute function private.check_post_vehicle();

-- Keep profiles.post_count in sync with published posts.
create function private.posts_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      update public.profiles set post_count = greatest(post_count - 1, 0) where id = old.author_id;
    end if;
  elsif old.published_at is null and new.published_at is not null then
    update public.profiles set post_count = post_count + 1 where id = new.author_id;
  end if;
  return null;
end;
$$;
create trigger posts_count after update of published_at or delete on public.posts
for each row execute function private.posts_count();

alter table public.posts enable row level security;
revoke all on public.posts from public, anon, authenticated;
grant select, delete on public.posts to authenticated;
grant insert (author_id, vehicle_id, caption) on public.posts to authenticated;
grant update (caption, vehicle_id) on public.posts to authenticated;

create policy posts_select_visible on public.posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (published_at is not null and not is_removed and private.can_see_content((select auth.uid()), author_id))
  );
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- Photos of a post: files in the private "post-media" bucket at "<post_id>/<file>".
create table public.post_media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  storage_path text not null unique,
  position     smallint not null default 0 check (position between 0 and 9),
  width        integer check (width is null or width between 1 and 10000),
  height       integer check (height is null or height between 1 and 10000),
  created_at   timestamptz not null default now(),
  constraint post_media_path check (
    storage_path ~ ('^' || post_id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  )
);
create index post_media_post_idx on public.post_media (post_id, position);

create function private.enforce_post_media_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.post_media m where m.post_id = new.post_id) >= 10 then
    raise exception 'PL8_IMAGE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger post_media_limit before insert on public.post_media
for each row execute function private.enforce_post_media_limit();

alter table public.post_media enable row level security;
revoke all on public.post_media from public, anon, authenticated;
grant select on public.post_media to authenticated;
grant insert (post_id, storage_path, position, width, height) on public.post_media to authenticated;
grant delete on public.post_media to authenticated;

create policy post_media_select on public.post_media
  for select to authenticated
  using (private.can_view_post((select auth.uid()), post_id));
-- Photos can only be attached to your own unpublished draft.
create policy post_media_insert_draft on public.post_media
  for insert to authenticated
  with check (private.is_draft_of((select auth.uid()), post_id));
create policy post_media_delete_draft on public.post_media
  for delete to authenticated
  using (private.is_draft_of((select auth.uid()), post_id));

-- -----------------------------------------------------------------------------
-- Likes, comments, saved posts
-- -----------------------------------------------------------------------------
create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index likes_post_idx on public.likes (post_id);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint comments_body check (char_length(btrim(body)) between 1 and 1000 and body = btrim(body))
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.saved_posts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create function private.likes_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
create trigger likes_count after insert or delete on public.likes
for each row execute function private.likes_count();

create function private.comments_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
create trigger comments_count after insert or delete on public.comments
for each row execute function private.comments_count();

-- Anti-spam: max 30 comments per 10 minutes per user.
create function private.comments_rate_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.comments c
       where c.author_id = new.author_id and c.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger comments_rate_limit before insert on public.comments
for each row execute function private.comments_rate_limit();

alter table public.likes enable row level security;
revoke all on public.likes from public, anon, authenticated;
grant select, delete on public.likes to authenticated;
grant insert (user_id, post_id) on public.likes to authenticated;
create policy likes_select_own on public.likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy likes_insert_own on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_post((select auth.uid()), post_id));
create policy likes_delete_own on public.likes for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
grant select, delete on public.comments to authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;
create policy comments_select_visible on public.comments for select to authenticated
  using (
    private.can_view_post((select auth.uid()), post_id)
    and not private.is_blocked_between((select auth.uid()), author_id)
  );
create policy comments_insert_own on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_view_post((select auth.uid()), post_id));
-- The comment's author or the post's author may delete a comment.
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_post_author((select auth.uid()), post_id));

alter table public.saved_posts enable row level security;
revoke all on public.saved_posts from public, anon, authenticated;
grant select, delete on public.saved_posts to authenticated;
grant insert (user_id, post_id) on public.saved_posts to authenticated;
create policy saved_select_own on public.saved_posts for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_insert_own on public.saved_posts for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_post((select auth.uid()), post_id));
create policy saved_delete_own on public.saved_posts for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Publishing
-- -----------------------------------------------------------------------------
create function public.publish_post(p_post_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not private.is_draft_of(uid, p_post_id) then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.post_media m where m.post_id = p_post_id) then
    raise exception 'PL8_MEDIA_REQUIRED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('publish:' || uid::text, 0));
  if (select count(*) from public.posts p
       where p.author_id = uid and p.published_at > now() - interval '24 hours') >= 20 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;
  update public.posts p set published_at = now() where p.id = p_post_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Feeds. One function, several modes, same privacy filter for all:
--   home     your posts + people you follow
--   discover public accounts only
--   user     one person's posts (if you may see their content)
--   saved    your saved posts
--   single   one post
-- Keyset pagination: pass the last row's published_at + post_id.
-- -----------------------------------------------------------------------------
create function public.get_posts(
  p_mode text,
  p_user uuid default null,
  p_post uuid default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
)
returns table (
  post_id             uuid,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_path  text,
  vehicle_id          uuid,
  vehicle_make        text,
  vehicle_model       text,
  vehicle_generation  text,
  caption             text,
  media_paths         text[],
  like_count          integer,
  comment_count       integer,
  liked               boolean,
  saved               boolean,
  published_at        timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_mode not in ('home', 'discover', 'user', 'saved', 'single') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  return query
  select
    p.id, p.author_id, a.username, a.display_name, a.avatar_path,
    v.id, v.make, v.model, v.generation,
    p.caption,
    coalesce((select array_agg(m.storage_path order by m.position, m.created_at)
                from public.post_media m where m.post_id = p.id), '{}'::text[]),
    p.like_count, p.comment_count,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = uid),
    exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = uid),
    p.published_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.vehicles v on v.id = p.vehicle_id and private.can_view_vehicle(uid, v.id)
  where p.published_at is not null
    and not p.is_removed
    and private.can_see_content(uid, p.author_id)
    and (
      (p_mode = 'home' and (p.author_id = uid or private.is_following(uid, p.author_id)))
      or (p_mode = 'discover' and not a.is_private)
      or (p_mode = 'user' and p.author_id = p_user)
      or (p_mode = 'saved' and exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = uid))
      or (p_mode = 'single' and p.id = p_post)
    )
    and (p_before is null or (p.published_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.published_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- Comments of a post with author details (blocked people left out).
create function public.get_comments(p_post uuid, p_after timestamptz default null, p_limit int default 50)
returns table (
  comment_id          uuid,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_path  text,
  body                text,
  created_at          timestamptz,
  can_delete          boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  post_author uuid;
begin
  if not private.can_view_post(uid, p_post) then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  select p.author_id into post_author from public.posts p where p.id = p_post;
  return query
  select c.id, c.author_id, a.username, a.display_name, a.avatar_path, c.body, c.created_at,
         (c.author_id = uid or post_author = uid)
  from public.comments c
  join public.profiles a on a.id = c.author_id
  where c.post_id = p_post
    and not private.is_blocked_between(uid, c.author_id)
    and (p_after is null or c.created_at > p_after)
  order by c.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.follow_user(uuid)',
    'public.unfollow_user(uuid)',
    'public.respond_follow_request(uuid, boolean)',
    'public.relationship(uuid)',
    'public.list_follows(uuid, text, timestamptz, int)',
    'public.my_follow_requests()',
    'public.publish_post(uuid)',
    'public.get_posts(text, uuid, uuid, timestamptz, uuid, int)',
    'public.get_comments(uuid, timestamptz, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: post-media (PRIVATE), path "<post_id>/<file>"
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy post_media_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-media'
    and private.can_view_post((select auth.uid()), private.try_uuid((storage.foldername(name))[1]))
  );
create policy post_media_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and private.is_draft_of((select auth.uid()), private.try_uuid((storage.foldername(name))[1]))
  );
create policy post_media_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-media'
    and private.is_post_author((select auth.uid()), private.try_uuid((storage.foldername(name))[1]))
  );
