# Milestone 1 — Foundation: report

Status: **complete, awaiting founder approval.** Milestone 2 has not been started.

## Founder decisions applied

| Decision | Where it shows |
|---|---|
| PL8 brand only (Concept 1) | Logo, icon, colours, Welcome screen |
| Minimum age 18 | Sign-up checkbox, **enforced by the database** (sign-up rejected without it) |
| Tagline "Every car has a story." | Welcome screen |
| No company/domain assumed | Legal page is a marked draft; no bundle ID, no paid email |
| Claude Code + Expo + Supabase + GitHub | Project setup, CI |
| Plate discovery opt-in only | Stated in the privacy screens; plates come in Milestone 2 |

## 1. Features completed

- **Project setup**: Expo SDK 58, React Native 0.88, TypeScript strict, Expo Router,
  ESLint, Jest, GitHub Actions CI (type check, lint, unit tests, database security
  tests, secret-key scan).
- **Design system**: brand tokens (#080B12 / #121722 / #087CFF / #FFFFFF / #9CA3AF /
  #252B36), Inter + Orbitron typography, PL8 logo (SVG plate frame with white→blue
  gradient), app icon and splash. Components: Button, TextField, Checkbox, Avatar,
  list rows, switch rows, choice groups, loading / error / empty states, skeletons,
  form messages.
- **Navigation**: Welcome/auth stack → 3-step onboarding → 5 tabs (Home, Discover,
  PL8 Search, Messages, Profile) + Settings stack. Routes are protected: signed-out
  users can only see auth screens, and users without a profile only see onboarding.
- **Email authentication**: register (email, password ≥10 with letters + digits,
  18+ confirmation, terms consent), 6-digit email confirmation code with resend,
  login, forgot password (code + new password), logout. Sessions are stored in the
  iOS Keychain / Android Keystore.
- **Onboarding**: username with live availability check, display name, photo, bio,
  city (optional, typed in, never GPS), private account, messaging preference.
- **Profiles**: own profile tab, edit profile (username, name, bio, city, photo,
  Instagram / TikTok / LinkedIn / Facebook links, which accept a pasted link or a
  handle), other members' profiles at `pl8://user/<username>` with **Block**.
- **Privacy settings**: private account, who may send message requests (stored now,
  enforced in Milestone 4), blocked users list with unblock, language (DE/EN).
- **Database foundation**: `profiles`, `user_settings`, `blocks`, private consent
  records, `avatars` storage bucket, all with Row Level Security.
- **German + English** throughout, with automated checks that both languages match.
- **Home, Discover, PL8 Search, Messages** tabs show clearly labelled
  "Milestone 2/3/4" placeholders. No fake data is shown.

## 2. Files created or modified

```
app.json, package.json, package-lock.json, tsconfig.json, eslint.config.js,
jest.setup.js, .gitignore, .env.example, AGENTS.md, README.md
.github/workflows/ci.yml
assets/images/{icon,splash-icon,android-icon-foreground,android-icon-monochrome}.png
docs/MILESTONE-1-REPORT.md, docs/SUPABASE-SETUP.md, docs/MILESTONE-0-PLAN.md (decisions)
scripts/test-db.sh
supabase/migrations/20261025120000_foundation.sql
supabase/tests/_shim.sql, supabase/tests/01_foundation.test.sql
src/app/_layout.tsx, src/app/+not-found.tsx, src/app/onboarding.tsx
src/app/(auth)/{_layout,welcome,login,register,verify-email,forgot-password,legal}.tsx
src/app/(tabs)/{_layout,index,discover,search,messages,profile}.tsx
src/app/settings/{_layout,index,privacy,blocked,language,legal}.tsx
src/app/profile/edit.tsx, src/app/user/[username].tsx
src/features/auth/AuthProvider.tsx
src/features/profile/{api.ts,avatar.ts,components.tsx,ProfileHeader.tsx,useUsernameCheck.ts}
src/features/legal/LegalContent.tsx, src/features/placeholder/ComingSoon.tsx
src/ui/{AppText,Avatar,Button,Checkbox,Logo,Rows,Screen,StateViews,TextField}.tsx, src/ui/index.ts
src/theme/tokens.ts, src/shared/{validation,legal}.ts
src/i18n/{en,de}.ts, src/i18n/index.tsx
src/lib/{supabase,env,errors,secureStorage,database.types}.ts
src/__tests__/{validation,lib,i18n}.test.ts, src/__tests__/screens.test.tsx
```

## 3. Tests performed and results (actually executed)

| Check | Command | Result |
|---|---|---|
| TypeScript (strict) | `npm run typecheck` | ✅ 0 errors |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Unit + component tests | `npm test` | ✅ **72 / 72 passed** (4 suites) |
| Database security tests | `npm run test:db` | ✅ **63 / 63 passed** |
| Mutation check | weakened one RLS policy on purpose | ✅ tests failed as expected, then restored |
| iOS + Android bundle | `expo export --platform ios --platform android` | ✅ both bundles built |
| Visual check | web render of Welcome, Login, Register (with errors), Reset, profile/onboarding components | ✅ matches brand; one logo clipping bug found and fixed |

The database tests cover: sign-up rejected without 18+ / consent; anonymous users
can read nothing; users can only create and edit their own profile and settings;
protected columns are not writable; username, bio, link and avatar-path rules;
consent records are unreadable; avatar uploads only into the user's own folder;
blocking hides profiles in both directions, block rows are invisible to the blocked
user, nobody can block on someone else's behalf; deleting an account removes
profile, settings and consent.

**Not yet tested:**
- **On a real phone.** There is no simulator here. The first run in Expo Go on
  your phone is the real device test.
- **Against a real Supabase project.** The database tests run on plain PostgreSQL
  with a small stand-in for Supabase's `auth` and `storage` parts. The migration
  uses only standard Supabase features, but the first real run happens when you
  paste it into your project (docs/SUPABASE-SETUP.md).
- **Real email delivery** (confirmation and reset codes). This needs your
  Supabase project.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | Apple and Google sign-in not built (this milestone was email-only) | Needs Apple Developer account (€99/yr); add before App Store |
| 2 | In-app **account deletion** not built yet (Settings says so) | Milestone 5, before any public beta (Apple requires it) |
| 3 | Legal texts (Impressum, Terms, Privacy Policy) are marked drafts | Needs company details + lawyer review |
| 4 | Supabase built-in email is test-only (low limits) | Free Resend SMTP before inviting testers, with your approval |
| 5 | Messaging policy is stored but not enforced yet (there is no messaging) | Milestone 4 |
| 6 | If a user picks a photo in onboarding and then quits, the file stays in storage | Clean-up job in Milestone 5 |
| 7 | Logo uses the free Orbitron font as a close match to the mockup | Swap for a designer-made SVG logo if you get one |
| 8 | Default "who can message me" is **Everyone (requests only)**. You did not decide this | Tell me if you prefer "Only people I follow" |
| 9 | GitHub push from this session was blocked (403, no access) | Reconnect GitHub, then I push |
| 10 | Expo Go only runs the latest SDK. If Expo Go updates past SDK 58 before testing, the project must be upgraded | Low effort; I will handle it |

## 5. Estimated ongoing costs

| Item | Now | When it starts |
|---|---|---|
| Supabase (Free) | **€0** | — |
| Expo Go / Expo account | **€0** | — |
| GitHub + Actions | **€0** (private repos include free CI minutes) | — |
| Supabase Pro | ~€23/month | Before beta, **only with your approval** |
| Apple Developer | €99/year | Before Apple sign-in / TestFlight |
| Google Play | ~€23 one-time | Before Android beta |
| Email (Resend) | €0 (free tier) | Before inviting testers |
| Domain | ~€15–60/year | When you choose a name |

**Milestone 1 recurring cost: €0.** Nothing paid was activated.

## 6. How to launch PL8 on your phone

See **README.md → "Run PL8 on your phone"**. Short version:

1. Do the Supabase setup in `docs/SUPABASE-SETUP.md` (free, ~15 min).
2. On a computer: install Node.js 22 and Git, then run
   `git clone …`, `npm ci`, and copy `.env.example` → `.env` with your two keys.
3. On your phone: install **Expo Go**.
4. Run `npx expo start` and scan the QR code.
5. Test: Create account → enter the 6-digit code from your email → choose a
   username → photo/bio → privacy → you land in the app. Try Edit profile,
   Settings → Privacy, Language, Log out, Forgot password.
