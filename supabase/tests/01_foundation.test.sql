-- =============================================================================
-- Milestone 1 security tests: sign-up consent, profiles, settings, blocks,
-- avatar storage. Each block switches to a specific user exactly like a
-- request through the Supabase API would (role + JWT claims).
-- Everything runs in one transaction and is rolled back.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

-- Fixed test users
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'
\set dave  '44444444-4444-4444-4444-444444444444'

-- ---------------------------------------------------------------- sign-up ----
select tests.throws(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'minor@test.dev', '{"terms_version":"2026-10","privacy_version":"2026-10"}')$$,
  'sign-up without 18+ confirmation is rejected', 'P0001');

select tests.throws(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'string@test.dev', '{"age_confirmed":"true","terms_version":"2026-10","privacy_version":"2026-10"}')$$,
  'sign-up with age_confirmed as a string (not boolean) is rejected', 'P0001');

select tests.throws(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'noterms@test.dev', '{"age_confirmed":true}')$$,
  'sign-up without accepted terms/privacy versions is rejected', 'P0001');

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@test.dev', '{"age_confirmed":true,"terms_version":"2026-10","privacy_version":"2026-10","locale":"en"}'),
  (:'bob',   'bob@test.dev',   '{"age_confirmed":true,"terms_version":"2026-10","privacy_version":"2026-10"}'),
  (:'carol', 'carol@test.dev', '{"age_confirmed":true,"terms_version":"2026-10","privacy_version":"2026-10","locale":"xx"}');

select tests.ok((select count(*) from private.user_consents) = 3, 'valid sign-ups record consent');
select tests.ok((select count(*) from public.user_settings) = 3, 'valid sign-ups create default settings');
select tests.ok((select locale from public.user_settings where user_id = :'alice') = 'en', 'locale from sign-up is stored');
select tests.ok((select locale from public.user_settings where user_id = :'carol') = 'de', 'unknown locale falls back to de');
select tests.ok(
  (select messaging_policy from public.user_settings where user_id = :'bob') = 'everyone',
  'default messaging policy is "everyone" (requests only)');

-- A user created without the consent hook (simulates a legacy/OAuth account).
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email) values (:'dave', 'dave@test.dev');
alter table auth.users enable trigger on_auth_user_created;

-- ----------------------------------------------------------- anonymous -------
set local role anon;
select tests.throws($$select * from public.profiles$$, 'anon cannot read profiles', '42501');
select tests.throws($$select * from public.user_settings$$, 'anon cannot read settings', '42501');
select tests.throws($$select public.is_username_available('free_name')$$, 'anon cannot call username check', '42501');
select tests.throws($$select * from public.list_blocked_users()$$, 'anon cannot list blocks', '42501');
reset role;

-- --------------------------------------------------------------- alice -------
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.profiles (id, username, display_name)
values (:'alice', 'alice_m2', 'Alice');
select tests.ok((select count(*) from public.profiles where id = :'alice') = 1, 'user can create own profile');

select tests.throws(
  format($$insert into public.profiles (id, username, display_name) values (%L, 'bob_fake', 'Fake')$$, :'bob'),
  'user cannot create a profile for someone else', '42501');

select tests.throws(
  $$update public.profiles set created_at = now() - interval '1 year'$$,
  'user cannot write protected column created_at', '42501');
select tests.throws(
  format($$update public.profiles set id = %L$$, :'carol'),
  'user cannot change profile id', '42501');

update public.profiles set bio = 'BMW M2 G87 · Wiesbaden', city = 'Wiesbaden' where id = :'alice';
select tests.ok((select bio from public.profiles where id = :'alice') = 'BMW M2 G87 · Wiesbaden', 'user can edit own profile');

select tests.throws($$update public.profiles set username = 'Alice_Caps'$$, 'uppercase username rejected', '23514');
select tests.throws($$update public.profiles set username = 'ab'$$, 'too-short username rejected', '23514');
select tests.throws($$update public.profiles set username = 'a..b'$$, 'doubled separator rejected', '23514');
select tests.throws($$update public.profiles set username = '_alice'$$, 'leading separator rejected', '23514');
select tests.throws($$update public.profiles set username = 'admin'$$, 'reserved username rejected', '23514');
select tests.throws($$update public.profiles set display_name = '   '$$, 'blank display name rejected', '23514');
select tests.throws($$update public.profiles set bio = repeat('x', 301)$$, 'bio over 300 chars rejected', '23514');
select tests.throws(
  $$update public.profiles set instagram_url = 'javascript:alert(1)'$$,
  'script URL rejected for instagram', '23514');
select tests.throws(
  $$update public.profiles set instagram_url = 'https://evil.example/instagram.com/x'$$,
  'non-instagram domain rejected', '23514');
select tests.throws(
  $$update public.profiles set facebook_url = 'http://facebook.com/someone'$$,
  'plain http rejected', '23514');
update public.profiles set
  instagram_url = 'https://instagram.com/alice.m2',
  tiktok_url    = 'https://www.tiktok.com/@alice.m2',
  linkedin_url  = 'https://de.linkedin.com/in/alice-m',
  facebook_url  = 'https://facebook.com/alice.m2'
where id = :'alice';
select tests.ok(true, 'valid social links accepted');

select tests.throws(
  format($$update public.profiles set avatar_path = %L$$, :'bob' || '/x.jpg'),
  'avatar path in another user''s folder rejected', '23514');
select tests.throws(
  format($$update public.profiles set avatar_path = %L$$, :'alice' || '/../x.jpg'),
  'avatar path traversal rejected', '23514');
update public.profiles set avatar_path = :'alice' || '/avatar_1.jpg' where id = :'alice';
select tests.ok(true, 'avatar path in own folder accepted');

-- settings
select tests.ok((select count(*) from public.user_settings) = 1, 'user sees only own settings row');
update public.user_settings set messaging_policy = 'followers';
select tests.ok(
  (select messaging_policy from public.user_settings where user_id = :'alice') = 'followers',
  'user can change own messaging policy');
select tests.ok(
  tests.affected(format($$update public.user_settings set messaging_policy = 'nobody' where user_id = %L$$, :'bob')) = 0,
  'user cannot change someone else''s settings');
select tests.throws(
  format($$insert into public.user_settings (user_id) values (%L)$$, :'dave'),
  'user cannot insert settings rows', '42501');
select tests.throws($$select * from private.user_consents$$, 'user cannot read consent records', '42501');

-- storage
insert into storage.objects (bucket_id, name, owner) values ('avatars', :'alice' || '/avatar_1.jpg', :'alice');
select tests.ok(true, 'user can upload into own avatar folder');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('avatars', %L)$$, :'bob' || '/evil.jpg'),
  'user cannot upload into another user''s avatar folder', '42501');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('avatars', %L)$$, 'evil.jpg'),
  'user cannot upload to avatar bucket root', '42501');
reset role;

-- ----------------------------------------------------------------- bob -------
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;

select tests.throws(
  $$insert into public.profiles (id, username, display_name)
    values (auth.uid(), 'alice_m2', 'Bob')$$,
  'duplicate username rejected', '23505');
insert into public.profiles (id, username, display_name) values (:'bob', 'bob.amg', 'Bob');

select tests.ok((select count(*) from public.profiles where id = :'alice') = 1, 'other users can see a profile');
select tests.ok(
  tests.affected(format($$update public.profiles set bio = 'hacked' where id = %L$$, :'alice')) = 0,
  'user cannot edit someone else''s profile');
select tests.ok(
  tests.affected(format($$delete from storage.objects where name = %L$$, :'alice' || '/avatar_1.jpg')) = 0,
  'user cannot delete someone else''s avatar');

select tests.ok(public.is_username_available('alice_m2') = false, 'taken username reported unavailable');
select tests.ok(public.is_username_available('bob.amg') = true, 'own current username reported available to self');
select tests.ok(public.is_username_available('fresh_name') = true, 'free username reported available');
select tests.ok(public.is_username_available('Bad Name') = false, 'invalid username reported unavailable');
select tests.ok(public.is_username_available('support') = false, 'reserved username reported unavailable');
reset role;

-- --------------------------------------------------------------- carol -------
select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.profiles (id, username, display_name, is_private) values (:'carol', 'carol_rs', 'Carol', true);
select tests.ok((select is_private from public.profiles where id = :'carol'), 'user can create a private profile');
reset role;

-- ---------------------------------------------------------------- dave -------
select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(
  $$insert into public.profiles (id, username, display_name) values (auth.uid(), 'dave_jdm', 'Dave')$$,
  'user without recorded consent cannot create a profile', '42501');
reset role;

-- -------------------------------------------------------------- blocks -------
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values (:'alice', :'bob');
select tests.ok(true, 'user can block another user');
select tests.throws(
  format($$insert into public.blocks (blocker_id, blocked_id) values (%L, %L)$$, :'bob', :'carol'),
  'user cannot create a block on someone else''s behalf', '42501');
select tests.throws(
  format($$insert into public.blocks (blocker_id, blocked_id) values (%L, %L)$$, :'alice', :'alice'),
  'user cannot block themselves', '23514');
select tests.ok((select count(*) from public.profiles where id = :'bob') = 0, 'blocker no longer sees blocked profile');
select tests.ok(
  (select count(*) from public.list_blocked_users() where user_id = :'bob') = 1,
  'blocker can still list the blocked user');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.profiles where id = :'alice') = 0, 'blocked user no longer sees blocker profile');
select tests.ok((select count(*) from public.blocks) = 0, 'blocked user cannot see the block row');
select tests.ok(
  tests.affected(format($$delete from public.blocks where blocker_id = %L$$, :'alice')) = 0,
  'blocked user cannot remove the block');
select tests.ok((select count(*) from public.list_blocked_users()) = 0, 'blocked user''s own block list is empty');
select tests.ok(public.is_username_available('alice_m2') = false, 'blocker''s username still counts as taken');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.profiles where id in (:'alice', :'bob')) = 2, 'third parties are unaffected by a block');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
delete from public.blocks where blocked_id = :'bob';
select tests.ok((select count(*) from public.profiles where id = :'bob') = 1, 'unblocking restores visibility');
reset role;

-- -------------------------------------------------------- deletion cascade ---
delete from auth.users where id = :'carol';
select tests.ok(
  not exists (select 1 from public.profiles where id = :'carol')
  and not exists (select 1 from public.user_settings where user_id = :'carol')
  and not exists (select 1 from private.user_consents where user_id = :'carol'),
  'deleting an auth user removes profile, settings and consent');

rollback;
