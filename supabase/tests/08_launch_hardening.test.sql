-- =============================================================================
-- Milestone 7: locked accounts, statements of reasons, DSA appeals, moderation
-- statistics, push switches per type.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set ann  'a8000000-0000-0000-0000-000000000001'
\set ben  'b8000000-0000-0000-0000-000000000002'
\set cleo 'c8000000-0000-0000-0000-000000000003'
\set dirk 'd8000000-0000-0000-0000-000000000004'
\set mod  'e8000000-0000-0000-0000-000000000005'
\set mod2 'f8000000-0000-0000-0000-000000000006'
\set gil  'f8000000-0000-0000-0000-0000000000aa'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'ann'::uuid, 'ann@m7.dev'), (:'ben'::uuid, 'ben@m7.dev'), (:'cleo'::uuid, 'cleo@m7.dev'),
             (:'dirk'::uuid, 'dirk@m7.dev'), (:'mod'::uuid, 'mod@m7.dev'), (:'mod2'::uuid, 'mod2@m7.dev')) as u(id, email);
insert into public.profiles (id, username, display_name) values
  (:'ann', 'ann_m7', 'Ann'), (:'ben', 'ben_m7', 'Ben'), (:'cleo', 'cleo_m7', 'Cleo'),
  (:'dirk', 'dirk_m7', 'Dirk'), (:'mod', 'mod_m7', 'Mod'), (:'mod2', 'mod2_m7', 'Mod Two');
insert into private.user_roles (user_id, role) values (:'mod', 'admin'), (:'mod2', 'admin');
-- A Google sign-up that has not given consent yet.
insert into auth.users (id, email, raw_app_meta_data) values (:'gil', 'gil@gmail.example', '{"provider":"google"}');

-- Content
insert into public.posts (id, author_id, caption) values
  ('f8000000-0000-0000-0000-0000000000a1', :'ann', 'Track day'),
  ('f8000000-0000-0000-0000-0000000000a2', :'ben', 'My build'),
  ('f8000000-0000-0000-0000-0000000000a3', :'mod2', 'Admin post');
update public.posts set published_at = now();
\set post_ann  'f8000000-0000-0000-0000-0000000000a1'
\set post_ben  'f8000000-0000-0000-0000-0000000000a2'
\set post_mod2 'f8000000-0000-0000-0000-0000000000a3'
insert into public.vehicles (id, owner_id, make, model, model_year) values
  ('f8000000-0000-0000-0000-0000000000b1', :'ann', 'BMW', 'M3', 2021),
  ('f8000000-0000-0000-0000-0000000000b2', :'ann', 'VW', 'Golf GTI', 2019);
\set car1 'f8000000-0000-0000-0000-0000000000b1'
\set car2 'f8000000-0000-0000-0000-0000000000b2'
insert into public.comments (id, post_id, author_id, body) values
  ('f8000000-0000-0000-0000-0000000000c1', :'post_ben', :'ann', 'Ugly car');
\set comment_ann 'f8000000-0000-0000-0000-0000000000c1'
insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[ann-phone-123456]', :'ann', 'ios'),
  ('ExponentPushToken[ben-phone-123456]', :'ben', 'android');

-- --------------------------------------------- push switches per type ------
update public.user_settings set push_likes = false where user_id = :'ann';
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.likes (user_id, post_id) values (auth.uid(), :'post_ann');
insert into public.comments (post_id, author_id, body) values (:'post_ann', auth.uid(), 'Nice line through turn 3');
reset role;
select tests.ok(
  exists (select 1 from public.notifications where recipient_id = :'ann' and type = 'like'),
  'likes still appear in the app when their push is switched off');
select tests.ok(
  not exists (select 1 from private.push_outbox where user_id = :'ann' and data ->> 'type' = 'like')
  and exists (select 1 from private.push_outbox where user_id = :'ann' and data ->> 'type' = 'comment'),
  'push switched off for likes only: no like push, comment push still sent');

update public.user_settings set push_messages = false where user_id = :'ben';
insert into public.follows (follower_id, followee_id) values (:'ben', :'ann');
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'ben') as conv \gset
select public.send_message(:'conv', 'Hi Ben');
reset role;
select tests.ok(not exists (select 1 from private.push_outbox where user_id = :'ben' and data ->> 'type' = 'message'),
  'message pushes can be switched off');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.user_settings set push_comments = false where user_id = auth.uid();
select tests.ok((select not push_comments from public.user_settings where user_id = auth.uid()), 'users can change their push switches');
reset role;

-- ----------------------------------------------------- locked accounts ------
-- Ben reports Ann's profile; the moderator suspends her.
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('user', :'ann', 'harassment', 'Insults everyone') as rep_suspend \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep_suspend', 'suspend', 'Repeated insults in comments');
reset role;

select tests.ok(
  (select data ->> 'note' = 'Repeated insults in comments' and data ->> 'reason' = 'harassment'
          and data ->> 'report_id' = :'rep_suspend'
     from public.notifications where recipient_id = :'ann' and type = 'account_suspended'),
  'a suspension comes with a statement of reasons');
select tests.ok(
  (select not (data ? 'note') and data ->> 'report_id' = :'rep_suspend'
     from private.push_outbox where user_id = :'ann' and data ->> 'type' = 'account_suspended'),
  'the push only carries ids, never the moderator''s note');
select tests.ok(
  (select banned_until is null from auth.users where id = :'ann') and private.is_locked(:'ann'),
  'a suspended person can still sign in, but the account is locked');
select tests.ok((select action = 'suspend' from public.reports where id = :'rep_suspend'), 'the report records which action was taken');

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.profiles where id = :'ann') = 1, 'locked: still sees their own profile');
select tests.ok((select count(*) from public.profiles where id = :'ben') = 0, 'locked: sees nobody else');
select tests.ok((select count(*) from public.posts where id = :'post_ben') = 0, 'locked: sees no posts of others');
select tests.throws(format($$select public.send_message(%L, 'still here?')$$, :'conv'), 'locked: cannot send messages', '42501');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L)$$, :'ann' || '/new.jpg', :'ann'),
  'locked: cannot upload files', '42501');
select tests.ok(
  (select count(*) from public.my_notifications() where type = 'account_suspended') = 1,
  'locked: can read the suspension notice');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'gil', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(
  format($$insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L)$$, :'gil' || '/a.jpg', :'gil'),
  'no consent yet: cannot upload a public profile picture', '42501');
reset role;

-- ------------------------------------------------------------- appeals -------
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select role = 'owner' and action = 'suspend' and note = 'Repeated insults in comments'
          and appeal_until > now() + interval '5 months' and appeal_id is null
     from public.my_decisions() where report_id = :'rep_suspend'),
  'the person sees the decision, the reason and how long they can appeal');
select tests.throws(format($$select public.submit_appeal(%L, 'unfair')$$, :'rep_suspend'),
  'an appeal needs an explanation (10+ characters)', 'P0001');
select public.submit_appeal(:'rep_suspend', 'I was quoting someone else, please look at the context.') as appeal_ann \gset
select tests.throws(format($$select public.submit_appeal(%L, 'Second try at an appeal')$$, :'rep_suspend'),
  'one appeal per decision', 'P0001');
select tests.throws($$insert into public.appeals (report_id, appellant_id, role, reason) values (gen_random_uuid(), auth.uid(), 'owner', 'direct insert attempt')$$,
  'appeals cannot be inserted directly', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.submit_appeal(%L, 'I want a harsher punishment')$$, :'rep_suspend'),
  'a reporter cannot appeal a decision that went their way', '42501');
select tests.ok((select count(*) from public.appeals) = 0, 'appeals of others are not visible');
reset role;

-- Cleo reports Ben's post; the moderator finds no violation; Cleo appeals.
select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('post', :'post_ben', 'spam', 'Advertises fake parts') as rep_dismissed \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep_dismissed', 'dismiss');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select role = 'reporter' and action = 'dismiss' and note is null from public.my_decisions() where report_id = :'rep_dismissed'),
  'a reporter sees "no violation" decisions and can appeal them');
select public.submit_appeal(:'rep_dismissed', 'The post links to a shop selling counterfeit wheels.') as appeal_cleo \gset
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.submit_appeal(%L, 'I just want to interfere here')$$, :'rep_dismissed'),
  'outsiders cannot appeal', '42501');
reset role;

-- Appeal window: 6 months.
insert into public.reports (id, reporter_id, target_type, target_id, target_owner_id, reason, status, action, handled_at, created_at)
values ('f8000000-0000-0000-0000-0000000000d1', :'dirk', 'post', :'post_ben', :'ben', 'spam', 'dismissed', 'dismiss',
        now() - interval '7 months', now() - interval '7 months');
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select public.submit_appeal('f8000000-0000-0000-0000-0000000000d1', 'Too late but trying anyway')$$,
  'appeals close 6 months after the decision', 'P0001');
reset role;

-- Ann's comment is removed and her post too (by mod), and Mod Two's post (by mod).
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('comment', :'comment_ann', 'harassment') as rep_comment \gset
select public.report_content('post', :'post_mod2', 'spam') as rep_mod2 \gset
reset role;
insert into public.reports (id, reporter_id, target_type, target_id, target_owner_id, reason)
values ('f8000000-0000-0000-0000-0000000000d2', :'dirk', 'post', :'post_ann', :'ann', 'violence');
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep_comment', 'remove', 'Insult');
select public.admin_resolve_report('f8000000-0000-0000-0000-0000000000d2', 'remove', 'Dangerous driving');
select public.admin_resolve_report(:'rep_mod2', 'remove', 'Spam');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.submit_appeal(:'rep_comment', 'It was a joke between friends.') as appeal_comment \gset
select public.submit_appeal('f8000000-0000-0000-0000-0000000000d2', 'This was on a closed track, not a road.') as appeal_post \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod2', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.submit_appeal(:'rep_mod2', 'This is an official PL8 announcement.') as appeal_mod2 \gset
reset role;

-- Moderators
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select * from public.admin_appeals_queue()$$, 'non-admins cannot see appeals', '42501');
select tests.throws(format($$select public.admin_decide_appeal(%L, 'reversed', 'nice try')$$, :'appeal_ann'),
  'non-admins cannot decide appeals', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.admin_appeals_queue()) = 5, 'all open appeals are in the queue');
select tests.ok(
  (select not restorable from public.admin_appeals_queue() where appeal_id = :'appeal_comment')
  and (select restorable from public.admin_appeals_queue() where appeal_id = :'appeal_post'),
  'the queue says what can be restored (deleted comments cannot)');
select tests.ok(
  (select appeal_reason like 'I was quoting%' and decision_note = 'Repeated insults in comments' and owner_username = 'ann_m7'
     from public.admin_appeals_queue() where appeal_id = :'appeal_ann'),
  'moderators see the appeal next to the original decision');
select tests.throws(format($$select public.admin_decide_appeal(%L, 'reversed', '')$$, :'appeal_ann'),
  'deciding an appeal needs a reason', 'P0001');
select tests.throws(format($$select public.admin_decide_appeal(%L, 'maybe', 'unsure')$$, :'appeal_ann'),
  'unknown outcome rejected', 'P0001');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'mod2', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.admin_decide_appeal(%L, 'reversed', 'Obviously fine')$$, :'appeal_mod2'),
  'nobody decides their own appeal', '42501');
reset role;

-- Remove one car, then reverse the suspension: the other car comes back.
update public.vehicles set is_restricted = true where id = :'car2';
insert into private.admin_actions (admin_id, action, target_type, target_id, reason)
values (:'mod', 'report_remove', 'vehicle', :'car2', 'Stolen photos');

select set_config('request.jwt.claims', json_build_object('sub', :'mod2', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_decide_appeal(:'appeal_ann', 'reversed', 'Context shows a quote; suspension lifted.');
select public.admin_decide_appeal(:'appeal_post', 'reversed', 'Closed track event, allowed.');
select public.admin_decide_appeal(:'appeal_comment', 'upheld', 'Insults are not allowed, even as jokes.');
select public.admin_decide_appeal(:'appeal_cleo', 'reversed', 'Second look: it is spam.');
select tests.throws(format($$select public.admin_decide_appeal(%L, 'upheld', 'again')$$, :'appeal_ann'),
  'an appeal is decided only once', 'P0001');
reset role;

select tests.ok(
  not private.is_locked(:'ann')
  and (select not is_restricted from public.vehicles where id = :'car1')
  and (select is_restricted from public.vehicles where id = :'car2'),
  'reversed suspension: account unlocked, cars back (except one removed separately)');
select tests.ok((select not is_removed from public.posts where id = :'post_ann'), 'reversed removal: the post is back');
select tests.ok(
  (select status = 'open' and action is null and handled_at is null from public.reports where id = :'rep_dismissed'),
  'reversed "no violation": the report goes back into the queue');
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'ann' and type = 'appeal_decided') = 3
  and (select data ->> 'outcome' = 'upheld' from public.notifications
        where recipient_id = :'ann' and type = 'appeal_decided' and data ->> 'report_id' = :'rep_comment'),
  'the person is told the outcome of each appeal');
select tests.ok(
  (select count(*) from private.admin_actions where action in ('appeal_reversed', 'appeal_upheld')) = 4,
  'appeal decisions are logged');

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.profiles where id = :'ann') = 1, 'after the reversal others see the account again');
reset role;

-- A car removed by a moderator and later reinstated on appeal stays visible
-- when a suspension is lifted afterwards.
select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('vehicle', :'car1', 'impersonation') as rep_car \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep_car', 'remove', 'Not the owner');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.submit_appeal(:'rep_car', 'Here is my registration, it is my car.') as appeal_car \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod2', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_decide_appeal(:'appeal_car', 'reversed', 'Ownership confirmed');
reset role;
update public.profiles set suspended_at = now() where id = :'ann';
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_unsuspend_user(:'ann', 'Test');
reset role;
select tests.ok((select not is_restricted from public.vehicles where id = :'car1'),
  'a car reinstated on appeal is not hidden again by a later unsuspension');

-- ------------------------------------------------------------ statistics -----
select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select public.admin_moderation_stats(now() - interval '1 day', now())$$, 'non-admins cannot see statistics', '42501');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select public.admin_moderation_stats(now(), now() - interval '1 day')$$, 'the period must make sense', 'P0001');
select public.admin_moderation_stats(now() - interval '1 day', now() + interval '1 minute') as stats \gset
reset role;
select tests.ok(
  -- 6 reports in the period (the 7-month-old one is outside it)
  (:'stats'::jsonb ->> 'reports_received')::int = 6
  and (:'stats'::jsonb -> 'reports_by_reason' ->> 'harassment')::int = 2
  -- 4 removals through reports + 1 car removal recorded directly above
  and (:'stats'::jsonb -> 'decisions' ->> 'remove')::int = 5
  and (:'stats'::jsonb -> 'decisions' ->> 'suspend')::int = 1
  and (:'stats'::jsonb -> 'decisions' ->> 'dismiss')::int = 1
  and (:'stats'::jsonb ->> 'appeals_received')::int = 6
  and (:'stats'::jsonb ->> 'appeals_reversed')::int = 4
  and (:'stats'::jsonb ->> 'appeals_upheld')::int = 1
  and (:'stats'::jsonb ->> 'appeals_open')::int = 1
  and (:'stats'::jsonb ? 'median_hours_to_decision'),
  'statistics count reports, decisions and appeals for the period');

-- ----------------------------------------------------------- data export -----
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select jsonb_array_length(d -> 'appeals') = 4 and d -> 'profile' ->> 'username' = 'ann_m7' from public.export_my_data() d),
  'the data export now includes the person''s appeals');
reset role;

-- ---------------------------------------------------------- performance -----
-- The faster feed pages through everything exactly once, newest first.
insert into public.follows (follower_id, followee_id) values (:'dirk', :'ben'), (:'dirk', :'cleo') on conflict do nothing;
insert into public.posts (author_id, caption, published_at)
select (array[:'ben'::uuid, :'cleo'::uuid, :'dirk'::uuid])[1 + i % 3], 'Feed ' || i, now() - (i * interval '1 hour')
from generate_series(1, 25) i;
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select published_at as p1_at, post_id as p1_id from public.get_posts('home', null, null, null, null, 10) offset 9 limit 1 \gset
select published_at as p2_at, post_id as p2_id from public.get_posts('home', null, null, :'p1_at', :'p1_id', 10) offset 9 limit 1 \gset
select tests.ok(
  (select count(*) = count(distinct post_id) and count(*) = (select count(*) from public.posts p
       where p.published_at is not null and not p.is_removed and p.author_id in (:'ben', :'cleo', :'dirk'))
   from (select post_id from public.get_posts('home', null, null, null, null, 10)
         union all select post_id from public.get_posts('home', null, null, :'p1_at', :'p1_id', 10)
         union all select post_id from public.get_posts('home', null, null, :'p2_at', :'p2_id', 10)) pages),
  'home feed pages cover every post of followed people exactly once');
select tests.ok(
  (select bool_and(published_at >= lead_at) from (
     select published_at, lead(published_at) over (order by published_at desc, post_id desc) as lead_at
     from public.get_posts('home', null, null, null, null, 10)) x where lead_at is not null),
  'home feed is sorted newest first');
reset role;

select tests.ok(
  not exists (
    select 1 from pg_constraint c
    where c.contype = 'f' and c.connamespace::regnamespace::text in ('public', 'private')
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)),
  'every foreign key has an index (deletes never scan whole tables)');

set local role anon;
select tests.throws($$select * from public.my_decisions()$$, 'anonymous users cannot list decisions', '42501');
select tests.throws($$select public.submit_appeal(gen_random_uuid(), 'anonymous appeal')$$, 'anonymous users cannot appeal', '42501');
reset role;

rollback;
