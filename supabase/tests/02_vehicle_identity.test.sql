-- =============================================================================
-- Milestone 2: vehicles, plate claims, verification, admin review, PL8 Search.
-- Runs the full journey as real API roles and checks every permission rule.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

\set alice  'a1111111-1111-1111-1111-111111111111'
\set bob    'b2222222-2222-2222-2222-222222222222'
\set carol  'c3333333-3333-3333-3333-333333333333'
\set dave   'd4444444-4444-4444-4444-444444444444'
\set eve    'e5555555-5555-5555-5555-555555555555'
\set newbie 'f6666666-6666-6666-6666-666666666666'

-- ------------------------------------------------------------ fixtures -------
insert into auth.users (id, email, raw_user_meta_data, created_at)
select u.id, u.email, '{"age_confirmed":true,"terms_version":"t","privacy_version":"p"}', u.created
from (values
  (:'alice'::uuid,  'alice@test.dev',  now() - interval '30 days'),
  (:'bob'::uuid,    'bob@test.dev',    now() - interval '30 days'),
  (:'carol'::uuid,  'carol@test.dev',  now() - interval '30 days'),
  (:'dave'::uuid,   'dave@test.dev',   now() - interval '30 days'),
  (:'eve'::uuid,    'eve@test.dev',    now() - interval '30 days'),
  (:'newbie'::uuid, 'newbie@test.dev', now() - interval '1 hour')
) as u(id, email, created);

insert into public.profiles (id, username, display_name) values
  (:'alice', 'alice_m2', 'Alice'),
  (:'bob', 'bob_spotter', 'Bob'),
  (:'carol', 'carol_rs', 'Carol'),
  (:'dave', 'dave_admin', 'Dave'),
  (:'eve', 'eve_buyer', 'Eve'),
  (:'newbie', 'newbie_1', 'Newbie');

insert into private.user_roles (user_id, role) values (:'dave', 'admin');
insert into public.blocks (blocker_id, blocked_id) values (:'alice', :'carol');

-- --------------------------------------------------- plate normalization -----
\set vectors `cat "$PL8_TESTS_DIR/plate_vectors.json"`
select tests.ok(
  private.normalize_plate_de(v->>'d', v->>'l', v->>'n', v->>'s') is not distinct from (v->>'expected'),
  format('normalize %s|%s|%s|%s → %s', v->>'d', v->>'l', v->>'n', v->>'s', coalesce(v->>'expected', 'invalid')))
from jsonb_array_elements(:'vectors'::jsonb) as v;

-- ------------------------------------------------------------- vehicles ------
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.vehicles (owner_id, make, model, generation, model_year, color, horsepower)
values (:'alice', 'BMW', 'M2', 'G87', 2024, 'Brooklyn Grey', 460)
returning id as v_alice \gset
select tests.ok(true, 'owner can add a vehicle');

select tests.throws(
  format($$insert into public.vehicles (owner_id, make, model, model_year) values (%L, 'Audi', 'RS3', 2023)$$, :'bob'),
  'cannot add a vehicle for someone else', '42501');
select tests.throws(
  format($$update public.vehicles set is_verified = true where id = %L$$, :'v_alice'),
  'owner cannot set is_verified', '42501');
select tests.throws(
  format($$update public.vehicles set is_restricted = false where id = %L$$, :'v_alice'),
  'owner cannot change moderation flag', '42501');
select tests.throws(
  format($$update public.vehicles set owner_id = %L where id = %L$$, :'bob', :'v_alice'),
  'owner cannot hand a vehicle to someone else', '42501');
select tests.throws(
  $$insert into public.vehicles (owner_id, make, model, model_year) values (auth.uid(), 'BMW', 'M3', 1800)$$,
  'impossible model year rejected', '23514');
select tests.throws(
  $$insert into public.vehicles (owner_id, make, model, model_year) values (auth.uid(), '', 'M3', 2020)$$,
  'empty make rejected', '23514');

insert into public.vehicles (owner_id, make, model, model_year, visibility)
values (:'alice', 'Porsche', '911 GT3', 2022, 'private')
returning id as v_alice_private \gset

-- photos
insert into public.vehicle_images (vehicle_id, storage_path, position)
values (:'v_alice', :'v_alice' || '/cover_1.jpg', 0);
select tests.ok(true, 'owner can add a vehicle photo');
select tests.throws(
  format($$insert into public.vehicle_images (vehicle_id, storage_path) values (%L, %L)$$, :'v_alice', :'v_alice_private' || '/x.jpg'),
  'photo path must belong to the same vehicle', '23514');
insert into storage.objects (bucket_id, name) values ('vehicle-photos', :'v_alice' || '/cover_1.jpg');
select tests.ok(true, 'owner can upload into the vehicle photo folder');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.vehicles where id = :'v_alice') = 1, 'others see a public vehicle');
select tests.ok((select count(*) from public.vehicles where id = :'v_alice_private') = 0, 'others do not see a private vehicle');
select tests.ok((select count(*) from public.vehicle_images where vehicle_id = :'v_alice') = 1, 'others see photos of a public vehicle');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'vehicle-photos' and name like :'v_alice' || '/%') = 1,
  'others can load photo files of a public vehicle');
select tests.throws(
  format($$insert into public.vehicle_images (vehicle_id, storage_path) values (%L, %L)$$, :'v_alice', :'v_alice' || '/evil.jpg'),
  'cannot add photos to someone else''s vehicle', '42501');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('vehicle-photos', %L)$$, :'v_alice' || '/evil.jpg'),
  'cannot upload files into someone else''s vehicle folder', '42501');
select tests.ok(
  tests.affected(format($$update public.vehicles set model = 'hacked' where id = %L$$, :'v_alice')) = 0,
  'cannot edit someone else''s vehicle');
select tests.ok(
  tests.affected(format($$delete from public.vehicles where id = %L$$, :'v_alice')) = 0,
  'cannot delete someone else''s vehicle');
reset role;

-- private account hides the garage
update public.profiles set is_private = true where id = :'alice';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.vehicles where owner_id = :'alice') = 0, 'private account hides the garage');
reset role;
update public.profiles set is_private = false where id = :'alice';

select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.vehicles where owner_id = :'alice') = 0, 'blocked user cannot see the garage');
reset role;

-- vehicle limit (10)
select set_config('request.jwt.claims', json_build_object('sub', :'newbie', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.vehicles (owner_id, make, model, model_year)
select auth.uid(), 'VW', 'Golf R ' || g, 2020 from generate_series(1, 10) g;
select tests.throws(
  $$insert into public.vehicles (owner_id, make, model, model_year) values (auth.uid(), 'VW', 'Golf 11', 2020)$$,
  'an 11th vehicle is rejected', 'P0001');
reset role;

-- ---------------------------------------------------------------- claims -----
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.claim_plate(:'v_alice', 'DE', ' wi ', 'fa', '480', '') as claim_alice \gset
select tests.ok(:'claim_alice' is not null, 'owner can claim a plate');
select tests.throws($$select * from private.plate_claims$$, 'claims table is not readable through the API', '42501');
select tests.throws(
  format($$select public.claim_plate(%L, 'DE', 'F', 'AB', '1', '')$$, :'v_alice'),
  'second live plate on the same vehicle is rejected', 'P0001');
select tests.throws(
  format($$select public.claim_plate(%L, 'DE', 'WI', 'FA', '480', '')$$, :'v_alice_private'),
  'same user cannot claim the same plate twice', 'P0001');
select tests.throws(
  format($$select public.claim_plate(%L, 'DE', 'F', 'AB', '0123', '')$$, :'v_alice_private'),
  'invalid plate is rejected', 'P0001');
select tests.throws(
  format($$select public.claim_plate(%L, 'FR', 'F', 'AB', '1', '')$$, :'v_alice_private'),
  'unsupported country is rejected', 'P0001');
select tests.ok(
  (select plate = 'WI-FA-480' and status = 'not_verified' and not discoverable and not show_owner
     from public.my_plate_claims() where claim_id = :'claim_alice'),
  'claim is stored normalized, unverified, private by default');
select tests.throws(
  format($$select public.set_plate_settings(%L, true, false)$$, :'claim_alice'),
  'cannot become discoverable before verification', 'P0001');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(
  format($$select public.claim_plate(%L, 'DE', 'F', 'AB', '1', '')$$, :'v_alice'),
  'cannot claim a plate for someone else''s vehicle', '42501');
select tests.ok((select count(*) from public.my_plate_claims()) = 0, 'users only see their own claims');
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'FA', '480')) = 0, 'unverified plate is not searchable');
select tests.throws(format($$select public.set_plate_settings(%L, false, true)$$, :'claim_alice'),
  'cannot change someone else''s plate settings', '42501');
select tests.throws(format($$select public.release_plate(%L)$$, :'claim_alice'),
  'cannot release someone else''s plate', '42501');
reset role;

-- ---------------------------------------------------------- verification -----
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select request_id as req_alice, challenge_code as code_alice from public.start_verification(:'claim_alice') \gset
select tests.ok(:'code_alice' ~ '^PL8-[A-Z0-9]{4}$', 'challenge code has the PL8-XXXX format');
select tests.ok(
  (select request_id from public.start_verification(:'claim_alice')) = :'req_alice',
  'starting again resumes the same request');
select tests.throws(format($$select public.submit_verification(%L)$$, :'req_alice'),
  'cannot submit without photos', 'P0001');

insert into storage.objects (bucket_id, name) values
  ('verification-evidence', :'alice' || '/' || :'req_alice' || '/1.jpg'),
  ('verification-evidence', :'alice' || '/' || :'req_alice' || '/2.jpg'),
  ('verification-evidence', :'alice' || '/' || :'req_alice' || '/3.jpg'),
  ('verification-evidence', :'alice' || '/' || :'req_alice' || '/4.jpg');
select tests.ok(true, 'owner can upload up to 4 evidence photos');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('verification-evidence', %L)$$,
         :'alice' || '/' || :'req_alice' || '/5.jpg'),
  'a 5th evidence photo is rejected', '42501');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('verification-evidence', %L)$$,
         :'alice' || '/' || gen_random_uuid() || '/1.jpg'),
  'evidence needs an open request of your own', '42501');

select public.submit_verification(:'req_alice');
select tests.ok(
  (select status = 'pending' and request_status = 'submitted' from public.my_plate_claims() where claim_id = :'claim_alice'),
  'submitting moves the claim to pending');
select tests.ok(
  (select challenge_code is null from public.my_plate_claims() where claim_id = :'claim_alice'),
  'challenge code is no longer returned after submission');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('verification-evidence', %L)$$,
         :'alice' || '/' || :'req_alice' || '/9.jpg'),
  'no more uploads after submission', '42501');
select tests.throws($$select * from public.admin_verification_queue()$$, 'non-admins cannot see the review queue', '42501');
select tests.throws(format($$select public.admin_decide_verification(%L, true)$$, :'req_alice'),
  'users cannot approve their own verification', '42501');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.am_i_admin() = false, 'am_i_admin is false for normal users');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'verification-evidence') = 0,
  'other users cannot see verification evidence');
select tests.throws(
  format($$insert into storage.objects (bucket_id, name) values ('verification-evidence', %L)$$,
         :'alice' || '/' || :'req_alice' || '/evil.jpg'),
  'cannot upload into someone else''s evidence folder', '42501');
reset role;

-- admin review
select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(public.am_i_admin(), 'am_i_admin is true for admins');
select tests.ok(
  (select cardinality(evidence_paths) = 4 and not has_conflict and plate = 'WI-FA-480' and challenge_code = :'code_alice'
     from public.admin_verification_queue() where request_id = :'req_alice'),
  'admin queue shows plate, code, 4 photos, no conflict');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'verification-evidence') = 4,
  'admin can view evidence files');
select tests.throws(format($$select public.admin_decide_verification(%L, false, '')$$, :'req_alice'),
  'rejection needs a reason', 'P0001');
select tests.ok(
  cardinality(public.admin_decide_verification(:'req_alice', true, null)) = 4,
  'admin approves and gets the evidence paths back for deletion');
select tests.throws(format($$select public.admin_decide_verification(%L, true)$$, :'req_alice'),
  'a request cannot be decided twice', 'P0001');
select tests.throws(format($$select public.admin_mark_evidence_purged(%L)$$, :'req_alice'),
  'cannot mark evidence purged while files remain', 'P0001');
select tests.ok(
  (select count(*) from public.admin_pending_evidence_cleanup() where request_id = :'req_alice') = 1,
  'undeleted evidence shows up in the cleanup list');
delete from storage.objects where bucket_id = 'verification-evidence' and name like :'alice' || '/' || :'req_alice' || '/%';
select public.admin_mark_evidence_purged(:'req_alice');
select tests.ok(true, 'admin deletes evidence and records the purge');
reset role;

select tests.ok((select is_verified from public.vehicles where id = :'v_alice'), 'approved vehicle is marked verified');
select tests.ok(
  (select count(*) from private.admin_actions where target_id = :'req_alice' and action = 'verification_approved') = 1,
  'the decision is written to the audit log');

-- ------------------------------------------------------------- search --------
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'FA', '480')) = 0,
  'verified but not opted-in plate is not searchable');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_plate_settings(:'claim_alice', true, false);
select tests.ok(true, 'owner opts in to plate discovery');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select vehicle_id = :'v_alice' and make = 'BMW' and model = 'M2' and generation = 'G87'
          and cover_path = :'v_alice' || '/cover_1.jpg' and owner_username is null and owner_display_name is null
     from public.search_plate('DE', 'WI', 'FA', '480')),
  'search finds the vehicle; owner hidden by default');
select tests.ok((select count(*) from public.search_plate('DE', 'wi', ' fa', '480 ')) = 1, 'search ignores case and spaces');
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'FA', '48')) = 0, 'no partial matches');
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'F', '480')) = 0, 'a different plate is not found');
select tests.ok((select count(*) from public.search_plate('DE', 'W%', '_', '4')) = 0, 'wildcards are not accepted');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_plate_settings(:'claim_alice', true, true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select owner_username = 'alice_m2' from public.search_plate('DE', 'WI', 'FA', '480')),
  'owner shown only after opting in');
reset role;

update public.profiles set is_private = true where id = :'alice';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select vehicle_id is null and make = 'BMW' from public.search_plate('DE', 'WI', 'FA', '480')),
  'private account: search shows the car card but no link to the garage');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'vehicle-photos' and name like :'v_alice' || '/%') = 1,
  'searchers can still load the photo of a discoverable car');
reset role;
update public.profiles set is_private = false where id = :'alice';

select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'FA', '480')) = 0, 'blocked users get no result');
select tests.ok(
  (select count(*) from storage.objects where bucket_id = 'vehicle-photos' and name like :'v_alice' || '/%') = 0,
  'blocked users cannot load the photos');
reset role;

set local role anon;
select tests.throws($$select * from public.search_plate('DE', 'WI', 'FA', '480')$$, 'anonymous search is refused', '42501');
reset role;

select tests.ok(
  (select bool_and(plate_hash is null or octet_length(plate_hash) = 32) from private.search_log),
  'search log stores only a hash of the plate');

-- rate limits
delete from private.search_log where user_id = :'bob';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from generate_series(1, 9) g, lateral public.search_plate('DE', 'F', 'AB', g::text) \g /dev/null
select tests.ok((select count(*) from public.search_plate('DE', 'F', 'AB', '10')) = 0, '10th search in 10 minutes still works');
select tests.throws($$select * from public.search_plate('DE', 'F', 'AB', '11')$$, '11th search in 10 minutes is blocked', 'P0001');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'newbie', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from generate_series(1, 5) g, lateral public.search_plate('DE', 'F', 'AB', g::text) \g /dev/null
select tests.throws($$select * from public.search_plate('DE', 'F', 'AB', '6')$$, 'new accounts get 5 searches per day', 'P0001');
reset role;

-- --------------------------------------------- transfer / dispute ------------
select set_config('request.jwt.claims', json_build_object('sub', :'eve', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.vehicles (owner_id, make, model, model_year) values (:'eve', 'BMW', 'M2', 2024)
returning id as v_eve \gset
select public.claim_plate(:'v_eve', 'DE', 'WI', 'FA', '480') as claim_eve \gset
select tests.ok(:'claim_eve' is not null, 'a second person can claim a held plate (no information leaked)');
select request_id as req_eve from public.start_verification(:'claim_eve') \gset
insert into storage.objects (bucket_id, name) values
  ('verification-evidence', :'eve' || '/' || :'req_eve' || '/1.jpg'),
  ('verification-evidence', :'eve' || '/' || :'req_eve' || '/2.jpg');
select public.submit_verification(:'req_eve');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select has_conflict from public.admin_verification_queue() where request_id = :'req_eve'),
  'admin sees that the plate is already held (dispute/transfer)');
select public.admin_decide_verification(:'req_eve', true, 'Transfer confirmed') \g /dev/null
reset role;

select tests.ok(
  (select status = 'revoked' and revoke_reason = 'transfer' and not discoverable
     from private.plate_claims where id = :'claim_alice'),
  'approving the new holder revokes the previous claim');
select tests.ok(not (select is_verified from public.vehicles where id = :'v_alice'), 'previous vehicle loses its badge');
select tests.ok((select status = 'verified' from private.plate_claims where id = :'claim_eve'), 'new holder is verified');
select tests.throws(
  format($$update private.plate_claims set status = 'verified' where id = %L$$, :'claim_alice'),
  'database never allows two verified claims for one plate', '23505');

delete from private.search_log where user_id = :'bob';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok((select count(*) from public.search_plate('DE', 'WI', 'FA', '480')) = 0,
  'after a transfer the plate stays hidden until the new owner opts in');
reset role;

-- rejection path + self-review
select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.vehicles (owner_id, make, model, model_year) values (:'dave', 'Audi', 'RS6', 2021)
returning id as v_dave \gset
select public.claim_plate(:'v_dave', 'DE', 'F', 'RS', '6') as claim_dave \gset
select request_id as req_dave from public.start_verification(:'claim_dave') \gset
insert into storage.objects (bucket_id, name) values
  ('verification-evidence', :'dave' || '/' || :'req_dave' || '/1.jpg'),
  ('verification-evidence', :'dave' || '/' || :'req_dave' || '/2.jpg');
select public.submit_verification(:'req_dave');
select tests.throws(format($$select public.admin_decide_verification(%L, true)$$, :'req_dave'),
  'admins cannot approve their own claim', '42501');
reset role;

insert into private.user_roles (user_id, role) values (:'bob', 'admin');
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.admin_decide_verification(:'req_dave', false, 'Plate not readable in photos') \g /dev/null
select tests.ok(true, 'a second admin can reject with a reason');
reset role;
delete from private.user_roles where user_id = :'bob';

select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.ok(
  (select status = 'rejected' and decision_note = 'Plate not readable in photos' from public.my_plate_claims() where claim_id = :'claim_dave'),
  'owner sees the rejection and the reason');
select tests.ok(
  (select request_id <> :'req_dave' from public.start_verification(:'claim_dave')),
  'owner can try again with a new code');
reset role;

-- release + admin revoke
select set_config('request.jwt.claims', json_build_object('sub', :'eve', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.release_plate(:'claim_eve');
select tests.ok(
  (select status = 'revoked' and revoke_reason = 'owner_removed' from public.my_plate_claims() where claim_id = :'claim_eve'),
  'owner can release a plate');
reset role;
select tests.ok(not (select is_verified from public.vehicles where id = :'v_eve'), 'released vehicle loses its badge');

select set_config('request.jwt.claims', json_build_object('sub', :'dave', 'role', 'authenticated')::text, true);
set local role authenticated;
select tests.throws(format($$select public.admin_revoke_claim(%L, '')$$, :'claim_dave'), 'revoking needs a reason', 'P0001');
select public.admin_revoke_claim(:'claim_dave', 'Test revoke');
select tests.ok(true, 'admin can revoke a claim with a reason');
reset role;

-- claim rate limit (5 per 24 h)
select set_config('request.jwt.claims', json_build_object('sub', :'newbie', 'role', 'authenticated')::text, true);
set local role authenticated;
select id as v_newbie from public.vehicles where owner_id = auth.uid() limit 1 \gset
do $$
declare c uuid;
begin
  for i in 1..5 loop
    c := public.claim_plate((select id from public.vehicles where owner_id = auth.uid() order by created_at limit 1),
                            'DE', 'F', 'NB', i::text);
    perform public.release_plate(c);
  end loop;
end;
$$;
select tests.throws(
  format($$select public.claim_plate(%L, 'DE', 'F', 'NB', '6')$$, :'v_newbie'),
  'more than 5 plate claims per day are blocked', 'P0001');
reset role;

-- deleting a vehicle removes its claims
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
delete from public.vehicles where id = :'v_alice';
reset role;
select tests.ok(not exists (select 1 from private.plate_claims where vehicle_id = :'v_alice'), 'deleting a vehicle deletes its claims');

rollback;
