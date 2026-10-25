# Beta deployment: put PL8 on testers' phones

This guide gets a real, installable PL8 app onto test phones. Unlike Expo Go, an
installed build supports **push notifications**.

Everything here is done from your computer's terminal, inside the project
folder. Expo's build servers do the heavy work, so you don't need Xcode or
Android Studio.

| | Android | iPhone |
|---|---|---|
| What testers get | An APK file they install from a link | An app installed from a link (registered devices only) |
| Accounts needed | Free Expo account | Free Expo account **+ Apple Developer Program** |
| Cost | **€0** | **€99 per year** (Apple), **needs your approval first** |
| Push notifications | Yes | Yes |

> **Paid services:** nothing in this guide costs money unless you choose the
> iPhone path, which needs the Apple Developer Program (€99 per year). Don't
> sign up until you have decided to; Android testing works without it.

---

## 0. Decide two things first (they can't be changed later)

1. **App ID (bundle identifier / package name).** Stores use this to tell your
   app apart from all others. It is usually your domain written backwards plus
   the app name, e.g. `com.yourcompany.pl8`.
   Your company and domain are not confirmed yet, so this was left empty on
   purpose. EAS asks for it the first time you build. Use the same value for
   Android and iOS. **Once testers or stores have the app, it can't be
   changed.**
2. **Expo account owner.** Create the Expo account with a company email you
   will keep (not a personal one), because the app's push credentials live there.

## 1. One-time setup (about 10 minutes, free)

1. Create a free account at **expo.dev** (Sign up).
2. In the project folder, log in:
   ```bash
   npx eas-cli@latest login
   ```
3. Link the project to your Expo account:
   ```bash
   npx eas-cli@latest init
   ```
   This adds a project ID to `app.json` (`extra.eas.projectId`). **Push
   notifications need this ID.** Commit the change.
4. Give the cloud builds your two **public** Supabase values. Builds run on
   Expo's servers and can't see your local `.env` file, so push it to EAS once
   per build type:
   ```bash
   npx eas-cli@latest env:push preview --path .env
   npx eas-cli@latest env:push production --path .env
   ```
   Your `.env` contains only public values: `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_KEY` (the **publishable** key) and, once set up, the
   sign-in switches `EXPO_PUBLIC_AUTH_GOOGLE` / `EXPO_PUBLIC_AUTH_APPLE`
   (docs/SOCIAL-LOGIN-SETUP.md). **Never** put the Supabase secret or
   service-role key there. The app refuses to start if you do.

## 2. Android beta (free)

```bash
npx eas-cli@latest build --platform android --profile preview
```

- The first time, EAS asks for the Android package name (see step 0), then
  creates an Android signing key and stores it for you. Answer **Yes**.
- The build takes about 10–25 minutes. On the free plan it may wait in a queue
  first.
- When it finishes you get a **link and a QR code**. Send the link to testers.
  They open it on their Android phone, download the APK and allow "install from
  this source" when asked.

## 3. iPhone beta (needs Apple Developer Program, €99 per year, **ask first**)

Only after you have approved the cost and enrolled at developer.apple.com:

1. Register each tester's iPhone (they open a link on the phone):
   ```bash
   npx eas-cli@latest device:create
   ```
2. Build:
   ```bash
   npx eas-cli@latest build --platform ios --profile preview
   ```
   EAS asks you to sign in with your Apple account and creates the
   certificates, including the push notification key, for you.
3. Send the resulting link to testers.

Later, for a larger iPhone beta without registering devices, use **TestFlight**:
build with `--profile production`, then `npx eas-cli@latest submit --platform ios`.
This needs the same Apple membership and an App Store Connect app entry.

## 4. Check that push notifications work

1. Install the beta build on a real phone and sign in.
2. Open **Notifications** (the bell on Home) and tap **Turn on**, or go to
   Settings → Notifications.
3. From a second account, follow or like a post of the first account. Within a
   few seconds a push arrives on the first phone.

If no push arrives:

- In Supabase, check that **pg_net** is enabled (Database → Extensions).
- Check that `app.json` has `extra.eas.projectId` (step 1.3) and that you built
  **after** running `eas init`.
- On iPhone, check Settings → PL8 → Notifications.

Message pushes never contain the message text. They only say that a new
message arrived.

## 5. Updating the beta

Run the same build command again. EAS counts up the build number
automatically. Testers install the new link over the old app; their data stays
because it lives in Supabase.

## 6. Production / store release (later, not part of the beta)

- **Google Play:** Google Play Console, **$25 once**, needs your approval.
  Then `npx eas-cli@latest build --platform android --profile production` and
  `npx eas-cli@latest submit --platform android`.
- **App Store:** Apple Developer Program (above), then build with
  `--profile production` and submit.
- Both stores need: a privacy policy URL, support contact, age rating (PL8 is
  18+), screenshots, and answers about data collection. The legal texts must be
  reviewed by a lawyer first (see `docs/PRIVACY-NOTES.md`).
