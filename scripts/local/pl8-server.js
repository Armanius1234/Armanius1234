// PL8 on this computer: a small web server for trying the web version.
//
// Windows: double-click "PL8 starten.bat".  Others: node pl8-server.js
//
// It serves index.html (and any files next to it) on http://localhost:8080
// (or the next free port), only to this computer, and opens the browser.
// Close the window (or press Ctrl+C) to stop it.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const FIRST_PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-cache');

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.statusCode = 400;
    return res.end('Bad request');
  }
  let file = path.normalize(path.join(ROOT, urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.statusCode = 400;
    return res.end('Bad request');
  }
  // The starter files themselves are not part of the website.
  const starterFile = path.dirname(file) === ROOT && /^(pl8-server\.js|.*\.bat|LIESMICH\.txt)$/i.test(path.basename(file));
  const isFile = !starterFile && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!isFile) {
    // Missing app files are real errors; every other address is a PL8 screen.
    if (/^\/(_expo|assets)\//.test(urlPath)) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    file = path.join(ROOT, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('index.html fehlt / is missing: put it in the same folder as pl8-server.js.');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}

function openBrowser(url) {
  if (process.env.PL8_NO_BROWSER === '1') return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
}

function start(port, triesLeft) {
  // Only this computer can connect (127.0.0.1 and ::1), never the network.
  const v4 = http.createServer(handle);
  v4.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) return start(port + 1, triesLeft - 1);
    console.error(`\nPL8 konnte nicht starten / could not start: ${err.message}`);
    process.exitCode = 1;
  });
  v4.listen(port, '127.0.0.1', () => {
    const v6 = http.createServer(handle);
    v6.once('error', () => undefined); // no IPv6 on this computer: fine
    v6.listen(port, '::1');
    const url = `http://localhost:${port}/`;
    console.log('');
    console.log('  PL8 laeuft auf diesem Computer / is running on this computer:');
    console.log(`  ${url}`);
    console.log('');
    console.log('  Der Browser oeffnet sich gleich. Fenster schliessen = PL8 beenden.');
    console.log('  The browser opens now. Close this window to stop PL8.');
    console.log('');
    openBrowser(url);
  });
}

start(FIRST_PORT, 20);
