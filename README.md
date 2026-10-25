# PL8

*Every car has a story.* — *See it. Search it. Connect.*

PL8 is a premium automotive social network that links voluntarily claimed,
verified license plates to digital vehicle profiles.

| | |
|---|---|
| Status | **Milestone 2 — Vehicle identity** (awaiting founder approval) |
| App | React Native + Expo SDK 58 + TypeScript (strict), iOS & Android |
| Backend | Supabase (Postgres + Row Level Security, Auth, Storage), EU region |
| Plan | [docs/MILESTONE-0-PLAN.md](docs/MILESTONE-0-PLAN.md) |
| Latest report | [docs/MILESTONE-2-REPORT.md](docs/MILESTONE-2-REPORT.md) |

---

## Run PL8 on your phone

You need a computer (Mac, Windows or Linux) and your phone **on the same Wi-Fi**.

### One-time setup

1. **Install on your computer**
   - Node.js 22 LTS: <https://nodejs.org> (choose "LTS")
   - Git: <https://git-scm.com/downloads>
2. **Install on your phone**: the free **Expo Go** app
   ([App Store](https://apps.apple.com/app/expo-go/id982107779) ·
   [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)).
3. **Set up Supabase** by following [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md)
   (about 15 minutes, free).
4. **Download the project** in a terminal (macOS: *Terminal*, Windows: *PowerShell*):

   ```bash
   git clone https://github.com/Armanius1234/Armanius1234.git pl8
   cd pl8
   git checkout claude/pl8-planning-architecture-f3uplf
   npm ci
   ```

5. **Add your keys**: copy `.env.example` to a new file called `.env` and paste
   your Supabase Project URL and publishable key (see the Supabase guide, step 4).

### Every time you want to test

```bash
cd pl8
npx expo start
```

A QR code appears in the terminal.

- **iPhone**: open the normal Camera app, point it at the QR code, tap the banner.
- **Android**: open Expo Go → **Scan QR code**.

PL8 opens inside Expo Go. Code changes reload automatically.

**Not loading?** Phone and computer must be on the same Wi-Fi. If they are, or on
office/guest networks, run `npm run start:tunnel` instead (the first time it
asks to install a helper; answer **y**).

**"Backend not configured" screen?** The `.env` file is missing or empty.
Fill it in, stop the server (Ctrl+C) and run `npx expo start` again.

---

## For developers

```bash
npm run typecheck   # TypeScript (strict)
npm run lint        # ESLint (expo config)
npm test            # unit + component tests (Jest)
npm run test:db     # database security tests (needs PostgreSQL 15+ locally, or DATABASE_URL)
npm run test:all    # everything above
```

### Project structure

```
src/app/            Screens (Expo Router: every file is a route)
  (auth)/           Welcome, login, register, verify email, reset password
  onboarding.tsx    3-step profile creation
  (tabs)/           Home · Discover · PL8 Search · Messages · Profile
  settings/         Settings, privacy, blocked users, language, legal
  profile/edit.tsx  Edit profile
  user/[username]   Other members' profiles (garage, block)
  vehicle/          Add vehicle, vehicle profile, edit + photos, plate
  verification/     Plate verification (challenge code + live photos)
  admin/            Verification review queue (admins only)
src/features/       Feature logic (auth, profile, garage/plates/search, legal)
src/ui/             Design-system components
src/theme/          Design tokens (brand colours, spacing, type)
src/shared/         Validation + German plate rules shared with the database
src/i18n/           German + English texts
src/lib/            Supabase client, env, errors, secure session storage
supabase/migrations SQL: tables, Row Level Security, functions, storage
supabase/tests      Database security tests (run on plain PostgreSQL)
```

### Environment variables

| Variable | Where from | Secret? |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API | No (public) |
| `EXPO_PUBLIC_SUPABASE_KEY` | Supabase → Project Settings → API Keys → **publishable** | No (public) |

Everything prefixed `EXPO_PUBLIC_` is bundled into the app. Privileged keys
(service role / secret) must **never** be used in the app. Data is protected by
Row Level Security in the database.

### Database changes

Migrations live in `supabase/migrations/` and are applied in filename order.
Each new table must have RLS enabled, explicit grants, and tests in
`supabase/tests/`.
