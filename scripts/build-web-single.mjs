// Builds the web version as ONE file: dist-web-single/index.html.
// JavaScript, fonts, icons and the browser icon are embedded; the two
// Supabase settings sit at the top of the file in a clearly marked block.
//
//   npm run build:web:single
//
// The file still has to be opened from a web address (upload it to your web
// space as index.html). See docs/WEB-VERSION.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'dist-web-single', '.export');
const out = join(root, 'dist-web-single', 'index.html');

rmSync(join(root, 'dist-web-single'), { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', tmp], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PL8_SINGLE_FILE: '1' },
});

const exported = readFileSync(join(tmp, 'index.html'), 'utf8');
const scripts = [...exported.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
if (scripts.length === 0) throw new Error('No scripts found in the exported index.html');

const MIME = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const dataUri = (file) => {
  const type = MIME[extname(file)];
  if (!type) throw new Error(`Unknown file type: ${file}`);
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
};

let embeddedAssets = 0;
const code = scripts.map((src) => {
  let js = readFileSync(join(tmp, src), 'utf8');
  // Fonts and icons are referenced as "/assets/…" strings: embed them.
  js = js.replace(/"(\/assets\/[^"]+)"/g, (whole, path) => {
    const file = join(tmp, decodeURI(path));
    if (!existsSync(file)) return whole;
    embeddedAssets += 1;
    return JSON.stringify(dataUri(file));
  });
  if (/\/_expo\/static\/js\//.test(js)) throw new Error(`${src} loads more script files; it cannot be embedded`);
  // "</script" inside the code would end the <script> element early.
  return js.replace(/<\/script/gi, '<\\/script');
});

// Runs before the app: reads the settings block, and if the page was opened as
// /index.html (or another .html name), shows it under "/" where the app starts.
const bootstrap = `(function () {
  try {
    var el = document.getElementById('pl8-config');
    window.PL8_CONFIG = JSON.parse(el ? el.textContent : '{}');
  } catch (e) {
    window.PL8_CONFIG = {};
  }
  if (/^https?:$/.test(location.protocol) && /\\.html?$/i.test(location.pathname)) {
    try { history.replaceState(null, '', '/' + location.search + location.hash); } catch (e) {}
  }
})();`;

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'self'",
  `script-src ${[bootstrap, ...code].map(sha).join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  'img-src \'self\' data: blob: https://*.supabase.co',
  "font-src 'self' data:",
  'connect-src \'self\' blob: data: https://*.supabase.co wss://*.supabase.co',
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const favicon = existsSync(join(root, 'assets/images/favicon.png')) ? dataUri(join(root, 'assets/images/favicon.png')) : '';
const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>PL8TE</title>
    <meta name="description" content="PL8TE – Turn your plate into a story." />
    <meta name="theme-color" content="#080B12" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    ${favicon ? `<link rel="icon" href="${favicon}" />` : ''}

    <!-- =====================================================================
         PL8TE SETTINGS: the connection to your Supabase project.
         Fill in the two PUBLIC values between the quotes, then save:
           supabaseUrl: Supabase -> Project Settings -> Data API -> Project URL
           supabaseKey: Supabase -> Project Settings -> API Keys -> Publishable key
         NEVER put the secret / service_role key here: anyone can read this file.
         ===================================================================== -->
    <script type="application/json" id="pl8-config">
{
  "supabaseUrl": "",
  "supabaseKey": ""
}
    </script>
    <!-- ===================== End of the settings ========================== -->

    <script>${bootstrap}</script>
    <style>
      html, body { height: 100%; background-color: #04060a; }
      body { overflow: hidden; }
      #root { display: flex; height: 100%; flex: 1; }
    </style>
  </head>
  <body>
    <noscript>PL8TE braucht JavaScript. / PL8TE needs JavaScript.</noscript>
    <div id="root"></div>
${code.map((js) => `    <script>${js}</script>`).join('\n')}
  </body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
rmSync(tmp, { recursive: true, force: true });

if (/sb_secret_[A-Za-z0-9_-]{10,}|service_role"?\s*[:=]\s*"?eyJ/.test(html)) {
  throw new Error('A privileged Supabase key was found in the output. Remove it from .env and rotate the key.');
}
console.log(`\nSingle-file web version: dist-web-single/index.html (${(html.length / 1024 / 1024).toFixed(1)} MB, ${scripts.length} scripts and ${embeddedAssets} fonts/icons embedded).`);
