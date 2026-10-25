# Supabase setup (one-time, about 15 minutes, free)

PL8 uses Supabase for accounts, the database and photo storage. You only do
this once. Nothing here costs money: the **Free** plan is enough for development.

> Do not upgrade to a paid plan yet. Before the beta we will discuss Supabase Pro
> (about $25/month) for daily backups and no pausing.

## 1. Create the project

1. Go to <https://supabase.com> → **Start your project** → sign up (GitHub or email).
2. **New project**
   - Name: `pl8-dev`
   - Database password: click **Generate**, then save it in your password manager.
   - Region: **Central EU (Frankfurt)**. This keeps data in the EU (GDPR).
   - Plan: **Free**
3. Wait about 2 minutes until the project is ready.

## 2. Create the database tables and security rules

1. Left menu → **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/20261025120000_foundation.sql` from this
   repository, copy **everything**, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned".
4. Check: left menu → **Table Editor**. You should see `profiles`,
   `user_settings` and `blocks`, each marked "RLS enabled".
   Left menu → **Storage** should show an `avatars` bucket.

> Run each migration file only once, in date order. Future milestones add new
> files; you will run only the new ones.

### Milestone 2 update (vehicles, plates, search)

If you already ran the first file, run only the second one:

1. **SQL Editor → New query**, paste everything from
   `supabase/migrations/20261026090000_vehicle_identity.sql`, then click **Run**.
2. Check: **Table Editor** now also shows `vehicles` and `vehicle_images`.
   **Storage** shows two new **private** buckets: `vehicle-photos` and
   `verification-evidence`.

### Milestone 3 update (following, posts, feed)

Run only the third file: **SQL Editor → New query**, paste everything from
`supabase/migrations/20261027090000_social.sql`, then **Run**.
Check: **Table Editor** shows `follows`, `follow_requests`, `posts`,
`post_media`, `likes`, `comments`, `saved_posts`. **Storage** shows a new
**private** bucket `post-media`.

### Milestone 4 update (messaging)

Run only the fourth file: **SQL Editor → New query**, paste everything from
`supabase/migrations/20261028090000_messaging.sql`, then **Run**.
Check: **Table Editor** shows `conversations`, `conversation_participants`,
`messages`. Then **Database → Publications → supabase_realtime**: `messages`
should be switched on (the file does this; switch it on by hand if not).

### Milestone 5 update (notifications, reports, account deletion)

1. **Switch on two free extensions first:** **Database → Extensions**, search
   for **pg_net** and switch it on. Do the same for **pg_cron**. pg_net sends
   push notifications; pg_cron runs the nightly data clean-up. Both are
   included in the free plan.
2. Run the fifth file: **SQL Editor → New query**, paste everything from
   `supabase/migrations/20261029090000_beta_readiness.sql`, then **Run**.
3. Check:
   - **Table Editor** shows `notifications`, `push_tokens` and `reports`.
   - **Database → Publications → supabase_realtime**: `notifications` is on.
   - **Integrations → Cron** (or **Database → Cron Jobs**) lists `pl8-retention`.
4. If you ran the file **before** switching on the extensions, it still works,
   but the Results panel shows a notice such as "pg_cron not available". Then
   switch the extensions on and run only this part again:

   ```sql
   select cron.schedule('pl8-retention', '17 3 * * *', 'select private.run_retention()');
   ```

   Push notifications start working once pg_net is on. Nothing else needs to be
   run again.

What the nightly clean-up deletes (03:17 server time):

| Data | Kept for |
|---|---|
| Read notifications | 90 days (unread: 180 days) |
| Push send log | 7 days |
| Plate search log and claim log (hashed) | 30 days |
| Unfinished post drafts | 1 day |
| Unused verification codes | expire after 7 days |
| Closed reports (record of moderation decisions) | 1 year |

**Suspended accounts** can't sign in. To lift a suspension, paste this into the
SQL Editor, replace both emails and the reason, then **Run**. The change is
logged under your admin account:

```sql
do $$
declare
  target uuid := (select id from auth.users where email = 'USER-EMAIL@example.com');
  admin uuid := (select id from auth.users where email = 'YOUR-ADMIN-EMAIL@example.com');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.admin_unsuspend_user(target, 'Reason for lifting the suspension');
end $$;
```

Their cars become visible again, except any a moderator removed separately.

### Milestone 6 update (district codes, social sign-in, chats, moderation)

Run the sixth file: **SQL Editor → New query**, paste everything from
`supabase/migrations/20261030090000_store_prep.sql`, then **Run**. Run it
**before** switching on Google or Apple sign-in.

Check:

- `select count(*) from private.de_districts;` returns **727**.
- **Database → Cron Jobs**: `pl8-retention` is still there (the nightly
  clean-up function was updated).

**A German district code is missing?** New codes appear now and then. Until
the next app update, add it like this (replace `XYZ`), and tell the developer
so the app's list can be updated too:

```sql
insert into private.de_districts (code) values ('XYZ');
```

The database accepts the new code at once. The app also checks the code
before sending, so users with that code can claim their plate once the app's
list is updated in the next app release.

Suspended accounts can now be lifted in the app: Settings → Admin →
**Suspended accounts**. The SQL snippet in the Milestone 5 section still
works.

Google and Apple sign-in: see **docs/SOCIAL-LOGIN-SETUP.md**.

### Make yourself the reviewer (admin)

Plate verifications are approved by hand in the app. Give your own account the
admin role **after** you have registered in the app:

```sql
insert into private.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'YOUR-EMAIL@example.com';
```

Paste this into **SQL Editor**, replace the email, then **Run**. Restart the app.
**Settings → Admin → Verification review** now appears.

For safety, nobody can approve their own plate, including admins. To test the
full journey you need **two accounts**: one that claims a plate, and your admin
account that approves it.

## 3. Email sign-up settings

Left menu → **Authentication**:

1. **Sign In / Providers → Email**
   - Enable Email provider: **on**
   - Confirm email: **on**
   - Minimum password length: **10**
   - Save.
2. **Emails → Templates** (sometimes under *Authentication → Email Templates*).
   PL8 uses **6-digit codes** instead of links, because codes work reliably in
   the test app. Replace two templates:

   **Confirm signup**: subject `Your PL8 code`, body:

   ```html
   <h2>Welcome to PL8</h2>
   <p>Your confirmation code is:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Enter it in the PL8 app. If you did not sign up, ignore this email.</p>
   ```

   **Reset password**: subject `Your PL8 password reset code`, body:

   ```html
   <h2>Reset your PL8 password</h2>
   <p>Your reset code is:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>If you did not ask for this, ignore this email. Your password stays the same.</p>
   ```

3. **Rate limits**: leave the defaults.

### Important: email sending limits on the free setup

Supabase's built-in email is for testing only. It sends to a small number of
addresses per hour, and may only deliver to email addresses of members of your
Supabase organization. For your own testing that is fine. Before inviting beta
testers we will connect a free email service (Resend, 3,000 emails/month free),
and I will ask for your approval first.

## 4. Copy the two public keys into the app

1. Left menu → **Project Settings** → **API Keys**.
   Copy the **Publishable key** (starts with `sb_publishable_`).
   If you only see "anon" and "service_role", copy **anon**.
2. **Project Settings → Data API** (or the project home page): copy the
   **Project URL** (`https://xxxx.supabase.co`).
3. In the project folder, copy `.env.example` to `.env` and fill in:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_...
   ```

⚠️ **Never** use the `service_role` / **secret** key in the app or in `.env`.
The app refuses to start if you do, and CI blocks it from being committed.

## 5. Free-plan behaviour to know

- A free project **pauses after 7 days without activity**. Open the Supabase
  dashboard and click **Restore** if that happens. No data is lost.
- Free projects have **no automatic backups**. Do not store real user data
  until we move to Pro before the beta.
