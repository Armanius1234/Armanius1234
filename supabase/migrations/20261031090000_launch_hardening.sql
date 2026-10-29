-- PL8 — Milestone 7: launch hardening
--
--   * EU DSA appeals (Art. 20): the affected person can appeal a removal or a
--     suspension, the reporter can appeal a "no violation" decision, within
--     6 months, in the app. Admins decide; reversals restore what they can.
--   * Suspended accounts can sign in again but are locked: they only see the
--     reason, can appeal, download their data or delete the account.
--   * Statement of reasons for suspensions too (DSA Art. 17).
--   * Moderation statistics for the DSA transparency report.
--   * Push notification switches per type; push payloads carry only ids.
--   * Locked accounts (suspended, or no consent yet) cannot upload files.
-- -----------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'account_suspended';
alter type public.notification_type add value if not exists 'appeal_decided';

-- -----------------------------------------------------------------------------
-- Locked accounts
-- -----------------------------------------------------------------------------
create function private.is_locked(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not private.has_consent(uid) or private.is_suspended(uid);
$$;
revoke execute on function private.is_locked(uuid) from public, anon;
grant execute on function private.is_locked(uuid) to authenticated;

-- Blocked = explicit block either way, or one side is locked (no consent yet,
-- or suspended). A deleted user (null) is not checked.
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (a is not null and private.is_locked(a))
      or (b is not null and private.is_locked(b))
      or exists (
        select 1
        from public.blocks bl
        where (bl.blocker_id = a and bl.blocked_id = b)
           or (bl.blocker_id = b and bl.blocked_id = a)
      );
$$;

-- No uploads from locked accounts (in addition to each bucket's own rules).
create policy storage_no_uploads_when_locked on storage.objects
  as restrictive for insert to authenticated
  with check (not private.is_locked((select auth.uid())));
create policy storage_no_updates_when_locked on storage.objects
  as restrictive for update to authenticated
  using (not private.is_locked((select auth.uid())));

-- Suspensions no longer block sign-in (the account is locked instead), so the
-- person can read the reason and appeal.
update auth.users u set banned_until = null
 where exists (select 1 from public.profiles p where p.id = u.id and p.suspended_at is not null);

-- -----------------------------------------------------------------------------
-- Which decision closed a report
-- -----------------------------------------------------------------------------
alter table public.reports add column action text check (action in ('dismiss', 'remove', 'suspend'));
update public.reports r
   set action = case
     when r.status = 'dismissed' then 'dismiss'
     when exists (select 1 from private.admin_actions a
                   where a.action = 'report_suspend' and a.target_id = r.target_id
                     and a.created_at between r.handled_at - interval '1 minute' and r.handled_at + interval '1 minute')
       then 'suspend'
     else 'remove'
   end
 where r.status <> 'open';

-- Was this vehicle removed by a moderator (and not reinstated since)?
create function private.vehicle_removed_by_moderator(vid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select a.action = 'report_remove'
    from private.admin_actions a
    where a.target_type = 'vehicle' and a.target_id = vid and a.action in ('report_remove', 'content_restored')
    order by a.created_at desc
    limit 1), false);
$$;
revoke execute on function private.vehicle_removed_by_moderator(uuid) from public, anon, authenticated;

create function private.lift_suspension(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles p set suspended_at = null where p.id = p_user;
  update public.vehicles v set is_restricted = false
   where v.owner_id = p_user and not private.vehicle_removed_by_moderator(v.id);
  update auth.users u set banned_until = null where u.id = p_user;
end;
$$;
revoke execute on function private.lift_suspension(uuid) from public, anon, authenticated;

create or replace function public.admin_unsuspend_user(p_user uuid, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  perform private.lift_suspension(p_user);
  insert into private.admin_actions (admin_id, action, target_type, target_id, reason)
  values (uid, 'user_unsuspended', 'user', p_user, p_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- Push: per-type switches, texts for the new types, minimal payloads
-- -----------------------------------------------------------------------------
alter table public.user_settings
  add column push_likes    boolean not null default true,
  add column push_comments boolean not null default true,
  add column push_follows  boolean not null default true,
  add column push_messages boolean not null default true;
grant update (push_likes, push_comments, push_follows, push_messages) on public.user_settings to authenticated;

create or replace function private.queue_push(recipient uuid, text_de text, text_en text, data jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  settings public.user_settings;
  tokens text[];
  new_id bigint;
  kind text := data ->> 'type';
begin
  select * into settings from public.user_settings s where s.user_id = recipient;
  if not found or not settings.push_enabled then
    return;
  end if;
  if (kind = 'like' and not settings.push_likes)
     or (kind = 'comment' and not settings.push_comments)
     or (kind in ('follow', 'follow_request', 'follow_accepted') and not settings.push_follows)
     or (kind = 'message' and not settings.push_messages) then
    return;
  end if;
  select array_agg(t.token) into tokens from public.push_tokens t where t.user_id = recipient;
  if tokens is null then
    return;
  end if;
  insert into private.push_outbox (user_id, tokens, title, body, data)
  values (recipient, tokens, 'PL8', case when settings.locale = 'en' then text_en else text_de end, data)
  returning id into new_id;
  perform private.send_push(new_id);
end;
$$;
revoke execute on function private.queue_push(uuid, text, text, jsonb) from public, anon, authenticated;

-- Compared as text so the new enum values are not needed at creation time.
create or replace function private.push_text(kind public.notification_type, actor_name text, lang text)
returns text
language sql immutable set search_path = ''
as $$
  select replace(
    case lang
      when 'en' then case kind::text
        when 'follow' then '{name} started following you'
        when 'follow_request' then '{name} wants to follow you'
        when 'follow_accepted' then '{name} accepted your follow request'
        when 'like' then '{name} liked your post'
        when 'comment' then '{name} commented on your post'
        when 'verification_approved' then 'Your plate is verified. You can now make it findable in PL8 Search.'
        when 'verification_rejected' then 'Your plate verification was not approved.'
        when 'plate_transferred' then 'Your plate was verified for another vehicle and removed from yours.'
        when 'plate_revoked' then 'The PL8 team removed your plate.'
        when 'report_resolved' then 'Your report was reviewed. Thank you.'
        when 'content_removed' then 'Some of your content was removed for breaking the community rules.'
        when 'account_suspended' then 'Your PL8 account was suspended. Open the app to see why and to appeal.'
        when 'appeal_decided' then 'Your appeal was reviewed. Open the app to see the result.'
      end
      else case kind::text
        when 'follow' then '{name} folgt dir jetzt'
        when 'follow_request' then '{name} möchte dir folgen'
        when 'follow_accepted' then '{name} hat deine Folgeanfrage angenommen'
        when 'like' then '{name} gefällt dein Beitrag'
        when 'comment' then '{name} hat deinen Beitrag kommentiert'
        when 'verification_approved' then 'Dein Kennzeichen ist verifiziert. Du kannst es jetzt in der PL8 Suche auffindbar machen.'
        when 'verification_rejected' then 'Deine Kennzeichen-Verifizierung wurde nicht bestätigt.'
        when 'plate_transferred' then 'Dein Kennzeichen wurde für ein anderes Fahrzeug verifiziert und von deinem entfernt.'
        when 'plate_revoked' then 'Das PL8-Team hat dein Kennzeichen entfernt.'
        when 'report_resolved' then 'Deine Meldung wurde geprüft. Danke!'
        when 'content_removed' then 'Ein Inhalt von dir wurde wegen eines Verstoßes gegen die Community-Regeln entfernt.'
        when 'account_suspended' then 'Dein PL8-Konto wurde gesperrt. Öffne die App, um den Grund zu sehen und Einspruch einzulegen.'
        when 'appeal_decided' then 'Dein Einspruch wurde geprüft. Öffne die App für das Ergebnis.'
      end
    end,
    '{name}', coalesce(actor_name, 'PL8'));
$$;

-- Same as before, but the push only carries ids (no moderator notes or texts).
create or replace function private.notify(
  recipient uuid,
  actor uuid,
  kind public.notification_type,
  p_post uuid default null,
  p_vehicle uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor_name text;
begin
  if recipient is null or recipient = actor then
    return;
  end if;
  if actor is not null and private.is_blocked_between(recipient, actor) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id, vehicle_id, data)
  values (recipient, actor, kind, p_post, p_vehicle, p_data);

  select p.display_name into actor_name from public.profiles p where p.id = actor;
  perform private.queue_push(
    recipient,
    private.push_text(kind, actor_name, 'de'),
    private.push_text(kind, actor_name, 'en'),
    jsonb_strip_nulls(jsonb_build_object('type', kind, 'post_id', p_post, 'vehicle_id', p_vehicle,
                                         'report_id', p_data ->> 'report_id'))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Resolving reports: records the action, no sign-in ban for suspensions, and
-- every affected person gets a statement of reasons with the report id
-- (needed to appeal).
-- -----------------------------------------------------------------------------
create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rep public.reports;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  outcome public.report_status;
  r record;
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'remove', 'suspend') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  select * into rep from public.reports x where x.id = p_report for update;
  if not found or rep.status <> 'open' then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if rep.target_owner_id = uid then
    raise exception 'PL8_SELF_REVIEW' using errcode = '42501';
  end if;
  if p_action <> 'dismiss' and (note is null or char_length(note) < 3) then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  if p_action = 'remove' then
    case rep.target_type
      when 'post' then update public.posts p set is_removed = true where p.id = rep.target_id;
      when 'comment' then delete from public.comments c where c.id = rep.target_id;
      when 'message' then delete from public.messages m where m.id = rep.target_id;
      when 'vehicle' then update public.vehicles v set is_restricted = true where v.id = rep.target_id;
      when 'user' then raise exception 'PL8_INVALID_STATE' using errcode = 'P0001'; -- use 'suspend'
    end case;
    perform private.notify(rep.target_owner_id, null, 'content_removed', null, null,
                           jsonb_build_object('target_type', rep.target_type, 'reason', rep.reason,
                                              'note', note, 'report_id', rep.id));
  elsif p_action = 'suspend' then
    update public.profiles p set suspended_at = now() where p.id = rep.target_owner_id;
    update public.vehicles v set is_restricted = true where v.owner_id = rep.target_owner_id;
    perform private.notify(rep.target_owner_id, null, 'account_suspended', null, null,
                           jsonb_build_object('target_type', rep.target_type, 'reason', rep.reason,
                                              'note', note, 'report_id', rep.id));
  end if;

  outcome := case when p_action = 'dismiss' then 'dismissed'::public.report_status else 'actioned'::public.report_status end;

  for r in
    update public.reports x
       set status = outcome, action = p_action, resolution_note = note, handled_by = uid, handled_at = now()
     where x.target_type = rep.target_type and x.target_id = rep.target_id and x.status = 'open'
    returning x.id, x.reporter_id
  loop
    perform private.notify(r.reporter_id, null, 'report_resolved', null, null,
                           jsonb_build_object('outcome', outcome, 'report_id', r.id));
  end loop;

  insert into private.admin_actions (admin_id, action, target_type, target_id, reason, metadata)
  values (uid, 'report_' || p_action, rep.target_type::text, rep.target_id, note,
          jsonb_build_object('report_id', rep.id, 'reason', rep.reason, 'owner_id', rep.target_owner_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Appeals (DSA Art. 20)
-- -----------------------------------------------------------------------------
create type public.appeal_status as enum ('open', 'upheld', 'reversed');

create table public.appeals (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports (id) on delete cascade,
  appellant_id  uuid not null references public.profiles (id) on delete cascade,
  role          text not null check (role in ('owner', 'reporter')),
  reason        text not null check (char_length(reason) between 10 and 2000),
  status        public.appeal_status not null default 'open',
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (report_id, appellant_id)
);
create index appeals_open_idx on public.appeals (status, created_at);

alter table public.appeals enable row level security;
revoke all on public.appeals from public, anon, authenticated;
grant select on public.appeals to authenticated;
create policy appeals_select_own on public.appeals for select to authenticated
  using (appellant_id = (select auth.uid()));

-- Decisions the signed-in user can see (and appeal): removals and suspensions
-- that affected them, and their own reports that were judged "no violation".
create function public.my_decisions()
returns table (
  report_id     uuid,
  role          text,
  target_type   text,
  reason        text,
  action        text,
  note          text,
  decided_at    timestamptz,
  appeal_until  timestamptz,
  appeal_id     uuid,
  appeal_status text,
  appeal_note   text
)
language sql stable security definer set search_path = ''
as $$
  with me as (select auth.uid() as id),
  owner_decisions as (
    select distinct on (r.target_type, r.target_id, r.handled_at)
           r.id, 'owner'::text as role, r.target_type, r.reason, r.action, r.resolution_note, r.handled_at
    from public.reports r, me
    where r.target_owner_id = me.id and r.status = 'actioned' and r.action in ('remove', 'suspend')
    order by r.target_type, r.target_id, r.handled_at, r.created_at
  ),
  reporter_decisions as (
    select r.id, 'reporter'::text, r.target_type, r.reason, r.action, null::text, r.handled_at
    from public.reports r, me
    where r.reporter_id = me.id and r.status = 'dismissed'
  ),
  d as (select * from owner_decisions union all select * from reporter_decisions)
  select d.id, d.role, d.target_type::text, d.reason::text, d.action, d.resolution_note, d.handled_at,
         d.handled_at + interval '6 months',
         a.id, a.status::text, a.decision_note
  from d
  left join public.appeals a on a.report_id = d.id and a.appellant_id = (select id from me)
  order by d.handled_at desc;
$$;

create function public.submit_appeal(p_report uuid, p_reason text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rep public.reports;
  appeal_role text;
  new_id uuid;
  text_reason text := btrim(coalesce(p_reason, ''));
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into rep from public.reports r where r.id = p_report;
  if found and rep.target_owner_id = uid and rep.status = 'actioned' and rep.action in ('remove', 'suspend') then
    appeal_role := 'owner';
  elsif found and rep.reporter_id = uid and rep.status = 'dismissed' then
    appeal_role := 'reporter';
  else
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if rep.handled_at < now() - interval '6 months' then
    raise exception 'PL8_APPEAL_EXPIRED' using errcode = 'P0001';
  end if;
  if char_length(text_reason) not between 10 and 2000 then
    raise exception 'PL8_APPEAL_REASON' using errcode = 'P0001';
  end if;
  -- One appeal per decision (a decision can close several reports at once).
  if exists (
    select 1 from public.appeals a join public.reports r on r.id = a.report_id
    where a.appellant_id = uid and r.target_type = rep.target_type and r.target_id = rep.target_id
      and r.handled_at = rep.handled_at
  ) then
    raise exception 'PL8_ALREADY_APPEALED' using errcode = 'P0001';
  end if;
  insert into public.appeals (report_id, appellant_id, role, reason)
  values (rep.id, uid, appeal_role, text_reason)
  returning id into new_id;
  return new_id;
end;
$$;

create function public.admin_appeals_queue()
returns table (
  appeal_id          uuid,
  created_at         timestamptz,
  appellant_username text,
  role               text,
  appeal_reason      text,
  report_id          uuid,
  target_type        text,
  report_reason      text,
  action             text,
  decision_note      text,
  decided_at         timestamptz,
  owner_username     text,
  preview            jsonb,
  snapshot           jsonb,
  restorable         boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select a.id, a.created_at, ap.username, a.role, a.reason,
         r.id, r.target_type::text, r.reason::text, r.action, r.resolution_note, r.handled_at,
         op.username,
         private.report_preview(r.target_type, r.target_id),
         s.snapshot,
         -- Deleted comments and messages cannot be brought back.
         (a.role = 'reporter' or r.action = 'suspend' or r.target_type in ('post', 'vehicle'))
  from public.appeals a
  join public.reports r on r.id = a.report_id
  left join public.profiles ap on ap.id = a.appellant_id
  left join public.profiles op on op.id = r.target_owner_id
  left join private.report_snapshots s on s.report_id = r.id
  where a.status = 'open'
  order by a.created_at;
end;
$$;

create function public.admin_decide_appeal(p_appeal uuid, p_outcome text, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ap public.appeals;
  rep public.reports;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_outcome not in ('upheld', 'reversed') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if note is null or char_length(note) < 3 then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into ap from public.appeals a where a.id = p_appeal for update;
  if not found or ap.status <> 'open' then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if ap.appellant_id = uid then
    raise exception 'PL8_SELF_REVIEW' using errcode = '42501';
  end if;
  select * into rep from public.reports r where r.id = ap.report_id for update;

  if p_outcome = 'reversed' then
    if ap.role = 'reporter' then
      -- The report goes back into the queue for a new decision.
      update public.reports r
         set status = 'open', action = null, resolution_note = null, handled_by = null, handled_at = null
       where r.id = rep.id;
    elsif rep.action = 'suspend' then
      perform private.lift_suspension(rep.target_owner_id);
    elsif rep.target_type = 'post' then
      update public.posts p set is_removed = false where p.id = rep.target_id;
    elsif rep.target_type = 'vehicle' then
      insert into private.admin_actions (admin_id, action, target_type, target_id, reason, metadata)
      values (uid, 'content_restored', 'vehicle', rep.target_id, note, jsonb_build_object('appeal_id', ap.id));
      update public.vehicles v set is_restricted = false
       where v.id = rep.target_id and not private.is_suspended(v.owner_id);
    end if;
  end if;

  update public.appeals a
     set status = p_outcome::public.appeal_status, decision_note = note, decided_by = uid, decided_at = now()
   where a.id = ap.id;

  insert into private.admin_actions (admin_id, action, target_type, target_id, reason, metadata)
  values (uid, 'appeal_' || p_outcome, rep.target_type::text, rep.target_id, note,
          jsonb_build_object('appeal_id', ap.id, 'report_id', rep.id, 'role', ap.role));

  perform private.notify(ap.appellant_id, null, 'appeal_decided', null, null,
                         jsonb_build_object('outcome', p_outcome, 'note', note, 'report_id', rep.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Moderation statistics (DSA transparency report)
-- -----------------------------------------------------------------------------
create function public.admin_moderation_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'reports_received', (select count(*) from public.reports r where r.created_at >= p_from and r.created_at < p_to),
    'reports_by_reason', coalesce((
      select jsonb_object_agg(x.reason, x.n) from (
        select r.reason::text as reason, count(*) as n from public.reports r
        where r.created_at >= p_from and r.created_at < p_to group by r.reason) x), '{}'::jsonb),
    'reports_by_target', coalesce((
      select jsonb_object_agg(x.target, x.n) from (
        select r.target_type::text as target, count(*) as n from public.reports r
        where r.created_at >= p_from and r.created_at < p_to group by r.target_type) x), '{}'::jsonb),
    'decisions', coalesce((
      select jsonb_object_agg(x.action, x.n) from (
        select substr(a.action, 8) as action, count(*) as n from private.admin_actions a
        where a.action in ('report_dismiss', 'report_remove', 'report_suspend')
          and a.created_at >= p_from and a.created_at < p_to group by a.action) x), '{}'::jsonb),
    'median_hours_to_decision', (
      select round((percentile_cont(0.5) within group (
               order by extract(epoch from (r.handled_at - r.created_at)) / 3600))::numeric, 1)
      from public.reports r
      where r.handled_at >= p_from and r.handled_at < p_to),
    'appeals_received', (select count(*) from public.appeals a where a.created_at >= p_from and a.created_at < p_to),
    'appeals_upheld', (select count(*) from public.appeals a
                        where a.status = 'upheld' and a.decided_at >= p_from and a.decided_at < p_to),
    'appeals_reversed', (select count(*) from public.appeals a
                          where a.status = 'reversed' and a.decided_at >= p_from and a.decided_at < p_to),
    'appeals_open', (select count(*) from public.appeals a where a.status = 'open'),
    'accounts_suspended_now', (select count(*) from public.profiles p where p.suspended_at is not null)
  ) into result;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Data export: everything as before, plus the user's appeals.
-- The previous function is kept as private.export_core.
-- -----------------------------------------------------------------------------
alter function public.export_my_data() rename to export_core;
alter function public.export_core() set schema private;
revoke execute on function private.export_core() from public, anon, authenticated;

create function public.export_my_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select private.export_core() || jsonb_build_object(
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object('role', a.role, 'reason', a.reason, 'status', a.status,
                                          'decision_note', a.decision_note, 'created_at', a.created_at,
                                          'decided_at', a.decided_at) order by a.created_at)
      from public.appeals a where a.appellant_id = (select auth.uid())), '[]'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Performance (found with scripts/perf-db.sh)
-- Every like/unlike and every comment deletion looked up older notifications
-- without an index, i.e. read the whole notifications table each time.
-- Foreign keys without an index made deletes (posts, vehicles, accounts) scan
-- the referencing tables.
-- -----------------------------------------------------------------------------
create index notifications_actor_post_idx on public.notifications (actor_id, post_id);
create index notifications_post_idx on public.notifications (post_id);
create index notifications_vehicle_idx on public.notifications (vehicle_id);
create index notifications_comment_idx on public.notifications ((data ->> 'comment_id')) where type = 'comment';
create index posts_vehicle_idx on public.posts (vehicle_id);
create index saved_posts_post_idx on public.saved_posts (post_id);
create index conversations_created_by_idx on public.conversations (created_by);
create index reports_target_owner_idx on public.reports (target_owner_id);
create index reports_handled_by_idx on public.reports (handled_by);
create index appeals_appellant_idx on public.appeals (appellant_id);
create index appeals_decided_by_idx on public.appeals (decided_by);
create index hidden_conversations_conversation_idx on private.hidden_conversations (conversation_id);
create index admin_actions_admin_idx on private.admin_actions (admin_id);
create index admin_actions_target_idx on private.admin_actions (target_type, target_id, created_at desc);
create index verification_requests_user_idx on private.verification_requests (user_id);
create index verification_requests_reviewer_idx on private.verification_requests (reviewer_id);

-- Feeds: same results as before, but faster on large data.
--  * Each feed type reads its candidate posts newest first with cheap filters
--    only (people you follow, one profile, saved posts, one post).
--  * The visibility check (blocks, private profiles, suspensions) runs one post
--    at a time, once per author, and stops as soon as the page is full, so a
--    page costs about 20 checks whatever plan the database picks.
--  * plan_cache_mode = force_custom_plan: after 5 calls PostgreSQL would switch
--    to a generic plan that ignores who you follow (measured: ~8 ms for calls
--    1-5, ~210 ms from call 6 on, 30,000 posts).
create or replace function public.get_posts(
  p_mode text,
  p_user uuid default null,
  p_post uuid default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
)
returns table (
  post_id             uuid,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_path  text,
  vehicle_id          uuid,
  vehicle_make        text,
  vehicle_model       text,
  vehicle_generation  text,
  caption             text,
  media_paths         text[],
  like_count          integer,
  comment_count       integer,
  liked               boolean,
  saved               boolean,
  published_at        timestamptz
)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
  before_id uuid := coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
  authors uuid[];
  picked uuid[] := '{}';
  allowed uuid[] := '{}';
  denied uuid[] := '{}';
  cur refcursor;
  r_id uuid;
  r_author uuid;
  ok boolean;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_mode not in ('home', 'discover', 'user', 'saved', 'single') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  -- Candidates, newest first, cheap filters only.
  if p_mode = 'home' then
    authors := array(select f.followee_id from public.follows f where f.follower_id = uid) || uid;
    open cur for
      select p.id, p.author_id from public.posts p
      where p.author_id = any(authors)
        and p.published_at is not null and not p.is_removed
        and (p_before is null or (p.published_at, p.id) < (p_before, before_id))
      order by p.published_at desc, p.id desc;
  elsif p_mode = 'discover' then
    open cur for
      select p.id, p.author_id from public.posts p
      join public.profiles a on a.id = p.author_id
      where p.published_at is not null and not p.is_removed and not a.is_private
        and (p_before is null or (p.published_at, p.id) < (p_before, before_id))
      order by p.published_at desc, p.id desc;
  elsif p_mode = 'user' then
    open cur for
      select p.id, p.author_id from public.posts p
      where p.author_id = p_user
        and p.published_at is not null and not p.is_removed
        and (p_before is null or (p.published_at, p.id) < (p_before, before_id))
      order by p.published_at desc, p.id desc;
  elsif p_mode = 'saved' then
    open cur for
      select p.id, p.author_id from public.saved_posts s
      join public.posts p on p.id = s.post_id
      where s.user_id = uid
        and p.published_at is not null and not p.is_removed
        and (p_before is null or (p.published_at, p.id) < (p_before, before_id))
      order by p.published_at desc, p.id desc;
  else -- single
    open cur for
      select p.id, p.author_id from public.posts p
      where p.id = p_post and p.published_at is not null and not p.is_removed;
  end if;

  -- Visibility, once per author, until the page is full.
  loop
    fetch cur into r_id, r_author;
    exit when not found;
    if r_author = any(allowed) then
      ok := true;
    elsif r_author = any(denied) then
      ok := false;
    else
      ok := private.can_see_content(uid, r_author);
      if ok then allowed := allowed || r_author; else denied := denied || r_author; end if;
    end if;
    if ok then
      picked := picked || r_id;
      exit when cardinality(picked) >= n;
    end if;
  end loop;
  close cur;

  return query
  select
    p.id, p.author_id, a.username, a.display_name, a.avatar_path,
    v.id, v.make, v.model, v.generation,
    p.caption,
    coalesce((select array_agg(m.storage_path order by m.position, m.created_at)
                from public.post_media m where m.post_id = p.id), '{}'::text[]),
    p.like_count, p.comment_count,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = uid),
    exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = uid),
    p.published_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.vehicles v on v.id = p.vehicle_id and private.can_view_vehicle(uid, v.id)
  where p.id = any(picked)
  order by p.published_at desc, p.id desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_decisions()',
    'public.submit_appeal(uuid, text)',
    'public.admin_appeals_queue()',
    'public.admin_decide_appeal(uuid, text, text)',
    'public.admin_moderation_stats(timestamptz, timestamptz)',
    'public.export_my_data()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
