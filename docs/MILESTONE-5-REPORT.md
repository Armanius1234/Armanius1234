# Milestone 5 — Beta readiness: report

Notifications, push, reporting, moderation, account deletion, data export,
automatic data clean-up, crash handling, a security audit and the beta build
setup.

## 1. Features completed

**Notifications**
- A bell on Home with an unread badge opens a list of follows, follow requests,
  accepted requests, likes, comments, plate verification results, plate
  changes, report outcomes and removed content.
- The list updates live. Opening it marks everything as read, and tapping an
  item opens the right screen.
- **Push notifications** use the free Expo Push Service and arrive in the
  user's language. Each user can switch them off (Settings → Notifications).
- New messages also trigger a push, but **never with the message text**, and
  at most one push per chat every 30 seconds.
- Notifications from blocked people are hidden.

**Reporting (EU DSA "notice and action")**
- A "Report" option on profiles, posts, comments, messages (long-press) and
  vehicles.
- 9 reasons plus optional details. Limited to 20 reports a day, and one open
  report per item per person.
- The reported person is never told who reported them.
- Settings → **My reports** shows the status of each report.

**Moderation (admins only, Settings → Admin → Reports)**
- A queue of open reports with the number of reports per item.
- The review screen shows the reported content, with photos through private
  links.
- Decisions: **No violation**, **Remove content** or **Suspend account**.
  - Removing or suspending needs a written reason.
  - Suspending asks for confirmation first.
- After a decision:
  - All reports on the same item close together.
  - Every reporter is told it was handled.
  - The affected person is told what was removed and why (the DSA "statement
    of reasons").
  - The decision is logged.
- Suspended accounts can't sign in, and their profile and cars disappear.
  Nobody can decide a report about themselves.
- **Storage clean-up:** lists files nothing points to any more and deletes them.

**Privacy rights (GDPR)**
- Settings → **Download my data** creates a JSON file with everything PL8
  stores about you and opens the share sheet.
- Settings → **Delete account** asks for your password, then deletes all files,
  all data and the login. Messages you sent stay with the other person,
  without your name.
- **Nightly clean-up:**
  - old notifications (90/180 days)
  - search and claim logs (30 days)
  - push log (7 days)
  - unfinished drafts (1 day)
  - closed reports (1 year)

**Stability**
- If a screen crashes, a friendly "Try again" screen appears instead of the app
  closing. No technical details are shown.
- A "No internet connection" bar appears when the phone is offline.

**Security audit** (now an automatic test that runs on every change)
- Every table is protected.
- Anonymous visitors can't read any table or run any app function.
- Private tables can't be reached.
- Every privileged function is locked to a fixed search path.
- Only profile pictures are public files.
- Users can't change moderation, verification, counter or status fields.

**Beta setup**
- `eas.json` with a **preview** profile (installable Android APK / iPhone
  ad-hoc build) and a **production** profile (store builds).
- The push permission is set up for iOS.
- A step-by-step guide: **docs/BETA-DEPLOYMENT.md**.

## 2. Files created or modified

**New**
- `supabase/migrations/20261029090000_beta_readiness.sql`: notifications,
  push queue, reports, moderation, suspension, deletion, export, retention.
- `supabase/tests/05_beta_readiness.test.sql`: 57 checks.
- `supabase/tests/06_security_audit.test.sql`: 7 checks.
- `src/app/notifications.tsx`, `src/app/report.tsx`
- `src/app/admin/reports.tsx`, `src/app/admin/report/[id].tsx`
- `src/app/settings/notifications.tsx`, `src/app/settings/reports.tsx`,
  `src/app/settings/delete-account.tsx`
- `src/features/notifications/` (api, push, text)
- `src/features/moderation/api.ts`, `src/features/account/api.ts`
- `src/features/system/` (CrashScreen, OfflineBanner)
- `src/__tests__/beta.test.tsx`: 19 tests.
- `eas.json`, `docs/BETA-DEPLOYMENT.md`, `docs/PRIVACY-NOTES.md`, this report.

**Changed**
- Root layout: crash screen, offline bar, new screens.
- Tabs: push setup and live notifications.
- Home: bell with badge.
- Post card, comments, chat, profile, vehicle: report menus.
- Settings: notifications, my reports, download data, delete account,
  admin → reports.
- `app.json`: notifications and sharing plugins.
- `package.json`: expo-notifications, expo-device, expo-sharing, NetInfo. All
  were installed with `expo install` and are SDK-compatible.
- Texts in German and English; database types; `docs/SUPABASE-SETUP.md`
  (Milestone 5 update); README.

## 3. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **152 / 152 passed** (9 suites; 20 new) |
| Database tests | ✅ **355 / 355 passed** (64 new) |
| Mutation checks | 6 deliberate bugs, **all caught** (details below) |
| iOS + Android bundles | ✅ both built |
| `eas.json` | ✅ validated with EAS's own schema (`@expo/eas-json` 25.3.0); a wrong value is correctly rejected |
| Bundles scanned for secret keys | ✅ none (the only match is the app's own guard that refuses secret keys) |
| Visual check | Home bell with badge, notification list, report form, moderator review, crash screen |

Mutation checks (bugs added on purpose to prove the tests catch them):

1. Account deletion without its permission grant.
2. Deleting the account **before** the files.
3. Removing the "reason required" check for moderators.
4. Accepting malformed IDs from a push.
5. Showing the offline bar while the connection is still unknown.
6. Showing removed cars again after a suspension is lifted.

**Bugs found and fixed during testing**
- Lifting a suspension would also have re-shown a car a moderator had removed
  separately. Fixed, with a test.
- A notification from a newer server version could have shown a raw text key.
  It now falls back to a neutral word.
- The "Turn on push" card appeared even when push was already allowed. It now
  only appears when the phone was never asked.

**Not tested yet:**
- Real push delivery to a phone. This needs an installed beta build, `eas init`
  and pg_net in Supabase. What is tested: the server queues the push, uses the
  right language, respects "push off", throttles chat pushes and never includes
  message text.
- Live updates between two real phones.
- Account deletion and data export against a real Supabase project. The
  database side is tested, and the app's steps and their order are tested
  with a mock.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | **Legal review needed before public launch:** privacy policy, terms, imprint, DPIA, DSA duties, Expo push (USA) transfer, received messages in the export, retention of the moderator log | Lawyer, using `docs/PRIVACY-NOTES.md` |
| 2 | App ID (bundle identifier) not set, because the company and domain are not confirmed. It can't be changed after release | Your decision before the first build |
| 3 | iPhone beta needs the Apple Developer Program (€99 per year) | **Needs your approval**; the Android beta is free |
| 4 | Appeals and lifting a suspension only work by email plus the SQL Editor (snippet in the setup guide) | Button for admins in Milestone 6 |
| 5 | No crash-reporting service (e.g. Sentry) | Optional; free tiers exist, but it adds a data processor and needs your approval |
| 6 | Emails use Supabase's built-in sender (low hourly limit) | Own email provider before launch |
| 7 | Messages are not end-to-end encrypted | Say so in the privacy policy |
| 8 | Moderators see the text of reported messages | Say so in the privacy policy |
| 9 | No dedicated performance pass on real phones yet. Lists already load in pages and render only what is on screen; images are cached and resized before upload | Measure with the beta build on an older Android phone |
| 10 | Play Store internal testing needs the Google Play Console ($25 once) | Not needed for the free APK beta; **needs your approval** later |

## 5. Estimated ongoing costs

**Still €0.** Expo Push, the Expo account, EAS builds on the free plan, pg_net
and pg_cron are all free.

| Optional, only with your approval | Cost |
|---|---|
| Apple Developer Program (iPhone beta + App Store) | €99 per year |
| Google Play Console (store release, not needed for the APK beta) | $25 once |
| EAS paid plan (faster builds, more builds per month) | not needed for the beta |
| Supabase Pro (backups, more capacity) | not needed for the beta |

## 6. How to try Milestone 5

**In Supabase:** follow docs/SUPABASE-SETUP.md → "Milestone 5 update". Switch
on pg_net and pg_cron, then run the fifth file.

**In Expo Go** (everything except push):

1. With two accounts, A likes and comments on a post of B. B sees the bell
   badge on Home. Opening it shows both notifications, and the badge
   disappears.
2. A opens one of B's posts → **⋯** → **Report post** → pick a reason → **Send
   report**. Settings → My reports shows "Under review".
3. As admin: Settings → Admin → **Reports** → open the report → write a reason
   → **Remove content**. The post disappears; B gets a "removed" notification;
   A's report shows "Action taken".
4. Settings → **Download my data** → share or save the file.
5. Settings → **Delete account**. **Use a test account**, because this can't
   be undone.
6. Switch on airplane mode: the "No internet connection" bar appears.

**Push notifications:** build the free Android beta following
**docs/BETA-DEPLOYMENT.md**, install it, tap the bell → **Turn on**, then
follow that account from a second phone.
