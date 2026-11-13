import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v1.3.10.6 startup does not call removed recovery ticker', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('ensureRecoveryTicker();'), false);
});

test('v1.3.10.6 cache busts the app shell', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /app\.js\?v=1\.5\.2/);
  assert.match(sw, /vantage-training-console-v15-2/);
});
