// A small web server that behaves like the Apache rules in public/.htaccess,
// for testing the web version locally.
//
//   node scripts/web-e2e/serve.mjs dist-web 8790
//
// With PL8_TEST_SUPABASE_URL / PL8_TEST_SUPABASE_KEY set, /pl8-config.js (or,
// in the single-file version, the settings block in index.html) points there
// (the browser test uses a mocked project).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

export function startServer(rootDir, port = 0) {
  const root = resolve(rootDir);
  const server = createServer((req, res) => {
    // Same headers as public/.htaccess.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");

    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (urlPath === '/pl8-config.js' && process.env.PL8_TEST_SUPABASE_URL !== undefined) {
      res.setHeader('Content-Type', TYPES['.js']);
      res.end(
        `window.PL8_CONFIG = ${JSON.stringify({
          supabaseUrl: process.env.PL8_TEST_SUPABASE_URL,
          supabaseKey: process.env.PL8_TEST_SUPABASE_KEY ?? '',
        })};`,
      );
      return;
    }
    let file = normalize(join(root, urlPath));
    if (!file.startsWith(root)) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const isFile = existsSync(file) && statSync(file).isFile();
    if (!isFile) {
      // App files that are missing are real 404s; every other address is an app screen.
      if (/^\/(_expo|assets)\//.test(urlPath)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      file = join(root, 'index.html');
    }
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    // Single-file version: the settings are a block inside index.html.
    if (extname(file) === '.html' && process.env.PL8_TEST_SUPABASE_URL !== undefined) {
      const config = JSON.stringify({
        supabaseUrl: process.env.PL8_TEST_SUPABASE_URL,
        supabaseKey: process.env.PL8_TEST_SUPABASE_KEY ?? '',
      });
      const html = readFileSync(file, 'utf8').replace(
        /(<script type="application\/json" id="pl8-config">)[\s\S]*?(<\/script>)/,
        `$1${config}$2`,
      );
      res.end(html);
      return;
    }
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir = 'dist-web', port = '8790'] = process.argv.slice(2);
  startServer(dir, Number(port)).then((s) => console.log(`Serving ${dir} on http://127.0.0.1:${s.address().port}`));
}
