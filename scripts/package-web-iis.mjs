// The IIS package: dist-web-iis/
//   website/      -> copy into the IIS site folder (e.g. C:\inetpub\wwwroot)
//                    index.html (single-file app) + web.config
//   Einrichtung/  -> setup help, NOT for the web folder
//                    LIESMICH-IIS.txt, SUPABASE-SCHNELLSTART.md, PL8-Datenbank-komplett.sql
// Run via: npm run build:web:iis
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const single = join(root, 'dist-web-single', 'index.html');
if (!existsSync(single)) throw new Error('dist-web-single/index.html is missing: run npm run build:web:single first');

const out = join(root, 'dist-web-iis');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'website'), { recursive: true });
mkdirSync(join(out, 'Einrichtung'), { recursive: true });
copyFileSync(single, join(out, 'website', 'index.html'));
copyFileSync(join(root, 'scripts', 'iis', 'web.config'), join(out, 'website', 'web.config'));
execFileSync(process.execPath, [join(root, 'scripts', 'combine-migrations.mjs')], { stdio: 'inherit' });
copyFileSync(join(root, 'dist-sql', 'PL8-Datenbank-komplett.sql'), join(out, 'Einrichtung', 'PL8-Datenbank-komplett.sql'));
copyFileSync(join(root, 'docs', 'SUPABASE-SCHNELLSTART.md'), join(out, 'Einrichtung', 'SUPABASE-SCHNELLSTART.md'));
copyFileSync(join(root, 'scripts', 'iis', 'LIESMICH-IIS.txt'), join(out, 'Einrichtung', 'LIESMICH-IIS.txt'));
console.log('Ready: dist-web-iis/website (index.html, web.config) and dist-web-iis/Einrichtung');
