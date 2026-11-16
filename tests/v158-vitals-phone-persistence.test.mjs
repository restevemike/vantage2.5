import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decideVitalsBootstrap } from '../cloud-sync.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.9 bootstrap picks the newer vitals copy without unverified overwrites', () => {
  const old = { date: '2026-11-16', updatedAt: '2026-11-16T13:00:00Z', hrv: 100 };
  const fresh = { date: '2026-11-16', updatedAt: '2026-11-16T17:00:00Z', hrv: 115 };
  assert.equal(decideVitalsBootstrap(fresh, old), 'upload');
  assert.equal(decideVitalsBootstrap(old, fresh), 'download');
  assert.equal(decideVitalsBootstrap({ ...fresh, updatedAt: old.updatedAt }, old), 'conflict');
  assert.equal(decideVitalsBootstrap({ date: '2026-11-16' }, old), 'conflict');
});

test('v1.5.9 vitals save verifies IndexedDB and reloads form from stored record', async () => {
  const source = await read('app.js');
  assert.match(source, /function loadSavedVitalsIntoForm\(dateValue = null\)/);
  assert.match(source, /if \(screen === 'vitals' && !vitalsFormDirty\) loadSavedVitalsIntoForm\(\)/);
  assert.match(source, /const readback = await db\.get\('vitals', vitals\.id\)/);
  assert.match(source, /readback\.updatedAt !== vitals\.updatedAt/);
  assert.match(source, /vitalsFormDirty = false;\s*loadSavedVitalsIntoForm\(vitals\.date\)/);
  assert.match(source, /new CustomEvent\('vantage-vitals-saved'/);
  assert.match(source, /vitalsFormDirty && !window\.confirm/);
  assert.match(source, /if \(!vitalsFormDirty\) loadSavedVitalsIntoForm\(\)/);
});

test('v1.5.9 cloud sync protects vitals against implicit deletion and stale pull', async () => {
  const source = await read('cloud-sync.js');
  assert.match(source, /if \(l\.store === 'vitals'\)/);
  assert.match(source, /else if \(r\?\.store === 'vitals'\) localWrites\.push\(r\)/);
  assert.match(source, /else if \(l\?\.store === 'vitals'\) uploads\.push\(l\)/);
  assert.match(source, /decideVitalsBootstrap\(phoneCopy, newest\.payload\) !== 'download'/);
  const ui = await read('cloud-sync-ui.js');
  assert.match(ui, /addEventListener\('vantage-vitals-saved', \(\) => scheduleAutoSync\('vitals', 100\)\)/);
});

test('v1.5.9 updates frontend, service worker and app version together', async () => {
  const [app, html, sw, pkg, manifestSource] = await Promise.all([
    read('app.js'),read('index.html'),read('sw.js'),read('package.json'),read('manifest.webmanifest'),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.start_url, './?pwa=159');
  assert.equal(manifest.id, './vantage-training-console-v133');
  assert.match(app,/APP_VERSION = '1\.5\.9'/);
  assert.match(html,/v1\.5\.9/);
  assert.match(sw,/vantage-training-console-v15-9/);
  assert.equal(JSON.parse(pkg).version,'1.5.9');
});
