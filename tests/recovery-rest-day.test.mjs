import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const db = await readFile(new URL('../db.js', import.meta.url), 'utf8');

 test('dashboard provides a mutually exclusive rest-day record', () => {
  assert.match(html, /id="recordRestDayButton"/);
  assert.match(js, /async function recordRestDay/);
  assert.match(js, /Training is already saved for today/);
  assert.match(js, /actualAction:\s*'rest-day'/);
});

test('recovery tab provides manual-duration actions and stressor classification', () => {
  assert.match(html, /id="recoveryScreen"/);
  assert.match(html, /data-nav="recovery"/);
  assert.match(js, /RECOVERY_ACTIVITIES/);
  assert.match(js, /physiological-stressor/);
  assert.match(js, /data-recovery-duration/);
  assert.match(js, /durationInputMode: 'manual'/);
  assert.doesNotMatch(js, /function startRecoveryTimer/);
  assert.match(js, /async function saveRecoveryAction/);
});

test('recovery records are included in durable local storage', () => {
  assert.match(db, /recoveryLogs:/);
  assert.match(db, /schemaVersion: 12/);
  assert.match(js, /db\.getAll\('recoveryLogs'\)/);
});
