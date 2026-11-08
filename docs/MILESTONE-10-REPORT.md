# Milestone 10 — Privacy switches and clean-up: report

Scope (recommended, everything free):

- a switch "Show me in people search"
- a switch "Suggest me to others"
- security updates
- a checklist for the first real test of the web version with your Supabase
  project

## 1. Features completed

**Settings → Privacy → "Being found"**

Two switches, both **on** by default.

- **"Show me in people search"**
  - **Off:** nobody finds you by name or username in Search → People. This
    includes the exact username. You also don't appear in the @mention
    suggestions while others type.
  - **What stays:** your profile still opens from your posts, comments,
    follower lists and links. Someone who types your exact `@username` still
    mentions you.
- **"Suggest me to others"**
  - **Off:** you never appear under "Suggested for you", for any reason
    (shared connections, same car make, popular).

Both settings are stored in the private settings table that only you can read,
so nobody can see who switched them off. They are included in "Download my
data", and work in the app and in the web version.

**Also fixed:** the note under the privacy settings still said plate search was
"coming with the Garage". It now describes how plate search actually works
(verified, then switched on per car).

## 2. Security updates

`npm audit` reported **36** issues: **3 high**, 32 moderate and 1 low.

**What was done**

- **Expo SDK 58 updated** from 58.0.19 to **58.0.23** (bug-fix release).
  - All Expo packages and React Native (0.88.0 → 0.88.1) were aligned with the
    official tool (`expo install --fix`).
  - This removed an old copy of zod from Expo's command-line tool.
- **node-forge** updated to 1.4.3 (fixed version).

**Result**

- **0 high**, 30 moderate, 1 low.
- The remaining ones come from 3 packages: glob, minimatch and deepmerge. They
  sit inside Expo's and Jest's build and test tools.
- npm's only offered "fix" is to go back to Expo 52 or Jest 29, which would
  break the app.
- **They are not in the app:** the source maps of all three builds (iOS,
  Android, web) were checked. None of these packages is in them. They run only
  on a developer computer or in CI.
- They go away when Expo updates its tools.

## 3. First real test of the web version

**docs/GO-LIVE-CHECKLIST.md** is a 30-minute checklist for your real Supabase
project with the web version and the phone app:

- registration
- post with photo
- follow, message, mention
- the new switches
- data download
- admin verification review
- logging out

Tick each line. If one fails, send me a screenshot and the step number.

## 3b. Web version as one file (added on your request)

`npm run build:web:single` packs the whole web version into **one
`index.html`** of about 5 MB: the app, fonts, icons and the browser icon.

- **Settings:** your two Supabase values go into a clearly marked block at the
  top of the file.
- **Security:** the security policy still allows only exactly this code to
  run. Each embedded script is pinned by its fingerprint.
- **Opened by double-click or inside another page:** a clear message explains
  that PL8 needs a web address. Before, this showed a blank page.
- **Opened as `…/index.html`:** works too.
- **Tests:** the same browser test runs against it, with 2 extra checks:
  **18 / 18 passed**. CI now builds and tests both versions.
- **Mutation check:** the "needs a web address" message switched off → caught.

## 4. Performance

`npm run perf:db`: **all 23 queries are within budget.**

| Query | ms | Budget |
|---|---|---|
| People search: exact name / matches everyone | 3.8 / 14.6 | 50 |
| Suggested people | 22.1 | 100 |
| Home feed / Discover | 8.6 / 8.2 | 50 |

This test machine was slower overall during this run. Unchanged queries such as
car search and the home feed took about twice as long as in Milestone 9. The
new switch adds one quick lookup per person and stays far within budget.

## 5. Files

**New**
- `supabase/migrations/20261104090000_privacy_controls.sql`
- `supabase/tests/10_privacy_controls.test.sql`: 14 checks.
- `src/__tests__/privacy.test.tsx`: 4 tests.
- `docs/GO-LIVE-CHECKLIST.md` and this report.

**Changed**
- Privacy screen (two switches), texts in German and English, database types,
  settings API.
- `package.json` / `package-lock.json`: Expo 58.0.23 and aligned packages.
- `app.json`: Expo's update tool added the expo-image settings plugin (standard for this version).
- Browser test: the switch in the web version (now 16 checks).
- Docs:
  - SUPABASE-SETUP: "Milestone 10 update" (the 9th file)
  - PRIVACY-NOTES: points 12 and 13 now describe the switches
  - README

## 6. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **269 / 269 passed** (17 suites; 4 new) |
| Database tests | ✅ **506 / 506 passed** (14 new) |
| Browser test of the web version | ✅ **16 / 16 passed** (1 new); single-file version **18 / 18** |
| Performance check | ✅ **23 / 23 within budget** |
| Mutation checks | **4 deliberate bugs, all caught.** Details below |
| iOS, Android and web builds | ✅ all built after the Expo update; no secret keys; flagged packages not included |

All app, database and browser tests were run again **after** the Expo update.

**Mutation checks**
1. Search ignoring the switch.
2. Suggestions ignoring the switch.
3. Switches not changeable (missing permission).
4. Switches off by default (this also broke Milestone 8's search tests, as
   expected).

**Not tested yet:**
- The real Supabase project and the real IONOS server: that is what the new
  checklist is for.
- The Expo update on a real phone. The app tests and all three builds pass;
  please watch for anything unusual when you next open the app in Expo Go.

## 7. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | Both switches are **on by default**. A lawyer should confirm this is acceptable, and the legal basis for suggestions | docs/PRIVACY-NOTES.md, points 12–13 |
| 2 | Moderate npm audit findings in build and test tools (not in the app) | Resolved by future Expo updates |
| 3 | People and car search still have no rate limit (each search returns at most 50 results) | Add one if scraping becomes a problem |
| 4 | Earlier open points unchanged: company and domain, legal texts, web host DPA, Apple sign-in token revocation, email sender, store accounts | Your decisions / approvals |

## 8. Estimated ongoing costs

**Still €0.** Nothing new to pay for.

## 9. How to try Milestone 10

1. **Supabase:** run the 9th file (docs/SUPABASE-SETUP.md, "Milestone 10
   update").
2. **Phone app:** in the `pl8` folder run `git pull`, then `npm ci`, then
   `npx expo start`. `npm ci` installs the updated Expo packages.
3. **Web version:** upload the new files (keep your filled-in
   `pl8-config.js`).
4. Settings → Privacy → **Being found**. Switch "Show me in people search"
   off, and search for yourself from a second account.
5. Then work through **docs/GO-LIVE-CHECKLIST.md**.
