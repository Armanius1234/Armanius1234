// Browser test for the package that runs PL8 on a computer (dist-web-local/:
// index.html + pl8-server.js + "PL8 starten.bat"). Starts the real starter
// server, then uses the app on http://localhost like a person would.
//
//   npm run build:web:local && npm run test:web:local
import { spawn } from 'node:child_process';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { assert, check, KEY, mockSupabase, results, signIn, SUPABASE, watchConsole } from './mock-supabase.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist-web-local');
const PORT = 18080;
const running = [];

function startStarter(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(DIR, 'pl8-server.js')], {
      env: { ...process.env, PORT: String(port), PL8_NO_BROWSER: '1' },
    });
    running.push(child);
    let out = '';
    const timer = setTimeout(() => reject(new Error(`no address printed:\n${out}`)), 10000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve({ child, port: Number(m[1]), out });
      }
    });
    child.stderr.on('data', (d) => (out += d));
  });
}

function get(host, port, path) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', (e) => resolve({ error: e.code }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  console.log(`▸ PL8 on a computer (starter + index.html): ${DIR}`);
  const first = await startStarter(PORT);

  await check('the starter runs and prints the address to open', async () => {
    assert(first.port === PORT, `port ${first.port}`);
    assert(/PL8 laeuft auf diesem Computer/.test(first.out), first.out);
  });

  await check('it serves the app, also for inner pages, and not its own files', async () => {
    const home = await get('127.0.0.1', PORT, '/');
    assert(home.status === 200 && /text\/html/.test(home.type) && home.body.includes('PL8 SETTINGS'), 'home');
    const inner = await get('127.0.0.1', PORT, '/settings/privacy');
    assert(inner.status === 200 && inner.body.includes('PL8 SETTINGS'), 'inner page');
    const missing = await get('127.0.0.1', PORT, '/_expo/static/js/web/missing.js');
    assert(missing.status === 404, `missing app file: ${missing.status}`);
    const own = await get('127.0.0.1', PORT, '/pl8-server.js');
    assert(!own.body.includes('createServer'), 'the server script was served');
    const sql = await get('127.0.0.1', PORT, '/PL8-Datenbank-komplett.sql');
    assert(!sql.body.includes('create table'), 'the database file was served');
    const escape = await get('127.0.0.1', PORT, '/..%2f..%2fpackage.json');
    assert(!escape.body.includes('"dependencies"'), 'a file outside the folder was served');
  });

  await check('only this computer can connect (not the network)', async () => {
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((a) => a && a.family === 'IPv4' && !a.internal);
    if (!lan) return; // no network card in this test machine: nothing to check
    const res = await get(lan.address, PORT, '/');
    assert(res.error, `reachable from the network address ${lan.address}`);
  });

  await check('if the port is taken, it picks the next free one', async () => {
    const second = await startStarter(PORT);
    assert(second.port === PORT + 1, `second port ${second.port}`);
    second.child.kill();
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
  const problems = watchConsole(page);
  await mockSupabase(page);
  const base = `http://localhost:${PORT}`;

  await check('first start: PL8 asks for the Supabase values and connects', async () => {
    await page.goto(base);
    await page.getByText('PL8 auf diesem Computer testen').waitFor({ timeout: 15000 });
    await page.getByLabel('Project URL').fill(SUPABASE);
    await page.getByLabel('Publishable Key').fill(KEY);
    await page.getByRole('button', { name: 'Verbinden' }).click();
    await page.getByText('Lokale Verbindung: pl8test.supabase.co').waitFor({ timeout: 15000 });
  });

  await check('signing in works, and reloading an inner page keeps working', async () => {
    await signIn(page, base);
    await page.goto(`${base}/settings`);
    await page.getByRole('button', { name: 'Meine Daten herunterladen' }).waitFor({ timeout: 15000 });
    await page.reload();
    await page.getByRole('button', { name: 'Meine Daten herunterladen' }).waitFor({ timeout: 15000 });
  });

  await check('"Change" on the welcome screen removes the saved values', async () => {
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('alert').getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('button', { name: 'Ändern' }).click();
    await page.getByText('PL8 auf diesem Computer testen').waitFor({ timeout: 15000 });
    assert((await page.evaluate(() => localStorage.getItem('pl8.localConfig'))) === null, 'values still saved');
  });

  await check('no errors or blocked content on localhost', async () => {
    assert(problems.length === 0, problems.join('\n'));
  });

  await browser.close();
  for (const c of running) c.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nLocal tests: ${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  for (const c of running) c.kill();
  process.exit(1);
});
