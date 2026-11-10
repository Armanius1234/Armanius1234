// Checks the IIS package (dist-web-iis/) without IIS: the right files, a
// web.config that needs no extra IIS modules, and a self-contained index.html.
// The app itself is then tested in a browser by run.mjs on the same index.html.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist-web-iis');
let failed = 0;
const check = (ok, name) => {
  console.log(`   ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed += 1;
};

console.log(`▸ IIS package: ${dir}`);
const site = readdirSync(join(dir, 'website')).sort();
check(JSON.stringify(site) === JSON.stringify(['index.html', 'web.config']), `website/ holds only index.html and web.config (${site})`);
const setup = readdirSync(join(dir, 'Einrichtung')).sort();
check(['LIESMICH-IIS.txt', 'PL8-Datenbank-komplett.sql', 'SUPABASE-SCHNELLSTART.md'].every((f) => setup.includes(f)), 'Einrichtung/ holds the guide and the database file');

const config = readFileSync(join(dir, 'website', 'web.config'), 'utf8');
check(/<defaultDocument[\s\S]*<add value="index.html" \/>/.test(config), 'web.config: index.html is the start page');
check(/<error statusCode="404" path="\/index.html" responseMode="ExecuteURL" \/>/.test(config), 'web.config: app addresses are answered with index.html');
// Sections that need extra modules or are locked by default would break the site (HTTP 500.19).
check(!/<(rewrite|handlers|modules|httpCompression|httpLogging|security)\b/.test(config), 'web.config: no extra IIS modules or locked sections');
check(!/defaultPath|allowAbsolutePathsWhenDelegated/.test(config), 'web.config: no locked httpErrors attributes');

const html = readFileSync(join(dir, 'website', 'index.html'), 'utf8');
check(!/\s(src|href)="\/(?!\/)/.test(html), 'index.html loads no other files from the server');
check(html.includes('id="pl8-config"') && html.includes('PL8TE SETTINGS'), 'index.html has the settings block');
check(!/sb_secret_[A-Za-z0-9_-]{10,}|service_role"?\s*[:=]\s*"?eyJ/.test(html), 'index.html contains no secret key');

console.log(`\nIIS package checks: ${failed ? `${failed} failed` : 'all passed'}`);
process.exit(failed ? 1 : 0);
