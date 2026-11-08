# PL8 web version

PL8 also runs in the browser, built from **the same code** as the phone app.
It uses the same Supabase project, the same accounts and the same security
rules. The finished web version is a folder of HTML, JavaScript and image
files that you upload to your web space (for example IONOS web hosting).

## 1. What is different in the browser

| Feature | Web version |
|---|---|
| Sign up, log in, feed, posts, comments, likes, saves, follows, messages, notifications list, search (plate, people, cars), suggestions, @mentions, garage, reports, appeals, settings, data download, account deletion, admin screens | ✅ same as the app |
| **Plate verification** (live photos with the challenge code) | ❌ **phone app only.** A browser could upload any picture. Claiming a plate works on the web; the screen then asks to continue on the phone. |
| Push notifications | ❌ phone app only. New notifications still appear in the app's notification list. |
| Sign in with Apple / Google | ❌ not offered on the web (not set up yet; email and password work) |
| "Download my data", statistics CSV | downloads a file instead of opening the share sheet |
| Wide screens | the app is shown as a centred column, like on a phone |

## 2. Build it

The finished files are made with one command (Node.js 22 and `npm ci` as in
the README):

```bash
npm run build:web
```

The result is the folder **`dist-web/`** (about 90 files, 5 MB):

| File | What it is |
|---|---|
| `index.html` | the start page |
| `pl8-config.js` | **the connection to your Supabase project**: the only file you edit |
| `.htaccess` | settings for the web server. It is a hidden file because its name starts with a dot. It must be uploaded too. |
| `_expo/`, `assets/` | the app itself (JavaScript, fonts, icons) |
| `favicon.ico`, `metadata.json` | browser icon, build info |

If a `.env` file with the Supabase values exists when you build, those values
are built in and `pl8-config.js` is ignored.

## 3. Put it online (IONOS web hosting)

The names of menu items in your IONOS account may differ slightly.

1. **Choose an address.**
   - The web version must sit at the **top level of a domain or subdomain**,
     for example `https://app.your-domain.de`.
   - It doesn't work in a sub-folder such as `https://your-domain.de/pl8/`.
   - In IONOS, create a subdomain (e.g. `app`), and let it point to a new,
     empty folder on your web space (e.g. `/pl8-app`).
2. **Switch on HTTPS** for that subdomain. An SSL certificate is included with
   IONOS hosting. The web version needs HTTPS.
3. **Upload** everything *inside* `dist-web/` into that folder:
   - use the IONOS web space file manager, or an SFTP program such as
     FileZilla
   - upload the folders `_expo` and `assets` as they are
   - **upload the hidden `.htaccess` too.** In FileZilla, switch on
     *Server → Force showing hidden files*.
4. **Fill in `pl8-config.js`** on the web space (in the file manager's editor,
   or with Notepad before uploading):

   ```js
   window.PL8_CONFIG = {
     supabaseUrl: 'https://abcdefghijkl.supabase.co',
     supabaseKey: 'sb_publishable_...',
   };
   ```

   Both values are public; you find them in Supabase under **Project Settings
   → Data API** (Project URL) and **API Keys** (Publishable key).
   ⚠️ **Never** put the secret / service_role key here: anyone can read this file.
5. Open `https://app.your-domain.de`. You should see the PL8 welcome screen.

Nothing has to be changed in Supabase. Sign-up and password reset use 6-digit
codes, which work the same in the browser.

**Costs:** none, if your IONOS package already includes web space and a free
subdomain. Do not book anything extra without checking with the developer
first.

## 4. Updating

Build again (`npm run build:web`) and upload the new files. Keep your filled-in
`pl8-config.js` (don't overwrite it with the empty one), or fill it in again.
Old files in `_expo/` can be deleted: each build gets new file names.

## 5. Troubleshooting

| What you see | Cause and fix |
|---|---|
| "Backend not configured" | `pl8-config.js` is empty or has a typo. Fix it and reload the page. |
| A blank page | The files are in a sub-folder of the address, or `pl8-config.js` / the `_expo` folder is missing. The address must lead straight to the folder that contains `index.html`. |
| The start page works, but reloading another page (e.g. `/settings`) shows "Not found" | `.htaccess` was not uploaded (it is hidden). |
| Double-clicking `index.html` on your computer shows a blank page | Normal: browsers only run the app from a web address (`https://…`), not from a file on your disk. The same applies to online HTML editors and website builders: the app is a set of files and needs a web server. |
| Photos or data don't load and you use your own Supabase domain | Add that domain to the `Content-Security-Policy` line in `index.html` (`img-src` and `connect-src`). |

## 6. Security and privacy notes

- **Content Security Policy:** the page only runs scripts from its own address
  and only talks to Supabase. `.htaccess` also blocks other websites from
  showing PL8 in a frame.
- **Login session:** kept in the browser's storage for this website, like most
  sites that use Supabase. On shared computers, people should log out.
- **Photos:** resized and re-encoded in the browser before upload. Metadata
  such as GPS location is not uploaded, the same as in the app.
- **Verification photos and reported photos** are shown to admins without
  being stored in the browser cache.
- **The hosting provider** (e.g. IONOS) processes visitors' IP addresses in
  its server logs. It must be listed in the privacy policy. See
  docs/PRIVACY-NOTES.md.

## 7. Testing

```bash
npm run build:web
npm run test:web   # opens the built site in Chromium with a mocked Supabase project
```

CI runs both on every push.
