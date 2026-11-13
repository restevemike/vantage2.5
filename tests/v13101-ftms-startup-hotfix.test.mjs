import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('v1.3.10.6 startup does not reference removed FTMS renderer', () => {
  assert.doesNotMatch(app, /\brenderFtmsBluetooth\s*\(/);
});

test('v1.3.10.6 cache-busts the broken v1.3.10 shell', () => {
  assert.match(html, /v1\.5\.4/);
  assert.match(html, /app\.js\?v=1\.5\.4/);
  assert.match(sw, /vantage-training-console-v15-4/);
});
