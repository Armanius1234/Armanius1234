-- =============================================================================
-- Minimal stand-in for the parts of Supabase our migrations depend on, so the
-- database tests run on any plain PostgreSQL (CI, or a laptop without Docker).
--
-- It mirrors Supabase's behaviour where it matters for security:
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.uid() reads the JWT "sub" claim exactly like Supabase does
--   * default privileges grant ALL on new public tables/functions to the API
--     roles — so our migrations must revoke explicitly, as on real Supabase
--   * storage.buckets / storage.objects with RLS, and storage.foldername()
--
-- NEVER run this against a real Supabase project.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
-- Supabase installs pgcrypto into the "extensions" schema.
create extension if not exists pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth -------
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  banned_until       timestamptz,
  created_at         timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- ------------------------------------------------------------- storage -------
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

create function storage.foldername(name text) returns text[]
language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- --------------------------------------------------------- test helpers ------
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Passes silently-but-visibly, fails by raising.
create function tests.ok(condition boolean, description text) returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'not ok - %', description;
  end if;
  raise notice 'ok - %', description;
end;
$$;

-- Runs SQL as the current role and asserts it fails (optionally with SQLSTATE).
create function tests.throws(sql text, description text, expected_state text default null)
returns void
language plpgsql
as $$
declare
  state text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
    if expected_state is not null and state <> expected_state then
      raise exception 'not ok - % (expected SQLSTATE %, got %: %)',
        description, expected_state, state, sqlerrm;
    end if;
    raise notice 'ok - %', description;
    return;
  end;
  raise exception 'not ok - % (statement succeeded but should have failed)', description;
end;
$$;

-- Returns the number of rows a statement affected (for "silently blocked" checks).
create function tests.affected(sql text) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ------------------------------------------------------------- realtime ------
-- Supabase creates this publication; tables are added to it by migrations.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
