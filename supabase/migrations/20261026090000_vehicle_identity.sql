-- =============================================================================
-- PL8 — Milestone 2: vehicle identity
--   * vehicles + vehicle photos (Digital Garage)
--   * license plate claims (private: never directly readable by the app)
--   * manual verification with a random challenge code + private evidence
--   * admin role, admin review, audit log
--   * PL8 Search: exact match, rate limited, logged, privacy-filtered
--
-- Every sensitive state change goes through a SECURITY DEFINER function that
-- checks the caller. Users can never set verification status themselves.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
create type private.app_role as enum ('admin');

create table private.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       private.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function private.is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.user_roles r where r.user_id = uid and r.role = 'admin');
$$;
revoke execute on function private.is_admin(uuid) from public, anon;
grant execute on function private.is_admin(uuid) to authenticated;

create function public.am_i_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin((select auth.uid()));
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- Append-only audit log of every admin decision.
create table private.admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   uuid not null,
  reason      text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Vehicles
-- -----------------------------------------------------------------------------
create type public.vehicle_visibility as enum ('public', 'private');

create table public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  make          text not null,
  model         text not null,
  generation    text,
  model_year    smallint not null,
  color         text,
  horsepower    smallint,
  modifications text not null default '',
  description   text not null default '',
  visibility    public.vehicle_visibility not null default 'public',
  -- Maintained only by the verification functions.
  is_verified   boolean not null default false,
  -- Set only by moderators (Milestone 5).
  is_restricted boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint vehicles_make check (char_length(make) between 1 and 40 and make = btrim(make)),
  constraint vehicles_model check (char_length(model) between 1 and 60 and model = btrim(model)),
  constraint vehicles_generation check (
    generation is null or (char_length(generation) between 1 and 40 and generation = btrim(generation))
  ),
  constraint vehicles_year check (model_year between 1886 and 2100),
  constraint vehicles_color check (color is null or (char_length(color) between 1 and 30 and color = btrim(color))),
  constraint vehicles_horsepower check (horsepower is null or horsepower between 1 and 2000),
  constraint vehicles_modifications check (char_length(modifications) <= 2000),
  constraint vehicles_description check (char_length(description) <= 1000)
);
create index vehicles_owner_idx on public.vehicles (owner_id, created_at);

create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function private.set_updated_at();

create function private.is_profile_private(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_private from public.profiles p where p.id = uid), true);
$$;
revoke execute on function private.is_profile_private(uuid) from public, anon;
grant execute on function private.is_profile_private(uuid) to authenticated;

-- Can `viewer` see this vehicle's profile? Owner always; others only when the
-- vehicle is public, not restricted, the owner's account is not private
-- (followers come in Milestone 3) and nobody blocked anybody.
create function private.can_view_vehicle(viewer uuid, vid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicles v
    join public.profiles p on p.id = v.owner_id
    where v.id = vid
      and (
        v.owner_id = viewer
        or (
          v.visibility = 'public'
          and not v.is_restricted
          and not p.is_private
          and not private.is_blocked_between(viewer, v.owner_id)
        )
      )
  );
$$;
revoke execute on function private.can_view_vehicle(uuid, uuid) from public, anon;
grant execute on function private.can_view_vehicle(uuid, uuid) to authenticated;

create function private.owns_vehicle(uid uuid, vid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.vehicles v where v.id = vid and v.owner_id = uid);
$$;
revoke execute on function private.owns_vehicle(uuid, uuid) from public, anon;
grant execute on function private.owns_vehicle(uuid, uuid) to authenticated;

-- Max 10 vehicles per user.
create function private.enforce_vehicle_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.vehicles v where v.owner_id = new.owner_id) >= 10 then
    raise exception 'PL8_VEHICLE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger vehicles_limit before insert on public.vehicles
for each row execute function private.enforce_vehicle_limit();

alter table public.vehicles enable row level security;
revoke all on public.vehicles from public, anon, authenticated;
grant select, delete on public.vehicles to authenticated;
grant insert (owner_id, make, model, generation, model_year, color, horsepower, modifications, description, visibility)
  on public.vehicles to authenticated;
grant update (make, model, generation, model_year, color, horsepower, modifications, description, visibility)
  on public.vehicles to authenticated;

create policy vehicles_select_visible on public.vehicles
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      visibility = 'public'
      and not is_restricted
      and not private.is_profile_private(owner_id)
      and not private.is_blocked_between((select auth.uid()), owner_id)
    )
  );

create policy vehicles_insert_own on public.vehicles
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy vehicles_update_own on public.vehicles
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy vehicles_delete_own on public.vehicles
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Vehicle photos (metadata; files live in the private "vehicle-photos" bucket
-- under "<vehicle_id>/<file>" — the path never contains the owner's id)
-- -----------------------------------------------------------------------------
create table public.vehicle_images (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null unique,
  position     smallint not null default 0 check (position between 0 and 9),
  width        integer check (width is null or width between 1 and 10000),
  height       integer check (height is null or height between 1 and 10000),
  created_at   timestamptz not null default now(),
  constraint vehicle_images_path check (
    storage_path ~ ('^' || vehicle_id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  )
);
create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, position, created_at);

create function private.enforce_image_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.vehicle_images i where i.vehicle_id = new.vehicle_id) >= 10 then
    raise exception 'PL8_IMAGE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger vehicle_images_limit before insert on public.vehicle_images
for each row execute function private.enforce_image_limit();

alter table public.vehicle_images enable row level security;
revoke all on public.vehicle_images from public, anon, authenticated;
grant select, delete on public.vehicle_images to authenticated;
grant insert (vehicle_id, storage_path, position, width, height) on public.vehicle_images to authenticated;
grant update (position) on public.vehicle_images to authenticated;

create policy vehicle_images_select on public.vehicle_images
  for select to authenticated
  using (private.can_view_vehicle((select auth.uid()), vehicle_id));

create policy vehicle_images_insert_own on public.vehicle_images
  for insert to authenticated
  with check (private.owns_vehicle((select auth.uid()), vehicle_id));

create policy vehicle_images_update_own on public.vehicle_images
  for update to authenticated
  using (private.owns_vehicle((select auth.uid()), vehicle_id))
  with check (private.owns_vehicle((select auth.uid()), vehicle_id));

create policy vehicle_images_delete_own on public.vehicle_images
  for delete to authenticated
  using (private.owns_vehicle((select auth.uid()), vehicle_id));

-- -----------------------------------------------------------------------------
-- License plates
-- Identity = country + normalized plate. Germany needs no extra jurisdiction
-- because the district code is part of the plate.
-- Keep normalize_plate_de in sync with src/shared/plate.ts
-- (shared test vectors: supabase/tests/plate_vectors.json).
-- -----------------------------------------------------------------------------
create function private.normalize_plate_de(p_district text, p_letters text, p_digits text, p_suffix text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  d text := upper(translate(btrim(coalesce(p_district, '')), 'äöü', 'ÄÖÜ'));
  l text := upper(btrim(coalesce(p_letters, '')));
  n text := btrim(coalesce(p_digits, ''));
  s text := upper(btrim(coalesce(p_suffix, '')));
begin
  if d !~ '^[A-ZÄÖÜ]{1,3}$' or l !~ '^[A-Z]{1,2}$' or n !~ '^[1-9][0-9]{0,3}$' or s !~ '^[EH]?$' then
    return null;
  end if;
  -- German plates have at most 8 characters including the E/H suffix.
  if char_length(d || l || n || s) > 8 then
    return null;
  end if;
  return d || '-' || l || '-' || n || s;
end;
$$;
revoke execute on function private.normalize_plate_de(text, text, text, text) from public, anon;
grant execute on function private.normalize_plate_de(text, text, text, text) to authenticated;

create type private.claim_status as enum ('not_verified', 'pending', 'verified', 'rejected', 'revoked');

create table private.plate_claims (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  country       text not null check (country in ('DE')),
  plate         text not null check (char_length(plate) between 5 and 12),
  status        private.claim_status not null default 'not_verified',
  -- Owner opt-ins (both off by default).
  discoverable  boolean not null default false,
  show_owner    boolean not null default false,
  verified_at   timestamptz,
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason in ('transfer', 'owner_removed', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint plate_claims_discoverable_needs_verified check (not discoverable or status = 'verified')
);

-- One active verified claim per plate.
create unique index plate_claims_one_verified on private.plate_claims (country, plate) where status = 'verified';
-- One live plate per vehicle.
create unique index plate_claims_one_live_per_vehicle on private.plate_claims (vehicle_id)
  where status in ('not_verified', 'pending', 'verified');
-- A user cannot hold the same plate twice.
create unique index plate_claims_one_live_per_user_plate on private.plate_claims (user_id, country, plate)
  where status in ('not_verified', 'pending', 'verified');
create index plate_claims_lookup on private.plate_claims (country, plate, status);
create index plate_claims_user on private.plate_claims (user_id, created_at desc);

create trigger plate_claims_set_updated_at
before update on private.plate_claims
for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Verification requests and evidence
-- Evidence files: private bucket "verification-evidence",
-- path "<user_id>/<request_id>/<file>.jpg". Deleted when an admin decides.
-- -----------------------------------------------------------------------------
create type private.request_status as enum ('awaiting_evidence', 'submitted', 'approved', 'rejected', 'expired');

create table private.verification_requests (
  id                 uuid primary key default gen_random_uuid(),
  claim_id           uuid not null references private.plate_claims (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  challenge_code     text not null check (challenge_code ~ '^PL8-[A-Z0-9]{4}$'),
  status             private.request_status not null default 'awaiting_evidence',
  submitted_at       timestamptz,
  decided_at         timestamptz,
  reviewer_id        uuid references auth.users (id) on delete set null,
  decision_note      text check (decision_note is null or char_length(decision_note) <= 500),
  evidence_purged_at timestamptz,
  created_at         timestamptz not null default now()
);
create index verification_requests_claim on private.verification_requests (claim_id, created_at desc);
create index verification_requests_queue on private.verification_requests (status, submitted_at);

create function private.random_challenge_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(4);
  out text := 'PL8-';
begin
  for i in 0..3 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;
revoke execute on function private.random_challenge_code() from public, anon, authenticated;

-- Folder names in storage paths are text; only accept real UUIDs.
create function private.try_uuid(t text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case when t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end;
$$;
grant execute on function private.try_uuid(text) to authenticated;

create function private.can_upload_evidence(uid uuid, request_folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.verification_requests r
    where r.id = private.try_uuid(request_folder)
      and r.user_id = uid
      and r.status = 'awaiting_evidence'
  )
  and (
    select count(*) from storage.objects o
    where o.bucket_id = 'verification-evidence'
      and o.name like uid::text || '/' || request_folder || '/%'
  ) < 4;
$$;
revoke execute on function private.can_upload_evidence(uuid, text) from public, anon;
grant execute on function private.can_upload_evidence(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Search log (abuse detection + rate limits). Stores a hash, not the plate.
-- Rows older than 30 days are deleted on every search.
-- -----------------------------------------------------------------------------
create table private.search_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  plate_hash bytea,
  found      boolean not null,
  created_at timestamptz not null default now()
);
create index search_log_user_time on private.search_log (user_id, created_at desc);
create index search_log_time on private.search_log (created_at);

-- Claim attempts are rate limited too.
create table private.claim_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index claim_log_user_time on private.claim_log (user_id, created_at desc);

-- Lock down everything in the private schema.
revoke all on all tables in schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Owner RPCs
-- -----------------------------------------------------------------------------

-- Claim a plate for one of your vehicles. The answer never reveals whether
-- someone else already holds the plate; conflicts are resolved by an admin.
create function public.claim_plate(
  p_vehicle_id uuid,
  p_country text,
  p_district text,
  p_letters text,
  p_digits text,
  p_suffix text default ''
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized text;
  new_id uuid;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.owns_vehicle(uid, p_vehicle_id) then
    raise exception 'PL8_NOT_YOUR_VEHICLE' using errcode = '42501';
  end if;
  if p_country is distinct from 'DE' then
    raise exception 'PL8_UNSUPPORTED_COUNTRY' using errcode = 'P0001';
  end if;

  normalized := private.normalize_plate_de(p_district, p_letters, p_digits, p_suffix);
  if normalized is null then
    raise exception 'PL8_INVALID_PLATE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('claim:' || uid::text, 0));
  if (select count(*) from private.claim_log c where c.user_id = uid and c.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from private.plate_claims c
    where c.vehicle_id = p_vehicle_id and c.status in ('not_verified', 'pending', 'verified')
  ) then
    raise exception 'PL8_VEHICLE_HAS_PLATE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from private.plate_claims c
    where c.user_id = uid and c.country = p_country and c.plate = normalized
      and c.status in ('not_verified', 'pending', 'verified')
  ) then
    raise exception 'PL8_ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  insert into private.claim_log (user_id) values (uid);
  insert into private.plate_claims (vehicle_id, user_id, country, plate)
  values (p_vehicle_id, uid, p_country, normalized)
  returning id into new_id;
  return new_id;
end;
$$;

-- The caller's claims (newest first), with the latest verification request.
create function public.my_plate_claims()
returns table (
  claim_id         uuid,
  vehicle_id       uuid,
  country          text,
  plate            text,
  status           text,
  discoverable     boolean,
  show_owner       boolean,
  verified_at      timestamptz,
  revoke_reason    text,
  created_at       timestamptz,
  request_id       uuid,
  request_status   text,
  challenge_code   text,
  decision_note    text
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.vehicle_id, c.country, c.plate, c.status::text, c.discoverable, c.show_owner,
         c.verified_at, c.revoke_reason, c.created_at,
         r.id, r.status::text,
         case when r.status = 'awaiting_evidence' then r.challenge_code end,
         r.decision_note
  from private.plate_claims c
  left join lateral (
    select * from private.verification_requests vr
    where vr.claim_id = c.id
    order by vr.created_at desc
    limit 1
  ) r on true
  where c.user_id = (select auth.uid())
  order by c.created_at desc;
$$;

-- Start (or resume) verification: returns the request and its challenge code.
create function public.start_verification(p_claim_id uuid)
returns table (request_id uuid, challenge_code text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  claim private.plate_claims;
  open_req private.verification_requests;
begin
  select * into claim from private.plate_claims c where c.id = p_claim_id and c.user_id = uid for update;
  if not found then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if claim.status not in ('not_verified', 'rejected') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  -- Expire stale unfinished requests (older than 7 days).
  update private.verification_requests r
     set status = 'expired'
   where r.claim_id = p_claim_id and r.status = 'awaiting_evidence'
     and r.created_at < now() - interval '7 days';

  select * into open_req from private.verification_requests r
   where r.claim_id = p_claim_id and r.status = 'awaiting_evidence'
   order by r.created_at desc limit 1;

  if not found then
    insert into private.verification_requests (claim_id, user_id, challenge_code)
    values (p_claim_id, uid, private.random_challenge_code())
    returning * into open_req;
  end if;

  if claim.status = 'rejected' then
    update private.plate_claims c set status = 'not_verified' where c.id = p_claim_id;
  end if;

  return query select open_req.id, open_req.challenge_code;
end;
$$;

-- Submit uploaded evidence for review (needs 2–4 photos).
create function public.submit_verification(p_request_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req private.verification_requests;
  files int;
begin
  select * into req from private.verification_requests r
   where r.id = p_request_id and r.user_id = uid for update;
  if not found then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if req.status <> 'awaiting_evidence' then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  select count(*) into files from storage.objects o
   where o.bucket_id = 'verification-evidence'
     and o.name like uid::text || '/' || p_request_id::text || '/%';
  if files < 2 then
    raise exception 'PL8_EVIDENCE_REQUIRED' using errcode = 'P0001';
  end if;

  update private.verification_requests r
     set status = 'submitted', submitted_at = now()
   where r.id = p_request_id;
  update private.plate_claims c set status = 'pending' where c.id = req.claim_id;
end;
$$;

-- Owner privacy switches. Discoverability requires an active verification.
create function public.set_plate_settings(p_claim_id uuid, p_discoverable boolean, p_show_owner boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  claim private.plate_claims;
begin
  select * into claim from private.plate_claims c where c.id = p_claim_id and c.user_id = uid for update;
  if not found then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if claim.status not in ('not_verified', 'pending', 'verified') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if p_discoverable and claim.status <> 'verified' then
    raise exception 'PL8_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  update private.plate_claims c
     set discoverable = coalesce(p_discoverable, false),
         show_owner = coalesce(p_show_owner, false)
   where c.id = p_claim_id;
end;
$$;

-- Remove your plate from a vehicle (new plate, car sold, …).
create function public.release_plate(p_claim_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  claim private.plate_claims;
begin
  select * into claim from private.plate_claims c where c.id = p_claim_id and c.user_id = uid for update;
  if not found then
    raise exception 'PL8_NOT_FOUND' using errcode = '42501';
  end if;
  if claim.status not in ('not_verified', 'pending', 'verified') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;

  update private.plate_claims c
     set status = 'revoked', revoked_at = now(), revoke_reason = 'owner_removed', discoverable = false
   where c.id = p_claim_id;
  update private.verification_requests r set status = 'expired'
   where r.claim_id = p_claim_id and r.status = 'awaiting_evidence';
  update public.vehicles v set is_verified = false where v.id = claim.vehicle_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- PL8 Search
-- -----------------------------------------------------------------------------
create function public.search_plate(
  p_country text,
  p_district text,
  p_letters text,
  p_digits text,
  p_suffix text default ''
)
returns table (
  vehicle_id         uuid,
  make               text,
  model              text,
  generation         text,
  model_year         smallint,
  color              text,
  cover_path         text,
  owner_username     text,
  owner_display_name text,
  owner_avatar_path  text
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  normalized text;
  recent int;
  daily int;
  daily_limit int;
  hit record;
  matched boolean;
begin
  if uid is null then
    raise exception 'PL8_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_country is distinct from 'DE' then
    raise exception 'PL8_UNSUPPORTED_COUNTRY' using errcode = 'P0001';
  end if;

  -- One search at a time per user, so limits cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('search:' || uid::text, 0));

  select count(*) filter (where l.created_at > now() - interval '10 minutes'), count(*)
    into recent, daily
    from private.search_log l
   where l.user_id = uid and l.created_at > now() - interval '24 hours';

  -- New accounts (< 24 h) get fewer searches.
  select case when u.created_at > now() - interval '24 hours' then 5 else 30 end
    into daily_limit from auth.users u where u.id = uid;

  if recent >= 10 or daily >= coalesce(daily_limit, 5) then
    raise exception 'PL8_RATE_LIMITED' using errcode = 'P0001';
  end if;

  delete from private.search_log l where l.created_at < now() - interval '30 days';

  normalized := private.normalize_plate_de(p_district, p_letters, p_digits, p_suffix);
  if normalized is null then
    insert into private.search_log (user_id, plate_hash, found) values (uid, null, false);
    return;
  end if;

  select v.id, v.make, v.model, v.generation, v.model_year, v.color, v.owner_id, c.show_owner,
         p.username, p.display_name, p.avatar_path,
         (select i.storage_path from public.vehicle_images i
           where i.vehicle_id = v.id order by i.position, i.created_at limit 1) as cover
    into hit
    from private.plate_claims c
    join public.vehicles v on v.id = c.vehicle_id
    join public.profiles p on p.id = v.owner_id
   where c.country = p_country
     and c.plate = normalized
     and c.status = 'verified'
     and c.discoverable
     and not v.is_restricted
     and not private.is_blocked_between(uid, v.owner_id);
  matched := found;

  insert into private.search_log (user_id, plate_hash, found)
  values (uid, extensions.digest(p_country || ':' || normalized, 'sha256'), matched);

  if not matched then
    return; -- Same empty answer for "unknown", "hidden" and "blocked".
  end if;

  return query select
    case when private.can_view_vehicle(uid, hit.id) then hit.id end,
    hit.make, hit.model, hit.generation, hit.model_year, hit.color, hit.cover,
    case when hit.show_owner then hit.username end,
    case when hit.show_owner then hit.display_name end,
    case when hit.show_owner then hit.avatar_path end;
end;
$$;

-- Photos of a vehicle may be shown to people who found it through PL8 Search.
create function private.can_view_vehicle_media(viewer uuid, folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_view_vehicle(viewer, private.try_uuid(folder))
      or exists (
        select 1
        from private.plate_claims c
        join public.vehicles v on v.id = c.vehicle_id
        where c.vehicle_id = private.try_uuid(folder)
          and c.status = 'verified'
          and c.discoverable
          and not v.is_restricted
          and not private.is_blocked_between(viewer, v.owner_id)
      );
$$;
revoke execute on function private.can_view_vehicle_media(uuid, text) from public, anon;
grant execute on function private.can_view_vehicle_media(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Admin RPCs
-- -----------------------------------------------------------------------------
create function public.admin_verification_queue()
returns table (
  request_id     uuid,
  claim_id       uuid,
  submitted_at   timestamptz,
  challenge_code text,
  country        text,
  plate          text,
  user_id        uuid,
  username       text,
  vehicle_id     uuid,
  make           text,
  model          text,
  model_year     smallint,
  color          text,
  evidence_paths text[],
  has_conflict   boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select r.id, c.id, r.submitted_at, r.challenge_code, c.country, c.plate,
         p.id, p.username, v.id, v.make, v.model, v.model_year, v.color,
         coalesce((
           select array_agg(o.name order by o.name) from storage.objects o
           where o.bucket_id = 'verification-evidence'
             and o.name like r.user_id::text || '/' || r.id::text || '/%'
         ), '{}'::text[]),
         exists (
           select 1 from private.plate_claims other
           where other.country = c.country and other.plate = c.plate
             and other.id <> c.id and other.status in ('verified', 'pending')
         )
  from private.verification_requests r
  join private.plate_claims c on c.id = r.claim_id
  join public.profiles p on p.id = r.user_id
  join public.vehicles v on v.id = c.vehicle_id
  where r.status = 'submitted'
  order by r.submitted_at;
end;
$$;

-- Approve or reject. Returns the evidence file paths, which the admin app
-- deletes immediately afterwards (retention: evidence is kept only until the
-- decision), then confirms with admin_mark_evidence_purged.
create function public.admin_decide_verification(p_request_id uuid, p_approve boolean, p_note text default null)
returns text[]
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req private.verification_requests;
  claim private.plate_claims;
  note text := nullif(btrim(coalesce(p_note, '')), '');
  paths text[];
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;

  select * into req from private.verification_requests r where r.id = p_request_id for update;
  if not found or req.status <> 'submitted' then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if req.user_id = uid then
    raise exception 'PL8_SELF_REVIEW' using errcode = '42501';
  end if;
  if not p_approve and (note is null or char_length(note) < 3) then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select * into claim from private.plate_claims c where c.id = req.claim_id for update;

  if p_approve then
    -- Transfer: an earlier verified holder of the same plate loses it.
    update public.vehicles v set is_verified = false
     where v.id in (
       select o.vehicle_id from private.plate_claims o
        where o.country = claim.country and o.plate = claim.plate
          and o.status = 'verified' and o.id <> claim.id
     );
    update private.plate_claims o
       set status = 'revoked', revoked_at = now(), revoke_reason = 'transfer', discoverable = false
     where o.country = claim.country and o.plate = claim.plate
       and o.status = 'verified' and o.id <> claim.id;

    update private.plate_claims c set status = 'verified', verified_at = now() where c.id = claim.id;
    update public.vehicles v set is_verified = true where v.id = claim.vehicle_id;
  else
    update private.plate_claims c set status = 'rejected' where c.id = claim.id;
  end if;

  update private.verification_requests r
     set status = case when p_approve then 'approved'::private.request_status else 'rejected'::private.request_status end,
         decided_at = now(), reviewer_id = uid, decision_note = note
   where r.id = p_request_id;

  insert into private.admin_actions (admin_id, action, target_type, target_id, reason, metadata)
  values (uid, case when p_approve then 'verification_approved' else 'verification_rejected' end,
          'verification_request', p_request_id, note,
          jsonb_build_object('claim_id', claim.id, 'vehicle_id', claim.vehicle_id));

  select coalesce(array_agg(o.name), '{}'::text[]) into paths from storage.objects o
   where o.bucket_id = 'verification-evidence'
     and o.name like req.user_id::text || '/' || req.id::text || '/%';
  return paths;
end;
$$;

create function public.admin_mark_evidence_purged(p_request_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  req private.verification_requests;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  select * into req from private.verification_requests r where r.id = p_request_id;
  if not found or req.status not in ('approved', 'rejected') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'verification-evidence'
      and o.name like req.user_id::text || '/' || req.id::text || '/%'
  ) then
    raise exception 'PL8_EVIDENCE_REMAINS' using errcode = 'P0001';
  end if;
  update private.verification_requests r set evidence_purged_at = now() where r.id = p_request_id;
end;
$$;

-- Decided requests whose evidence was not deleted yet (retry list for admins).
create function public.admin_pending_evidence_cleanup()
returns table (request_id uuid, evidence_paths text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select r.id, array_agg(o.name)
  from private.verification_requests r
  join storage.objects o
    on o.bucket_id = 'verification-evidence'
   and o.name like r.user_id::text || '/' || r.id::text || '/%'
  where r.status in ('approved', 'rejected', 'expired')
  group by r.id;
end;
$$;

create function public.admin_revoke_claim(p_claim_id uuid, p_reason text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  claim private.plate_claims;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin(uid) then
    raise exception 'PL8_ADMIN_ONLY' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) < 3 then
    raise exception 'PL8_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into claim from private.plate_claims c where c.id = p_claim_id for update;
  if not found or claim.status not in ('not_verified', 'pending', 'verified') then
    raise exception 'PL8_INVALID_STATE' using errcode = 'P0001';
  end if;
  update private.plate_claims c
     set status = 'revoked', revoked_at = now(), revoke_reason = 'admin', discoverable = false
   where c.id = p_claim_id;
  update public.vehicles v set is_verified = false where v.id = claim.vehicle_id;
  insert into private.admin_actions (admin_id, action, target_type, target_id, reason)
  values (uid, 'claim_revoked', 'plate_claim', p_claim_id, reason);
end;
$$;

-- Only signed-in users may call these RPCs.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.claim_plate(uuid, text, text, text, text, text)',
    'public.my_plate_claims()',
    'public.start_verification(uuid)',
    'public.submit_verification(uuid)',
    'public.set_plate_settings(uuid, boolean, boolean)',
    'public.release_plate(uuid)',
    'public.search_plate(text, text, text, text, text)',
    'public.admin_verification_queue()',
    'public.admin_decide_verification(uuid, boolean, text)',
    'public.admin_mark_evidence_purged(uuid)',
    'public.admin_pending_evidence_cleanup()',
    'public.admin_revoke_claim(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage buckets (both PRIVATE)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-photos', 'vehicle-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-evidence', 'verification-evidence', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- vehicle-photos: "<vehicle_id>/<file>"
create policy vehicle_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and private.can_view_vehicle_media((select auth.uid()), (storage.foldername(name))[1])
  );

create policy vehicle_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and private.owns_vehicle((select auth.uid()), private.try_uuid((storage.foldername(name))[1]))
  );

create policy vehicle_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and private.owns_vehicle((select auth.uid()), private.try_uuid((storage.foldername(name))[1]))
  );

-- verification-evidence: "<user_id>/<request_id>/<file>"
create policy evidence_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_admin((select auth.uid()))
    )
  );

create policy evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.can_upload_evidence((select auth.uid()), (storage.foldername(name))[2])
  );

create policy evidence_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_admin((select auth.uid()))
    )
  );
