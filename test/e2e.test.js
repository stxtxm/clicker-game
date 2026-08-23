/**
 * E2E — drives the real game (index.html) in headless chromium via
 * test/e2e-runner.html and asserts every scenario line reports PASS.
 *
 * Skipped automatically when no chromium-compatible browser is available
 * (CI installs it; see .github/workflows/ci.yml).
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFile, spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function findChromium() {
  const candidates = [process.env.CHROMIUM_PATH, 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes('/') && fs.existsSync(c)) return c;
    try {
      fs.accessSync('/usr/bin/' + c, fs.constants.X_OK);
      return '/usr/bin/' + c;
    } catch { /* keep looking */ }
    try {
      fs.accessSync('/usr/local/bin/' + c, fs.constants.X_OK);
      return '/usr/local/bin/' + c;
    } catch { /* keep looking */ }
  }
  return null;
}

/** Serve the repo root statically on an ephemeral port. */
function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const ext = path.extname(file);
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('e2e: full player session in headless chromium', { timeout: 120000 }, async () => {
  const chromium = findChromium();
  if (!chromium) {
    console.log('e2e skipped: no chromium found (set CHROMIUM_PATH to enable)');
    return;
  }
  const root = path.join(__dirname, '..');
  const { server, port } = await serve(root);
  try {
    const url = `http://127.0.0.1:${port}/test/e2e-runner.html`;
    const dom = await new Promise((resolve, reject) => {
      execFile(chromium, [
        '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--virtual-time-budget=30000', '--timeout=60000', '--dump-dom', url
      ], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
        if (err && !stdout) reject(err); else resolve(stdout);
      });
    });
    const lines = dom.match(/E2E [^\n<]+/g) || [];
    console.log('E2E results:\n' + lines.map((l) => '  ' + l).join('\n'));
    assert.ok(lines.length >= 10, 'runner produced results (got ' + lines.length + ') — is the page loading?');
    const failures = lines.filter((l) => l.includes(': FAIL'));
    assert.deepStrictEqual(failures, [], 'e2e failures:\n' + failures.join('\n'));
  } finally {
    server.close();
  }
});
