// Browser test for the web version: opens the built site (dist-web) in
// Chromium and clicks through the main journeys against a mocked Supabase
// project. The database rules themselves are covered by `npm run test:db`.
//
//   npm run build:web && npm run test:web
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startServer } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// npm run test:web tests dist-web/; npm run test:web:single tests dist-web-single/.
const DIST = join(here, '..', '..', process.env.PL8_WEB_DIR ?? 'dist-web');
const SINGLE = existsSync(join(DIST, '.htaccess')) === false;
const SUPABASE = 'https://pl8test.supabase.co';
const KEY = 'sb_publishable_test_key_for_the_browser_test';
const ME = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const MY_POST = '33333333-3333-4333-8333-333333333333';
const NEW_POST = '44444444-4444-4444-8444-444444444444';
const CLAIM = '55555555-5555-4555-8555-555555555555';

// A 1×1 PNG for every photo the app downloads.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const now = new Date().toISOString();
const profile = (id, username, display_name) => ({
  id, username, display_name, bio: '', avatar_path: null, city: null,
  instagram_url: null, tiktok_url: null, linkedin_url: null, facebook_url: null,
  is_private: false, follower_count: 3, following_count: 2, post_count: 1,
  suspended_at: null, created_at: now, updated_at: now,
});
const PROFILES = [profile(ME, 'mia_maier', 'Mia Maier'), profile(BEN, 'ben.bmw', 'Ben Becker')];
const SETTINGS = {
  user_id: ME, messaging_policy: 'everyone', locale: 'de', push_enabled: true,
  push_likes: true, push_comments: true, push_follows: true, push_messages: true,
  show_in_search: true, show_in_suggestions: true, updated_at: now,
};
const FEED = [
  {
    post_id: MY_POST, author_id: ME, author_username: 'mia_maier', author_display_name: 'Mia Maier',
    author_avatar_path: null, vehicle_id: null, vehicle_make: null, vehicle_model: null, vehicle_generation: null,
    caption: 'Sonntagsausfahrt mit @ben.bmw', media_paths: [`${MY_POST}/a.jpg`], like_count: 4, comment_count: 0,
    liked: false, saved: false, published_at: now,
  },
];
const CLAIMS = [
  {
    claim_id: CLAIM, vehicle_id: 'v1', country: 'DE', plate: 'M-PL-8', status: 'unverified', discoverable: false,
    show_owner: false, verified_at: null, revoke_reason: null, created_at: now, request_id: 'r1',
    request_status: 'awaiting_evidence', challenge_code: 'PL8-ABCD', decision_note: null,
  },
];
const CHAT = '66666666-6666-4666-8666-666666666666';
const CONVERSATION = {
  conversation_id: CHAT, status: 'active', is_request_for_me: false, i_sent_request: false, other_id: BEN,
  other_username: 'ben.bmw', other_display_name: 'Ben Becker', other_avatar_path: null, other_last_read_at: now,
};
const MESSAGES = [{ id: 'm1', conversation_id: CHAT, sender_id: BEN, body: 'Treffen am Samstag?', created_at: now }];
const RPC = {
  conversation_info: [CONVERSATION],
  get_posts: FEED,
  my_consent: true,
  am_i_admin: false,
  unread_message_count: 0,
  unread_notification_count: 0,
  my_plate_claims: CLAIMS,
  export_my_data: { profile: PROFILES[0], posts: FEED },
  relationship: [{ following: false, requested: false, follows_me: false, requested_me: false }],
};

function jwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2ln`;
}
const USER = {
  id: ME, aud: 'authenticated', role: 'authenticated', email: 'mia@example.com',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: now,
};
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: jwt({ sub: ME, role: 'authenticated', aud: 'authenticated', exp, email: USER.email }),
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh-1', user: USER,
  };
}

/** Answers the app's Supabase requests and records them. */
async function mockSupabase(page) {
  const calls = [];
  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const call = { method: req.method(), path, search: url.search, body: req.postDataBuffer() };
    calls.push(call);
    const json = (data, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (path === '/auth/v1/token') return json(session());
    if (path === '/auth/v1/user') return json(USER);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (req.method() === 'POST' && table === 'posts') return json(wantsObject ? { id: NEW_POST } : [{ id: NEW_POST }], 201);
      if (req.method() === 'PATCH' && table === 'user_settings') {
        Object.assign(SETTINGS, JSON.parse(req.postData() ?? '{}'));
        return json(wantsObject ? SETTINGS : [SETTINGS]);
      }
      if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 204 });
      let rows = [];
      if (table === 'profiles') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const username = url.searchParams.get('username')?.replace(/^eq\./, '');
        rows = PROFILES.filter((p) => (!id || p.id === id) && (!username || p.username === username));
      }
      if (table === 'user_settings') rows = [SETTINGS];
      if (table === 'messages') rows = MESSAGES;
      return json(wantsObject ? (rows[0] ?? null) : rows);
    }

    if (path.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') {
      const bucket = path.split('/')[5];
      const { paths = [] } = JSON.parse(req.postData() ?? '{}');
      return json(paths.map((p) => ({ path: p, signedURL: `/object/sign/${bucket}/${p}?token=t`, error: null })));
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'POST') {
      return json({ Key: path.replace('/storage/v1/object/', ''), Id: 'f1' });
    }
    return json([]);
  });

  // Live updates (chat, notifications): accept every channel.
  await page.routeWebSocket(/pl8test\.supabase\.co/, (ws) => {
    ws.onMessage((raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (Array.isArray(msg)) {
        const [joinRef, ref, topic, event, payload] = msg;
        if (event === 'phx_join' || event === 'heartbeat') {
          const changes = (payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: i + 1 }));
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: changes } }]));
        }
      } else if (msg.event === 'phx_join' || msg.event === 'heartbeat') {
        const changes = (msg.payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: i + 1 }));
        ws.send(JSON.stringify({ topic: msg.topic, event: 'phx_reply', ref: msg.ref, payload: { status: 'ok', response: { postgres_changes: changes } } }));
      }
    });
  });
  return calls;
}

// ------------------------------------------------------------------ harness --
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`   ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`   ✗ ${name}\n     ${String(e?.message ?? e).split('\n').slice(0, 6).join('\n     ')}`);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function watchConsole(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  return problems;
}

async function signIn(page, base) {
  await page.goto(`${base}/login`);
  await page.getByLabel('E-Mail').fill('mia@example.com');
  await page.getByLabel('Passwort', { exact: true }).fill('a-long-password-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Sonntagsausfahrt mit').first().waitFor({ timeout: 15000 });
}

// -------------------------------------------------------------------- tests --
async function main() {
  const browser = await chromium.launch();
  const empty = await startServer(DIST);
  const emptyBase = `http://127.0.0.1:${empty.address().port}`;

  console.log(`▸ Web version (browser test): ${SINGLE ? 'single file' : 'folder'} ${DIST}`);

  if (SINGLE) {
    await check('opened as a file on the computer, the page explains it needs a web address', async () => {
      const page = await browser.newPage({ locale: 'de-DE' });
      await page.goto(`file://${join(DIST, 'index.html')}`);
      await page.getByText('PL8 braucht eine Webadresse').waitFor({ timeout: 15000 });
      await page.close();
    });
    await check('opened as /index.html, the app starts normally', async () => {
      const page = await browser.newPage({ locale: 'de-DE' });
      await page.goto(`${emptyBase}/index.html`);
      await page.getByText('pl8-config.js').first().waitFor({ timeout: 15000 });
      await page.close();
    });
  }

  // 1. Before pl8-config.js is filled in.
  await check('without pl8-config.js values, the page explains what to fill in', async () => {
    delete process.env.PL8_TEST_SUPABASE_URL;
    const page = await browser.newPage({ locale: 'de-DE' });
    const problems = watchConsole(page);
    await page.goto(emptyBase);
    await page.getByText('pl8-config.js').first().waitFor({ timeout: 15000 });
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

async function expectCall(cond, message, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
