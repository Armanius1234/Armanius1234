-- =============================================================================
-- Milestone 8: people search, car search, suggested people, @mentions.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set ann   'a9000000-0000-0000-0000-000000000001'
\set ben   'b9000000-0000-0000-0000-000000000002'
\set cleo  'c9000000-0000-0000-0000-000000000003'
\set dirk  'd9000000-0000-0000-0000-000000000004'
\set eve   'e9000000-0000-0000-0000-000000000005'
\set mia   'f9000000-0000-0000-0000-000000000006'
\set jo    'f9000000-0000-0000-0000-000000000007'
\set bella 'f9000000-0000-0000-0000-000000000008'
\set gil   'f9000000-0000-0000-0000-0000000000aa'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'ann'::uuid, 'ann@m8.dev'), (:'ben'::uuid, 'ben@m8.dev'), (:'cleo'::uuid, 'cleo@m8.dev'),
             (:'dirk'::uuid, 'dirk@m8.dev'), (:'eve'::uuid, 'eve@m8.dev'), (:'mia'::uuid, 'mia@m8.dev'),
             (:'jo'::uuid, 'jo@m8.dev'), (:'bella'::uuid, 'bella@m8.dev')) as u(id, email);
insert into public.profiles (id, username, display_name, is_private, suspended_at) values
  (:'ann',   'ann_porsche', 'Ann Porsche', false, null),
  (:'ben',   'ben.bmw',     'Ben Becker',  false, null),
  (:'cleo',  'cleo_m',      'Cleo Maier',  true,  null),
  (:'dirk',  'dirk_drift',  'Dirk D',      false, null),
  (:'eve',   'eve_e',       'Eve Maier',   false, now()),
  (:'mia',   'mia_maier',   'Mia Maier',   false, null),
  (:'jo',    'joanna_r',    'Jo R',        false, null),
  (:'bella', 'annabelle',   'Bella A',     false, null);
-- A Google sign-up without consent yet.
insert into auth.users (id, email, raw_app_meta_data) values (:'gil', 'gil@gmail.example', '{"provider":"google"}');
-- Dirk blocked Ben.
insert into public.blocks (blocker_id, blocked_id) values (:'dirk', :'ben');

-- ------------------------------------------------------------ people search --
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_people('ben')) = 1
  and (select username = 'ben.bmw' from public.search_people('@BEN')),
  'finds people by username, ignoring "@" and capital letters');
select tests.ok((select array_agg(username order by username) from public.search_people('maier')) = array['cleo_m', 'mia_maier'],
  'finds people by name (suspended people are never shown)');
select tests.ok((select is_private from public.search_people('cleo')), 'private profiles can be found, and say so');
select tests.ok((select count(*) from public.search_people('b')) = 0, 'one letter is not enough to search');
select tests.ok((select count(*) from public.search_people('__')) = 0 and (select count(*) from public.search_people('%%')) = 0,
  'wildcard characters are searched literally');
select tests.ok((select array_agg(username) from public.search_people('anna')) = array['annabelle', 'joanna_r'],
  'names starting with the search come first');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_people('dirk')) = 0, 'people who blocked you cannot be found');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_people('ben')) = 0, 'people you blocked cannot be found');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_people('ann')) = 0, 'without consent: search finds nobody');
reset role;

-- --------------------------------------------------------------- car search --
insert into public.vehicles (id, owner_id, make, model, generation, model_year, visibility, is_restricted, is_verified) values
  ('f9000000-0000-0000-0000-0000000000c1', :'ann',  'Porsche', '911 GT3', '992', 2023, 'public',  false, true),
  ('f9000000-0000-0000-0000-0000000000c2', :'ann',  'Porsche', '718 Cayman', null, 2020, 'private', false, false),
  ('f9000000-0000-0000-0000-0000000000c3', :'cleo', 'Porsche', '911 Carrera', '997', 2008, 'public', false, false),
  ('f9000000-0000-0000-0000-0000000000c4', :'dirk', 'Porsche', '944', null, 1988, 'public', false, false),
  ('f9000000-0000-0000-0000-0000000000c5', :'mia',  'Porsche', '911 Turbo', '930', 1986, 'public', true, false),
  ('f9000000-0000-0000-0000-0000000000c6', :'ben',  'BMW', 'M3', 'G80', 2022, 'public', false, false);
insert into public.vehicle_images (vehicle_id, storage_path, position)
values ('f9000000-0000-0000-0000-0000000000c1', 'f9000000-0000-0000-0000-0000000000c1/cover.jpg', 0);
insert into private.plate_claims (vehicle_id, user_id, country, plate, status, discoverable, verified_at)
values ('f9000000-0000-0000-0000-0000000000c1', :'ann', 'DE', 'S-GT-3', 'verified', true, now());

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select array_agg(model order by model) from public.search_vehicles('porsche')) = array['911 GT3'],
  'car search shows only cars you may see (not private, removed, private owners or people who blocked you)');
select tests.ok(
  (select cover_path = 'f9000000-0000-0000-0000-0000000000c1/cover.jpg' and owner_username = 'ann_porsche' and is_verified
     from public.search_vehicles('911 gt3')),
  'every word must match; results show the cover photo, owner and verified badge');
select tests.ok(
  not exists (select 1 from public.search_vehicles('porsche') r where to_jsonb(r)::text like '%S-GT-3%'),
  'car search never shows plates');
select tests.ok((select count(*) from public.search_vehicles('porsche 718')) = 0, 'private cars stay hidden');
select tests.ok((select count(*) from public.search_vehicles('p')) = 0, 'one letter is not enough to search');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mia', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select array_agg(model order by model) from public.search_vehicles('porsche')) = array['911 GT3', '944'],
  'people who did not block you see their cars');
reset role;

-- --------------------------------------------------------- suggested people --
-- Ann follows Ben; Ben follows Mia and Cleo. Ann has asked Jo to follow.
insert into public.follows (follower_id, followee_id) values (:'ann', :'ben'), (:'ben', :'mia'), (:'ben', :'cleo'), (:'mia', :'cleo');
insert into public.follow_requests (requester_id, target_id) values (:'ann', :'jo');
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select reason = 'followed_by' and mutual_count = 1 and mutual_example = 'ben.bmw' from public.suggested_people() where username = 'mia_maier')
  and (select reason = 'followed_by' from public.suggested_people() where username = 'cleo_m'),
  'suggests people followed by people you follow, with an example');
select tests.ok(
  (select reason = 'same_make' and shared_make = 'Porsche' from public.suggested_people() where username = 'dirk_drift'),
  'suggests people driving the same make');
select tests.ok(
  not exists (select 1 from public.suggested_people() where username in ('ann_porsche', 'ben.bmw', 'joanna_r', 'eve_e')),
  'never suggests yourself, people you follow or asked to follow, or suspended people');
select tests.ok(
  (select array_agg(reason) from (select reason from public.suggested_people() limit 2) x) = array['followed_by', 'followed_by'],
  'people with shared connections come first');
reset role;
-- Ann also follows Eve, who is suspended; Eve follows Bella.
insert into public.follows (follower_id, followee_id) values (:'ann', :'eve'), (:'eve', :'bella');
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  not exists (select 1 from public.suggested_people() where mutual_example = 'eve_e' or (username = 'annabelle' and reason = 'followed_by')),
  'a suspended account is never named as "followed by", and does not count');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(not exists (select 1 from public.suggested_people() where username = 'dirk_drift'),
  'never suggests people who blocked you');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.suggested_people()) = 0, 'without consent: no suggestions');
reset role;

-- ---------------------------------------------------------------- mentions ---
select tests.ok(
  private.mentioned_usernames('Hi @Mia_Maier, @ben.bmw! mail me@mia_maier.de @a @mia_maier') = array['ben.bmw', 'mia_maier']
  or private.mentioned_usernames('Hi @Mia_Maier, @ben.bmw! mail me@mia_maier.de @a @mia_maier') = array['mia_maier', 'ben.bmw'],
  'mentions are found once each; e-mail addresses and too-short names are not mentions');
select tests.ok(cardinality(private.mentioned_usernames('@aaa @bbb @ccc @ddd @eee @fff @ggg')) = 5, 'at most 5 mentions count');

insert into public.posts (id, author_id, caption) values ('f9000000-0000-0000-0000-0000000000d1', :'ann', 'Track day with @mia_maier');
\set post 'f9000000-0000-0000-0000-0000000000d1'
select tests.ok(not exists (select 1 from public.notifications where type = 'mention'), 'drafts do not notify');
update public.posts set published_at = now() where id = :'post';
select tests.ok(
  (select actor_id = :'ann' and post_id = :'post' and data ->> 'excerpt' = 'Track day with @mia_maier'
     from public.notifications where type = 'mention' and recipient_id = :'mia'),
  'publishing a post tells the people mentioned in it');
update public.posts set caption = 'Track day with @mia_maier and @cleo_m' where id = :'post';
select tests.ok(
  (select count(*) from public.notifications where type = 'mention' and recipient_id = :'mia') = 1
  and (select count(*) from public.notifications where type = 'mention' and recipient_id = :'cleo') = 1,
  'editing a caption only tells newly mentioned people, nobody twice');

-- Mia deletes her mention notification; fixing a typo in the caption must not
-- bring it back (only newly added names count).
delete from public.notifications where type = 'mention' and recipient_id = :'mia' and post_id = :'post';
update public.posts set caption = 'Track day with @mia_maier and @cleo_m!' where id = :'post';
select tests.ok(not exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'mia' and post_id = :'post'),
  'small caption edits do not repeat mentions');

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.comments (post_id, author_id, body)
values (:'post', auth.uid(), 'Great shot @ann_porsche, say hi to @dirk_drift and @nobody_here');
reset role;
select tests.ok(
  (select count(*) from public.notifications where type = 'mention' and recipient_id = :'ann') = 0
  and (select count(*) from public.notifications where type = 'comment' and recipient_id = :'ann') = 1,
  'the post''s author gets one comment notification, not an extra mention');
select tests.ok(not exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'dirk'),
  'people who blocked the writer are not told');

-- Cleo (private) mentions Mia (a follower) and Dirk (not a follower).
insert into public.posts (id, author_id, caption, published_at)
values ('f9000000-0000-0000-0000-0000000000d2', :'cleo', 'Garage night @mia_maier @dirk_drift', now());
select tests.ok(
  exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'mia' and post_id = 'f9000000-0000-0000-0000-0000000000d2')
  and not exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'dirk' and post_id = 'f9000000-0000-0000-0000-0000000000d2'),
  'only people who can see the post are told');

select set_config('request.jwt.claims', json_build_object('sub', :'mia', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.comments (post_id, author_id, body)
values (:'post', auth.uid(), 'Thanks @ben.bmw!') returning id as comment_mia \gset
reset role;
select tests.ok(exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'ben'
                          and data ->> 'comment_id' = :'comment_mia'),
  'mentions in comments notify');
delete from public.comments where id = :'comment_mia';
select tests.ok(not exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'ben'),
  'deleting the comment removes its mention notification');

-- Push follows the "comments" switch.
insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[mia-phone-1234567]', :'mia', 'ios');
update public.user_settings set push_comments = false where user_id = :'mia';
insert into public.posts (author_id, caption, published_at) values (:'ann', 'Again @mia_maier', now());
select tests.ok(
  exists (select 1 from public.notifications where type = 'mention' and recipient_id = :'mia' and data ->> 'excerpt' = 'Again @mia_maier')
  and not exists (select 1 from private.push_outbox where user_id = :'mia' and data ->> 'type' = 'mention'),
  'mention pushes follow the "comments" switch (still shown in the app)');

-- The unread badge hides the same notifications as the list: from people who
-- blocked you or whom you blocked, suspended people, and people without
-- consent. A locked account still counts notifications without a sender.
insert into public.profiles (id, username, display_name) values (:'gil', 'gil_google', 'Gil');
update public.notifications set read_at = now() where recipient_id in (:'jo', :'ben', :'dirk', :'gil');
insert into public.notifications (recipient_id, actor_id, type) values
  (:'jo', :'ann', 'follow'), (:'jo', :'eve', 'follow'), (:'jo', :'gil', 'follow'),
  (:'ben', :'dirk', 'follow'), (:'ben', :'ann', 'follow'),
  (:'dirk', :'ben', 'follow'), (:'dirk', :'ann', 'follow'),
  (:'gil', :'ann', 'follow'), (:'gil', null, 'report_resolved');
select set_config('request.jwt.claims', json_build_object('sub', :'jo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_notification_count() = 1, 'badge: suspended senders and senders without consent are not counted');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_notification_count() = 1, 'badge: people who blocked you are not counted');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_notification_count() = 1, 'badge: people you blocked are not counted');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_notification_count() = 1, 'badge: a locked account counts only notifications without a sender');
reset role;

-- The unread badge stops counting at 100 (the app shows "99+").
insert into public.notifications (recipient_id, type, data)
select :'jo', 'report_resolved', '{}'::jsonb from generate_series(1, 105);
select set_config('request.jwt.claims', json_build_object('sub', :'jo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_notification_count() = 100, 'the unread badge stops counting at 100');
reset role;

-- ------------------------------------------------------------------ access ----
set local role anon;
select tests.throws($$select * from public.search_people('ann')$$, 'anonymous users cannot search people', '42501');
select tests.throws($$select * from public.search_vehicles('porsche')$$, 'anonymous users cannot search cars', '42501');
select tests.throws($$select * from public.suggested_people()$$, 'anonymous users get no suggestions', '42501');
reset role;

rollback;
