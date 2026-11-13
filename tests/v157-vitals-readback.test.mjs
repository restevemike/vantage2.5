import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.7 verifies pulled vitals by IndexedDB readback before reporting success', async () => {
  const [cloud, ui] = await Promise.all([read('cloud-sync.js'), read('cloud-sync-ui.js')]);
  assert.match(cloud, /const localReadback = await db\.get\('vitals', newest\.record_id\)/);
  assert.match(cloud, /Cloud vitals local verification failed/);
  assert.match(cloud, /verifiedLocal: true/);
  assert.match(ui, /Vitals pulled and verified locally/);
  assert.match(ui, /location\.reload\(\)/);
});
