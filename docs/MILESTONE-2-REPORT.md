# Milestone 2 — Vehicle identity: report

Status: **complete, awaiting founder approval.** Milestone 3 has not been started.

## 1. Features completed

- **Digital Garage**: every profile shows its garage (yours with "Add vehicle",
  up to 10 cars). Private accounts and private cars stay hidden from others.
- **Add / edit vehicle**: make (with quick picks: BMW, Mercedes-AMG, Audi, Porsche,
  JDM brands…), model, generation, model year, colour, PS, modifications,
  description, "show on my profile" switch, delete.
- **Vehicle photos**: up to 10 per car from camera or gallery, cover photo,
  remove. Resized and re-encoded on the phone (~1600 px JPEG). Stored in a
  **private** bucket and shown through 1-hour signed links.
- **Vehicle profile**: photo gallery, details, owner, "Verified PL8" badge.
- **Plate claim**: EU-style plate input with separate fields for district,
  letters and numbers (because "F-AB" ≠ "FA-B"), plus E/H suffix. German format
  checked in the app **and** on the server (same 25 test cases).
- **Manual verification**:
  1. The app shows a random code, e.g. `PL8-7K3Q`.
  2. The owner takes 2–4 **live camera photos** (the gallery is not allowed)
     showing the car, the plate and the code on paper.
  3. The owner sends them for review.
  4. An admin approves or rejects with a reason.
  - Nobody can approve their own plate, admins included.
  - Every decision goes into an audit log.
  - The app says "access to the car", not "legal ownership".
- **Evidence retention**: evidence photos are private (owner and admins only) and
  **deleted right after the decision**. The admin screen has a retry button for
  any leftovers. Codes that are never used expire after 7 days.
- **Duplicate prevention, transfers, disputes**:
  - The database allows only one verified owner per plate, one live plate per
    car, and no claiming the same plate twice.
  - If a second person claims a held plate, the admin sees a ⚠ warning.
    Approving moves the plate to them and removes it from the previous owner,
    who is shown why.
  - Owners can remove their plate, for example after getting a new plate or
    selling the car.
- **PL8 Search**:
  - Exact match only. Typing part of a plate never finds anything.
  - Results include only plates that are verified **and** opted in by the
    owner, on cars that aren't restricted, between people who haven't blocked
    each other.
  - Unknown, hidden and blocked plates all get the same "No PL8 found" answer.
  - **The car is shown first.** The owner is shown only if they turned on
    "Show my profile".
  - If the owner's account is private, you see the car card but get no link
    into their garage.
  - Limits: 10 searches per 10 minutes and 30 per day (5 per day for accounts
    less than 24 hours old). Claims are limited to 5 per day.
  - Searches are logged for 30 days as a fingerprint (hash) of the plate,
    never the plate itself.
- **Admin review screens**: Settings → Admin (visible only to admins; the server
  checks again on every action).

## 2. Files created or modified

```
supabase/migrations/20261026090000_vehicle_identity.sql   (new: tables, RLS, functions, buckets)
supabase/tests/02_vehicle_identity.test.sql               (new: full journey + permissions)
supabase/tests/plate_vectors.json                         (new: plate test cases shared with the app)
supabase/tests/_shim.sql, scripts/test-db.sh              (pgcrypto in "extensions", UTF-8 test DB)
src/shared/plate.ts, src/shared/vehicle.ts                (new)
src/lib/images.ts                                         (new: camera/gallery + resize)
src/lib/database.types.ts, src/lib/errors.ts              (updated)
src/features/garage/{api.ts,components.tsx,GarageSection.tsx,VehicleForm.tsx}   (new)
src/features/profile/{api.ts,avatar.ts}                   (updated)
src/app/vehicle/new.tsx, src/app/vehicle/[id]/{index,edit,plate}.tsx            (new)
src/app/verification/[claimId].tsx, src/app/admin/{index,[requestId]}.tsx       (new)
src/app/(tabs)/search.tsx, src/app/(tabs)/profile.tsx, src/app/user/[username].tsx,
src/app/settings/index.tsx, src/app/_layout.tsx           (updated)
src/i18n/{en,de}.ts                                       (new texts, DE + EN)
src/__tests__/{plate.test.ts,garage.test.tsx}             (new)
app.json                                                  (camera permission text)
docs/MILESTONE-2-REPORT.md, docs/SUPABASE-SETUP.md, README.md
```

## 3. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict (`npm run typecheck`) | ✅ 0 errors |
| Lint (`npm run lint`) | ✅ 0 errors, 0 warnings |
| App tests (`npm test`) | ✅ **110 / 110 passed** (6 suites; 38 new) |
| Database tests (`npm run test:db`) | ✅ **181 / 181 passed** (118 new) |
| Mutation check | removed the "opt-in" and "blocked" rules from search → tests failed as expected |
| iOS + Android bundles | ✅ both built |
| Visual check | plate input, plate badges, vehicle card, status labels, switches rendered and match the brand |

The database test runs the **complete user journey** as real API roles:

1. Alice adds a car and photos.
2. She claims `WI-FA 480`, gets a code, uploads 4 photos and submits.
3. Admin Dave approves, the photos are deleted, and the purge is recorded.
4. Alice opts in. Bob searches and finds the car without the owner. Alice turns
   on "show owner", and Bob now sees her username.
5. Carol, whom Alice blocked, finds nothing and can't load the photos.
6. Eve claims the same plate and gets it verified. Alice's claim is revoked as
   a transfer, and the plate stays hidden until Eve opts in.

It also checks: rejection with a reason and retry; admins can't approve their
own plate; non-admins can't use admin functions; nobody can set "verified"
themselves; the plate table can't be read at all; photo and evidence folders
are locked to their owners; the 4-photo, 10-car and claim/search limits work;
and the database itself blocks two verified owners for one plate.

**Not tested yet:**
- **On a real phone.** In particular, the camera and photo uploads need a
  real device.
- **Against a real Supabase project.** The tests use plain PostgreSQL with a
  stand-in for Supabase's `auth` and `storage`. One known difference: Supabase
  Storage checks upload permissions in its own service, and it hasn't been
  exercised here. The first real upload on your phone is that test.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | District codes are checked for **format only** (1–3 letters), not against the official list, so a non-existent district like "QQ" is accepted | Add the official KBA district list (~700 codes) in a small follow-up |
| 2 | Special plates (diplomatic, military, seasonal, exchangeable) are not supported | Later; very rare among target users |
| 3 | No notifications yet: rejected, approved or transferred owners see it only when they open the plate screen | Milestone 5 (notifications) |
| 4 | Follow and message buttons in search results are not built ("coming soon" note shown) | Milestones 3–4 |
| 5 | The plan's "show plate characters on profile" switch was **not** built. Plates are never shown publicly, only the "Verified PL8" badge | Ask me if you want it |
| 6 | Design change from the plan: plate search runs as a database function instead of an Edge Function. Simpler and testable; no extra deployment | No action |
| 7 | Testing the journey needs **two accounts**, and Supabase's test email only reaches members of your Supabase team | Invite your second email to the Supabase organization, or temporarily turn "Confirm email" off while testing |
| 8 | GitHub push still blocked (403) | Reconnect GitHub, then I push everything |
| Carried over | Apple/Google sign-in, in-app account deletion, legal texts, email provider | As planned (M5 / before beta) |

### Items needing qualified human review before public launch

- **GDPR/DPIA for plate search.** The design is opt-in, exact-match,
  rate-limited and logged as a hash, but plate-to-person lookup still needs a
  lawyer's assessment and a privacy-policy section.
- **Verification ≠ ownership.** The wording says so, but the Terms of Use
  should state it too.
- **Moderation process.** Who reviews, how fast, and how disputes are handled
  should be written down before strangers use the app.

## 5. Estimated ongoing costs

**Still €0.** Photos use Supabase's free 1 GB storage: at about 300 KB per
photo that's roughly 3,000 photos, enough for testing. No paid service was
activated. Before the beta: Supabase Pro (~€23/month, includes 100 GB), with
your approval.

## 6. How to try Milestone 2 on your phone

1. In Supabase, run the new migration (docs/SUPABASE-SETUP.md → "Milestone 2 update").
2. Make your account admin (same guide → "Make yourself the reviewer").
3. Start the app as before (`npx expo start`, scan the QR code).
4. Account A: Profile → **Add vehicle** → save → add photos → open the car →
   **Claim your plate** → **Verify now** → write the code on paper → take 2–4
   photos → **Send for review**.
5. Account B (admin): Settings → **Verification review** → open → **Approve**.
6. Account A: open the plate → switch on **Findable in PL8 Search**.
7. Account B: **PL8 Search** tab → enter the plate → the car appears.
