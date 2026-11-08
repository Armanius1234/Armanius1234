# First real test: web version + your Supabase project

So far the web version has been tested in a browser against a **mocked**
Supabase project. This checklist is the first test with **your real project**.
It takes about 30 minutes. Tick each line. If one fails, send the developer a
screenshot and the step number.

You need:
- your Supabase project with **all 9 files** from `supabase/migrations/` run
  in date order (docs/SUPABASE-SETUP.md)
- the web version uploaded and `pl8-config.js` filled in (docs/WEB-VERSION.md)
- your phone with the PL8 app (Expo Go, see README)
- two email addresses you can read. Supabase's test email only reaches
  members of your Supabase team, so invite the second address under
  **Organization → Team**.

## A. Web version, first account

| # | Do this | Expected |
|---|---|---|
| A1 | Open `https://app.your-domain.de` | PL8 welcome screen, padlock (HTTPS) in the address bar |
| A2 | Reload the page on `https://app.your-domain.de/login` | The login screen again (not "Not found") |
| A3 | **Register** with email 1, confirm 18+ and the terms | "Enter the code" screen |
| A4 | Enter the 6-digit code from the email | Choose a username |
| A5 | Choose a username and display name | Home feed (empty) |
| A6 | **+** → choose a photo from your computer → caption → **Share** | The post appears in your feed and on your profile |
| A7 | Settings → **Privacy** | "Being found" with two switches, both on |
| A8 | Settings → **Download my data** | A file `pl8-data-<date>.json` is downloaded |

## B. Phone app, second account

| # | Do this | Expected |
|---|---|---|
| B1 | Register with email 2 in the app on your phone | Home feed |
| B2 | Search → **People** → type 2 letters of account 1's name | Account 1 is found |
| B3 | Follow account 1 and send a message | Sent |
| B4 | Comment on account 1's post and mention it: `@username` | Sent |

## C. Back in the browser (account 1)

| # | Do this | Expected |
|---|---|---|
| C1 | Look at the bell (notifications) | New follower, comment, mention |
| C2 | Messages → open the chat → reply | The reply appears on the phone |
| C3 | Settings → Privacy → switch off **"Show me in people search"** | Saved (switch stays off after reloading the page) |
| C4 | On the phone: Search → People → search account 1 again | **Not found** any more |
| C5 | Switch it back on in the browser, search again on the phone | Found again |

## D. Admin and verification

| # | Do this | Expected |
|---|---|---|
| D1 | Make account 1 the admin (docs/SUPABASE-SETUP.md, "Make yourself the reviewer"). Reload the page. | Settings → **Admin** appears |
| D2 | On the phone (account 2): add a car, claim a plate, take the verification photos, submit | "Submitted" |
| D3 | In the browser (account 1): Settings → Admin → **Verification review** | The request with the photos and the code |
| D4 | Approve it | Account 2 gets "verified" on the phone |
| D5 | In the browser: add a car and claim a plate, then open the verification step | "Verify on your phone" (on purpose) |

## E. Finish

| # | Do this | Expected |
|---|---|---|
| E1 | Settings → **Log out** in the browser | Welcome screen; reloading stays logged out |
| E2 | Try the web version on your phone's browser too (Safari / Chrome) | Same as on the computer |

When everything is ticked, the web version works with your project. Tell the
developer which lines failed, if any.
