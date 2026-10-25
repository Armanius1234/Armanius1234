-- =============================================================================
-- Milestone 4: conversations, message requests, messaging policy, unread,
-- blocking, privacy of messages.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set mia  'a1000000-0000-0000-0000-000000000001'
\set leo  'b1000000-0000-0000-0000-000000000002'
\set zoe  'c1000000-0000-0000-0000-000000000003'
\set max  'd1000000-0000-0000-0000-000000000004'
\set eva  'e1000000-0000-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'mia'::uuid, 'mia@t.dev'), (:'leo'::uuid, 'leo@t.dev'), (:'zoe'::uuid, 'zoe@t.dev'),
             (:'max'::uuid, 'max@t.dev'), (:'eva'::uuid, 'eva@t.dev')) as u(id, email);
insert into public.profiles (id, username, display_name) values
  (:'mia', 'mia_gt3', 'Mia'), (:'leo', 'leo_amg', 'Leo'), (:'zoe', 'zoe_rs', 'Zoe'),
  (:'max', 'max_jdm', 'Max'), (:'eva', 'eva_e30', 'Eva');

-- Zoe only accepts messages from people she follows; Max accepts none.
update public.user_settings set messaging_policy = 'followers' where user_id = :'zoe';
update public.user_settings set messaging_policy = 'nobody' where user_id = :'max';
-- Mia follows Eva (so Eva can write to Mia without a request).
insert into public.follows (follower_id, followee_id) values (:'mia', :'eva');

-- -------------------------------------------------------- requests -----------
select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'mia') as conv_lm \gset
select tests.ok(:'conv_lm' is not null, 'a stranger can open a conversation');
select tests.ok(public.start_conversation(:'mia') = :'conv_lm', 'opening again returns the same conversation');
select tests.ok(
  (select status = 'request' and i_sent_request from public.conversation_info(:'conv_lm')),
  'a stranger''s conversation starts as a request');
select tests.throws(format($$select public.start_conversation(%L)$$, :'leo'), 'cannot message yourself', 'P0001');
select tests.throws(format($$select public.start_conversation(%L)$$, :'zoe'),
  '"only people I follow" blocks strangers', 'P0001');
select tests.throws(format($$select public.start_conversation(%L)$$, :'max'),
  '"nobody" blocks everyone new', 'P0001');
select tests.throws(
  format($$insert into public.messages (conversation_id, sender_id, body) values (%L, auth.uid(), 'hi')$$, :'conv_lm'),
  'messages cannot be inserted directly', '42501');
select tests.throws(
  format($$update public.conversations set status = 'active' where id = %L$$, :'conv_lm'),
  'conversation status cannot be changed directly', '42501');

select public.send_message(:'conv_lm', 'Hi! Saw your GT3 at the Feldberg.') as msg1 \gset
select tests.ok(:'msg1' is not null, 'request sender can send one message');
select tests.throws(format($$select public.send_message(%L, 'Hello??')$$, :'conv_lm'),
  'a second message waits until the request is accepted', 'P0001');
select tests.throws(format($$select public.send_message(%L, '   ')$$, :'conv_lm'),
  'empty messages are rejected', 'P0001');
reset role;

-- Bystanders see nothing
select set_config('request.jwt.claims', json_build_object('sub', :'zoe', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.messages) = 0, 'non-participants cannot read messages');
select tests.ok((select count(*) from public.conversations) = 0, 'non-participants cannot see conversations');
select tests.ok((select count(*) from public.conversation_participants) = 0, 'non-participants cannot see who talks to whom');
select tests.throws(format($$select public.send_message(%L, 'intruder')$$, :'conv_lm'),
  'non-participants cannot send', '42501');
select tests.throws(format($$select * from public.conversation_info(%L)$$, :'conv_lm'),
  'non-participants cannot open the conversation', '42501');
select tests.ok(
  tests.affected(format($$delete from public.messages where id = %L$$, :'msg1')) = 0,
  'non-participants cannot delete messages');
reset role;

set local role anon;
select tests.throws($$select * from public.messages$$, 'anonymous users cannot read messages', '42501');
reset role;

-- Recipient
select set_config('request.jwt.claims', json_build_object('sub', :'mia', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select is_request_for_me and unread_count = 1 and other_username = 'leo_amg' and not last_message_mine
     from public.my_conversations() where conversation_id = :'conv_lm'),
  'recipient sees the request with 1 unread message');
select tests.ok(public.unread_message_count() = 0, 'requests do not count towards the unread badge');
select tests.ok((select count(*) from public.messages where conversation_id = :'conv_lm') = 1, 'recipient can read the request message');
select tests.ok(
  tests.affected(format($$delete from public.messages where id = %L$$, :'msg1')) = 0,
  'recipient cannot delete the sender''s message');
select public.send_message(:'conv_lm', 'Thanks! Come to the next meet.');
select tests.ok(
  (select status = 'active' and not is_request_for_me from public.conversation_info(:'conv_lm')),
  'replying accepts the request');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.unread_message_count() = 1, 'sender now has 1 unread reply');
select public.mark_conversation_read(:'conv_lm');
select tests.ok(public.unread_message_count() = 0, 'marking as read clears the badge');
select public.send_message(:'conv_lm', 'Deal!');
select tests.ok(true, 'after acceptance both sides can write freely');
select tests.ok(tests.affected(format($$delete from public.messages where id = %L$$, :'msg1')) = 1,
  'sender can unsend their own message');
reset role;

-- --------------------------------------------- following skips requests ------
select set_config('request.jwt.claims', json_build_object('sub', :'eva', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'mia') as conv_em \gset
select tests.ok(
  (select status = 'active' from public.conversation_info(:'conv_em')),
  'people you follow land directly in your chats');
reset role;

-- Zoe follows Mia (fixture), so Mia may write to Zoe.
insert into public.follows (follower_id, followee_id) values (:'zoe', :'mia') on conflict do nothing;
select set_config('request.jwt.claims', json_build_object('sub', :'mia', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.start_conversation(:'zoe') is not null, '"only people I follow" lets in people Zoe follows');
reset role;

-- --------------------------------------------------------------- decline -----
select set_config('request.jwt.claims', json_build_object('sub', :'max', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.start_conversation(:'leo') as conv_ml \gset
select public.send_message(:'conv_ml', 'Selling my wheels, interested?');
select tests.throws(format($$select public.respond_message_request(%L, false)$$, :'conv_ml'),
  'the sender cannot answer their own request', 'P0001');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.respond_message_request(:'conv_ml', false);
select tests.ok(
  (select count(*) from public.my_conversations() where conversation_id = :'conv_ml') = 0,
  'a declined request disappears from the inbox');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'max', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.send_message(%L, 'please?')$$, :'conv_ml'),
  'no more messages after a decline', 'P0001');
select tests.throws(format($$select public.start_conversation(%L)$$, :'leo'),
  'a declined sender cannot open a new request', 'P0001');
reset role;

-- -------------------------------------------------------------- blocking -----
select set_config('request.jwt.claims', json_build_object('sub', :'mia', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values (:'mia', :'leo');
select tests.ok((select count(*) from public.my_conversations() where conversation_id = :'conv_lm') = 0,
  'blocking hides the conversation for the blocker');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'leo', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.messages where conversation_id = :'conv_lm') = 0,
  'blocked person can no longer read the conversation');
select tests.throws(format($$select public.send_message(%L, 'why?')$$, :'conv_lm'),
  'blocked person cannot send', '42501');
select tests.throws(format($$select public.start_conversation(%L)$$, :'mia'),
  'blocked person cannot start a new conversation', '42501');
reset role;

-- ----------------------------------------------------------- rate limits -----
select set_config('request.jwt.claims', json_build_object('sub', :'eva', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from generate_series(1, 30) g, lateral (select public.send_message(:'conv_em', 'msg ' || g)) s \g /dev/null
select tests.throws(format($$select public.send_message(%L, 'one too many')$$, :'conv_em'),
  'more than 30 messages per minute are blocked', 'P0001');
reset role;

-- --------------------------------------------------------- realtime ----------
select tests.ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages'),
  'messages are published for realtime');

-- ---------------------------------------------------- account deletion -------
delete from auth.users where id = :'eva';
select tests.ok(
  not exists (select 1 from public.conversation_participants where user_id = :'eva')
  and exists (select 1 from public.messages where conversation_id = :'conv_em' and sender_id is null),
  'deleting an account removes the participant and anonymizes their messages');

rollback;
