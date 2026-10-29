# Milestone 7 — Launch hardening: report

Scope (recommended, everything free):

- appeals against moderation decisions (EU Digital Services Act)
- moderation statistics
- push switches per type
- a performance pass
- an accessibility pass
- a store listing pack

## 1. Features completed

**Appeals (DSA Art. 20)**
- **Who can appeal, within 6 months of the decision:**
  - people whose content was removed or whose account was suspended
  - reporters whose report was found "no violation"
- **Where:** Settings → **Moderation decisions** shows each decision, the
  reason, the note from the PL8 team and the appeal deadline, with an
  **Appeal** button. Tapping a decision notification opens it too.
- **How it is reviewed:** under Settings → Admin → **Appeals**, the admin sees
  - the explanation
  - the original decision
  - the content as it was when reported
  - what reversing will do

  The admin then keeps or reverses the decision, with a written reason.
  Nobody can decide their own appeal.
- **Reversing:**
  - **Removed post or car:** becomes visible again.
  - **Suspension:** lifted.
  - **"No violation" report:** goes back into the queue for a new decision.
  - **Deleted comments and messages** cannot be restored; the screen says so.
- **The person is told the result**, with the reason and a pointer to
  out-of-court dispute settlement and courts.

**Suspensions**
- A suspended person now **can sign in**, but only sees:
  - the suspension and its reason
  - the appeal form
  - "Download my data", "Delete account" and "Log out"

  Before, sign-in was blocked completely, so appeals were impossible.
- The database treats a suspended account as blocked by everyone.
- A suspension now sends a **statement of reasons** (DSA Art. 17), like content
  removals already did.
- Locked accounts can't upload files. This also closes a small Milestone 6
  gap: an Apple/Google sign-up without consent could upload a public profile
  picture.

**Statistics** (Settings → Admin → Statistics), for the last 30 days or 12
months:
- reports by reason and type
- decisions
- median time to a decision
- appeals: received, kept, reversed, open
- suspended accounts

You can **share it as a CSV file** for the DSA transparency report.

**Push switches per type** (Settings → Notifications)
- Messages, new followers, comments and likes can each be switched off.
- Plate updates and decisions by the PL8 team are always sent.
- Push messages now carry **only IDs**, never moderator notes.

**Store listing pack:** `docs/STORE-LISTING.md`
- German and English store texts (all within the character limits)
- draft answers for Apple's privacy questions and Google's "Data safety" form
- age rating notes and notes for App Review
- screenshot plan and a submission checklist

## 2. Performance pass

A new performance check (`npm run perf:db`) fills a database with a busy
beta's worth of data and times the 18 most-used queries as a real member,
16 times each, against a budget:

- 5,000 members
- 125,000 follows
- 30,000 posts
- 120,000 likes
- 40,000 comments
- 21,000 messages
- 285,000 notifications

**Found and fixed:**

| Problem | Before | After |
|---|---|---|
| Every like/unlike and every comment deletion read the **whole notifications table** (missing index, since Milestone 5) | Seeding stalled for more than 17 minutes at the likes | Likes insert at normal speed (whole seed: about 4 minutes) |
| **14 foreign keys without an index**: deleting posts, cars or accounts scanned whole tables | — | All indexed; a test now fails if one is ever missing |
| **Home feed**: after a few uses, PostgreSQL switched to a plan that checks every candidate post | ~190 ms (first page), ~125 ms (older pages) | **7.2 ms / 7.5 ms** |

**Final results** (median of 16 runs, this test machine):

| Query | ms | Budget |
|---|---|---|
| Home feed (first page / older page) | 7.2 / 7.5 | 50 |
| Discover | 6.1 | 50 |
| Profile posts / single post | 1.0 / 0.8 | 50 / 20 |
| 300-comment thread | 6.6 | 50 |
| Inbox (60 chats) / chat messages | 10.5 / 4.5 | 50 / 20 |
| Notifications / unread badges | 7.9 / 10.6–11.4 | 50 / 20 |
| Plate search | 1.3 | 50 |
| Admin reports queue (500 open) / statistics | 20.1 / 4.0 | 200 / 100 |

**On the phone:**
- Car photos are now cached by file, so they are no longer downloaded again
  whenever their private link is renewed.
- Verification evidence and reported photos are kept in memory only, never
  in the moderator's disk cache (privacy).

## 3. Accessibility pass

- **Contrast (WCAG AA):** white text on the blue buttons was 3.9:1 and on the
  red buttons 3.8:1 (the minimum is 4.5:1). These now use a slightly deeper
  blue (#0070EF, 4.6:1) and red (#DC2626, 4.8:1). The brand blue stays for
  icons, links and outlines, where it passes. The same applies to chat bubbles,
  count badges and the crash screen.
- **Screen readers:** a new automatic check renders 20 main screens and fails
  if anything tappable has no role or name, or a text field or switch has no
  label. It found:
  - the car name under a post was not announced as a link
  - the post photo area had no role
  - comments had no role and a jumbled spoken name
  - switches did not announce "disabled"

  All four are fixed.
- Text follows the phone's font size setting (only the PL8 logo is fixed).

## 4. Navigation bug found and fixed

A new test renders the **real** app navigation for each kind of account. It
showed that:

- a **signed-out** person opening the app got "Unmatched Route" instead of
  the welcome screen (probably since Milestone 1; earlier checks opened
  `/welcome` directly)
- a locked screen could fall back to the wrong place, e.g. Settings instead
  of the suspension screen

Each account state now has an explicit landing screen: welcome, onboarding,
suspension, or home. 7 tests cover it.

## 5. Files

**New**
- `supabase/migrations/20261031090000_launch_hardening.sql`
- `supabase/tests/08_launch_hardening.test.sql`: 49 checks.
- Performance check: `supabase/perf/seed.sql`, `supabase/perf/measure.sql`,
  `scripts/perf-db.sh`, `scripts/lib/db.sh` (shared with the test script).
- Screens:
  - `src/app/suspended.tsx`
  - `src/app/settings/decisions.tsx`, `src/app/settings/appeal.tsx`
  - `src/app/admin/appeals.tsx`, `src/app/admin/appeal/[id].tsx`
  - `src/app/admin/stats.tsx`
- `src/features/moderation/appeals.ts`, `AppealComponents.tsx`,
  `ContentPreview.tsx`
- `src/test-utils/a11y.ts`
- Tests: `navigation.test.tsx` (7), `appeals.test.tsx` (21), `a11y.test.tsx` (23).
- `docs/STORE-LISTING.md`, this report.

**Changed**
- Root layout (landing screens, suspension lock); notification settings;
  notification taps.
- Colours (`tokens.ts`), Button, Rows (switch), post card, comments.
- Images (cache keys; memory-only for sensitive photos).
- Texts in German and English; database types.
- Docs: SUPABASE-SETUP (Milestone 7 update), PRIVACY-NOTES, README.

## 6. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **238 / 238 passed** (14 suites; 51 new) |
| Database tests | ✅ **450 / 450 passed** (49 new) |
| Performance check | ✅ **18 / 18 queries within budget** (`npm run perf:db`) |
| Mutation checks | **15 deliberate bugs, all caught.** One was first missed and is now covered by a new test; details below |
| iOS + Android bundles | ✅ both built; no secret keys; test helpers not included |

**Mutation checks**

*Database:*
1. Locked accounts not treated as blocked.
2. Uploads allowed while locked.
3. No 6-month appeal window.
4. Deciding your own appeal.
5. Like push ignoring its switch.
6. Moderator note in the push.
7. Unsuspending showing removed cars.
8. Reporter appealing a decision in their favour.

*App:*

9. Suspended users not sent to their screen.
10. Switch state not announced.
11. Buttons back to the low-contrast blue.
12. Appeal deadline ignored.
13. Comment without a role.
14. Appeal sent without an explanation.
15. Suspension notification opening nothing. This was **missed at first**;
    the notification taps are now tested.

**Earlier tests changed on purpose:**
- Milestone 5's "suspended account cannot sign in" now checks the new rule:
  locked, sign-in allowed for appeals.

**Not tested yet:**
- Appeals and the suspension screen against a real Supabase project (the
  database rules are tested).
- Push on a real phone (unchanged from Milestone 5).
- Performance on a real phone and on Supabase's servers. The database
  numbers come from this test machine.

## 7. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | Legal review: terms describing moderation and appeals, DSA point of contact, wording of the out-of-court pointer, privacy answers in the store pack | Lawyer (docs/PRIVACY-NOTES.md, docs/STORE-LISTING.md) |
| 2 | Deleted comments and messages can't be restored after a successful appeal | Switch them to "hidden" instead of deleted, if wanted |
| 3 | Google Play requires an account-deletion **web page**; Apple review needs a demo account | Needs your domain (see docs/STORE-LISTING.md, section 9) |
| 4 | Earlier open points unchanged: company and domain, bundle ID, Apple sign-in token revocation, crash reporting, own email sender | Your decisions / approvals |

## 8. Estimated ongoing costs

**Still €0.** Nothing new to pay for. The paid store accounts (Apple €99 per
year, Google $25 once) still need your approval.

## 9. How to try Milestone 7

**In Supabase:** follow docs/SUPABASE-SETUP.md → "Milestone 7 update" (run
the seventh file).

**In Expo Go:**

1. **Settings → Notifications:** switch off "Likes". Likes still appear in
   the app, without a push.
2. **Appeal a removal:** from a second account, report one of your posts.
   - As admin, remove it with a reason.
   - On the first account, open Settings → Moderation decisions → Appeal,
     and send an explanation.
   - As admin, open Settings → Admin → Appeals and reverse the decision. The
     post is back, and the first account gets the result.
3. **Suspension:** suspend a test account from a report.
   - Sign in with it: you only see the suspension screen with the reason and
     the appeal form.
4. **Statistics:** Settings → Admin → Statistics → Share as CSV file.
