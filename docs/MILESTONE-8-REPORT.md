# Milestone 8 — Discovery: report

Scope (recommended, everything free):

- people search
- car search by make and model
- suggested people on Discover
- @mentions in posts and comments

Bigger features (clubs, meets, marketplace and similar) are parked until you
make the product decisions they need.

## 1. Features completed

**Search tab: Plate · People · Cars**
- The Search tab now has three modes. **Plate** works exactly as before.
- **People:** search by username or display name, from 2 letters on, with or
  without "@".
  - Exact matches come first, then names that start with the search, then the
    most-followed.
  - Each result shows the name, @username and picture, and says "Following" or
    "Private account".
  - Never shown: people who blocked you or whom you blocked, suspended
    accounts, and sign-ups that haven't given consent yet.
- **Cars:** search by make, model or generation, e.g. "Porsche 911" or "E30".
  - Up to 4 words, and each word must match.
  - Results show the cover photo, year, a "verified" mark and the owner's
    @username.
  - It only finds cars you could already open (visibility, private owners,
    blocks and moderation are respected).
  - **Plates are never shown or searched here.**
- `%` and `_` are searched as normal characters, not as wildcards.

**Suggested for you** (top of Discover)
- Up to 10 people, each with a reason and a Follow button:
  - "Followed by @ben.bmw and 2 more": people the people you follow follow
    (more shared connections come first)
  - "Also drives a Porsche": owners of a public car of a make you own
  - "Popular on PL8": most-followed members, to fill up
- Never suggests yourself, people you already follow or asked to follow,
  suspended people, or anyone blocked either way.
- The section is hidden when there is nobody to suggest.

**@mentions**
- Write `@username` in a caption or comment. The name becomes a tappable link
  to the profile.
- While you type `@` plus 2 letters, matching people appear above the keyboard.
  Tap one to fill in the name.
- The person mentioned gets a notification ("Ann mentioned you: …") and a
  push. The push follows the switch now called **"Comments and mentions"**.
- **Rules:**
  - At most 5 mentions per text count.
  - Only people who can see the post are told. People who blocked the writer
    are never told.
  - Drafts tell nobody. The people mentioned are told when the post is
    published.
  - Editing a caption only tells **newly** added names, nobody twice.
  - The post's author gets one "comment" notification, not an extra
    "mention".
  - Deleting a comment also deletes its mention notifications.
  - E-mail addresses such as `me@mia.de` are not mentions.

**Unread notification badge**
- It now stops counting at 100. The app already showed "99+".

## 2. Performance

The performance check (`npm run perf:db`) now also times the new searches and
suggestions. The test data now includes a popular post with 300 comments, so
its author has hundreds of unread notifications.

**Found and fixed:**

| Problem | Before | After |
|---|---|---|
| **People search** for a word that matches everyone ("member"): every match was checked for blocks before the first 20 were picked | 645 ms | **7.4 ms** |
| **Suggested people:** all candidates were checked for blocks before the first 10 were picked | 335 ms | **16.6 ms** |
| **Unread notification badge** for a member with 342 unread notifications: counted all of them, and checked blocks one notification at a time | 93 ms | **2.4 ms** (counts up to 100, in a single query) |

**Final results:** median of 16 runs on this test machine.

| Query | ms | Budget |
|---|---|---|
| People search: exact name / matches everyone | 3.1 / 7.4 | 50 |
| Car search: one make / two words | 5.7 / 6.9 | 50 |
| Suggested people | 16.6 | 100 |
| Unread notification badge | 2.4 | 20 |
| Home feed: first page / older page | 4.6 / 6.7 | 50 |
| Discover | 5.6 | 50 |
| 300-comment thread | 5.7 | 50 |
| Inbox (60 chats) / chat messages | 9.4 / 3.8 | 50 / 20 |
| Notifications list / unread message badge | 6.6 / 10.0 | 50 / 20 |
| Plate search | 1.6 | 50 |
| Admin reports queue (500 open) / statistics | 17.1 / 3.6 | 200 / 100 |

All **23 / 23** queries are within budget.

**Privacy bug found while reviewing:** "Followed by @…" could name an account
you follow that has since been **suspended**. Suspended accounts must be
invisible to everyone, so they are now never named and don't count. A test
covers it. The test data is unchanged from
Milestone 7 apart from the popular post:

- 5,000 members
- 125,000 follows
- 30,000 posts
- 120,000 likes
- 40,000 comments
- 21,000 messages
- 285,000 notifications

## 3. Files

**New**
- `supabase/migrations/20261102090000_discovery.sql`
- `supabase/tests/09_discovery.test.sql`: 42 checks.
- `src/features/discovery/api.ts`: searches, suggestions and mention helpers.
- `src/features/discovery/components.tsx`: people and car results,
  "Suggested for you".
- `src/features/discovery/mentions.tsx`: tappable mentions and suggestions
  while typing.
- `src/__tests__/discovery.test.tsx`: 14 tests.
- This report.

**Changed**
- Screens:
  - Search tab (three modes)
  - Discover (suggestions)
  - Post and comments (tappable mentions, suggestions while typing)
  - New post and edit post
  - Notifications and push taps (mentions open the post)
- Texts in German and English; database types.
- Performance check: test data and the new queries.
- Tests: notification taps, accessibility (Discover with suggestions), the
  list of notification types.
- Docs:
  - SUPABASE-SETUP (Milestone 8 update)
  - PRIVACY-NOTES (new points 12 and 13)
  - STORE-LISTING (descriptions mention search and @mentions)
  - README

## 4. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **254 / 254 passed** (15 suites; 16 new) |
| Database tests | ✅ **492 / 492 passed** (42 new) |
| Performance check | ✅ **23 / 23 queries within budget** |
| Mutation checks | **21 deliberate bugs, all caught.** Three were missed at first and are now covered by new tests; details below |
| iOS + Android bundles | ✅ both built; no secret keys |
| Visual check | ✅ people results, car results, suggestions and mention chips checked on screenshots. The suggestion cards were misaligned and are fixed |

**Mutation checks**

*Database:*
1. People search ignoring blocks.
2. Suggestions ignoring blocks.
3. Wildcards not escaped.
4. Car search ignoring visibility.
5. Suggesting people you already follow.
6. Mentions ignoring who can see the post.
7. Editing a caption telling everyone again. This was **missed at first**;
   a test now covers small edits.
8. E-mail addresses counted as mentions.
9. Mention push ignoring the "comments" switch.
10. Badge counting without a limit.
11. Badge ignoring that the reader is locked.
12. Badge counting suspended senders.
13. Badge counting senders without consent.
14. Badge ignoring people you blocked.
15. Badge ignoring people who blocked you.
16. A suspended account named in "Followed by …" (the privacy fix in
    section 2).

*App:*

17. An e-mail address treated as a mention while typing.
18. People search sent after one letter. This was **missed at first**; now
    tested.
19. Mention links without a role for screen readers.
20. A mention notification opening nothing. This was **missed at first**;
    now tested.
21. Suggestion reason ignoring the "and 2 more" count.

**Not tested yet:**
- The new searches against a real Supabase project. The database rules are
  tested; the migration switches on the free `pg_trgm` extension.
- Push for mentions on a real phone (same push path as comments since
  Milestone 5).
- Performance on a real phone and on Supabase's servers. The numbers above
  come from this test machine.

**Unchanged and not from this milestone:** the app test run prints "A worker
process has failed to exit gracefully". It also appears without the new
tests, and all tests pass.

## 5. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | No "don't show me in people search" setting. Private accounts can be found by name, but their posts stay hidden | Your decision; GDPR review (docs/PRIVACY-NOTES.md, point 12) |
| 2 | Suggestions use follow relationships and car makes: legal basis and whether an opt-out is needed | Lawyer (point 13) |
| 3 | People and car search have no rate limit. Each search returns at most 50 results, and profiles were already visible to signed-in members | Add one if scraping becomes a problem |
| 4 | Clubs, meets, marketplace, events | Need your product decisions first |
| 5 | Earlier open points unchanged: company and domain, bundle ID, legal texts, Apple sign-in token revocation, crash reporting, own email sender, store accounts | Your decisions / approvals |

## 6. Estimated ongoing costs

**Still €0.** `pg_trgm` is a free, built-in Supabase extension. The paid store
accounts (Apple €99 per year, Google $25 once) still need your approval.

## 7. How to try Milestone 8

**In Supabase:** follow docs/SUPABASE-SETUP.md → "Milestone 8 update" (run
the eighth file).

**In Expo Go:** you need two or three test accounts.

1. **Search → People:** type 2 letters of a test account's name. Tap the
   result to open the profile.
2. **Search → Cars:** type a make, e.g. "BMW". Cars set to "only me" don't
   appear.
3. **Discover:** "Suggested for you" appears at the top once there are other
   accounts to suggest.
4. **Mentions:** write a comment and type `@` plus 2 letters of the other
   account's name. Tap the suggestion and send. The other account gets a
   notification, and tapping it opens the post.
