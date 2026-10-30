-- Synthetic data for the performance check (scripts/perf-db.sh).
-- Roughly a busy regional beta: 5,000 members. Deterministic (fixed seed).
-- Triggers stay on, so counters and notifications are realistic.
\set ON_ERROR_STOP on
select setseed(0.42);

-- Members (sign-up trigger records consent and settings).
insert into auth.users (id, email, raw_user_meta_data, created_at)
select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'user' || i || '@perf.dev',
       '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}',
       now() - interval '60 days'
from generate_series(1, 5000) i;

insert into public.profiles (id, username, display_name, is_private)
select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       'member_' || i, 'Member ' || i, (i % 10 = 0)
from generate_series(1, 5000) i;

create temporary table u as
select row_number() over (order by id) as n, id from public.profiles;
create index on u (n);

-- Follows: everyone follows 25 others; user 1 (the measured user) follows 150.
insert into public.follows (follower_id, followee_id, created_at)
select distinct a.id, b.id, now() - (random() * interval '50 days')
from u a
cross join lateral (select (1 + floor(random() * 5000))::int as n from generate_series(1, case when a.n = 1 then 150 else 25 end)) pick
join u b on b.n = pick.n
where a.id <> b.id
on conflict do nothing;

-- Blocks: a few hundred.
insert into public.blocks (blocker_id, blocked_id)
select a.id, b.id from u a join u b on b.n = ((a.n * 7919) % 5000) + 1
where a.n % 10 = 3 and a.id <> b.id
on conflict do nothing;

-- Vehicles: 3,000.
insert into public.vehicles (id, owner_id, make, model, model_year)
select gen_random_uuid(), u.id, (array['BMW','Audi','Porsche','VW','Mercedes'])[1 + (i % 5)], 'Model ' || (i % 40), 1990 + (i % 35)
from generate_series(1, 3000) i join u on u.n = 1 + (i * 13 % 5000);

-- Posts: 30,000 over 60 days, one photo each, published.
insert into public.posts (id, author_id, caption, created_at)
select gen_random_uuid(), u.id, 'Post number ' || r.i, now() - (r.age * interval '60 days')
from (select i, 1 + floor(random() * 5000)::int as un, random() as age from generate_series(1, 30000) i) r
join u on u.n = r.un;
insert into public.post_media (post_id, storage_path)
select p.id, p.id || '/1.jpg' from public.posts p;
update public.posts set published_at = created_at;

create temporary table pp as select row_number() over (order by id) as n, id, author_id from public.posts;
create index on pp (n);

-- Likes: 120,000. Comments: 40,000. (Random picks are drawn first, then joined.)
insert into public.likes (user_id, post_id, created_at)
select distinct on (u.id, pp.id) u.id, pp.id, now() - (r.age * interval '30 days')
from (select 1 + floor(random() * 5000)::int as un, 1 + floor(random() * 30000)::int as pn, random() as age
      from generate_series(1, 120000)) r
join u on u.n = r.un
join pp on pp.n = r.pn
on conflict do nothing;

insert into public.comments (post_id, author_id, body, created_at)
select pp.id, u.id, 'Comment ' || r.i, now() - (r.age * interval '30 days')
from (select i, 1 + floor(random() * 5000)::int as un, 1 + floor(random() * 30000)::int as pn, random() as age
      from generate_series(1, 40000) i) r
join u on u.n = r.un
join pp on pp.n = r.pn;

-- One very popular post (300 comments) by the measured member, so it is
-- always visible to them (post ids are random, so no random pick here).
insert into public.posts (author_id, caption, created_at)
values ((select id from u where n = 1), 'Popular thread', now() - interval '1 day');
update public.posts set published_at = created_at where caption = 'Popular thread';
insert into public.comments (post_id, author_id, body)
select (select id from public.posts where caption = 'Popular thread'), u.id, 'Thread reply ' || u.n
from u where u.n between 2 and 301;

-- Conversations: user 1 has 60 chats; 1,000 chats between others. 20 messages each.
create temporary table pairs as
select gen_random_uuid() as id, a, b from (
  select (select id from u where n = 1) as a, (select id from u where n = i + 1) as b from generate_series(1, 60) i
  union all
  select (select id from u where n = i) as a, (select id from u where n = i + 1) as b from generate_series(100, 1099) i
) x;
insert into public.conversations (id, created_by, pair_key, status, last_message_at)
select id, a, least(a::text, b::text) || ':' || greatest(a::text, b::text), 'active', now() from pairs;
insert into public.conversation_participants (conversation_id, user_id)
select id, a from pairs union all select id, b from pairs;
insert into public.messages (conversation_id, sender_id, body, created_at)
select p.id, case when j % 2 = 0 then p.a else p.b end, 'Message ' || j, now() - ((21 - j) * interval '1 minute')
from pairs p cross join generate_series(1, 20) j;

-- Verified, findable plates: 1,000.
insert into private.plate_claims (vehicle_id, user_id, country, plate, status, discoverable, verified_at)
select v.id, v.owner_id, 'DE', 'F-PF-' || row_number() over (order by v.id), 'verified', true, now()
from (select * from public.vehicles order by id limit 1000) v;

-- Reports: 2,000 (most closed).
insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, status, action, handled_at, created_at)
select u.id, 'post', pp.id, pp.author_id, 'spam',
       case when i % 4 = 0 then 'open' else 'dismissed' end::public.report_status,
       case when i % 4 = 0 then null else 'dismiss' end,
       case when i % 4 = 0 then null else now() - interval '1 day' end,
       now() - interval '2 days'
from generate_series(1, 2000) i
join u on u.n = 1 + (i * 31 % 5000)
join pp on pp.n = 1 + (i * 17 % 30000)
where u.id <> pp.author_id
on conflict do nothing;

analyze;

select 'members' as what, count(*) from public.profiles
union all select 'follows', count(*) from public.follows
union all select 'posts', count(*) from public.posts
union all select 'likes', count(*) from public.likes
union all select 'comments', count(*) from public.comments
union all select 'messages', count(*) from public.messages
union all select 'notifications', count(*) from public.notifications
union all select 'plates', count(*) from private.plate_claims
union all select 'reports', count(*) from public.reports;
