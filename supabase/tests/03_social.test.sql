-- =============================================================================
-- Milestone 3: following, private accounts, posts, feed, likes, comments, saves.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set ann  'a0000000-0000-0000-0000-00000000000a'
\set ben  'b0000000-0000-0000-0000-00000000000b'
\set cat  'c0000000-0000-0000-0000-00000000000c'
\set dan  'd0000000-0000-0000-0000-00000000000d'

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}'
from (values (:'ann'::uuid, 'ann@t.dev'), (:'ben'::uuid, 'ben@t.dev'),
             (:'cat'::uuid, 'cat@t.dev'), (:'dan'::uuid, 'dan@t.dev')) as u(id, email);
insert into public.profiles (id, username, display_name, is_private) values
  (:'ann', 'ann_public', 'Ann', false),
  (:'ben', 'ben_private', 'Ben', true),
  (:'cat', 'cat_viewer', 'Cat', false),
  (:'dan', 'dan_blocked', 'Dan', false);

-- ------------------------------------------------------------- following -----
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.follow_user(:'ann') = 'following', 'following a public account is immediate');
select tests.ok(public.follow_user(:'ann') = 'following', 'following twice is harmless');
select tests.ok(public.follow_user(:'ben') = 'requested', 'following a private account sends a request');
select tests.throws(format($$select public.follow_user(%L)$$, :'cat'), 'cannot follow yourself', 'P0001');
select tests.throws(
  format($$insert into public.follows (follower_id, followee_id) values (%L, %L)$$, :'cat', :'ben'),
  'cannot skip the request by inserting a follow directly', '42501');
select tests.throws(
  format($$update public.profiles set follower_count = 999 where id = %L$$, :'cat'),
  'follower counts are not writable', '42501');
select tests.ok(
  (select following and not requested from public.relationship(:'ann')) and
  (select requested and not following from public.relationship(:'ben')),
  'relationship reports following and requested');
reset role;

select tests.ok(
  (select follower_count = 1 from public.profiles where id = :'ann')
  and (select following_count = 1 from public.profiles where id = :'cat'),
  'counters follow the follows');

-- Ben's private content before approval
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.posts (author_id, caption) values (:'ben', 'Track day') returning id as post_ben \gset
insert into public.post_media (post_id, storage_path) values (:'post_ben', :'post_ben' || '/1.jpg');
insert into storage.objects (bucket_id, name) values ('post-media', :'post_ben' || '/1.jpg');
select public.publish_post(:'post_ben');
insert into public.vehicles (owner_id, make, model, model_year) values (:'ben', 'Porsche', '911', 2022) returning id as v_ben \gset
select tests.ok((select count(*) from public.my_follow_requests()) = 1, 'private account sees the pending request');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.posts where id = :'post_ben') = 0, 'pending requester cannot see private posts');
select tests.ok((select count(*) from public.get_posts('user', :'ben')) = 0, 'private profile feed is empty for non-followers');
select tests.ok((select count(*) from public.vehicles where owner_id = :'ben') = 0, 'private garage hidden from non-followers');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'post-media' and name like :'post_ben' || '/%') = 0,
  'private post photos cannot be loaded by non-followers');
select tests.throws(format($$select * from public.list_follows(%L, 'followers')$$, :'ben'),
  'follower list of a private account is hidden', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.respond_follow_request(:'cat', true);
select tests.ok(private.is_following(:'cat', :'ben'), 'accepting a request creates the follow');
select tests.throws(format($$select public.respond_follow_request(%L, true)$$, :'dan'),
  'cannot accept a request that does not exist', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.posts where id = :'post_ben') = 1, 'approved follower sees private posts');
select tests.ok((select count(*) from public.vehicles where owner_id = :'ben') = 1, 'approved follower sees the private garage');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'post-media' and name like :'post_ben' || '/%') = 1,
  'approved follower can load the photos');
select tests.ok((select count(*) from public.list_follows(:'ben', 'followers')) = 1, 'follower list visible after approval');
reset role;

-- Ben removes Cat as a follower
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  tests.affected(format($$delete from public.follows where follower_id = %L and followee_id = auth.uid()$$, :'cat')) = 1,
  'a private account can remove a follower');
reset role;
select tests.ok(not private.is_following(:'cat', :'ben'), 'removed follower no longer follows');

-- Going public approves pending requests
select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.follow_user(:'ben') = 'requested', 'Dan requests to follow Ben');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set is_private = false where id = :'ben';
reset role;
select tests.ok(private.is_following(:'dan', :'ben'), 'switching to public approves pending requests');
update public.profiles set is_private = true where id = :'ben';

-- Blocking ends relationships
select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.follow_user(:'ann');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values (:'ann', :'dan');
reset role;
select tests.ok(not private.is_following(:'dan', :'ann'), 'blocking removes the follow');
select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.follow_user(%L)$$, :'ann'), 'blocked users cannot follow', '42501');
reset role;

-- ----------------------------------------------------------------- posts -----
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.vehicles (owner_id, make, model, model_year) values (:'ann', 'BMW', 'M2', 2024) returning id as v_ann \gset
insert into public.posts (author_id, vehicle_id, caption) values (:'ann', :'v_ann', 'New wheels') returning id as post_ann \gset
select tests.throws(format($$select public.publish_post(%L)$$, :'post_ann'), 'a post needs at least one photo', 'P0001');
insert into storage.objects (bucket_id, name) values ('post-media', :'post_ann' || '/a.jpg');
insert into public.post_media (post_id, storage_path, position) values (:'post_ann', :'post_ann' || '/a.jpg', 0);
select tests.throws(
  format($$insert into public.post_media (post_id, storage_path) values (%L, %L)$$, :'post_ann', :'post_ben' || '/x.jpg'),
  'photo path must belong to the post', '23514');
select tests.throws(
  format($$insert into public.posts (author_id, vehicle_id) values (auth.uid(), %L)$$, :'v_ben'),
  'cannot tag someone else''s car', '42501');
select tests.throws(
  format($$insert into public.posts (author_id, caption) values (%L, 'fake')$$, :'cat'),
  'cannot post as someone else', '42501');
select tests.throws(
  format($$update public.posts set like_count = 1000 where id = %L$$, :'post_ann'),
  'like counter is not writable', '42501');
select tests.throws(
  format($$update public.posts set published_at = now() where id = %L$$, :'post_ann'),
  'publishing only through publish_post', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.posts where id = :'post_ann') = 0, 'drafts are invisible to others');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('post-media', %L)$$, :'post_ann' || '/evil.jpg'),
  'cannot upload into someone else''s post', '42501');
select tests.throws(
  format($$insert into public.post_media (post_id, storage_path) values (%L, %L)$$, :'post_ann', :'post_ann' || '/evil.jpg'),
  'cannot attach photos to someone else''s post', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.publish_post(:'post_ann');
select tests.throws(format($$select public.publish_post(%L)$$, :'post_ann'), 'a post cannot be published twice', 'P0001');
select tests.throws(
  format($$insert into public.post_media (post_id, storage_path) values (%L, %L)$$, :'post_ann', :'post_ann' || '/late.jpg'),
  'no new photos after publishing', '42501');
reset role;
select tests.ok((select post_count = 1 from public.profiles where id = :'ann'), 'post counter increases on publish');

-- ------------------------------------------------------------------ feeds -----
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select author_username = 'ann_public' and vehicle_make = 'BMW' and cardinality(media_paths) = 1 and not liked
     from public.get_posts('home') where post_id = :'post_ann'),
  'home feed shows posts of people you follow, with car and photos');
select tests.ok((select count(*) from public.get_posts('home') where post_id = :'post_ben') = 0,
  'home feed excludes private accounts you no longer follow');
select tests.ok((select count(*) from public.get_posts('discover') where post_id = :'post_ann') = 1, 'discover shows public posts');
select tests.ok((select count(*) from public.get_posts('discover') where post_id = :'post_ben') = 0, 'discover never shows private accounts');
select tests.throws($$select * from public.get_posts('everything')$$, 'unknown feed mode is rejected', 'P0001');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.get_posts('discover') where post_id = :'post_ann') = 0, 'blocked users do not see the post in discover');
select tests.ok((select count(*) from public.get_posts('single', null, :'post_ann')) = 0, 'blocked users cannot open the post');
select tests.throws(format($$insert into public.likes (user_id, post_id) values (auth.uid(), %L)$$, :'post_ann'),
  'blocked users cannot like', '42501');
select tests.throws(format($$insert into public.comments (post_id, author_id, body) values (%L, auth.uid(), 'hi')$$, :'post_ann'),
  'blocked users cannot comment', '42501');
reset role;

-- pagination
select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare pid uuid;
begin
  for i in 1..3 loop
    insert into public.posts (author_id, caption) values (auth.uid(), 'post ' || i) returning id into pid;
    insert into public.post_media (post_id, storage_path) values (pid, pid::text || '/p.jpg');
    perform public.publish_post(pid);
  end loop;
end;
$$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select published_at as last_at, post_id as last_id from public.get_posts('user', :'ann', null, null, null, 2) offset 1 limit 1 \gset
select tests.ok(
  (select count(*) from public.get_posts('user', :'ann', null, :'last_at', :'last_id', 10)) = 2,
  'keyset pagination returns the remaining posts');
select tests.ok(
  (select count(distinct post_id) from (
     select post_id from public.get_posts('user', :'ann', null, null, null, 2)
     union all
     select post_id from public.get_posts('user', :'ann', null, :'last_at', :'last_id', 10)) s) = 4,
  'pages do not overlap or skip posts');
reset role;

-- --------------------------------------------------- likes / comments / saves -
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.likes (user_id, post_id) values (auth.uid(), :'post_ann');
select tests.throws(format($$insert into public.likes (user_id, post_id) values (%L, %L)$$, :'ann', :'post_ann'),
  'cannot like on someone else''s behalf', '42501');
select tests.throws(format($$insert into public.likes (user_id, post_id) values (auth.uid(), %L)$$, :'post_ben'),
  'cannot like a post you cannot see', '42501');
select tests.ok(
  (select liked and like_count = 1 from public.get_posts('single', null, :'post_ann')),
  'like shows up with the counter');
insert into public.comments (post_id, author_id, body) values (:'post_ann', auth.uid(), 'Clean build!') returning id as comment_cat \gset
select tests.throws(format($$insert into public.comments (post_id, author_id, body) values (%L, auth.uid(), '   ')$$, :'post_ann'),
  'empty comment rejected', '23514');
insert into public.saved_posts (user_id, post_id) values (auth.uid(), :'post_ann');
select tests.ok((select count(*) from public.get_posts('saved')) = 1, 'saved posts list');
select tests.ok((select saved from public.get_posts('single', null, :'post_ann')), 'saved flag shows on the post');
reset role;

select tests.ok((select comment_count = 1 from public.posts where id = :'post_ann'), 'comment counter increases');

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.saved_posts) = 0, 'saved posts are private to the saver');
select tests.ok((select count(*) from public.likes) = 0, 'other people''s likes are not listed');
select tests.ok(
  tests.affected(format($$delete from public.comments where id = %L$$, :'comment_cat')) = 0,
  'a third person cannot delete a comment');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select can_delete and body = 'Clean build!' from public.get_comments(:'post_ann')),
  'post author sees the comment and may delete it');
select tests.ok(tests.affected(format($$delete from public.comments where id = %L$$, :'comment_cat')) = 1,
  'post author can delete a comment on their post');
reset role;
select tests.ok((select comment_count = 0 from public.posts where id = :'post_ann'), 'comment counter decreases');

-- comment rate limit
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.comments (post_id, author_id, body)
select :'post_ann', auth.uid(), 'spam ' || g from generate_series(1, 30) g;
select tests.throws(format($$insert into public.comments (post_id, author_id, body) values (%L, auth.uid(), 'one more')$$, :'post_ann'),
  'more than 30 comments in 10 minutes are blocked', 'P0001');
reset role;

-- edits and deletes
select set_config('request.jwt.claims', json_build_object('sub', :'cat', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(tests.affected(format($$update public.posts set caption = 'hacked' where id = %L$$, :'post_ann')) = 0,
  'cannot edit someone else''s caption');
select tests.ok(tests.affected(format($$delete from public.posts where id = %L$$, :'post_ann')) = 0,
  'cannot delete someone else''s post');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'ann', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.posts set caption = 'New wheels (BBS)' where id = :'post_ann';
delete from storage.objects where bucket_id = 'post-media' and name like :'post_ann' || '/%';
delete from public.posts where id = :'post_ann';
select tests.ok(true, 'author can edit the caption, delete photos and the post');
reset role;
select tests.ok((select post_count = 3 from public.profiles where id = :'ann'), 'post counter decreases on delete');
select tests.ok(not exists (select 1 from public.saved_posts where post_id = :'post_ann'), 'deleting a post removes saves');

set local role anon;
select tests.throws($$select * from public.get_posts('discover')$$, 'anonymous users cannot read feeds', '42501');
select tests.throws($$select * from public.posts$$, 'anonymous users cannot read posts', '42501');
reset role;

rollback;
