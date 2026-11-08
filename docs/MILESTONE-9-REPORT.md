# Milestone 9 — Web version: report

Scope (your choice): PL8 in the browser, built from **the same code** as the
phone app (Milestones 1–8), to upload to your IONOS web hosting. One code
base, the same Supabase project, the same accounts and the same security
rules.

## 1. What works in the browser

**Everything from Milestones 1–8, with three exceptions:**

- **Plate verification** needs live photos from the phone app. A browser could
  upload any picture, so the web version asks people to continue on the
  phone. Claiming a plate works on the web.
- **Push notifications** are phone-only. New notifications still show in the
  notification list.
- **Sign in with Apple / Google** is not offered on the web yet. Email and
  password work.

"Download my data" and the moderation statistics download a file instead of
opening the share sheet. On a wide screen, PL8 is a centred column, like on a
phone.

How to build it, upload it to IONOS and connect it to Supabase:
**docs/WEB-VERSION.md**.

## 2. What was built or changed

**For the web**
- **Dialogs:** a PL8 dialog for the browser. React Native's own dialog does
  nothing in a browser, so all 45 menus, confirmations and error messages
  (delete, report, block, log out…) would have been silent. On the phone,
  the system dialog stays exactly as before. A lint rule now prevents the old
  dialog from coming back.
- **Login session:** stored in the browser's storage for the website. If the
  browser blocks storage, it is kept in memory until the page is closed.
- **Files:**
  - Photo uploads read the picked file in the browser.
  - The data export and the statistics CSV are downloaded as files.
- **Photos:** resized and re-encoded in the browser before upload, so GPS and
  other metadata are not uploaded (tested with a photo that contains GPS
  data).
- **Verification and reported photos:** shown without being stored in the
  browser cache.
- **`pl8-config.js`:** connects a finished build to your Supabase project
  without building again. A secret key is refused there too.
- **Server rules (`.htaccess`) for IONOS:**
  - Links like `/post/123` open the app instead of "Not found".
  - Other websites can't show PL8 inside a frame.
- **Security policy in `index.html`:** scripts only from the PL8 website, data
  only from Supabase.
- **Small fixes:**
  - Page language for screen readers.
  - Browser icon.
  - Tab bar labels were cut off at the bottom in the browser; fixed.

**For both web and phone**
- **A page opened directly** (a reloaded browser page, a shared link, a tapped
  notification) now has the home screen underneath, so "back" works.
  - **Before:** on the web, such a page had no way back, and the "Back to my
    car" button did nothing.

**New commands**
- `npm run build:web`: builds the web version into `dist-web/` and checks it
  contains no secret key.
- `npm run test:web`: opens the built site in Chromium and tests it.

## 3. Bugs found and fixed

| Problem | Found by | Fixed |
|---|---|---|
| All 45 dialogs and menus did nothing in a browser | code review before building | PL8 dialog on the web + lint rule |
| Login session storage (iPhone/Android keychain) does not exist in a browser | code review | browser storage, memory fallback |
| Data export, statistics CSV and photo upload used phone-only file functions | code review | browser versions |
| Tab bar labels cut off by 2–3 px in the browser | screenshots | more height on the web only |
| Pages opened directly had no way back | screenshots | home screen underneath (tested on web and in app tests) |
| The new dialog passed an extra empty value to the phone's dialog | an existing app test | arguments passed on unchanged |

## 4. Files

**New**
- `src/ui/alert.tsx`: the dialog for phone and web.
- `src/ui/SensitiveImage.tsx` and `.web.tsx`
- `src/lib/files.ts` and `.web.ts`
- `src/lib/authStorage.ts` and `.web.ts`
- `public/index.html`, `public/pl8-config.js`, `public/.htaccess`
- `scripts/build-web.sh`
- `scripts/web-e2e/`: the browser test, a test server with the same rules as
  `.htaccess`, and a test photo with GPS data.
- `src/__tests__/web.test.tsx`: 10 tests.
- `docs/WEB-VERSION.md` and this report.

**Changed**
- 23 screens and components now use the new dialog.
- The verification screen (phone-only notice).
- Root layout:
  - centred column on the web
  - dialog host
  - home screen under directly opened pages
- Tab bar: label room on the web.
- Supabase client, data export, statistics CSV, image helpers.
- Configuration (`env.ts`): reads `pl8-config.js` on the web.
- Texts in German and English.
- `app.json`: web settings and browser icon.
- ESLint rule, CI (new web job), `.gitignore`.
- `package.json`: Playwright as a development tool. It is not part of the app.
- Docs: README, PRIVACY-NOTES (new point 16 and host / browser storage rows).

## 5. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors. **Correction:** this said "0 warnings", but one warning (an unneeded comment in a test file) was missed because only the exit code was checked. Fixed after Milestone 10. |
| App tests | ✅ **265 / 265 passed** (16 suites; 11 new) |
| Database tests | ✅ **492 / 492 passed** (unchanged) |
| **Browser test of the web version** (Chromium, mocked Supabase) | ✅ **15 / 15 passed** |
| Mutation checks | **9 deliberate bugs, all caught.** Details below |
| Web build | ✅ 86 files, 4.8 MB; no secret keys |
| iOS + Android bundles | ✅ both built; no secret keys (the only match is the app's own check text "sb_secret_") |
| Visual check | ✅ screenshots on desktop and phone width. The tab bar labels were cut off; now fixed |

**The browser test covers:**
- the setup message when `pl8-config.js` is empty
- the welcome screen with no errors and nothing blocked by the security policy
- deep links
- the centred column
- signing in
- the session after a reload
- page language
- a menu with a confirmation (cancel and confirm)
- posting a photo (resized, re-encoded, no GPS)
- chat
- data download
- the verification notice
- the way back from a directly opened page
- signing out (session removed)
- no errors during the whole session

**Mutation checks**
1. Menus using the old dialog.
2. Verification not blocked on the web.
3. Download doing nothing.
4. Session kept in memory only.
5. No centred column.
6. A stricter security policy breaking the page.
7. The original photo uploaded without re-encoding.
8. No home screen under directly opened pages.
9. Old dialog imported in a new file (blocked by the lint rule).

**Not tested yet:**
- **Against your real Supabase project from a browser.** The browser test
  uses a mocked project. The database rules are the same and are tested.
- **On the real IONOS server.** The test server copies the `.htaccess` rules,
  but they have not run on IONOS's Apache.
- **Safari, Firefox and real phone browsers.** Only Chromium was tested, at
  desktop and phone width.
- Opening `index.html` by double-click shows a blank page. That is expected:
  the app needs a web address. Checked.

## 6. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | **A single HTML file for an HTML editor or website builder is not possible.** The app is about 90 files and must be served from a web address. | Upload `dist-web/` to the IONOS web space (docs/WEB-VERSION.md) |
| 2 | **Privacy:** confirm that the browser login storage needs no consent banner; add the web host and an imprint / privacy link to the website; sign the host's DPA | Lawyer (docs/PRIVACY-NOTES.md, point 16) |
| 3 | **Verification:** the live-photo rule has always been enforced by the app, not the server. The manual admin review is the real safeguard. | Keep reviewing carefully; a server-side check could come later |
| 4 | `npm audit` lists 27 known issues in production packages (3 high: in Expo's command-line tool, node-forge and an older zod copy, all pulled in by Expo's own tools). They are unchanged by this milestone (same count before and after) | Check with the next Expo update |
| 5 | Earlier open points unchanged: company and domain, legal texts, Apple sign-in token revocation, email sender, store accounts | Your decisions / approvals |

## 7. Estimated ongoing costs

**€0 extra**, if your IONOS package already includes web space, a subdomain and
SSL (most do). Nothing was booked.

## 8. How to try Milestone 9

1. Unzip the web version (or run `npm run build:web`).
2. In IONOS:
   - create a subdomain, e.g. `app.your-domain.de`, pointing to an empty
     folder
   - switch on SSL
3. Upload everything inside the folder, **including the hidden `.htaccess`**.
4. Fill in `pl8-config.js` with your Supabase Project URL and publishable key.
5. Open the address, sign in with your test account, and try posting, chatting,
   and Settings → Download my data.
