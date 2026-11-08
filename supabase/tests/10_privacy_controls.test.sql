-- =============================================================================
-- Milestone 10: "Show me in people search" and "Suggest me to others".
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set kai 'a1000000-0000-0000-0000-000000000001'
\set lou 'a1000000-0000-0000-0000-000000000002'
\set max 'a1000000-0000-0000-0000-000000000003'
\set nia 'a1000000-0000-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'kai'::uuid, 'kai@m10.dev'), (:'lou'::uuid, 'lou@m10.dev'),
             (:'max'::uuid, 'max@m10.dev'), (:'nia'::uuid, 'nia@m10.dev')) as u(id, email);
insert into public.profiles (id, username, display_name) values
  (:'kai', 'kai_k', 'Kai Klein'),
  (:'lou', 'lou_l', 'Lou Lang'),
  (:'max', 'max_m', 'Max Mohr'),
  (:'nia', 'nia_n', 'Nia Lang');
-- Kai follows Max; Max follows Lou and Nia. Kai and Lou both drive a Porsche.
insert into public.follows (follower_id, followee_id) values (:'kai', :'max'), (:'max', :'lou'), (:'max', :'nia');
insert into public.vehicles (owner_id, make, model, model_year, visibility) values
  (:'kai', 'Porsche', '911', 2019, 'public'),
  (:'lou', 'Porsche', 'Cayman', 2021, 'public');

select tests.ok(
  (select show_in_search and show_in_suggestions from public.user_settings where user_id = :'lou'),
  'new accounts can be found and suggested (both switches on by default)');

-- Before: Kai finds Lou and gets Lou suggested.
select set_config('request.jwt.claims', json_build_object('sub', :'kai', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  exists (select 1 from public.search_people('lou') where username = 'lou_l')
  and exists (select 1 from public.suggested_people() where username = 'lou_l'),
  'with the switches on: found in search and suggested');
reset role;

-- Lou switches both off.
select set_config('request.jwt.claims', json_build_object('sub', :'lou', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  tests.affected($$update public.user_settings set show_in_search = false, show_in_suggestions = false where user_id = auth.uid()$$) = 1,
  'people can switch both off for themselves');
select tests.ok(
  tests.affected(format($$update public.user_settings set show_in_search = false where user_id = %L$$, :'kai')) = 0,
  'nobody can change someone else''s switches');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'kai', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select count(*) from public.search_people('lou')) = 0
  and (select count(*) from public.search_people('lou_l')) = 0,
  'switched off: not found by name or by exact username');
select tests.ok(
  (select array_agg(username) from public.search_people('lang')) = array['nia_n'],
  'other people are still found');
select tests.ok(
  not exists (select 1 from public.suggested_people() where username = 'lou_l')
  and exists (select 1 from public.suggested_people() where username = 'nia_n'),
  'switched off: never suggested (not as "followed by", not as "same car"); others still are');
select tests.ok(
  (select count(*) from public.profiles where id = :'lou') = 1,
  'the profile itself stays visible (posts, comments, links still lead to it)');
select tests.ok(
  (select count(*) from public.user_settings where user_id = :'lou') = 0,
  'nobody else can see who switched it off');
reset role;

-- An exact @mention still reaches Lou.
insert into public.posts (author_id, caption, published_at) values (:'kai', 'Cars and coffee with @lou_l', now());
select tests.ok(
  exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'lou' and actor_id = :'kai'),
  'people can still @mention the exact username');

-- The data export shows the switches.
select set_config('request.jwt.claims', json_build_object('sub', :'lou', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (public.export_my_data() -> 'settings' ->> 'show_in_search') = 'false'
  and (public.export_my_data() -> 'settings' ->> 'show_in_suggestions') = 'false',
  'the data export includes both switches');

-- Lou switches them back on.
select tests.ok(
  tests.affected($$update public.user_settings set show_in_search = true, show_in_suggestions = true where user_id = auth.uid()$$) = 1,
  'switching back on works');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'kai', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  exists (select 1 from public.search_people('lou') where username = 'lou_l')
  and exists (select 1 from public.suggested_people() where username = 'lou_l'),
  'switched back on: found and suggested again');
reset role;

set local role anon;
select tests.throws($$update public.user_settings set show_in_search = false$$, 'anonymous users cannot change settings', '42501');
reset role;

rollback;
