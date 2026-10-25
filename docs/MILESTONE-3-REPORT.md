# Milestone 3 — Social network: report

Status: **complete, awaiting founder approval.** Milestone 4 (messaging) has not been started.

## 1. Features completed

- **Following**:
  - Follow public accounts instantly. Private accounts get a follow request.
  - Follow back, unfollow, and withdraw a request, each with a confirmation.
  - Follower and following lists; owners can remove a follower.
  - Requests screen (accept or decline), shown on your profile as
    "Follow requests (n)".
  - Switching an account from private to public approves all pending requests.
  - Blocking someone ends all follows and requests between you.
- **Private accounts now mean**: only approved followers see the posts, the
  garage, the follower lists and the post photos. Others see a "This account
  is private" notice. The server enforces this in a single place.
- **Profile** now looks like the mockup: header, Posts · Followers · Following
  counts (1.2K style), Follow / Follow back / Requested button, a "Follows you"
  label, and **Posts | Garage** tabs with a 3-column photo grid.
- **Posts**:
  - Up to 10 photos from the gallery or camera, a caption, and an optional tag
    for one of your cars.
  - A post is saved as a draft, its photos are uploaded, and only then is it
    published. If any step fails, the draft and photos are removed, so no
    half-finished posts appear.
  - Photos are resized on the phone and stored in a **private** bucket.
  - You can delete your own posts, including their photos.
- **Home feed**: posts from people you follow plus your own, newest first.
  It loads more as you scroll, supports pull to refresh, and shows a helpful
  screen when empty.
- **Discover**: the latest posts from **public** accounts in a photo grid.
  Private accounts never appear there.
- **Likes**: the heart updates instantly and is undone automatically if the
  server refuses.
- **Comments**: on the post screen. Long-press to delete your own comment, or
  any comment on your post. Limit: 30 comments per 10 minutes.
- **Saved posts**: bookmark any post; a Saved screen is reachable from your
  profile. Only you can see what you saved.
- **Anti-spam limits**: 20 posts per day, 200 follows per day, 30 comments per
  10 minutes.

## 2. Files created or modified

```
supabase/migrations/20261027090000_social.sql   (new: follows, posts, likes, comments, saves, feeds, post-media bucket)
supabase/tests/03_social.test.sql               (new: 70 checks)
src/features/social/{api.ts,components.tsx,ProfileBody.tsx,FollowListScreen.tsx,GridFeedScreen.tsx}  (new)
src/app/(tabs)/index.tsx (home feed), (tabs)/discover.tsx, (tabs)/profile.tsx           (rebuilt)
src/app/user/[username]/{index,followers,following}.tsx                                (moved + new)
src/app/post/new.tsx, src/app/post/[id].tsx, src/app/saved.tsx, src/app/follow-requests.tsx  (new)
src/ui/Segmented.tsx, src/shared/time.ts, src/lib/images.ts (multi-photo picker)
src/lib/database.types.ts, src/lib/errors.ts, src/features/garage/api.ts, src/app/_layout.tsx
src/i18n/{en,de}.ts
src/__tests__/social.test.tsx                   (new)
docs/MILESTONE-3-REPORT.md, docs/SUPABASE-SETUP.md, README.md
```

## 3. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **121 / 121 passed** (7 suites; 11 new) |
| Database tests | ✅ **251 / 251 passed** (70 new) |
| Mutation check | made private accounts behave like public ones → tests failed as expected |
| iOS + Android bundles | ✅ both built |
| Visual check | profile header, stats, Posts/Garage tabs, post card, private notice match the mockup style |

The database tests cover:

- **Following:** follow, private request, accept, decline, remove follower,
  private-to-public auto-approve, block ends follows, no self-follow, no
  sneaking a follow past a request, counters not writable.
- **Private content:** posts, garage, photo files and follower lists are hidden
  until approved.
- **Posts:** drafts invisible to others; no publishing without a photo; no
  photos added after publishing; photos can't go into someone else's post;
  only your own cars can be tagged; captions and counters protected.
- **Feeds:** home vs. discover vs. profile; private accounts never in
  discover; blocked users see nothing and can't like or comment.
- **Paging:** loading more returns every post with no gaps or duplicates.
- **Likes, comments, saves:** counters, who may delete a comment, saves are
  private, the comment limit works.
- **Deleting a post:** removes its saves and updates the post counter.
  Anonymous users can read nothing.

**Not tested yet:** on a real phone (photo picking, upload speed, scrolling)
and against a real Supabase project.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | No notifications yet for new followers, requests, likes and comments | Milestone 5 |
| 2 | Reporting posts or comments isn't built yet (blocking is) | Milestone 5 (moderation) |
| 3 | Posts can't be edited after sharing (delete and re-post instead). Captions can be changed in the database but there is no edit screen yet | Small follow-up if you want it |
| 4 | Discover is simply "newest public posts", with no ranking or filtering by make | Later (ranking costs nothing but needs real data) |
| 5 | Drafts left behind by a crash mid-upload are cleaned up only in normal error cases | Cleanup job in Milestone 5 |
| 6 | Photos are shown through 1-hour private links, so scrolling makes a few extra requests | Fine for the beta; can be optimised later |
| 7 | A vehicle's own page doesn't list the posts tagged with it yet | Nice-to-have follow-up |

## 5. Estimated ongoing costs

**Still €0.** Posts add photos to Supabase's free 1 GB storage (about 3,000
photos at ~300 KB). This is the first feature that will grow storage with real
users. Supabase Pro (~€23/month, 100 GB) will be needed for the beta, as
planned, and only with your approval.

## 6. How to try Milestone 3 on your phone

1. In Supabase, run the third migration (docs/SUPABASE-SETUP.md → "Milestone 3 update").
2. Start the app as before.
3. With two accounts:
   - Account A: Profile → **New post** → choose photos → caption → tag your
     car → **Share**.
   - Account B: open A's profile from search or the post, **Follow**, then
     check that A's post shows in the Home feed. Like it, comment, save it.
   - Make A private (Settings → Privacy), unfollow with B, and follow again.
     B now shows "Requested" and A sees **Follow requests (1)** on the profile.
