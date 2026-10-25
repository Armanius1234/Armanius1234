# PL8 — Milestone 0: Architecture & Planning

> *Every car has a story.* — *See it. Search it. Connect.*

Status: **Draft for founder approval.** No application code has been written.
Implementation starts only after the founder writes `APPROVED — START MILESTONE 1`.

---

## 1. Understanding of PL8

PL8 is a social network where the **vehicle**, not only the person, is the
profile. Its main feature links a **voluntarily claimed and verified license
plate** to a digital vehicle profile. Someone who sees a car on the street can
type the plate into PL8 and, **only if the owner has opted in**, find the
vehicle, follow it, or ask to start a conversation.

What makes PL8 different from Instagram car pages:

| Instagram-style car page | PL8 |
|---|---|
| Found by handle or hashtag | Found by the **physical plate** you saw |
| Anyone can claim to own any car | **Verified** vehicle–owner link |
| Person-first | **Vehicle-first** (garage, builds, history) |

The core is also the main risk. A plate is **personal data** under EU law (it
can be linked to a person). A plate-to-person lookup could be used for
stalking, harassment or road-rage revenge. So privacy controls are not an add-on:
they are what makes PL8 trustworthy enough to exist. The design follows that:

- Plates are **private by default** and discoverable only after **verification
  + explicit opt-in**.
- Search is **exact match only**, rate-limited and logged. Plates cannot be listed
  or partially matched.
- Search reveals the **vehicle** first. The **person** is shown only as far as
  their own privacy settings allow.
- Contact goes through **message requests**, never direct contact details or location.

Launch market: Germany (Rhein-Main), car-enthusiast communities. Built so other
countries and languages can be added later.

---

## 2. Recommended architecture

### 2.1 Overview

```
┌──────────────────────────────┐
│  PL8 mobile app (iOS/Android)│  React Native + Expo + TypeScript (strict)
│  Expo Router · TanStack Query│  only the public "anon" key is in the app
└──────────────┬───────────────┘
               │ HTTPS (user JWT)
┌──────────────▼──────────────────────────────────────────────┐
│ Supabase project — EU region (Frankfurt, eu-central-1)      │
│                                                             │
│  Auth ── email/password, Apple, Google                      │
│  PostgREST ── normal reads/writes, guarded by RLS           │
│  Postgres RPC ── SECURITY DEFINER functions for sensitive   │
│                  writes (claim plate, accept request, …)    │
│  Edge Functions (Deno) ── plate search, admin verification, │
│                  account deletion, push sending             │
│  Storage ── public-read media buckets + PRIVATE evidence    │
│  Realtime ── new messages / notifications (RLS-checked)     │
└─────────────────────────────────────────────────────────────┘
               │
  Expo Push Service (free) → APNs / FCM
```

### 2.2 Key decisions and why

| Decision | Choice | Reason |
|---|---|---|
| App framework | **Expo (managed workflow), latest stable SDK** | One TypeScript codebase for iOS + Android, over-the-air updates, cloud builds without owning a Mac, works on Replit. |
| Navigation | **Expo Router** (file-based) | Deep links built in (needed later for PL8 Tap QR/NFC: `pl8.app/v/<id>`). |
| Server state | **TanStack Query** | Caching, pagination, retries and loading/error states for little code. |
| Local state | React context + small **Zustand** store only where needed | Keeps dependencies few. |
| Validation | **Zod** schemas, also used by the server | The same rules on client and server. |
| Forms | **react-hook-form** + Zod | Less re-rendering, clean validation. |
| Images | **expo-image** (caching) + **expo-image-manipulator** (resize/compress before upload) | Supabase image resizing is a paid feature, so we compress on the device. |
| Backend | **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) | One vendor, generous free tier, standard Postgres, so we can leave later. |
| Sensitive logic | **Postgres functions + Edge Functions** | Users can never set verification, plate status, or other users' data directly. |
| Region | **Frankfurt (EU)** | GDPR: data stays in the EU. |
| Admin tooling (MVP) | **Hidden admin section inside the app**, only for accounts with the `admin` role (checked on the server) | No separate web app to build or host. |
| Push | **Expo Push Service** | Free; no Firebase setup beyond what Android requires. |
| Email | **Custom SMTP: Resend free tier** (3,000 emails/month) | Supabase's built-in email is for testing only and is heavily rate-limited. |
| Error tracking | **Sentry free tier** (optional, needs approval) | Crash reports during beta. |
| Tests | Jest + React Native Testing Library (app); **pgTAP** (database & RLS); Deno test (Edge Functions) | Security rules get automated tests, not just manual checks. |
| CI | **GitHub Actions** (free for this usage) | Type-check, lint and tests on every push. |
| i18n | **i18next**: German + English from day one | Text is never hard-coded, so adding countries later is cheap. |

### 2.3 Portability

All database changes are **SQL migration files in Git** (`supabase/migrations`).
The whole backend can be rebuilt on any Postgres + S3 setup or self-hosted
Supabase. Nothing is configured only by clicking around in a dashboard.

---

## 3. Database design

PostgreSQL in the `public` schema for app tables, plus a `private` schema that
the app API **cannot reach at all** (raw plates, search logs, rate limits, admin data).

Conventions: `uuid` primary keys (`gen_random_uuid()`), `created_at` /
`updated_at timestamptz`, enums for statuses, `ON DELETE CASCADE` for content
owned by a user, `ON DELETE SET NULL` where history must be kept (reports,
admin actions).

### 3.1 Identity & privacy

**profiles** — one row per auth user
| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id`, `ON DELETE CASCADE` |
| username | citext UNIQUE | 3–30 chars, `[a-z0-9._]`, reserved-word list |
| display_name | text | ≤ 50 |
| bio | text | ≤ 300 |
| avatar_path | text | Storage path |
| instagram_url / tiktok_url / linkedin_url / facebook_url | text | must match each platform's domain |
| is_private | bool default false | private = follow requests needed |
| messaging_policy | enum `everyone` / `followers` / `nobody` default `followers` | |
| city | text null | optional, user-typed (e.g. "Wiesbaden"); never derived from GPS |
| locale | text default `de` | |
| country_code | char(2) default `DE` | |
| deleted_at | timestamptz | set while deletion is being processed |
| follower_count / following_count | int | kept up to date by triggers |

**user_roles** — `(user_id PK → profiles, role enum 'admin'|'moderator')`.
Not writable by clients. Also copied into the JWT `app_metadata` for fast checks.

**blocks** — `(blocker_id, blocked_id)` PK, both → profiles CASCADE. Check
`blocker_id <> blocked_id`. Index on `blocked_id`.
A helper function `is_blocked_either_way(a, b)` is used by every visibility rule.

### 3.2 Vehicles & plates

**vehicles**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid → profiles CASCADE | indexed |
| make, model, generation | text | make/model come from a reference list, with free text allowed |
| model_year | smallint | 1886 … current+1 |
| color | text | |
| horsepower | smallint null | 1–2000 |
| modifications | text | (structured `vehicle_mods` table later for PL8 Builds) |
| description | text | ≤ 1000 |
| cover_image_id | uuid null → vehicle_images | |
| visibility | enum `public` / `followers` / `private` | |
| is_restricted | bool | set by moderators only |
| position | smallint | garage order |

**vehicle_images** — `id, vehicle_id → vehicles CASCADE, storage_path, width,
height, position`. Index `(vehicle_id, position)`.

**plates** (`private` schema — never readable from the app)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) | `DE` |
| jurisdiction | text default '' | empty for DE (the district code is part of the plate); a US state, for example |
| normalized | text | canonical form, e.g. `F-AB-123E` |
| lookup_hash | bytea | HMAC-SHA256(secret pepper, country‖jurisdiction‖normalized) |
| | | **UNIQUE (country_code, jurisdiction, normalized)** |

**plate_claims** (`private` schema; owners read their own through an RPC)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| plate_id | → plates | |
| vehicle_id | → vehicles CASCADE | |
| user_id | → profiles CASCADE | |
| status | enum `not_verified` / `pending` / `verified` / `rejected` / `revoked` | |
| discoverable | bool default **false** | owner opt-in; only takes effect when `verified` |
| show_on_profile | bool default **false** | separate opt-in to display the plate characters on the vehicle profile |
| verified_at, revoked_at | timestamptz | |
| revoke_reason | enum `transfer` / `owner_removed` / `dispute` / `admin` / `account_deleted` | |

Key constraints:
- **Partial unique index**: `UNIQUE (plate_id) WHERE status = 'verified'`, so a plate
  can have only one active verified claim.
- **Partial unique index**: `UNIQUE (vehicle_id) WHERE status IN ('pending','verified')`,
  so a vehicle can have only one live plate.
- Clients can never change `status` (no RLS write policy). Only the RPCs
  `claim_plate`, `set_plate_discoverable` and `release_plate`, and the admin Edge
  Function, can change it.

**Plate changes and transfers**: a car gets a new plate, so the old claim is
`revoked (owner_removed)` and a new claim starts. A car is sold, so the new owner
claims the same plate and it goes to `pending`. When an admin verifies the new
claim, the old one becomes `revoked (transfer)` automatically, and the old owner
is notified. **Disputes**: a `reports` row of type `plate_dispute` freezes
discoverability on the claim until an admin decides.

**verification_requests**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| claim_id | → plate_claims CASCADE | |
| user_id | → profiles CASCADE | |
| challenge_code | text | random 6-character code the user must show in the photo/video |
| status | enum `submitted` / `in_review` / `approved` / `rejected` | |
| reviewer_id | → profiles SET NULL | |
| decision_note | text | shown to user on rejection |
| evidence_purge_after | timestamptz | decision + 30 days |

**verification_evidence** — `id, request_id → verification_requests CASCADE,
storage_path, kind enum photo|video|document`. Files live in the **private
`evidence` bucket**. Only the uploader (write once) and admins (5-minute signed
URLs) can access them. A scheduled job deletes them after `evidence_purge_after`.

### 3.3 Social graph

**follows** — `(follower_id, followee_id)` PK, both → profiles CASCADE, check not
self, index on `followee_id`, `created_at`.

**follow_requests** — `(requester_id, target_id)` PK, `status pending`.
Accepting is an RPC that inserts into `follows` and deletes the request in one
transaction.

(Following a **vehicle** is following its owner's profile with that vehicle
highlighted. We keep one follow graph to keep it simple. We can add
`vehicle_follows` later if users want it.)

### 3.4 Posts

**posts** — `id, author_id → profiles CASCADE, vehicle_id → vehicles SET NULL,
caption ≤ 2200, like_count, comment_count, created_at, is_removed (moderation)`.
Index `(author_id, created_at desc)`.

**post_media** — `id, post_id CASCADE, storage_path, width, height, position`
(max 10). Its `media_type` column already allows `video` for Reels later.

**likes** — `(user_id, post_id)` PK. **saved_posts** — `(user_id, post_id)` PK.
**comments** — `id, post_id CASCADE, author_id CASCADE, body ≤ 1000,
parent_id null (replies later), created_at`. Index `(post_id, created_at)`.

**Feed**: a `get_home_feed(cursor)` function returns posts from followed accounts
plus your own, newest first, filtered for blocks and private profiles.
It uses keyset pagination (`created_at, id`), not offsets.

### 3.5 Messaging

**conversations** — `id, kind enum direct (group later), status enum
request|active, created_by, last_message_at`.
**conversation_participants** — `(conversation_id, user_id)` PK, `last_read_at`,
`muted`, `archived`, `role` (for future groups).
**messages** — `id, conversation_id CASCADE, sender_id SET NULL, body ≤ 2000,
created_at, deleted_at`. Index `(conversation_id, created_at desc)`.

**Message requests** are conversations with `status = 'request'`. The sender can
send **one** message until the recipient accepts. The recipient sees it under a
"Requests" tab. The RPC `start_conversation(target)` checks blocks and the target's
`messaging_policy` before creating it. **Unread count** = messages newer than
`last_read_at`.

### 3.6 Notifications, safety, admin

**notifications** — `id, recipient_id CASCADE, actor_id SET NULL, type enum
(follow, follow_request, like, comment, message, verification_update, …),
entity_type, entity_id, read_at, created_at`. Created by database triggers,
never by clients. Index `(recipient_id, created_at desc)`.

**push_tokens** — `user_id, expo_token UNIQUE, platform, updated_at`.

**reports** — `id, reporter_id SET NULL, target_type enum
(profile, vehicle, post, comment, message, plate_dispute), target_id, reason enum,
details, status enum open|actioned|dismissed, handled_by, handled_at`.

**admin_actions** (append-only audit log) — `id, admin_id SET NULL, action,
target_type, target_id, reason, metadata jsonb, created_at`. No updates or
deletes are allowed, even for admins.

**private.search_log** — `user_id, lookup_hash, found bool, created_at`. Kept
**30 days**, used for abuse detection and rate limits.
**private.rate_limits** — `key, window_start, count`.

### 3.7 Row Level Security (summary)

RLS is **enabled on every table**. The default is "deny".

| Table | Read | Write |
|---|---|---|
| profiles | anyone signed in, except blocked pairs; private profiles show only basic info to non-followers | own row only; protected columns (counts, roles) are not writable |
| vehicles / vehicle_images | according to `visibility` + follow status + blocks + `is_restricted` | owner only |
| plates / plate_claims | **no direct access**: owner reads own claims via RPC | RPCs only |
| verification_* | owner reads own; admins read all | owner creates (via RPC); admins decide (Edge Function) |
| follows | visible if the profile is visible | insert own (public targets only); delete own |
| follow_requests | requester or target | requester creates; target accepts/declines (RPC) |
| posts / post_media / comments / likes | author visible + not blocked | author only; likes/saves own row |
| conversations / participants / messages | **participants only** | via RPCs; send only when allowed |
| notifications | recipient only | triggers only; recipient may mark as read |
| blocks | blocker only | blocker only |
| reports | reporter (own), moderators | any signed-in user creates |
| admin_actions | admins | Edge Functions only |

Every policy gets a **pgTAP test** that shows both allowed and denied access.

---

## 4. Security & privacy approach

### 4.1 PL8 Search: how it stays safe

1. **Signed-in, email-verified users only.**
2. Input is **normalized on the server** (see 4.2). Clients cannot send raw SQL
   or wildcards. **Exact match only**: no prefix, fuzzy or partial search.
3. Lookup by `lookup_hash` (HMAC with a secret kept only in the Edge Function).
   Leaked database data does not easily show which plates are registered.
4. A result is returned only if **all** are true: a claim is `verified`;
   `discoverable = true`; the vehicle is not restricted or private; neither user
   has blocked the other; the owner's account is active.
5. **The same "No PL8 found" answer** whether the plate does not exist, exists but
   is hidden, or is blocked. Nobody can learn "this plate is registered but private".
6. **Rate limits** (adjustable): 10 searches / 10 min, 30 / day per user; new
   accounts (< 24 h) get 5 / day. Too many "not found" results in a row causes a
   cool-down. All limits are enforced on the server.
7. Response contains **only**: vehicle id, make, model, generation, cover photo,
   and the owner's public username/avatar **if their profile setting allows it**.
   The plate itself, verification evidence, location and contact details are never returned.
8. Searches are logged for 30 days so abuse can be investigated.

### 4.2 German plate normalization

German plates look like `F-AB 1234E`: **district code** (1–3 letters, including
Ä/Ö/Ü, e.g. `MÜ`, `LÖ`), **1–2 letters**, **1–4 digits**, optional **E**
(electric) or **H** (historic). Total max 8 characters.

**Spaces and hyphens matter.** `FAB123` could be `F-AB 123` or `FA-B 123`, two
different cars. So:
- The search and claim screens use a **plate-shaped input** with separate
  fields: district | letters | digits | suffix.
- Canonical form: `F-AB-123`, uppercase, umlauts kept, leading zeros not allowed.
- We validate against the official list of German district codes (public data)
  and support special formats (seasonal plates, `Y` military, `0` diplomatic)
  as "not claimable" in the MVP.
- The code is written as `normalizePlate(country, input)` with one module per
  country, so other countries are added later without changing the database.
- It will be covered by many unit tests (valid, invalid and confusing inputs).

### 4.3 Verification (manual MVP)

1. User claims a plate. The claim becomes `not_verified`.
2. User opens Verification and gets a **one-time challenge code** (e.g. `PL8-7K3Q`).
3. User uploads **2–4 photos**: the car with the plate visible, plus a handwritten
   code next to the plate (proves **current access**, not ownership).
   An optional extra is a **heavily redacted** photo of the registration
   certificate (Zulassungsbescheinigung Teil I) showing only plate + holder name.
   Whether we should accept this at all is a question for a lawyer (see §9).
4. Status becomes `pending`. An admin reviews it in the in-app admin queue and
   approves or rejects with a reason. Every decision is written to `admin_actions`.
5. Evidence files are **deleted automatically 30 days after the decision**.
6. Admins can **revoke** a verification at any time (for example after a dispute).

The wording in the app will say "verified access to this vehicle", **not**
"legal owner".

### 4.4 General security

- Only the **anon key** ships in the app. The service-role key exists only in Edge
  Function secrets. It is never in Git or the app (checked in CI).
- `.env.example` documents every variable. Real `.env` files are in `.gitignore`.
- Uploads: allowed file types + size limits per bucket. Paths are tied to the user
  (`{user_id}/…`) and enforced by Storage RLS. EXIF/GPS metadata is
  **stripped on device** before upload. This matters because car photos taken at
  home would otherwise reveal the home address.
- All text inputs are length-limited with Zod on the client **and** checked by
  database constraints.
- Auth: email confirmation required, secure session storage
  (`expo-secure-store`), password reset by email link, Apple/Google OAuth through Supabase.
- **No live location** anywhere. Posts do not get automatic location tags.
- Messages are protected by RLS (participants only). End-to-end encryption is
  out of scope for MVP. We will say this clearly in the privacy policy.

### 4.5 GDPR / EU compliance by design

| Requirement | How |
|---|---|
| Data in EU | Supabase Frankfurt; Resend EU region; Expo push contains no personal content |
| Legal basis for plate discoverability | Separate **explicit opt-in** (consent), can be switched off any time and takes effect immediately |
| Data minimization | No phone numbers, no real names required, no VIN, no address |
| Right to erasure | In-app **Delete account**: account hidden immediately, data deleted by an Edge Function within 30 days (claims revoked, media removed, messages anonymized for the other person) |
| Right of access | "Download my data" (JSON export) in Milestone 5 |
| Retention | Evidence 30 days after decision; search logs 30 days; deleted accounts purged in ≤ 30 days |
| Minimum age | **16** proposed (German age of digital consent), shown at sign-up. Needs founder decision. |
| Required legal pages | Impressum, privacy policy (Datenschutzerklärung), terms, community guidelines |
| Processors | Data processing agreements (AVV/DPA) with Supabase, Resend, Expo (and Sentry if used) |
| DPIA | A Data Protection Impact Assessment is **strongly advised** for plate search. It must be reviewed by a qualified person before public launch |
| Digital Services Act | Report button on all content, reasons given for moderation decisions, contact point |

---

## 5. Screen map

```
(auth) — shown when signed out
├── Welcome                 logo, slogans, "Get started" / "Log in"
├── Login                   email + password, Apple, Google, "Forgot password"
├── Register                email, password, age confirmation, terms consent
├── Forgot password / Reset password
└── Verify email

(onboarding) — first sign-in only
├── Choose username & display name
├── Profile photo & bio (skippable)
├── Add your first car (skippable → Add Vehicle)
└── Privacy choices (private profile? messaging policy)

(tabs)
├── HOME          feed · pull-to-refresh · bell icon → Notifications · "+" → Create Post
├── DISCOVER      featured vehicles · creators · by make (BMW M, AMG, RS, Porsche, JDM)
├── PL8 SEARCH    plate-shaped input · result card · empty/limit states
├── MESSAGES      Chats | Requests tabs · unread badges
└── PROFILE       header, stats, Posts | Garage tabs · ⚙ Settings

Stack screens
├── Vehicle Profile         photos, specs, mods, owner, posts with this car, "Verified" badge
├── Add / Edit Vehicle      multi-step: make/model → details → photos
├── Claim Plate             plate input → discoverability explanation → confirm
├── Verification            challenge code → upload evidence → status timeline
├── User Profile (others)   follow / requested / following · message · ⋯ block/report
├── Followers / Following
├── Edit Profile
├── Create Post             pick photos → choose vehicle → caption
├── Post Detail
├── Comments
├── Conversation            realtime chat · accept/decline if request
├── Notifications
├── Follow Requests
├── Settings
│   ├── Account (email, password, sign-in methods, delete account)
│   ├── Privacy (private profile, messaging policy, plate discoverability per car)
│   ├── Blocked Users
│   ├── My Reports
│   ├── Notifications preferences
│   ├── Language
│   └── Legal (Impressum, privacy policy, terms)
├── Report (sheet)          reason picker → details → submit
└── Admin (role-gated)      Verification queue · Review request · Reports queue · Audit log
```

Every screen gets: loading skeleton, empty state, error state with retry,
and offline notice.

---

## 6. Design system

Reference: [`docs/design/brand-concepts-reference.png`](design/brand-concepts-reference.png).
It shows three concepts (PL8, CLMD, DRV). **Only concept 1, PL8, is used.**
CLMD and DRV are ignored unless you say otherwise.

What we take from the PL8 concept:

- **Logo**: heavy, wide geometric sans-serif. "PL" is white and "8" is electric
  blue, inside a rounded-rectangle plate frame whose border fades from white to
  blue, with a soft blue glow. It will be rebuilt as a clean **SVG** so it stays
  sharp everywhere.
- **App icon**: the dark variant (black tile, white PL, blue 8) is the default. The
  white and blue variants are kept for marketing and alternate icons.
- **Welcome screen**: logo centered on near-black, tagline in wide-tracked small
  caps, a full-width **blue primary button** ("Registrieren") above a dark
  secondary button ("Anmelden").
- **Profile/vehicle screen**: large car hero photo at the top. Below it, an
  **EU-style plate badge** (blue EU strip with "D", black-on-white characters,
  e.g. `WI·FA 480`) with a blue verified tick. Then name, car (e.g. "BMW M2 G87"),
  city; counts for Follower / Following / Posts; a blue **Folgen** button next to a
  dark **Nachricht** button; social icons; photo grid.
- **German UI copy** first (Registrieren, Anmelden, Folgen, Nachricht).

Two things in the mockup that affect privacy (see Question 13):
1. **The plate is shown on the profile.** If every opted-in profile shows its
   plate, someone could scroll through profiles and collect a full
   plate → person list, which the exact-match search is designed to prevent.
   Plan: a **separate** owner switch, "Show plate on my vehicle profile"
   (default **off**). When off, the badge shows "Verified PL8" without the characters.
2. **City under the name** (e.g. Wiesbaden). We add an optional, free-text
   `city` field on the profile, never an automatic location, and it is hidden by default.

### 6.1 Color tokens

| Token | Value | Use |
|---|---|---|
| `bg.primary` | `#080B12` | screen background |
| `bg.secondary` | `#121722` | cards, inputs, tab bar |
| `bg.elevated` | `#1A2030` *(derived)* | sheets, modals, pressed state |
| `accent` | `#087CFF` | primary buttons, active tab, the "8", links |
| `accent.pressed` | `#0066D6` *(derived)* | |
| `accent.subtle` | `#087CFF1F` *(12% alpha)* | selected chips, focus glow |
| `text.primary` | `#FFFFFF` | |
| `text.secondary` | `#9CA3AF` | captions, metadata |
| `text.disabled` | `#5B6270` *(derived)* | |
| `border` | `#252B36` | dividers, card outlines |
| `success` | `#22C55E` | Verified badge |
| `warning` | `#F59E0B` | Pending |
| `danger` | `#EF4444` | errors, destructive actions |

The app is **dark mode only** at launch. That matches the brand and halves UI testing.

### 6.2 Typography

- **Inter** (free, open-source) for all UI text. Weights 400 / 500 / 600 / 700.
- Scale: Display 32 · Title 24 · Heading 20 · Body 16 · Callout 14 · Caption 12.
- **Plate display font**: a condensed, wide-tracked font (e.g. *Barlow Semi
  Condensed*, free) for the plate component. The official German plate font
  (FE-Schrift) has unclear licensing, so we avoid it unless we can license it.

### 6.3 Shape, spacing, motion

- Spacing: 4-point scale (4, 8, 12, 16, 24, 32, 48). Screen gutter 16.
- Radius: 8 (chips, small), 12 (inputs, buttons), 16 (cards), 24 (sheets), full (avatars).
- Motion: 150–250 ms ease-out. Use React Native Reanimated (bundled with Expo) only
  where it adds clear value (tab transitions, like animation, sheet).
- Haptics on like, follow and successful search (expo-haptics).
- Minimum touch target 44×44. WCAG AA contrast (`#9CA3AF` on `#080B12` passes).

### 6.4 Core components

`Logo` (PL white + 8 blue in a thin rounded plate frame) · `PlateInput` ·
`PlateBadge` · `Button` (primary/secondary/ghost/destructive) · `TextField` ·
`Avatar` · `VehicleCard` · `PostCard` · `VerifiedBadge` · `StatusPill` ·
`Skeleton` · `EmptyState` · `ErrorState` · `Sheet` · `TabBar` · `Toast`.

All in `src/ui/`, using tokens from one `theme.ts` file. The brand is changed
in one place and only with your approval.

---

## 7. Project structure

```
/
├── app/                      Expo Router screens (routes only, thin)
│   ├── (auth)/  (onboarding)/  (tabs)/  vehicle/  post/  chat/  settings/  admin/
│   └── _layout.tsx
├── src/
│   ├── ui/                   design-system components + theme.ts
│   ├── features/             one folder per feature: auth, profile, garage,
│   │                         plates, search, feed, messaging, notifications,
│   │                         moderation — each with api.ts, hooks.ts, components/, schemas.ts
│   ├── lib/                  supabase client, query client, i18n, image utils
│   ├── shared/               plate normalization + Zod schemas used by app AND server
│   └── i18n/                 de.json, en.json
├── supabase/
│   ├── migrations/           SQL (tables, RLS, functions, triggers)
│   ├── functions/            Edge Functions: plate-search, admin-verify,
│   │                         delete-account, send-push, purge-jobs
│   ├── tests/                pgTAP RLS & function tests
│   └── seed.sql              local development data only
├── docs/                     this plan, ADRs, privacy notes
├── .github/workflows/ci.yml
├── .env.example
└── README.md                 setup steps for a non-technical founder
```

---

## 8. Milestone plan

Each milestone ends with: tests run (with the actual results reported), a short
demo guide, and a stop for your approval.

| # | Scope | Main deliverables | Done when |
|---|---|---|---|
| **0** | Planning | This document | You approve |
| **1** | Foundation | Expo project, CI, theme + core components, tab navigation, sign-up/login/reset/Apple/Google, onboarding, profiles + edit, privacy settings, base migrations + RLS for profiles/roles/blocks, legal page placeholders | Real sign-up works on iOS + Android test devices; RLS tests pass |
| **2** | Vehicle identity | Garage, Add/Edit Vehicle, Vehicle Profile, photo upload (EXIF stripped), plate normalization (DE), Claim Plate, verification upload + admin queue, transfer/duplicate rules, PL8 Search Edge Function with rate limits | Full journey: register car → claim → verify (admin) → opt in → second user finds it; abuse tests (enumeration, hidden plate, blocked user) pass |
| **3** | Social | Follow / requests, posts with media, feed with pagination, likes, comments, saves, Discover v1 | Feed respects private profiles + blocks (tested) |
| **4** | Messaging | Conversations, message requests, realtime, unread counts, messaging policy, blocking integration | Non-participants cannot read messages (tested); request rules tested |
| **5** | Beta readiness | Notifications + push, reports + moderation queue, account deletion + data export, retention jobs, error tracking, performance pass, TestFlight + Play internal testing | Closed beta with ~50–200 Rhein-Main users |

Future features (Clubs, Meets, Drives, Builds, Shop My Build, Tap, PRO, Business,
Marketplace, Stories, Reels, Car Battles) are **not built**. The schema is shaped
so they fit later: `vehicles` can get `vehicle_mods`; `conversations.kind` allows
groups; `post_media.media_type` allows video; Expo Router deep links serve PL8 Tap;
`profiles` can later get an `account_type` for Business.

---

## 9. Estimated costs

### 9.1 Infrastructure & accounts (first 12 months)

| Item | Cost | When |
|---|---|---|
| Supabase **Free** | €0 | Milestones 1–4 (note: free projects pause after 7 days of no activity; no backups) |
| Supabase **Pro** | ~$25/month (~€23) | **Needed from beta** (daily backups, no pausing). ~6 months ≈ €140 |
| Apple Developer Program | €99 / year | Before TestFlight (Milestone 5; earlier for Apple Sign-In testing) |
| Google Play Console | $25 one-time (~€23) | Before Android beta |
| Expo / EAS Build | €0 (free tier: limited monthly builds, fine for MVP) | Throughout |
| Domain (e.g. pl8.app / pl8app.de) | €15–60 / year | Milestone 1 (needed for email + legal pages) |
| Resend email | €0 (free tier) | Milestone 1 |
| Sentry | €0 (free tier) | Milestone 5 (optional) |
| GitHub + Actions | €0 | Throughout |
| **Subtotal** | **≈ €300–400 in year 1** | |

### 9.2 Non-technical costs you should budget for

| Item | Rough cost |
|---|---|
| Legal review: privacy policy, terms, DPIA for plate search, Impressum | €500–1,500 (strongly recommended before public launch) |
| Company setup (UG) if not done yet | €300–800 |
| Trademark check / registration "PL8" (DPMA, 3 classes) | ~€290 (check availability first; "PL8" may already be taken) |
| AI-assisted development usage | depends on your plan; keep sessions focused, one milestone at a time |

**Recurring costs I will ask you to approve before turning them on:**
Supabase Pro, Apple Developer, domain, and any paid service tier.

---

## 10. Technical & business risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Plate lookup used for stalking/harassment** | Severe, legal + reputational | Opt-in only, verification, exact match, rate limits, no location, message requests, blocking, fast reports. Needs legal/DPIA review |
| **False claims** (claiming someone else's plate) | Wrong person contacted | No discoverability before verification; dispute flow; revocation |
| **Verification evidence is sensitive** (documents show name/address) | GDPR breach risk | Prefer photo + challenge code; private bucket; 30-day deletion; lawyer to decide on documents |
| **Manual verification doesn't scale** | Backlog, slow growth | Fine for beta (hundreds). Later: better challenge flows or paid ID check (only with approval) |
| **German plate ambiguity** (`FAB123`) | Wrong matches | Structured plate input + official district list |
| **App Store review** | Rejection delays | Apple requires: account deletion in-app ✔, Sign in with Apple when Google is offered ✔, report/block/moderation for user content ✔, published privacy policy + EULA |
| **Supabase free tier pauses / no backups** | Data loss in beta | Move to Pro before real users |
| **Cost growth from images** | Storage/bandwidth bills | Compress on device (~300 KB per photo), cache with expo-image, size limits |
| **Single admin = bottleneck & single point of trust** | Slow verification; insider risk | Audit log of every admin action; add a second moderator before launch |
| **Scope creep** (future features) | Budget gone before MVP | Strict milestones; "later" list |
| **Trademark conflict on "PL8"** | Forced rebrand | Check DPMA/EUIPO before spending on branding |
| **Founder is non-technical** | Hard to judge quality | CI checks, written test results, README with setup steps, short decision records |

---

## 11. Questions to answer before Milestone 1

1. **Design reference**: I'm using concept 1 (PL8) from the reference image and
   ignoring CLMD and DRV. Is that right? Should I match its screens closely?
2. **Minimum age**: 16 (recommended) or 18?
3. **Verification evidence**: Is photo + handwritten challenge code enough for the
   beta, or do you want (redacted) registration documents too? *(Recommend: photos
   only until a lawyer has reviewed this.)*
4. **Search result**: should it show the **owner's profile** by default, or only
   the **vehicle** until the owner allows more? *(Recommend: vehicle + username,
   with an owner setting to hide the username.)*
5. **Default messaging**: who can send message requests by default:
   everyone, or followers only? *(Recommend: everyone can send one request;
   owner can restrict.)*
6. **Languages**: German + English at launch?
7. **Legal entity**: Is there a company (UG/GmbH) yet? Who is listed in the
   Impressum and as data controller?
8. **Accounts**: Will you create the Supabase, Apple Developer, Google Play and
   Expo accounts yourself (recommended, so you own them)? I'll give step-by-step instructions.
9. **Domain**: Do you own a domain for PL8 (needed for emails and legal pages)?
10. **Where you'll run it**: Replit, or a local computer? Do you have an iPhone
    and/or Android phone for testing?
11. **Admins**: Who besides you will review verifications and reports in beta?
12. **Discover tab**: for the MVP, is a simple "latest vehicles + browse by make"
    page enough? *(Recommend yes. Algorithmic ranking later.)*
13. **Plate on profile**: the mockup shows the plate on the profile. Are you OK with
    a separate owner switch for this, off by default? *(Recommend yes. See §6.)*
14. **Tagline**: the mockup uses "Turn your plate into a story." The written spec uses
    "Every car has a story." / "See it. Search it. Connect." Which one goes on the
    Welcome screen?
