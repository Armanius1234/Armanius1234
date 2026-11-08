// The mocked Supabase project and small test helpers, shared by the browser
// tests (run.mjs: the website; local.mjs: the starter for a computer).
import { Buffer } from 'node:buffer';

export const SUPABASE = 'https://pl8test.supabase.co';
export const KEY = 'sb_publishable_test_key_for_the_browser_test';
export const ME = '11111111-1111-4111-8111-111111111111';
export const BEN = '22222222-2222-4222-8222-222222222222';
export const MY_POST = '33333333-3333-4333-8333-333333333333';
export const NEW_POST = '44444444-4444-4444-8444-444444444444';
export const CLAIM = '55555555-5555-4555-8555-555555555555';

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
export const SETTINGS = {
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
export const CHAT = '66666666-6666-4666-8666-666666666666';
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
export async function mockSupabase(page) {
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
export const results = [];
export async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`   ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`   ✗ ${name}\n     ${String(e?.message ?? e).split('\n').slice(0, 6).join('\n     ')}`);
  }
}
export function assert(cond, message) {
  if (!cond) throw new Error(message);
}

export function watchConsole(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  return problems;
}

export async function signIn(page, base) {
  await page.goto(`${base}/login`);
  await page.getByLabel('E-Mail').fill('mia@example.com');
  await page.getByLabel('Passwort', { exact: true }).fill('a-long-password-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Sonntagsausfahrt mit').first().waitFor({ timeout: 15000 });
}


export async function expectCall(cond, message, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
