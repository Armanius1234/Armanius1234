# Sign in with Google and Apple: setup

The app already contains both sign-in options. They stay **hidden** until you
set them up and switch them on, so nothing breaks in the meantime.

| | Google | Apple |
|---|---|---|
| Where it appears | iPhone and Android | iPhone only (Apple's own button) |
| Cost | **€0** | needs the **Apple Developer Program, €99 per year** (**ask first**) |
| Switch in `.env` | `EXPO_PUBLIC_AUTH_GOOGLE=on` | `EXPO_PUBLIC_AUTH_APPLE=on` |

> **App Store rule 4.8:** an iPhone app that offers Google sign-in must also
> offer Sign in with Apple. The app enforces this: on iPhone the Google button
> only appears when Apple is switched on too. On Android, Google works alone.

**What happens for a new user:** they tap "Continue with Google" or "Continue
with Apple". Next, PL8 asks them to confirm they are 18+ and accept the terms.
This step is **enforced by the database**: until it is done, the account can't
see or contact anyone and can't create a profile. Then the usual profile steps
follow. A sign-up that stops at the consent step is deleted automatically after
7 days.

---

## Before you start: one Supabase setting for both

Supabase → **Authentication → URL Configuration → Redirect URLs** → **Add URL**:

- `pl8://auth/callback` (the installed app)
- `exp://**` (only needed for testing in Expo Go)

Save.

## Google (free)

1. Open **console.cloud.google.com** and sign in with the company Google account.
   Create a project named "PL8".
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name **PL8**, support email, developer contact email.
   - Scopes: the default ones (email, profile, openid) are enough.
   - **Publish** the app. While it is in "Testing", only test users you add
     can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**. This is correct for an app too,
     because Supabase handles the sign-in.
   - Under **Authorized redirect URIs** add:
     `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
     (your project URL from `.env`, followed by `/auth/v1/callback`).
   - Create, then copy the **Client ID** and **Client secret**.
4. Supabase → **Authentication → Sign In / Providers → Google** → turn it on,
   paste the Client ID and Client secret, then Save.
5. In your `.env` set `EXPO_PUBLIC_AUTH_GOOGLE=on` and restart
   `npx expo start`. For beta builds, run the `env:push` commands from
   docs/BETA-DEPLOYMENT.md again.
6. **Test on Android first.** On iPhone the button stays hidden until Apple
   is on (rule 4.8 above).

The Client secret stays in Supabase only. It is **never** put in the app or
in `.env`.

## Apple (needs the Apple Developer Program, €99 per year: **ask first**)

Sign in with Apple uses the native Apple sheet (Face ID). No secret key is
needed for this.

1. Enroll in the Apple Developer Program (developer.apple.com).
2. Decide the **bundle identifier** first (docs/BETA-DEPLOYMENT.md, step 0),
   e.g. `com.yourcompany.pl8`. The first `eas build` for iOS registers it and
   switches on "Sign In with Apple" for it automatically. The capability is
   already in `app.json`.
3. Supabase → **Authentication → Sign In / Providers → Apple** → turn it on.
   - In **Client IDs**, enter your bundle identifier (e.g.
     `com.yourcompany.pl8`). To also test in Expo Go, add
     `host.exp.Exponent`, separated by a comma.
   - Leave the OAuth "Secret key" fields empty. They are only needed for
     Apple sign-in on websites or Android, which PL8 does not use.
   - Save.
4. In your `.env` set `EXPO_PUBLIC_AUTH_APPLE=on`, restart, and test on an
   iPhone.

### Required before App Store submission: revoking Apple sign-ins

When someone with an Apple sign-in deletes their PL8 account, Apple requires
the app to also **revoke** that sign-in at Apple. This needs a small server
function holding an Apple key. It is **not built yet** and is listed in the
Milestone 6 report. It is not needed for the beta.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Button doesn't appear | Check `.env` says exactly `on`, then restart the dev server. On iPhone, Google also needs Apple to be on. |
| Browser opens, then "redirect URL not allowed" | Add `pl8://auth/callback` (and `exp://**` for Expo Go) under Redirect URLs. |
| "Sign-in did not work" right after choosing the account | 1) Run the Milestone 6 database update (docs/SUPABASE-SETUP.md); without it the database refuses new Apple/Google accounts. 2) Check the Client ID and secret in Supabase, and the redirect URI in Google Cloud. Supabase → **Logs → Auth** shows the exact reason. |
| Apple: "Sign-in did not work" on iPhone | The bundle identifier in Supabase → Apple → Client IDs doesn't match the app's (or add `host.exp.Exponent` for Expo Go). |
