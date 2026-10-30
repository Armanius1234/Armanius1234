# Privacy and legal notes: for qualified review before public launch

**Status:** technical notes written by the developer. **This is not legal
advice.** A qualified lawyer or data-protection officer must review it before PL8
opens to the public. It is meant to make that review faster: it lists what the
app actually stores, where, for how long, and which questions are still open.

---

## 1. What PL8 stores

| Data | Where | Who can see it | Kept until |
|---|---|---|---|
| Email, password (hashed by Supabase Auth) | Supabase Auth | the user; the operator via the Supabase dashboard | account deletion |
| 18+ confirmation, accepted terms/privacy versions + time | `private.user_consents` | operator only | account deletion |
| Profile: username, display name, bio, profile picture | `profiles`, `avatars` bucket (**public** files) | everyone signed in (private profiles: limited) | account deletion |
| Settings: language, who may message, push on/off | `user_settings` | the user | account deletion |
| Vehicles + photos | `vehicles`, `vehicle-photos` (private, signed links) | according to visibility | account deletion |
| **License plate** (normalised text) | `private.plate_claims` | owner; others only if the owner made it findable | plate removal / account deletion |
| Verification evidence photos (live photos, challenge code) | `verification-evidence` (private) | owner + admins | **deleted right after the decision** |
| Posts, photos, comments, likes, saves | `posts`, `post-media` etc. | according to profile visibility | account deletion |
| Follows, follow requests, blocks | tables of the same name | the people involved (blocks: only the blocker) | account deletion |
| **Messages** | `messages` | the two participants; moderators see a reported message | account deletion (see §4.3) |
| In-app notifications | `notifications` | the recipient | 90 days after read, 180 days at most |
| Push tokens (device addresses for push) | `push_tokens` | the user | sign-out / account deletion |
| Push send log | `private.push_outbox` | operator only | 7 days |
| Plate search log (**hash** of the searched plate, found yes/no) | `private.search_log` | operator only | 30 days |
| Plate claim attempts (rate limiting) | `private.claim_log` | operator only | 30 days |
| Reports (who reported what, reason, decision) | `reports` | the reporter (own reports), moderators | 1 year after the decision |
| Moderator actions (decision, reason, who decided) | `private.admin_actions` | operator only | **no automatic deletion yet** (see §4.8) |
| Copy of reported content at the time of the report | `private.report_snapshots` | moderators | deleted together with the report (1 year after the decision) |
| Appeals (who appealed which decision, their explanation, the outcome and the moderator's answer) | `appeals` | the appellant; moderators | deleted together with the report (1 year after the decision) |
| Chats you deleted for yourself (which chat, when) | `private.hidden_conversations` | operator only | account deletion |
| Apple / Google sign-in data: email (Apple may give a private relay address), name if shared, provider account ID | Supabase Auth | the user; the operator | account deletion; **sign-ups that never give consent: 7 days** |

Clean-up runs every night (`private.run_retention()`, see
docs/SUPABASE-SETUP.md).

## 2. Service providers (processors) and data transfers

| Provider | What for | Data | Notes for review |
|---|---|---|---|
| **Supabase** | database, login, file storage, live updates | everything above | Choose an **EU region** (e.g. Frankfurt) when creating the project. Sign Supabase's DPA. |
| **Expo (650 Industries, USA)** | push delivery (Expo Push Service) and app builds | push token + push text (e.g. "Lena M. liked your post") | **Third-country transfer (USA).** Check Expo's DPA / SCCs / DPF status. Message pushes never contain the message text. |
| **Apple (APNs) / Google (FCM)** | delivering the push to the phone | push token + push text | standard for every app with push |
| Apple / Google sign-in (optional, off until set up) | signing in | email (and name, if the user shares it) | Apple and Google are usually **separate controllers** for their own sign-in. Please confirm and mention it in the privacy policy. |
| Supabase email (default sender) | sign-up and reset codes | email address | Replace with an EU email provider before launch (also for sending limits). |

No analytics, advertising or tracking SDKs are included. No crash-reporting
service is active (Sentry etc. would need approval and a review).

## 3. Rights of the user: what the app already does

| Right (GDPR) | In the app |
|---|---|
| Access + data portability (Art. 15, 20) | Settings → **Download my data**: a JSON file with profile, settings, consents, vehicles, plates, posts, comments, likes, follows, blocks, messages in the user's conversations (sent **and received**, marked "from me"), notifications, reports made, account email and dates. |
| Erasure (Art. 17) | Settings → **Delete account**: files deleted first, then all database rows and the login. Email accounts confirm with their password; Apple / Google accounts by typing their username. "Delete chat" only hides a chat for you: the messages stay with the other person and in your data export, because they are shared. |
| Rectification (Art. 16) | edit profile, vehicles, settings |
| Withdraw consent for push | Settings → Notifications, or the phone settings |
| Objection / restriction (Art. 18, 21) | **no self-service**: handled by email to the operator |

## 4. Open points that need a qualified decision

1. **DPIA (Art. 35).** PL8 links license plates (personal data in Germany) to
   profiles and makes them searchable on an opt-in basis. A data protection
   impact assessment is probably required. Please confirm.
2. **Other people's plates in photos.** Posts and vehicle photos can show the
   plates of uninvolved cars. Reporting ("shares private information, e.g.
   someone's plate") exists. Automatic blurring does not. Is that enough?
3. **Messages are not end-to-end encrypted.** They are encrypted in transit
   and stored in the database. Moderators see the text of a message that was
   reported to them. This must be stated clearly in the privacy policy.
4. **Deleted accounts in conversations.** Messages a deleted user sent stay
   visible to the other person, **without name or profile**. Please confirm this
   is acceptable or require full deletion.
5. **Received messages in the data export.** The export contains the text of
   messages the user received, which is the other person's data too
   (Art. 15(4)). Keep, or export only the user's own messages?
6. **Search log hashes.** A hash of a plate is pseudonymous, not anonymous,
   because there are few possible plates. It is kept 30 days for abuse
   prevention. Please confirm the legal basis (legitimate interest?) and duration.
7. **Age 18+** is a self-declaration with a checkbox. There is no age verification.
8. **EU Digital Services Act (DSA).** In place:
   - a notice-and-action flow (report button on every profile, post, comment,
     message and vehicle)
   - a **statement of reasons** to the affected person, for removals and
     suspensions (reason category and the moderator's note)
   - an **internal complaint system** (Art. 20): appeals in the app within
     6 months, by the affected person and by reporters whose report was found
     "no violation"; decided by a person, never by the same person who appealed;
     the result is sent with an explanation and a pointer to out-of-court
     settlement and courts
   - a log of every decision
   - **statistics** for transparency reporting (shareable CSV)
   Suspended accounts can still sign in, but only see the suspension, the
   appeal, data download and account deletion. Nobody else can see or reach
   them.
   **Not in place yet:**
   - a single point of contact (Art. 11/12).
   - terms that describe moderation and appeals.
   - the wording of the out-of-court settlement pointer.
   Deleted comments and messages cannot be restored after a successful appeal.
   Small companies may be exempt from some duties. Please check which apply.
9. **Moderator log** (`private.admin_actions`) has no deletion period yet.
   Please decide one, e.g. 3 years.
10. **Backups.** Deleted data can remain in Supabase backups for a limited
   time. Check the plan's backup retention and mention it in the privacy policy.
11. **Legal texts are placeholders.** These are still to be written:
    - privacy policy
    - terms of use
    - imprint (Impressum)
    - community rules

    The app shows version numbers that users accept at sign-up (terms
    `2026-10-draft`). Each new version must be accepted again.
12. **Being found by name.** Since Milestone 8, signed-in members can search
    people by username or display name. The search shows only what profiles
    already show: name, username, picture, private or not. Blocked, suspended
    and not-yet-consented accounts never appear. There is **no "don't show me
    in search" setting** yet. Please decide if one is needed. Name and car
    search have no rate limit; each search returns at most 50 results.
13. **Suggestions** ("followed by people you follow", "also drives a Porsche")
    use follow relationships and the makes of public cars. Nothing is shown
    that the person couldn't see anyway. Please confirm the legal basis
    (legitimate interest?) and whether an opt-out is needed.
14. **Sign in with Apple: revoking on deletion.** Apple requires that deleting
    an account also revokes the Apple sign-in. This needs a server function
    with an Apple key and is **not built yet**. It must be done before App Store
    submission if Apple sign-in is offered.
15. **Consent for social sign-ups** is collected in the app right after the
    Apple / Google step, not on the sign-up form. The database blocks the
    account until consent is given. Please confirm this order is acceptable.
16. **Company not founded / domain not confirmed.** These are still missing:
    - the controller's name and address
    - a contact email
    - the DPAs with providers (they must be signed by the company)
    - store listings

## 5. Security measures (summary for the privacy policy, Art. 32)

- Row-level security on every table. The app only has the public
  "publishable" key; no privileged key is in the app (checked automatically in
  CI).
- Verification evidence and reported photos are kept only in memory on the
  moderator's phone, never in its disk cache. Push messages carry only IDs,
  never texts or moderator notes.
- Locked accounts (suspended, or no consent yet) cannot upload files.
- Private files only through short-lived signed links. Evidence photos are
  visible only to the owner and admins.
- Sensitive tables live in a separate `private` schema that the app cannot reach.
- Rate limits on searches, plate claims, messages and reports.
- Blocking hides profiles, posts, comments, messages and notifications in both
  directions.
- 492 automated database checks, including a security audit (every table
  protected, no anonymous access, no unprotected functions).
