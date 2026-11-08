-- =============================================================================
-- Milestone 10: privacy controls.
--
-- Two switches in Settings → Privacy, both on by default:
--   show_in_search       "Show me in people search" (also the @mention
--                        suggestions while typing, which use the same search)
--   show_in_suggestions  "Suggest me to others" ("Suggested for you")
--
-- They live in user_settings, which only the owner can read, so nobody can see
-- who switched them off. Switching them off does not hide the profile itself:
-- it can still be opened from posts, comments, follower lists and links, and
-- people can still @mention the exact username.
-- =============================================================================

alter table public.user_settings
  add column show_in_search boolean not null default true,
  add column show_in_suggestions boolean not null default true;

grant update (show_in_search, show_in_suggestions) on public.user_settings to authenticated;

-- -----------------------------------------------------------------------------
-- People search (from Milestone 8) — now skips people who switched it off.
-- -----------------------------------------------------------------------------
create or replace function public.search_people(p_query text, p_limit int default 20)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_path    text,
  is_private     boolean,
  follower_count integer,
  i_follow       boolean
)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  q text := lower(btrim(coalesce(p_query, '')));
  pat text;
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
  picked uuid[] := '{}';
  cur refcursor;
  r_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  q := ltrim(q, '@');
  if char_length(q) < 2 or char_length(q) > 50 then
    return;
  end if;
  pat := '%' || private.like_escape(q) || '%';

  -- Best matches first (exact name, then names starting with it, then the
  -- most followed); the visibility check runs one person at a time until the
  -- page is full (a common word can match thousands of people).
  open cur for
    select p.id from public.profiles p
    where (p.username like pat or lower(p.display_name) like pat)
      and p.suspended_at is null
      -- People who switched off "show me in people search".
      and not exists (select 1 from public.user_settings s where s.user_id = p.id and not s.show_in_search)
    order by (p.username = q) desc,
             (p.username like private.like_escape(q) || '%') desc,
             p.follower_count desc,
             p.username;
  loop
    fetch cur into r_id;
    exit when not found;
    if not private.is_blocked_between(uid, r_id) then
      picked := picked || r_id;
      exit when cardinality(picked) >= n;
    end if;
  end loop;
  close cur;

  return query
  select p.id, p.username, p.display_name, p.avatar_path, p.is_private, p.follower_count,
         private.is_following(uid, p.id)
  from unnest(picked) with ordinality as x(id, ord)
  join public.profiles p on p.id = x.id
  order by x.ord;
end;
$$;

-- -----------------------------------------------------------------------------
-- Suggested people (from Milestone 8) — now skips people who switched it off.
-- -----------------------------------------------------------------------------
create or replace function public.suggested_people(p_limit int default 10)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_path    text,
  is_private     boolean,
  reason         text,
  mutual_count   integer,
  mutual_example text,
  shared_make    text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n int := least(greatest(coalesce(p_limit, 10), 1), 30);
  found_count int := 0;
  r record;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Ranked candidates (cheap), then the visibility check one at a time.
  for r in
    with mine as (select f.followee_id as id from public.follows f where f.follower_id = uid),
    fof as (
      select f2.followee_id as id, count(*)::int as mutual, min(m.username) as example
      from public.follows f1
      join public.follows f2 on f2.follower_id = f1.followee_id
      join public.profiles m on m.id = f1.followee_id
      where f1.follower_id = uid
        and m.suspended_at is null  -- a suspended account is never named
      group by f2.followee_id
    ),
    my_makes as (select distinct lower(v.make) as make from public.vehicles v where v.owner_id = uid),
    same_make as (
      select v.owner_id as id, min(v.make) as make
      from public.vehicles v join my_makes mm on mm.make = lower(v.make)
      where v.visibility = 'public' and not v.is_restricted
      group by v.owner_id
    ),
    popular as (
      select p.id from public.profiles p
      where not p.is_private and p.suspended_at is null
      order by p.follower_count desc, p.created_at
      limit 100
    ),
    candidates as (
      select c.id,
             coalesce(max(fof.mutual), 0) as mutual,
             max(fof.example) as example,
             max(sm.make) as make
      from (select id from fof union select id from same_make union select id from popular) c
      left join fof on fof.id = c.id
      left join same_make sm on sm.id = c.id
      group by c.id
    )
    select p.id, p.username, p.display_name, p.avatar_path, p.is_private,
           c.mutual, c.example, c.make
    from candidates c
    join public.profiles p on p.id = c.id
    where p.id <> uid
      and p.suspended_at is null
      and not exists (select 1 from mine where mine.id = p.id)
      and not exists (select 1 from public.follow_requests fr where fr.requester_id = uid and fr.target_id = p.id)
      -- People who switched off "suggest me to others".
      and not exists (select 1 from public.user_settings s where s.user_id = p.id and not s.show_in_suggestions)
    order by c.mutual * 10 + (case when c.make is not null then 5 else 0 end) desc,
             p.follower_count desc, p.username
  loop
    continue when private.is_blocked_between(uid, r.id);
    user_id := r.id;
    username := r.username;
    display_name := r.display_name;
    avatar_path := r.avatar_path;
    is_private := r.is_private;
    reason := case when r.mutual > 0 then 'followed_by' when r.make is not null then 'same_make' else 'popular' end;
    mutual_count := r.mutual;
    mutual_example := r.example;
    shared_make := r.make;
    return next;
    found_count := found_count + 1;
    exit when found_count >= n;
  end loop;
end;
$$;

-- Same access as before: signed-in members only.
revoke execute on function public.search_people(text, int) from public, anon;
grant execute on function public.search_people(text, int) to authenticated;
revoke execute on function public.suggested_people(int) from public, anon;
grant execute on function public.suggested_people(int) to authenticated;
