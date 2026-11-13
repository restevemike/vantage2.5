import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.5 exposes an explicit newest-vitals cloud pull', async () => {
  const [cloud, ui] = await Promise.all([read('cloud-sync.js'), read('cloud-sync-ui.js')]);
  assert.match(cloud, /pullNewestVitalsFromCloud/);
  assert.match(cloud, /eq\('store_name', 'vitals'\)/);
  assert.match(cloud, /await db\.put\('vitals', newest\.payload\)/);
  assert.match(cloud, /vantage-cloud-data-applied/);
  assert.match(ui, /Pull newest vitals from cloud/);
});

test('v1.5.5 chooses newest vitals by payload date, not cloud updated_at', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /String\(b\.payload\.date\)\.localeCompare\(String\(a\.payload\.date\)\)/);
});
