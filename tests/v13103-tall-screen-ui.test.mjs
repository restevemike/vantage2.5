import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('styles.css', root), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');
const sw = await readFile(new URL('sw.js', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('v1.3.10.6 uses dynamic viewport and safe areas', () => {
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-left/);
});

test('v1.3.10.6 has geometry-based tall portrait optimisation', () => {
  assert.match(css, /max-aspect-ratio:\s*10\/17/);
  assert.match(css, /orientation:\s*portrait/);
  assert.doesNotMatch(css, /XQ-EC|Xperia 1 VI.*user-agent/i);
});

test('v1.3.10.6 cache busts UI assets without changing origin identity', () => {
  assert.equal(pkg.version, '1.5.5');
  assert.match(html, /v1\.5\.5/);
  assert.match(html, /app\.js\?v=1\.5\.5/);
  assert.match(sw, /vantage-training-console-v15-5/);
});
