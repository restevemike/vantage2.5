import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.7 exposes Cloud as a first-class screen and nav tab', async () => {
  const [html, ui] = await Promise.all([read('index.html'), read('cloud-sync-ui.js')]);
  assert.match(html, /data-screen="cloud"/);
  assert.match(html, /data-nav="cloud"/);
  assert.match(html, /id="cloudSyncHost"/);
  assert.match(html, /data-go="cloud"/);
  assert.match(ui, /#cloudSyncHost/);
});

test('v1.5.7 supports safe device rebootstrap from cloud', async () => {
  const [cloud, ui] = await Promise.all([read('cloud-sync.js'), read('cloud-sync-ui.js')]);
  assert.match(cloud, /rebootstrapFromCloud/);
  assert.match(cloud, /clearBaseline\(CORE_BASELINE_PREFIX/);
  assert.match(cloud, /clearBaseline\(MEDIA_BASELINE_PREFIX/);
  assert.match(ui, /Re-bootstrap this device from cloud/);
  assert.match(ui, /Local-only records will be preserved and uploaded/);
});

test('v1.5.7 refreshes the open app after cloud data is applied', async () => {
  const [cloud, app] = await Promise.all([read('cloud-sync.js'), read('app.js')]);
  assert.match(cloud, /vantage-cloud-data-applied/);
  assert.match(app, /vantage-cloud-data-applied/);
  assert.match(app, /await refreshState\(\)/);
  assert.match(app, /renderAll\(\)/);
});
