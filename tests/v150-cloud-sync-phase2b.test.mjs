import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.2 ships incremental cloud sync with explicit magic-link redirect', async () => {
  const [cloud, ui, html, sw, manifestText, pkgText] = await Promise.all([
    read('cloud-sync.js'), read('cloud-sync-ui.js'), read('index.html'),
    read('sw.js'), read('manifest.webmanifest'), read('package.json')
  ]);
  const manifest = JSON.parse(manifestText);
  const pkg = JSON.parse(pkgText);

  assert.match(cloud, /syncCoreIncremental/);
  assert.match(cloud, /syncMediaIncremental/);
  assert.match(cloud, /vantage_cloud_records/);
  assert.match(cloud, /vantage_cloud_media/);
  assert.match(cloud, /vantage-media/);
  assert.match(cloud, /emailRedirectTo/);
  assert.match(cloud, /sendMagicLink/);
  assert.match(cloud, /conflicts/);

  assert.match(ui, /Phase 2C/);
  assert.match(ui, /Email sign-in link/);
  assert.match(ui, /Sync core records/);
  assert.match(ui, /Sync private media/);

  assert.match(html, /v1\.5\.2/);
  assert.match(html, /app\.js\?v=1\.5\.2/);
  assert.match(sw, /vantage-training-console-v15-2/);
  assert.equal(manifest.start_url, './?pwa=152');
  assert.equal(pkg.version, '1.5.2');
});

test('Phase 2B keeps Phase 2A fallback snapshot restore available', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /pushCoreSnapshot/);
  assert.match(cloud, /restoreCoreSnapshot/);
  assert.match(cloud, /vantage-cloud-core-v1/);
});

test('Phase 2B never silently resolves divergent record edits', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /lf\s*===\s*rf/);
  assert.match(cloud, /conflicts\.push/);
});
