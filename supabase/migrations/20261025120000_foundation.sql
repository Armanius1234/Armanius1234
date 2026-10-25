-- =============================================================================
-- PL8 — Milestone 1 foundation
--   * private schema for data the app API must never expose
--   * profiles (public identity), user_settings (private preferences)
--   * consent records (18+ confirmation, terms/privacy versions)
--   * blocks (used by every visibility rule)
--   * avatars storage bucket + policies
--
-- Security model:
--   * Row Level Security is enabled on every table.
--   * Table privileges are granted explicitly, per column where it matters,
--     so users can never write protected columns (ids, timestamps, …).
--   * Functions that must bypass RLS are SECURITY DEFINER with an empty
--     search_path and fully-qualified names.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schemas
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call helper functions in `private`, so signed-in users need
-- USAGE on the schema. They get no table privileges in it.
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.messaging_policy as enum ('everyone', 'followers', 'nobody');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consent records (private: never readable by the app)
-- -----------------------------------------------------------------------------
create table private.user_consents (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  age_confirmed_at timestamptz not null,
  terms_version    text not null check (char_length(terms_version) between 1 and 20),
  privacy_version  text not null check (char_length(privacy_version) between 1 and 20),
  created_at       timestamptz not null default now()
);
revoke all on private.user_consents from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- User settings (private preferences, owner-only)
-- -----------------------------------------------------------------------------
create table public.user_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  -- Who may send a message request. Enforced server-side from Milestone 4.
  messaging_policy public.messaging_policy not null default 'everyone',
  locale           text not null default 'de' check (locale in ('de', 'en')),
  updated_at       timestamptz not null default now()
);

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function private.set_updated_at();

alter table public.user_settings enable row level security;

revoke all on public.user_settings from public, anon, authenticated;
grant select on public.user_settings to authenticated;
grant update (messaging_policy, locale) on public.user_settings to authenticated;

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- New-user hook: record consent and create default settings.
-- Sign-up is rejected unless the client sent age_confirmed = true and the
-- accepted document versions. (When Apple/Google sign-in is added, consent
-- moves to onboarding for those users.)
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if (meta -> 'age_confirmed') is distinct from 'true'::jsonb then
    raise exception 'PL8_AGE_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce(meta ->> 'terms_version', '') = ''
     or coalesce(meta ->> 'privacy_version', '') = '' then
    raise exception 'PL8_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into private.user_consents (user_id, age_confirmed_at, terms_version, privacy_version)
  values (new.id, now(), meta ->> 'terms_version', meta ->> 'privacy_version');

  insert into public.user_settings (user_id, locale)
  values (
    new.id,
    case when meta ->> 'locale' in ('de', 'en') then meta ->> 'locale' else 'de' end
  );

  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.has_consent(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.user_consents c where c.user_id = uid);
$$;
revoke execute on function private.has_consent(uuid) from public, anon;
grant execute on function private.has_consent(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Profiles (public identity)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  display_name  text not null,
  bio           text not null default '',
  avatar_path   text,
  city          text,
  instagram_url text,
  tiktok_url    text,
  linkedin_url  text,
  facebook_url  text,
  is_private    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 3–30 chars, lowercase letters, digits, "." and "_", no leading/trailing
  -- or doubled separators. Keep in sync with src/shared/validation.ts.
  constraint profiles_username_format check (
    username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
    and username !~ '[._]{2}'
  ),
  constraint profiles_username_not_reserved check (
    username <> all (array[
      'admin', 'administrator', 'root', 'support', 'help', 'pl8', 'pl8app',
      'official', 'team', 'staff', 'moderator', 'mod', 'security', 'system',
      'api', 'www', 'settings', 'privacy', 'terms', 'legal', 'impressum',
      'search', 'discover', 'messages', 'notifications', 'verify', 'verified'
    ])
  ),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 50
    and display_name = btrim(display_name)
  ),
  constraint profiles_bio_length check (char_length(bio) <= 300),
  constraint profiles_city_length check (
    city is null or (char_length(btrim(city)) between 1 and 60 and city = btrim(city))
  ),
  -- Avatars must live in the owner's own storage folder.
  constraint profiles_avatar_path_format check (
    avatar_path is null
    or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  ),
  constraint profiles_instagram_url check (
    instagram_url is null
    or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?$'
  ),
  constraint profiles_tiktok_url check (
    tiktok_url is null
    or tiktok_url ~ '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._]{2,24}/?$'
  ),
  constraint profiles_linkedin_url check (
    linkedin_url is null
    or linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/(in|company)/[A-Za-z0-9_-]{3,100}/?$'
  ),
  constraint profiles_facebook_url check (
    facebook_url is null
    or facebook_url ~ '^https://(www\.|m\.)?facebook\.com/[A-Za-z0-9.]{5,50}/?$'
  )
);

create unique index profiles_username_key on public.profiles (username);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Blocks
-- -----------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_id_idx on public.blocks (blocked_id);

-- True if either user has blocked the other. SECURITY DEFINER because the
-- caller must not be able to read the other person's block rows directly.
create function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;
revoke execute on function private.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;

alter table public.blocks enable row level security;

revoke all on public.blocks from public, anon, authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Profiles: privileges and RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (
  id, username, display_name, bio, avatar_path, city,
  instagram_url, tiktok_url, linkedin_url, facebook_url, is_private
) on public.profiles to authenticated;
grant update (
  username, display_name, bio, avatar_path, city,
  instagram_url, tiktok_url, linkedin_url, facebook_url, is_private
) on public.profiles to authenticated;

-- Signed-in users can see profiles, except where either side blocked the other.
-- (Private profiles still show basic identity; their content is gated in
-- later milestones.)
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or not private.is_blocked_between((select auth.uid()), id)
  );

-- A user creates exactly their own profile, and only after recorded consent.
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and private.has_consent((select auth.uid()))
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy: account deletion runs server-side (Milestone 5).

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Username availability. SECURITY DEFINER so names held by users who blocked
-- the caller still count as taken (without revealing who holds them).
create function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
    and candidate !~ '[._]{2}'
    and candidate <> all (array[
      'admin', 'administrator', 'root', 'support', 'help', 'pl8', 'pl8app',
      'official', 'team', 'staff', 'moderator', 'mod', 'security', 'system',
      'api', 'www', 'settings', 'privacy', 'terms', 'legal', 'impressum',
      'search', 'discover', 'messages', 'notifications', 'verify', 'verified'
    ])
    and not exists (
      select 1 from public.profiles p
      where p.username = candidate and p.id <> (select auth.uid())
    );
$$;
revoke execute on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

-- The caller's blocked users. Needed because profile RLS hides blocked
-- profiles from both sides, including from the blocker.
create function public.list_blocked_users()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  blocked_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;
revoke execute on function public.list_blocked_users() from public, anon;
grant execute on function public.list_blocked_users() to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: avatars
--   Public read (profile pictures are public), write only into own folder
--   "<user_id>/<file>". Max 2 MB, images only.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
