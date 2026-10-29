-- Times the queries the app uses most, as a real signed-in member (same
-- security rules as the app). Run by scripts/perf-db.sh after seed.sql.
-- Each query runs several times; the median must stay under its budget.
\set ON_ERROR_STOP on

create schema perf;
create table perf.results (label text, median_ms numeric, p95_ms numeric, budget_ms numeric, runs int);
grant usage on schema perf to authenticated;
grant insert on perf.results to authenticated;

create function perf.bench(label text, sql text, as_user uuid, budget_ms numeric, runs int default 15)
returns void
language plpgsql
as $$
declare
  t0 timestamptz;
  times numeric[] := '{}';
  n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', as_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- One warm-up run (plans and caches), then the timed runs. "x::text" makes
  -- the database compute every value (a bare count(*) could skip the work).
  execute format('select count(*) from (%s) x where x::text is not null', sql) into n;
  for i in 1..runs loop
    t0 := clock_timestamp();
    execute format('select count(*) from (%s) x where x::text is not null', sql) into n;
    times := times || (extract(epoch from clock_timestamp() - t0) * 1000)::numeric;
  end loop;
  execute 'reset role';
  insert into perf.results
  select label,
         round((percentile_cont(0.5) within group (order by t))::numeric, 1),
         round((percentile_cont(0.95) within group (order by t))::numeric, 1),
         budget_ms, runs
  from unnest(times) t;
end;
$$;

-- The measured member follows ~150 people, has 60 chats and many notifications.
\set me    '00000000-0000-4000-8000-000000000001'
\set other '00000000-0000-4000-8000-000000000002'
\set admin '00000000-0000-4000-8000-000000001388'
insert into private.user_roles (user_id, role) values (:'admin', 'admin');
select id as popular_post from public.posts p
 where exists (select 1 from public.comments c where c.post_id = p.id and c.body like 'Thread reply%') limit 1 \gset
select id as some_post from public.posts order by id limit 1 \gset
select conversation_id as chat from public.conversation_participants where user_id = :'me' limit 1 \gset

begin;
select perf.bench('Home feed, first page', $q$select * from public.get_posts('home')$q$, :'me', 50);
select perf.bench('Home feed, page from 30 days ago',
  $q$select * from public.get_posts('home', null, null, now() - interval '30 days')$q$, :'me', 50);
select perf.bench('Discover, first page', $q$select * from public.get_posts('discover')$q$, :'me', 50);
select perf.bench('Profile posts', format($q$select * from public.get_posts('user', %L)$q$, :'other'), :'me', 50);
select perf.bench('Single post', format($q$select * from public.get_posts('single', null, %L)$q$, :'some_post'), :'me', 20);
select perf.bench('Comments (300-comment thread)', format($q$select * from public.get_comments(%L)$q$, :'popular_post'), :'me', 50);
select perf.bench('Inbox (60 chats)', $q$select * from public.my_conversations()$q$, :'me', 50);
select perf.bench('Chat messages',
  format($q$select * from public.messages where conversation_id = %L order by created_at desc limit 30$q$, :'chat'), :'me', 20);
select perf.bench('Unread message badge', $q$select public.unread_message_count()$q$, :'me', 20);
select perf.bench('Notifications list', $q$select * from public.my_notifications(null, 30)$q$, :'me', 50);
select perf.bench('Unread notification badge', $q$select public.unread_notification_count()$q$, :'me', 20);
select perf.bench('Profile by username', $q$select * from public.profiles where username = 'member_42'$q$, :'me', 20);
select perf.bench('Relationship (follow button)', format($q$select * from public.relationship(%L)$q$, :'other'), :'me', 20);
select perf.bench('Followers list', format($q$select * from public.follows where followee_id = %L limit 50$q$, :'other'), :'me', 20);
select perf.bench('Plate search', $q$select * from public.search_plate('DE', 'F', 'PF', '7')$q$, :'me', 50, 9);
select perf.bench('My moderation decisions', $q$select * from public.my_decisions()$q$, :'me', 20);
select perf.bench('Admin: reports queue (500 open)', $q$select * from public.admin_reports_queue()$q$, :'admin', 200, 5);
select perf.bench('Admin: statistics (30 days)',
  $q$select public.admin_moderation_stats(now() - interval '30 days', now())$q$, :'admin', 100, 5);
commit;

\pset format aligned
\pset border 1
select label as "query",
       median_ms as "median ms",
       p95_ms as "slowest 5% ms",
       budget_ms as "budget ms",
       case when median_ms <= budget_ms then 'ok' else 'TOO SLOW' end as "result"
from perf.results order by ctid;

do $$
declare
  slow int := (select count(*) from perf.results where median_ms > budget_ms);
begin
  if slow > 0 then
    raise exception '% quer(ies) over budget', slow;
  end if;
end;
$$;
