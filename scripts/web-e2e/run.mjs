// Browser test for the web version: opens the built site (dist-web) in
// Chromium and clicks through the main journeys against a mocked Supabase
// project. The database rules themselves are covered by `npm run test:db`.
//
//   npm run build:web && npm run test:web
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  assert,
  check,
  CHAT,
  CLAIM,
  expectCall,
  KEY,
  mockSupabase,
  MY_POST,
  NEW_POST,
  results,
  signIn,
  SUPABASE,
  watchConsole,
} from './mock-supabase.mjs';
import { startServer } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// npm run test:web tests dist-web/; npm run test:web:single tests dist-web-single/.
const DIST = join(here, '..', '..', process.env.PL8_WEB_DIR ?? 'dist-web');
const SINGLE = existsSync(join(DIST, '.htaccess')) === false;
// -------------------------------------------------------------------- tests --
async function main() {
  // pl8.test stands in for a real website address (not "this computer").
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP pl8.test 127.0.0.1'] });
  const empty = await startServer(DIST);
  const emptyBase = `http://127.0.0.1:${empty.address().port}`;
  const emptySite = `http://pl8.test:${empty.address().port}`;

  console.log(`▸ Web version (browser test): ${SINGLE ? 'single file' : 'folder'} ${DIST}`);

  if (SINGLE) {
    await check('opened as a file on the computer, the page explains it needs a web address', async () => {
      const page = await browser.newPage({ locale: 'de-DE' });
      await page.goto(`file://${join(DIST, 'index.html')}`);
      await page.getByText('PL8TE braucht eine Webadresse').waitFor({ timeout: 15000 });
      await page.close();
    });
    await check('opened as /index.html, the app starts normally', async () => {
      const page = await browser.newPage({ locale: 'de-DE' });
      await page.goto(`${emptySite}/index.html`);
      await page.getByText('pl8-config.js').first().waitFor({ timeout: 15000 });
      await page.close();
    });
  }

  // 1. Before pl8-config.js is filled in.
  await check('on a website without pl8-config.js values, the page explains what to fill in', async () => {
    delete process.env.PL8_TEST_SUPABASE_URL;
    const page = await browser.newPage({ locale: 'de-DE' });
    const problems = watchConsole(page);
    await page.goto(emptySite);
    await page.getByText('Backend nicht eingerichtet').waitFor({ timeout: 15000 });
    assert((await page.getByLabel('Project URL').count()) === 0, 'the local setup form is shown on a website');
    assert(problems.length === 0, problems.join('\n'));
    await page.close();
  });

  await check('on this computer (localhost) without values, PL8 asks for them, and refuses a secret key', async () => {
    const page = await browser.newPage({ locale: 'de-DE' });
    const problems = watchConsole(page);
    await page.goto(emptyBase);
    await page.getByText('PL8TE auf diesem Computer testen').waitFor({ timeout: 15000 });
    await page.getByLabel('Project URL').fill(SUPABASE);
    await page.getByLabel('Publishable Key').fill('sb_secret_' + 'a-made-up-key-for-this-test');
    await page.getByRole('button', { name: 'Verbinden' }).click();
    await page.getByText(/Das ist ein geheimer Schlüssel/).waitFor();
    const saved = await page.evaluate(() => localStorage.getItem('pl8.localConfig'));
    assert(saved === null, 'a secret key was saved');
    assert(problems.length === 0, problems.join('\n'));
    await page.close();
  });
  empty.close();

  process.env.PL8_TEST_SUPABASE_URL = SUPABASE;
  process.env.PL8_TEST_SUPABASE_KEY = KEY;
  const server = await startServer(DIST);
  const base = `http://127.0.0.1:${server.address().port}`;

  await check('signed out: the welcome screen loads, with no errors and no blocked content', async () => {
    const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
    const problems = watchConsole(page);
    await mockSupabase(page);
    await page.goto(base);
    await page.getByRole('button', { name: 'Anmelden' }).first().waitFor({ timeout: 15000 });
    assert(problems.length === 0, problems.join('\n'));
    await page.close();
  });

  await check('a deep link (e.g. /post/123) opens the app instead of a server error', async () => {
    const page = await browser.newPage({ locale: 'de-DE' });
    await mockSupabase(page);
    const res = await page.goto(`${base}/post/${MY_POST}`);
    assert(res?.status() === 200, `status ${res?.status()}`);
    // Signed out, so the app sends the visitor to the welcome screen.
    await page.getByRole('button', { name: 'Anmelden' }).first().waitFor({ timeout: 15000 });
    await page.close();
  });

  await check('on a wide screen the app is a centred column (at most 600 px)', async () => {
    const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
    await mockSupabase(page);
    await page.goto(`${base}/login`);
    const box = await page.getByLabel('E-Mail').boundingBox();
    assert(box && box.x >= (1280 - 600) / 2 && box.x + box.width <= (1280 + 600) / 2, `field at ${JSON.stringify(box)}`);
    await page.close();
  });

  await check('on a wide screen, profile photos are a 3-column grid inside the column', async () => {
    const wide = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
    await mockSupabase(wide);
    await signIn(wide, base);
    await wide.goto(`${base}/profile`);
    const tile = wide.getByRole('button', { name: 'Beitrag', exact: true }).first();
    await tile.waitFor({ timeout: 15000 });
    const box = await tile.boundingBox();
    assert(box && box.width <= 600 / 3 + 2, `grid tile is ${box?.width}px wide`);
    await wide.close();
  });

  // 2. Signed in.
  const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 420, height: 860 }, acceptDownloads: true });
  const problems = watchConsole(page);
  const calls = await mockSupabase(page);

  await check('sign in with email and password, then the home feed shows posts', async () => {
    await signIn(page, base);
    assert(calls.some((c) => c.path === '/auth/v1/token'), 'no sign-in request');
    assert(calls.some((c) => c.path === '/rest/v1/rpc/get_posts'), 'feed not loaded');
  });

  await check('the session is kept in the browser and survives a reload', async () => {
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('auth-token')));
    assert(stored.length === 1, `stored keys: ${stored}`);
    await page.reload();
    await page.getByText('Sonntagsausfahrt mit').first().waitFor({ timeout: 15000 });
  });

  await check('the page language follows the account language (German)', async () => {
    assert((await page.evaluate(() => document.documentElement.lang)) === 'de', 'lang is not de');
  });

  await check('menus and confirmations work: post options → delete → confirm', async () => {
    await page.getByRole('button', { name: 'Optionen' }).first().click();
    await page.getByRole('alert').getByRole('button', { name: 'Beitrag löschen' }).click();
    // A second dialog asks for confirmation; Escape cancels it.
    await page.getByRole('alert').getByText('Diesen Beitrag löschen?').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('alert').waitFor({ state: 'detached' });
    assert(!calls.some((c) => c.method === 'DELETE' && c.path === '/rest/v1/posts'), 'deleted although cancelled');
    // Again, and confirm this time.
    await page.getByRole('button', { name: 'Optionen' }).first().click();
    await page.getByRole('alert').getByRole('button', { name: 'Beitrag löschen' }).click();
    await page.getByRole('alert').getByText('Diesen Beitrag löschen?').waitFor();
    await page.getByRole('alert').getByRole('button', { name: 'Beitrag löschen' }).click();
    await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
    await expectCall(() => calls.some((c) => c.method === 'DELETE' && c.path === '/rest/v1/posts' && c.search.includes(MY_POST)), 'post was not deleted');
  });

  await check('posting a photo: it is resized, re-encoded and uploaded without its GPS data', async () => {
    await page.goto(`${base}/post/new`);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Fotos wählen' }).click();
    await (await chooser).setFiles(join(here, 'fixtures', 'car-with-gps.jpg'));
    await page.getByLabel('Beschreibung').fill('Neu im Web');
    await page.getByRole('button', { name: 'Teilen' }).click();
    await expectCall(() => calls.some((c) => c.path === '/rest/v1/rpc/publish_post'), 'post not published');
    const upload = calls.find((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/post-media/${NEW_POST}/`));
    assert(upload, 'no photo upload');
    const bytes = upload.body ?? Buffer.alloc(0);
    // The upload may be a plain body or multipart; look for the JPEG inside it.
    const start = bytes.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    assert(start >= 0, 'uploaded file is not a JPEG');
    const jpeg = bytes.subarray(start);
    assert(!jpeg.includes(Buffer.from('Exif')) && !jpeg.includes(Buffer.from('TestCam')), 'photo metadata was uploaded');
    const original = readFileSync(join(here, 'fixtures', 'car-with-gps.jpg'));
    assert(!jpeg.equals(original), 'the original file was uploaded unchanged');
  });

  await check('chat: messages show, and a new message is sent', async () => {
    await page.goto(`${base}/chat/${CHAT}`);
    await page.getByText('Treffen am Samstag?').waitFor({ timeout: 15000 });
    await page.getByLabel('Nachricht…').fill('Klar, 10 Uhr!');
    await page.getByRole('button', { name: 'Senden' }).click();
    await expectCall(() => {
      const send = calls.find((c) => c.path === '/rest/v1/rpc/send_message');
      return !!send && JSON.parse(send.body.toString()).p_body === 'Klar, 10 Uhr!';
    }, 'message not sent');
  });

  await check('privacy: "Show me in people search" can be switched off', async () => {
    await page.goto(`${base}/settings/privacy`);
    const toggle = page.getByRole('switch', { name: 'In der Personensuche zeigen' });
    await toggle.waitFor({ timeout: 15000 });
    await toggle.click();
    await expectCall(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/user_settings');
      return !!patch && JSON.parse(patch.body.toString()).show_in_search === false;
    }, 'setting not saved');
  });

  await check('"Download my data" downloads a JSON file', async () => {
    await page.goto(`${base}/settings`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Meine Daten herunterladen' }).click();
    const file = await download;
    assert(/^pl8-data-\d{4}-\d{2}-\d{2}\.json$/.test(file.suggestedFilename()), file.suggestedFilename());
    const text = readFileSync(await file.path(), 'utf8');
    assert(JSON.parse(text).profile.username === 'mia_maier', 'wrong file content');
  });

  await check('plate verification sends people to the phone app (no live photos in a browser)', async () => {
    await page.goto(`${base}/verification/${CLAIM}`);
    await page.getByText('Auf dem Handy verifizieren').waitFor({ timeout: 15000 });
    assert((await page.getByText('PL8-ABCD').count()) === 0, 'challenge code shown on the web');
  });

  await check('a page opened directly (reload, shared link) still has a way back', async () => {
    // The verification page above was opened straight from the address bar.
    await page.getByRole('button', { name: 'Zurück zu meinem Auto' }).click();
    await page.getByText('Sonntagsausfahrt mit').first().waitFor({ timeout: 15000 });
  });

  await check('sign out asks first, then removes the session from the browser', async () => {
    await page.goto(`${base}/settings`);
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('alert').getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('button', { name: 'Anmelden' }).first().waitFor({ timeout: 15000 });
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('auth-token')));
    assert(stored.length === 0, `still stored: ${stored}`);
  });

  await check('no errors or blocked content during the whole signed-in session', async () => {
    assert(problems.length === 0, problems.join('\n'));
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nWeb tests: ${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}


main().catch((e) => {
  console.error(e);
  process.exit(1);
});
