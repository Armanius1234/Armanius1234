// Puts the single-file web version together with the starter for testing on
// a computer: dist-web-local/ = index.html + "PL8 starten.bat" + pl8-server.js
// + LIESMICH.txt.  Run via: npm run build:web:local
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const single = join(root, 'dist-web-single', 'index.html');
if (!existsSync(single)) throw new Error('dist-web-single/index.html is missing: run npm run build:web:single first');

const out = join(root, 'dist-web-local');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(single, join(out, 'index.html'));
for (const f of ['pl8-server.js', 'PL8 starten.bat', 'LIESMICH.txt']) copyFileSync(join(root, 'scripts', 'local', f), join(out, f));
console.log('Ready: dist-web-local/ (index.html, PL8 starten.bat, pl8-server.js, LIESMICH.txt)');
