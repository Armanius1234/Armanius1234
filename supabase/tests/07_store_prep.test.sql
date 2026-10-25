-- =============================================================================
-- Milestone 6: district codes, sign in with Apple/Google (consent gate),
-- deleting a chat for yourself, report snapshots, suspended-accounts list.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set ann  'a7000000-0000-0000-0000-000000000001'
\set ben  'b7000000-0000-0000-0000-000000000002'
\set gil  'c7000000-0000-0000-0000-000000000003'
\set mod  'd7000000-0000-0000-0000-000000000004'
\set eve  'e7000000-0000-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data, created_at)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}', now() - interval '30 days'
from (values (:'ann'::uuid, 'ann@m6.dev'), (:'ben'::uuid, 'ben@m6.dev'), (:'mod'::uuid, 'mod@m6.dev')) as u(id, email);
insert into public.profiles (id, username, display_name) values
  (:'ann', 'ann_m6', 'Ann'), (:'ben', 'ben_m6', 'Ben'), (:'mod', 'mod_m6', 'Moderator');
insert into private.user_roles (user_id, role) values (:'mod', 'admin');

-- Ann: a published post and a verified, findable plate.
insert into public.posts (id, author_id, caption) values ('f7000000-0000-0000-0000-0000000000a1', :'ann', 'Golden hour');
update public.posts set published_at = now() where id = 'f7000000-0000-0000-0000-0000000000a1';
\set post 'f7000000-0000-0000-0000-0000000000a1'
insert into public.vehicles (id, owner_id, make, model, model_year) values ('f7000000-0000-0000-0000-0000000000b1', :'ann', 'Porsche', '911', 2022);
insert into private.plate_claims (vehicle_id, user_id, country, plate, status, discoverable, verified_at)
values ('f7000000-0000-0000-0000-0000000000b1', :'ann', 'DE', 'DA-PL-8', 'verified', true, now());

-- ------------------------------------------------------- district codes ------
\set districts `cat "$PL8_TESTS_DIR/../../src/shared/de-districts.json"`
select tests.ok(
  (select array_agg(code order by code) from private.de_districts)
    = (select array_agg(x order by x) from jsonb_array_elements_text(:'districts'::jsonb) x)
  and (select count(*) from private.de_districts) = 727,
  'database district list is the same as the app''s (727 codes)');

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(
  $$select public.claim_plate('f7000000-0000-0000-0000-0000000000b1', 'DE', 'XX', 'AB', '1')$$,
  'a plate with a district code that does not exist cannot be claimed', 'P0001');
select tests.ok((select count(*) from public.search_plate('DE', 'FFM', 'AB', '1')) = 0, 'searching an unknown district finds nothing');
select tests.throws($$select count(*) from private.de_districts$$, 'app users cannot read the district table directly', '42501');
reset role;
select tests.ok(
  (select found = false and plate_hash is null from private.search_log where user_id = :'ann' order by created_at desc limit 1),
  'the invalid search is still counted for the rate limit');

insert into private.de_districts (code) values ('QQ');
select tests.ok(private.normalize_plate_de('qq', 'a', '1', '') = 'QQ-A-1', 'a new district code works as soon as it is added');

-- --------------------------------------------- sign in with Apple / Google ---
select tests.throws(
  format($$insert into auth.users (id, email) values (%L, 'nobody@m6.dev')$$, gen_random_uuid()),
  'email sign-up without 18+ and consent is still rejected', 'P0001');
select tests.throws(
  format($$insert into auth.users (id, email, raw_user_meta_data) values (%L, 'trick@m6.dev', '{"provider":"google","iss":"https://accounts.google.com"}')$$, gen_random_uuid()),
  'claiming to be Google in the sign-up data does not skip consent', 'P0001');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (:'gil', 'gil@gmail.example', '{"provider":"google","providers":["google"]}', '{"full_name":"Gil G","iss":"https://accounts.google.com"}');
select tests.ok(
  not exists (select 1 from private.user_consents where user_id = :'gil')
  and exists (select 1 from public.user_settings where user_id = :'gil'),
  'Google sign-up creates the login, but no consent yet');

select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.my_consent() = false, 'the app can see that consent is missing');
select tests.ok((select count(*) from public.profiles) = 0, 'without consent: no profiles are visible');
select tests.ok((select count(*) from public.posts) = 0, 'without consent: no posts are visible');
select tests.ok((select count(*) from public.vehicles) = 0, 'without consent: no vehicles are visible');
select tests.ok((select count(*) from public.search_plate('DE', 'DA', 'PL', '8')) = 0, 'without consent: plate search finds nothing');
select tests.throws(
  format($$insert into public.profiles (id, username, display_name) values (%L, 'gil_g', 'Gil')$$, :'gil'),
  'without consent: no profile can be created', '42501');
select tests.throws($$select public.record_consent(false, 'v1', 'v1')$$, 'consent needs the 18+ confirmation', 'P0001');
select tests.throws($$select public.record_consent(true, '', 'v1')$$, 'consent needs the terms version', 'P0001');
select public.record_consent(true, '2026-10-draft', '2026-10-draft', 'en');
select tests.ok(public.my_consent(), 'consent recorded');
select public.record_consent(true, 'other', 'other', 'de');
reset role;
select tests.ok(
  (select terms_version = '2026-10-draft' from private.user_consents where user_id = :'gil')
  and (select locale = 'en' from public.user_settings where user_id = :'gil'),
  'consent is recorded once (with time and versions); the language is saved');

select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.profiles (id, username, display_name) values (:'gil', 'gil_g', 'Gil');
select tests.ok((select count(*) from public.profiles where id = :'ann') = 1, 'after consent: profiles are visible');
select tests.ok((select count(*) from public.posts where id = :'post') = 1, 'after consent: posts are visible');
reset role;

-- Apple sign-up with a partial consent payload is treated like any social sign-up.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (:'eve', 'eve@privaterelay.appleid.example', '{"provider":"apple"}', '{"age_confirmed":true}');
select tests.ok(not exists (select 1 from private.user_consents where user_id = :'eve'),
  'Apple sign-up without full consent data waits for the consent step');

-- Abandoned social sign-ups are cleaned up after 7 days; finished ones stay.
insert into auth.users (id, email, raw_app_meta_data, created_at)
values ('e7000000-0000-0000-0000-0000000000ff', 'gone@gmail.example', '{"provider":"google"}', now() - interval '8 days');
update auth.users set created_at = now() - interval '8 days' where id = :'gil';
select private.run_retention();
select tests.ok(
  not exists (select 1 from auth.users where id = 'e7000000-0000-0000-0000-0000000000ff')
  and exists (select 1 from auth.users where id = :'gil')
  and exists (select 1 from auth.users where id = :'eve'),
  'social logins without consent are deleted after 7 days; others are kept');

set local role anon;
select tests.throws($$select public.record_consent(true, 'v1', 'v1')$$, 'anonymous users cannot record consent', '42501');
select tests.throws($$select public.my_consent()$$, 'anonymous users cannot check consent', '42501');
reset role;

-- --------------------------------------------- delete a chat for yourself ----
insert into public.follows (follower_id, followee_id) values (:'ben', :'ann');
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'ben') as conv \gset
select public.send_message(:'conv', 'Nice 911?');
select public.send_message(:'conv', 'Want to meet at the Nürburgring?');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.send_message(:'conv', 'Sure!');
select tests.ok((select count(*) from public.my_conversations()) = 1, 'chat is in the inbox');
select public.hide_conversation(:'conv');
select tests.ok((select count(*) from public.my_conversations()) = 0, 'a deleted chat leaves the inbox');
select tests.ok((select count(*) from public.messages where conversation_id = :'conv') = 0, 'its messages are gone for you');
select tests.ok(public.unread_message_count() = 0, 'nothing unread in a deleted chat');
select tests.throws($$select count(*) from private.hidden_conversations$$, 'nobody can read who deleted which chat', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.messages where conversation_id = :'conv') = 3, 'the other person keeps the whole chat');
select tests.ok((select count(*) from public.my_conversations()) = 1, 'the chat stays in the other person''s inbox');
select public.send_message(:'conv', 'See you Saturday');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select last_message = 'See you Saturday' and unread_count = 1 from public.my_conversations() where conversation_id = :'conv'),
  'a new message brings the chat back');
select tests.ok(
  (select array_agg(body) from public.messages where conversation_id = :'conv') = array['See you Saturday'],
  'only messages after deleting are shown');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.hide_conversation(%L)$$, :'conv'), 'outsiders cannot touch the chat', '42501');
reset role;

-- --------------------------------------------------- report snapshots --------
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('post', :'post', 'harassment', 'Insulting caption') as rep \gset
select tests.throws($$select count(*) from private.report_snapshots$$, 'reporters cannot read moderation copies', '42501');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.posts set caption = 'Nothing to see here' where id = :'post';
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select preview ->> 'caption' = 'Nothing to see here' and snapshot ->> 'caption' = 'Golden hour'
     from public.admin_reports_queue() where report_id = :'rep'),
  'moderators see the content as it was when reported, even after an edit');
reset role;

-- --------------------------------------------- suspended-accounts list -------
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select * from public.admin_suspended_users()$$, 'non-admins cannot list suspended accounts', '42501');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep', 'suspend', 'Repeated insults');
select tests.ok(
  (select username = 'ann_m6' and reason = 'Repeated insults' from public.admin_suspended_users()),
  'admins see suspended accounts with the reason');
select public.admin_unsuspend_user(:'ann', 'Appeal accepted');
select tests.ok((select count(*) from public.admin_suspended_users()) = 0, 'lifting the suspension removes it from the list');
reset role;

rollback;
