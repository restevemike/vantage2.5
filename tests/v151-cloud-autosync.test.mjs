import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.3 emits local database change events for cloud autosync', async () => {
  const db = await read('db.js');
  assert.match(db, /vantage-db-change/);
  assert.match(db, /notifyLocalChange\(storeName, 'put'\)/);
  assert.match(db, /notifyLocalChange\(storeName, 'putMany'\)/);
  assert.match(db, /notifyLocalChange\(storeName, 'remove'\)/);
  assert.match(db, /__vantageCloudApplying/);
});

test('v1.5.3 schedules debounced autosync on writes, online and resume', async () => {
  const ui = await read('cloud-sync-ui.js');
  assert.match(ui, /Phase 2C/);
  assert.match(ui, /scheduleAutoSync/);
  assert.match(ui, /vantage-db-change/);
  assert.match(ui, /addEventListener\('online'/);
  assert.match(ui, /visibilitychange/);
  assert.match(ui, /8000/);
  assert.match(ui, /syncAllIncremental/);
});

test('v1.5.3 cloud-applied writes are loop suppressed', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /__vantageCloudApplying = true/);
  assert.match(cloud, /__vantageCloudApplying = false/);
  assert.match(cloud, /syncAllIncremental/);
});
