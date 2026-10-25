# Milestone 4 — Messaging: report

Status: **complete, awaiting founder approval.** Milestone 5 (beta readiness) has not been started.

## 1. Features completed

- **One-to-one conversations**: one conversation per pair of people. Opened
  with the **Message** button on a profile, or from a PL8 Search result when
  the owner chose to show their profile (next to **Follow**).
- **Message requests**: messages from people you don't follow arrive under
  **Messages → Requests**.
  - The sender can send **one** message until you accept. They see "Request
    sent…".
  - You can **Accept**, **Decline** or **Block**. Replying also accepts.
  - After a decline the sender cannot write again or open a new request.
  - People you follow land directly in your chats.
- **"Who can message me" is now enforced** on the server (Settings → Privacy):
  everyone (as requests) / only people I follow / nobody.
- **Live messages**: new messages appear instantly in the chat and the inbox
  (Supabase Realtime). Realtime applies the same access rules, so only the two
  people in a conversation receive its messages. The app also refreshes when
  it comes back to the foreground.
- **Unread counts**: per conversation, plus a blue badge on the Messages tab
  that also counts requests. Opening a chat marks it as read. Your last
  message shows **Seen** once the other person has read it.
- **Unsend**: long-press your own message.
- **Blocking**: from the chat header. A blocked conversation disappears for
  both people; neither side can read it, send, or start a new one.
- **Profile tab badge** for pending follow requests.
- **Spam limits**: 30 messages per minute and 20 new conversations per day.
- **Privacy**:
  - Message rows can't be written directly; every send goes through a checked
    server function.
  - Outsiders can't even see who is talking to whom.
  - Deleting an account removes the person and anonymizes their messages for
    the other side.
  - Messages are **not end-to-end encrypted**. They are protected by access
    rules, and the privacy policy must say so.
- The last "coming soon" placeholder screens are gone: every tab now works.

## 2. Files created or modified

```
supabase/migrations/20261028090000_messaging.sql     (new)
supabase/tests/04_messaging.test.sql                 (new: 40 checks)
supabase/tests/_shim.sql                             (realtime publication)
src/features/messaging/{api.ts,MessageButton.tsx}    (new)
src/app/(tabs)/messages.tsx                          (inbox: Chats | Requests)
src/app/chat/[id].tsx                                (new: chat screen)
src/app/(tabs)/_layout.tsx                           (badges + live subscription)
src/app/(tabs)/search.tsx, src/features/social/ProfileBody.tsx   (Message buttons)
src/app/_layout.tsx                                  (chat route, refresh on foreground)
src/lib/database.types.ts, src/lib/errors.ts, src/i18n/{en,de}.ts
src/features/placeholder/ComingSoon.tsx              (removed — no placeholders left)
src/__tests__/messaging.test.tsx                     (new)
docs/MILESTONE-4-REPORT.md, docs/SUPABASE-SETUP.md, README.md
```

## 3. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict | ✅ 0 errors |
| Lint | ✅ 0 errors, 0 warnings |
| App tests | ✅ **132 / 132 passed** (8 suites; 11 new) |
| Database tests | ✅ **291 / 291 passed** (40 new) |
| Mutation check | removed the blocking rule from conversation access → tests failed as expected |
| iOS + Android bundles | ✅ both built |
| Visual check | inbox row with unread badge, request banner, chat bubbles, "Seen" |

The database tests cover:

- **Requests:** one message per request, decline closes it for good, replying
  accepts, and the sender can't answer their own request.
- **"Who can message me":** all three settings.
- **People you follow:** their messages skip the request step.
- **Outsiders:** can't read, send, open, or see participants. Anonymous users
  get nothing.
- **Direct writes:** no inserting messages or changing status directly.
- **Unread:** counts, "mark as read", requests not counted in the badge.
- **Unsend:** only your own messages.
- **Blocking:** hides the conversation and stops reading, sending and new
  conversations.
- **Limits:** 30 messages per minute.
- **Live updates:** messages are switched on for realtime.
- **Account deletion:** anonymizes that person's messages.

**Not tested yet:** live delivery between two real phones. Realtime needs a
running Supabase project. The access rules it relies on are tested above.

## 4. Remaining issues and open points

| # | Item | Plan |
|---|---|---|
| 1 | No push notifications for new messages yet (only in-app badges) | Milestone 5 |
| 2 | No "report message / report user" yet (blocking is in) | Milestone 5 |
| 3 | Text only: no photos in chat | Later, if wanted |
| 4 | You can't delete a whole conversation for yourself (only unsend messages or block) | Small follow-up |
| 5 | Messages are not end-to-end encrypted | Must be stated in the privacy policy; E2E is a large project for later |
| 6 | One live connection per signed-in phone. The free Supabase plan allows 200 at the same time | Enough for the beta; Pro allows 500 |

## 5. Estimated ongoing costs

**Still €0.** Realtime is included in Supabase Free (200 connections at once,
2 million messages per month). Messages are small text rows and use almost no
storage.

## 6. How to try Milestone 4 on your phone

1. In Supabase, run the fourth migration (docs/SUPABASE-SETUP.md → "Milestone 4 update").
2. With two accounts that don't follow each other:
   - Account B opens A's profile → **Message** → sends "Hi".
   - Account A sees a blue badge on the Messages tab, opens **Requests (1)**,
     then **Accept**.
   - Chat back and forth: messages appear live, and **Seen** shows under the
     last message.
3. Settings → Privacy → "Who can send you message requests?" → **Nobody**, then
   check that a third account can no longer start a chat.
