# Milestone 6 — Store launch preparation: report

Scope (recommended in Milestone 5, everything free):

- Apple and Google sign-in
- German district codes for plates
- Editing posts
- Deleting a chat for yourself
- Moderation polish

Paid accounts are prepared for, but nothing was bought.

## 1. Features completed

**Real German district codes**
- A plate must now start with a real district code
  (Unterscheidungszeichen). There are 727 codes:
  - all districts
  - the reintroduced old codes (e.g. SÄK, UER)
  - official ones (Bundeswehr "Y", federal police "BP", state governments)
- Typos like "FFM" get a clear message: "This district code does not exist in
  Germany."
- The app and the database use the same list, and a test checks they match.
  A new code can be added in the database with one line (setup guide).
- Sources: Berlin open data (CC BY 3.0) and the `kennzeichen` list (MIT),
  combined so no real plate is rejected.
  Both are credited on the in-app legal page, as their licences require.

**Sign in with Google and Apple** (built in, **off until you set them up**)
- Google works on iPhone and Android. Apple uses Apple's own button (Face ID)
  on iPhone.
- App Store rule 4.8 is built in: on iPhone, Google only appears when Apple
  is on too.
- **18+ and consent:** new Apple/Google users must confirm both in the app
  before anything else. The **database enforces this**: until then the account
  can't see profiles, posts, cars or search results, can't message or follow,
  and can't create a profile.
- A sign-up that stops at this step can be cancelled (the login is deleted),
  and abandoned ones are deleted automatically after 7 days.
- **Safer sign-in links (PKCE):** if another app on the phone catches the
  sign-in link, it can't use it.
- Apple's name (shared only once) pre-fills the profile name.
- **Delete account** also works for Apple/Google accounts: they confirm by
  typing their username, because they have no password.
- Setup guide: **docs/SOCIAL-LOGIN-SETUP.md**.

**Posts and chats**
- **Edit caption** on your own posts (⋯ → Edit caption).
- **Delete chat:** long-press it in Messages, or ⋯ in the chat.
  - The chat is removed **for you only**. The other person keeps it and is
    not told.
  - If they write again, the chat comes back with only the new messages.

**Moderation**
- **Reports keep a copy** of the content as it was when reported. If the author
  edits or deletes it afterwards, moderators see "When it was reported" next
  to "Now".
- **Suspended accounts** (Settings → Admin): a list with the reason. You can
  lift a suspension with a written reason and a confirmation, without the SQL
  Editor.

## 2. Files created or modified

**New**
- `supabase/migrations/20261030090000_store_prep.sql`: district table and
  check, consent rules for social sign-up, record_consent, hidden chats, report
  copies, suspended list, retention update.
- `supabase/tests/07_store_prep.test.sql`: 40 checks.
- `src/shared/de-districts.json`, `src/shared/plateDistricts.ts`
- `src/features/auth/` (social.ts, SocialButtons, ConsentStep, consent.ts)
- `src/app/auth/callback.tsx` (return address after Google sign-in)
- `src/app/post/edit.tsx`, `src/app/admin/suspended.tsx`
- `src/features/moderation/snapshot.ts`
- `src/__tests__/social-login.test.tsx` (20 tests), `src/__tests__/store.test.tsx` (5 tests)
- `docs/SOCIAL-LOGIN-SETUP.md`, this report.

**Changed**
- Plate check (app); sign-up and login screens (buttons); onboarding (consent
  step, name pre-fill); delete account.
- Post menu, inbox, chat menu, admin report review, settings, root layout.
- Supabase client (PKCE); `env.ts` and `.env.example` (sign-in switches).
- `app.json`: Apple sign-in permission, web-browser plugin.
- `package.json`: expo-apple-authentication, expo-crypto and
  expo-web-browser, all installed with `expo install` and SDK-compatible.
- Texts in German and English.
- Docs: SUPABASE-SETUP (Milestone 6 update), PRIVACY-NOTES, BETA-DEPLOYMENT,
  README.

## 3. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **187 / 187 passed** (11 suites; 35 new) |
| Database tests | ✅ **401 / 401 passed** (46 new) |
| Mutation checks | **10 deliberate bugs, all caught** (details below) |
| iOS + Android bundles | ✅ both built |
| iOS settings | ✅ Apple sign-in and push permissions present |
| `eas.json` | ✅ still valid (EAS's own schema) |
| Secret-key scan (code and bundles) | ✅ none found |
| Visual check | Google button, consent step, unknown-district message, edit caption, suspended accounts, report changed after reporting, deleting a Google account |

Mutation checks (bugs added on purpose to prove the tests catch them):

**Database**
1. Removing the consent rule.
2. Removing the district check.
3. Showing hidden chat messages.
4. Trusting a "provider" value sent by the user.

**App**
5. Google on iPhone without Apple.
6. Wrong Apple nonce sent to Supabase.
7. No handling for a sign-in link that arrives twice.
8. No username check before deleting.
9. Unknown districts accepted.
10. Consent sent without the checkboxes.

**Bugs found and fixed during testing**
- Confirming consent a second time changed the saved language. A repeat
  confirmation now changes nothing.
- New Apple/Google users would have seen the consent step in German on an
  English phone, because the default saved language was applied too early.
  The saved language now applies only once the profile exists.
- If the "cancel sign-up" deletion failed, the user would have been signed out
  without seeing the error. The error now stays on screen.

**Checked against the source:** the database rule for Apple/Google sign-ups
depends on Supabase Auth setting the provider *before* it saves a new user. I
confirmed this in the Supabase Auth source code (`signup.go`, `ToUserModel`).

**Flaky test found and fixed:** an older test from Milestone 3 ("FollowButton
follows a public account") failed now and then: twice locally and once in CI
on the first Milestone 6 push.
- **Cause:** the Follow button shows its label while it is still loading, but
  ignores presses until loading is done. On a busy machine the test pressed
  it too early.
- **The app was fine.** The test now waits until the button is ready, as a
  person would.
- **Proof:**
  - It was reproduced under CPU load.
  - With a 300 ms delay added on purpose, the old test fails every time and
    the fixed test passes.

**Not tested yet:**
- Real Google and Apple sign-in. This needs the provider set up in Supabase
  and, for Apple, the paid Apple account. The app's steps are tested with
  mocks, and the database rules are tested for real.
- Delete chat and edit caption against a real Supabase project. The database
  rules are tested.

**npm audit:** 5 high-severity advisories, the **same as before** this
milestone. They are in Expo's developer tools (node-forge in the Expo CLI,
and an older nested copy of zod), not in the app on the phone. Fixing them
needs an Expo update; `npm audit fix --force` would break SDK compatibility.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | **Apple: revoke the Apple sign-in when an account is deleted.** Required by Apple before App Store submission. Needs a small server function with an Apple key | Before App Store submission (needs the Apple account) |
| 2 | Google / Apple must be set up before the buttons appear | docs/SOCIAL-LOGIN-SETUP.md. Google is free; Apple is €99 per year and **needs your approval** |
| 3 | A brand-new district code is blocked by the app until its list is updated (the database can be updated right away) | Rare; add it in the next app update |
| 4 | Captions can be edited without an "edited" label (like Instagram). Reported versions are kept for moderators | Add a label if you want one |
| 5 | Legal review still open (privacy policy, terms, imprint, DPIA, DSA). New points 12–13 added | Lawyer, using docs/PRIVACY-NOTES.md |
| 6 | App ID (bundle identifier), company and domain still not set | Your decision |
| 7 | Remaining items from Milestone 5 (crash reporting, own email sender, Play Console) | Unchanged |

## 5. Estimated ongoing costs

**Still €0.** Google sign-in, PKCE and the new modules are free.

| Optional, only with your approval | Cost |
|---|---|
| Apple Developer Program (Apple sign-in, iPhone beta, App Store) | €99 per year |
| Google Play Console (store release) | $25 once |

## 6. How to try Milestone 6

**In Supabase:** follow docs/SUPABASE-SETUP.md → "Milestone 6 update" (run
the sixth file).

**In Expo Go:**
1. PL8 Search: type **FFM - AB 1** → "This district code does not exist".
   Then **F - AB 1** works.
2. One of your posts → **⋯** → **Edit caption** → change it → Save.
3. Messages → long-press a chat → **Delete chat**. It disappears for you. The
   other account still sees it. When they write again, it comes back with only
   the new message.
4. As admin: report a post from a second account, edit the post's caption,
   then open the report. "When it was reported" shows the old caption.
5. Suspend an account from a report, then Settings → Admin → **Suspended
   accounts** → lift it with a reason.

**Google sign-in:** follow docs/SOCIAL-LOGIN-SETUP.md (free, about
20 minutes), set `EXPO_PUBLIC_AUTH_GOOGLE=on`, restart, and try it on Android.
