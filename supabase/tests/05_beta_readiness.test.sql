-- =============================================================================
-- Milestone 5: notifications, push queue, reports, moderation, suspension,
-- account deletion, data export, retention, orphaned files.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set ana  'a2000000-0000-0000-0000-000000000001'
\set ben  'b2000000-0000-0000-0000-000000000002'
\set cleo 'c2000000-0000-0000-0000-000000000003'
\set dirk 'd2000000-0000-0000-0000-000000000004'
\set mod  'e2000000-0000-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'ana'::uuid, 'ana@t.dev'), (:'ben'::uuid, 'ben@t.dev'), (:'cleo'::uuid, 'cleo@t.dev'),
             (:'dirk'::uuid, 'dirk@t.dev'), (:'mod'::uuid, 'mod@t.dev')) as u(id, email);
insert into public.profiles (id, username, display_name, is_private) values
  (:'ana', 'ana_m3', 'Ana', false), (:'ben', 'ben_rs4', 'Ben', false), (:'cleo', 'cleo_private', 'Cleo', true),
  (:'dirk', 'dirk_spam', 'Dirk', false), (:'mod', 'pl8_mod', 'Moderator', false);
insert into private.user_roles (user_id, role) values (:'mod', 'admin');
update public.user_settings set locale = 'en' where user_id = :'ana';

-- Ana has a published post
insert into public.posts (id, author_id, caption) values ('f2000000-0000-0000-0000-0000000000a1', :'ana', 'Nordschleife day');
insert into public.post_media (post_id, storage_path) values ('f2000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-0000000000a1/1.jpg');
update public.posts set published_at = now() where id = 'f2000000-0000-0000-0000-0000000000a1';
\set post 'f2000000-0000-0000-0000-0000000000a1'

-- ---------------------------------------------------------- push tokens ------
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[ana-phone-123456]', 'ios');
select tests.ok((select count(*) from public.push_tokens) = 1, 'user can register a push token');
select tests.throws($$select public.register_push_token('not-a-token', 'ios')$$, 'invalid push token rejected', '23514');
select tests.throws(
  $$insert into public.notifications (recipient_id, type) values (auth.uid(), 'follow')$$,
  'notifications cannot be created by users', '42501');
reset role;

-- ------------------------------------------------------------- follows -------
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.follow_user(:'ana');
select public.follow_user(:'cleo');
select tests.ok((select count(*) from public.notifications) = 0, 'actors do not get their own notifications');
reset role;

select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'ana' and type = 'follow' and actor_id = :'ben') = 1,
  'a new follower creates a "follow" notification');
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'cleo' and type = 'follow_request') = 1,
  'a follow request creates a "follow_request" notification');
select tests.ok(
  (select body = 'Ben started following you' and tokens = array['ExponentPushToken[ana-phone-123456]']
     from private.push_outbox where user_id = :'ana' order by id desc limit 1),
  'push is queued in the recipient''s language');

select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.respond_follow_request(:'ben', true);
reset role;
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'ben' and type = 'follow_accepted' and actor_id = :'cleo') = 1,
  'accepting a request tells the requester');
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'cleo' and type = 'follow') = 0,
  'the person accepting does not get a "follow" notification');

select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.follow_user(:'cleo');
select public.unfollow_user(:'cleo');
reset role;
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'cleo' and actor_id = :'dirk') = 0,
  'withdrawing a request removes its notification');

-- ------------------------------------------------------- likes/comments ------
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.likes (user_id, post_id) values (auth.uid(), :'post');
delete from public.likes where user_id = auth.uid() and post_id = :'post';
insert into public.likes (user_id, post_id) values (auth.uid(), :'post');
insert into public.comments (post_id, author_id, body) values (:'post', auth.uid(), 'Which tyres?') returning id as comment_ben \gset
reset role;
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'ana' and type = 'like') = 1,
  'like / unlike / like leaves exactly one like notification');
select tests.ok(
  (select data ->> 'excerpt' = 'Which tyres?' from public.notifications where recipient_id = :'ana' and type = 'comment'),
  'comment notification includes a short excerpt');

select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.likes (user_id, post_id) values (auth.uid(), :'post');
select tests.ok((select count(*) from public.notifications where type = 'like' and actor_id = auth.uid()) = 0,
  'liking your own post creates no notification');
select tests.ok(public.unread_notification_count() = 3, 'unread count (follow, like, comment)');
select tests.ok(
  (select count(*) from public.my_notifications()) = 3
  and (select actor_username = 'ben_rs4' from public.my_notifications() limit 1),
  'notification list includes the actor');
select tests.throws(
  $$update public.notifications set type = 'like'$$,
  'only read_at may be changed', '42501');
select public.mark_notifications_read();
select tests.ok(public.unread_notification_count() = 0, 'mark all as read');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.notifications) = 0, 'users cannot read other people''s notifications');
reset role;

-- deleting the comment removes its notification
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
delete from public.comments where id = :'comment_ben';
reset role;
select tests.ok(not exists (select 1 from public.notifications where type = 'comment' and recipient_id = :'ana'),
  'deleting a comment removes its notification');

-- push switch
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.user_settings set push_enabled = false;
reset role;
delete from private.push_outbox;
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.follow_user(:'ana');
reset role;
select tests.ok(
  (select count(*) from public.notifications where recipient_id = :'ana' and actor_id = :'dirk') = 1
  and (select count(*) from private.push_outbox where user_id = :'ana') = 0,
  'push off: in-app notification only, no push');
update public.user_settings set push_enabled = true where user_id = :'ana';

-- blocked actors
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values (:'ana', :'dirk');
select tests.ok((select count(*) from public.my_notifications() where actor_username = 'dirk_spam') = 0,
  'notifications from blocked people are hidden');
reset role;

-- --------------------------------------------------------- message push ------
-- Ana follows Ben, so Ben's chat is accepted straight away.
insert into public.follows (follower_id, followee_id) values (:'ana', :'ben');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'ana') as conv \gset
select public.send_message(:'conv', 'My secret phone number is 0170 1234567');
select public.send_message(:'conv', 'second message');
reset role;
select tests.ok(
  (select count(*) from private.push_outbox where user_id = :'ana' and data ->> 'conversation_id' = :'conv') = 1,
  'message pushes are throttled per conversation');
select tests.ok(
  (select body = 'New message from Ben' and body not like '%0170%' from private.push_outbox
    where user_id = :'ana' and data ->> 'conversation_id' = :'conv'),
  'message pushes never contain the message text');

-- verification outcome
insert into public.vehicles (id, owner_id, make, model, model_year) values ('f2000000-0000-0000-0000-0000000000b1', :'ana', 'BMW', 'M3', 2021);
insert into private.plate_claims (id, vehicle_id, user_id, country, plate)
values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000b1', :'ana', 'DE', 'F-AN-3');
update private.plate_claims set status = 'verified' where id = 'f2000000-0000-0000-0000-0000000000c1';
select tests.ok(
  exists (select 1 from public.notifications where recipient_id = :'ana' and type = 'verification_approved'
            and vehicle_id = 'f2000000-0000-0000-0000-0000000000b1'),
  'verification approval notifies the owner');

-- --------------------------------------------------------------- reports -----
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('post', :'post', 'harassment', 'Insulting caption') as rep1 \gset
select tests.ok(public.report_content('post', :'post', 'spam') = :'rep1', 'reporting again returns the same open report');
select tests.throws(format($$select public.report_content('user', %L, 'spam')$$, :'ben'), 'cannot report yourself', 'P0001');
select tests.throws(
  $$insert into public.reports (reporter_id, target_type, target_id, reason) values (auth.uid(), 'user', auth.uid(), 'spam')$$,
  'reports cannot be inserted directly', '42501');
select tests.ok((select count(*) from public.my_reports()) = 1, 'reporter sees their report');
select tests.throws($$select * from public.admin_reports_queue()$$, 'non-admins cannot see the report queue', '42501');
reset role;

-- message reports work even after blocking
select id as msg_ben from public.messages where conversation_id = :'conv' limit 1 \gset
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values (:'ana', :'ben');
select tests.ok(
  public.report_content('message', :'msg_ben', 'harassment') is not null,
  'a blocked sender''s message can still be reported');
delete from public.blocks where blocker_id = :'ana' and blocked_id = :'ben';
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(
  format($$select public.report_content('message', %L, 'spam')$$, :'msg_ben'),
  'non-participants cannot report a message they never saw', '42501');
reset role;

-- a private post cannot be reported by someone who cannot see it
insert into public.posts (id, author_id, caption) values ('f2000000-0000-0000-0000-0000000000a2', :'cleo', 'private');
insert into public.post_media (post_id, storage_path) values ('f2000000-0000-0000-0000-0000000000a2', 'f2000000-0000-0000-0000-0000000000a2/1.jpg');
update public.posts set published_at = now() where id = 'f2000000-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claims', json_build_object('sub', :'dirk', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select public.report_content('post', 'f2000000-0000-0000-0000-0000000000a2', 'spam')$$,
  'cannot report content you cannot see', '42501');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'cleo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('post', :'post', 'spam') as rep2 \gset
reset role;

-- moderation
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select open_reports = 2 and preview ->> 'caption' = 'Nordschleife day' and owner_username = 'ana_m3'
     from public.admin_reports_queue() where report_id = :'rep1'),
  'moderator sees the content, owner and number of reports');
select tests.throws(format($$select public.admin_resolve_report(%L, 'remove', '')$$, :'rep1'),
  'removing content needs a reason', 'P0001');
select tests.throws(format($$select public.admin_resolve_report(%L, 'delete-everything', 'x')$$, :'rep1'),
  'unknown moderation action rejected', 'P0001');
select public.admin_resolve_report(:'rep1', 'remove', 'Harassing caption');
reset role;

select tests.ok((select is_removed from public.posts where id = :'post'), 'removed post is hidden');
select tests.ok(
  (select count(*) from public.reports where target_id = :'post' and status = 'actioned') = 2,
  'all open reports on the same content are closed together');
select tests.ok(
  (select count(*) from public.notifications where type = 'report_resolved' and recipient_id in (:'ben', :'cleo')) = 2,
  'every reporter is told the report was handled');
select tests.ok(
  (select data ->> 'reason' = 'harassment' from public.notifications where recipient_id = :'ana' and type = 'content_removed'),
  'the affected person is told why (statement of reasons)');
select tests.ok(
  exists (select 1 from private.admin_actions where action = 'report_remove' and target_id = :'post'),
  'moderation decisions are logged');

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.get_posts('single', null, :'post')) = 0, 'removed post no longer appears');
reset role;

-- suspension
-- Dirk has two cars; one was already removed by a moderator after a report.
insert into public.vehicles (id, owner_id, make, model, model_year) values
  ('f2000000-0000-0000-0000-0000000000d1', :'dirk', 'Audi', 'RS3', 2022),
  ('f2000000-0000-0000-0000-0000000000d2', :'dirk', 'VW', 'Golf R', 2020);
insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason)
values (:'cleo', 'vehicle', 'f2000000-0000-0000-0000-0000000000d2', :'dirk', 'illegal')
returning id as rep_car \gset
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep_car', 'remove', 'Stolen car photos');
reset role;
select tests.ok((select is_restricted from public.vehicles where id = 'f2000000-0000-0000-0000-0000000000d2'),
  'removed vehicle is hidden');

select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('user', :'dirk', 'spam', 'Spams everyone') as rep3 \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_resolve_report(:'rep3', 'suspend', 'Repeated spam');
reset role;
select tests.ok((select banned_until = 'infinity' from auth.users where id = :'dirk'), 'suspended account cannot sign in');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.profiles where id = :'dirk') = 0, 'suspended profile is hidden from others');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_unsuspend_user(:'dirk', 'Appeal accepted');
reset role;
select tests.ok((select banned_until is null from auth.users where id = :'dirk'), 'unsuspending restores sign-in');
select tests.ok(
  (select not is_restricted from public.vehicles where id = 'f2000000-0000-0000-0000-0000000000d1')
  and (select is_restricted from public.vehicles where id = 'f2000000-0000-0000-0000-0000000000d2'),
  'unsuspending shows the cars again, but not one a moderator removed');

-- The SQL-Editor snippet from docs/SUPABASE-SETUP.md (runs as the database owner).
update public.profiles set suspended_at = now() where id = :'dirk';
update auth.users set banned_until = 'infinity' where id = :'dirk';
do $$
declare
  target uuid := (select id from auth.users where email = 'dirk@t.dev');
  admin uuid := (select id from auth.users where email = 'mod@t.dev');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.admin_unsuspend_user(target, 'Lifted from the SQL Editor');
end $$;
select tests.ok(
  (select banned_until is null from auth.users where id = :'dirk')
  and (select suspended_at is null from public.profiles where id = :'dirk')
  and exists (select 1 from private.admin_actions where action = 'user_unsuspended' and admin_id = :'mod'
              and target_id = :'dirk' and reason = 'Lifted from the SQL Editor'),
  'the documented SQL-Editor snippet lifts a suspension and logs who did it');

-- self-review
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_content('user', :'mod', 'other', 'test') as rep4 \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.admin_resolve_report(%L, 'dismiss')$$, :'rep4'),
  'moderators cannot decide reports about themselves', '42501');
reset role;

-- ------------------------------------------------------------- export --------
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select d -> 'profile' ->> 'username' = 'ana_m3'
      and jsonb_array_length(d -> 'plates') = 1
      and d -> 'plates' -> 0 ->> 'plate' = 'F-AN-3'
      and jsonb_array_length(d -> 'messages') >= 1
      and d -> 'account' ->> 'email' = 'ana@t.dev'
   from public.export_my_data() d),
  'data export contains profile, plates, messages and account');
reset role;

-- ------------------------------------------------------------ retention ------
insert into public.notifications (recipient_id, type, read_at, created_at)
values (:'ana', 'follow', now() - interval '100 days', now() - interval '100 days');
insert into public.posts (author_id, caption, created_at) values (:'ana', 'old draft', now() - interval '2 days');
select private.run_retention();
select tests.ok(
  not exists (select 1 from public.notifications where created_at < now() - interval '90 days')
  and not exists (select 1 from public.posts where caption = 'old draft'),
  'retention removes old notifications and abandoned drafts');

-- ------------------------------------------------------- orphaned files ------
insert into storage.objects (bucket_id, name, created_at) values ('post-media', 'f2000000-0000-0000-0000-00000000dead/x.jpg', now() - interval '3 days');
select set_config('request.jwt.claims', json_build_object('sub', :'mod', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  exists (select 1 from public.admin_orphaned_files() where path = 'f2000000-0000-0000-0000-00000000dead/x.jpg'),
  'orphaned files are listed for clean-up');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws($$select * from public.admin_orphaned_files()$$, 'non-admins cannot list files', '42501');
reset role;

-- ------------------------------------------------------ account deletion -----
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = :'ben'), 'account deletion removes the login');
select tests.ok(
  not exists (select 1 from public.profiles where id = :'ben')
  and not exists (select 1 from public.follows where follower_id = :'ben' or followee_id = :'ben')
  and not exists (select 1 from public.push_tokens where user_id = :'ben')
  and not exists (select 1 from public.notifications where actor_id = :'ben'),
  'profile, follows, tokens and notifications are deleted');
select tests.ok(
  exists (select 1 from public.messages where conversation_id = :'conv' and sender_id is null)
  and exists (select 1 from public.reports where id = :'rep1' and reporter_id is null),
  'messages to others and moderation records remain, without the person');

set local role anon;
select tests.throws($$select public.delete_my_account()$$, 'anonymous users cannot call account deletion', '42501');
select tests.throws($$select public.export_my_data()$$, 'anonymous users cannot export data', '42501');
reset role;

rollback;
