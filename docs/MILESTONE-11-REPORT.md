# Milestone 11 — PL8TE design and Windows IIS: report

Scope (your request): everything from Milestones 1–10 as a package that a
Windows 11 PC opens with IIS alone, in the look of your four brand images.

## 1. What was done

**Name and look, based on your images**
- **Name:** PL8TE everywhere in the app (German and English texts, app name,
  browser title).
  - Unchanged: the internal project name (`pl8`) and the verification code
    format `PL8-XXXX`, which the database creates.
- **Logo:** "PL8TE" in a heavy slanted font with a blue, glowing "8", in a
  plate frame. The font is Exo 2 ExtraBold Italic, free under the Open Font
  License; it replaces Orbitron.
- **Slogans:** "Turn your plate into a story." and "Driven to connect.", plus
  the row "Connect drivers / Discover cars / Build a community".
- **Start screen:** your car picture (image 2) as the background, fading into
  black, with the logo, slogan, "Registrieren" (blue) and "Anmelden" (dark).
  The connection screen uses the same look.
- **Wide screens:** the app is a centred column over the blurred car picture.
- **Profile, like image 1:**
  - your car photo as the cover
  - the plate with a blue check (only on your own profile; others see
    "Verified car", because plates stay private)
  - name, @username and car (e.g. "BMW M2 G87"), place
  - Follower / Following / Posts in that order
  - "Folgen" (blue) and "Nachricht"
  - social icons and the photo grid
- **Fixed on the way:** in the web version, pictures were sized by the whole
  browser window instead of the app column, at 4 places (post photos, photo
  grid, car photos, admin review). The grid showed one photo at two thirds of
  the width. A browser test now checks it.

**Windows IIS** (`npm run build:web:iis` → `dist-web-iis/`)
- **`website/`**: copy this into `C:\inetpub\wwwroot`.
  - **`index.html`**: the whole app in one file.
  - **`web.config`**: start page, addresses like `/settings` answered with the
    app, and security headers.
  - It only uses IIS features that are on by default. No URL Rewrite, no
    Node.js, no ASP.NET, no other programs.
- **`Einrichtung/`**: German guide `LIESMICH-IIS.txt` (switch on IIS, copy,
  connect), the Supabase quick start and the database in one file.
- **Connecting:** on `http://localhost`, PL8TE asks for the two Supabase values
  (from Milestone 10). For other devices, they go into the block at the top of
  `index.html`.

**Not part of this milestone:** the **3D garage** from image 4 (360° car,
paint, rims, body kit, Market). It needs licensed 3D car models and your
product decisions. It can come as its own milestone.

## 2. Tests performed and results (actually executed)

| Check | Result |
|---|---|
| TypeScript strict, lint | ✅ 0 errors; lint output checked, no warnings |
| App tests | ✅ **274 / 274 passed** (10 updated for the new name and slogan) |
| Database tests | ✅ **506 / 506 passed** (database unchanged) |
| Browser tests, website version | ✅ **18 / 18** (1 new: grid inside the column on wide screens) |
| Browser tests, single file | ✅ **20 / 20** |
| **IIS package** | ✅ all package checks (only `index.html` + `web.config`, no extra IIS modules, no outside files, no secret key) + **20 / 20** browser tests on exactly this `index.html` |
| Package for a computer (starter) | ✅ **8 / 8** |
| Visual check | ✅ screenshots of the start screen, profile and connection screen, on phone and desktop width |

**Not tested:**
- **IIS itself.** The test machine runs Linux; the test server copies the rules
  of `web.config` (start page, unknown addresses → `index.html`).
  - The `web.config` only uses sections that standard IIS allows in a site.
  - If IIS still answers "HTTP 500.19", deleting `web.config` keeps the app
    working. Only reloading an inner page then shows "Not found".
- **A mutation check for the grid fix.** The new test passes, but it was not
  checked against the old, broken code.

## 3. Open points

| # | Item | Plan |
|---|---|---|
| 1 | **Brand images show a BMW and its logo.** The background picture is your image 2. Using a car brand's logo in your own app or advertising can infringe trademark rights. | Lawyer, or a picture without a logo |
| 2 | **Name "PL8TE":** check it is free as a trademark and domain before launch | You / lawyer |
| 3 | 3D garage, Market, Community (image 4) | Your product decisions, then its own milestone |
| 4 | A Supabase project is still needed for accounts and data (free): docs/SUPABASE-SCHNELLSTART.md | You (about 15 minutes) |
| 5 | Earlier open points unchanged (company, legal texts, store accounts, …) | Your decisions |

## 4. Costs

**€0.** IIS is part of Windows 11, Supabase Free costs nothing, and the font is
free.
