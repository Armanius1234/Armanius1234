-- =============================================================================
-- Automatic security audit of the whole schema. Fails if a future change
-- forgets RLS, grants something to anonymous users, or leaves a privileged
-- function without a fixed search_path.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

select tests.ok(
  not exists (
    select 1 from pg_tables t
    where t.schemaname = 'public' and not t.rowsecurity
  ),
  'every table in the public API has Row Level Security enabled');

select tests.ok(
  not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.grantee in ('anon', 'PUBLIC')
  ),
  'anonymous users have no table privileges at all');

select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  ),
  'anonymous users cannot call any API function');

select tests.ok(
  not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'private' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'tables in the private schema are not reachable by app users');

select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  ),
  'every SECURITY DEFINER function pins its search_path');

select tests.ok(
  (select array_agg(id order by id) from storage.buckets where public) = array['avatars'],
  'only profile pictures are in a public bucket; all other files are private');

select tests.ok(
  not exists (
    select 1 from information_schema.column_privileges c
    where c.table_schema = 'public' and c.grantee = 'authenticated' and c.privilege_type in ('INSERT', 'UPDATE')
      and c.column_name in ('is_verified', 'is_restricted', 'is_removed', 'suspended_at', 'like_count',
                            'comment_count', 'follower_count', 'following_count', 'post_count', 'published_at', 'status')
  ),
  'users can never write moderation, verification, counter or status columns');

rollback;
