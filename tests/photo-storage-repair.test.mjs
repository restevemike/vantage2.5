import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v1.3.10.6 cache-busts app and database modules', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(index, /app\.js\?v=1\.5\.4/);
  assert.match(app, /db\.js\?v=1\.5\.4/);
});

test('database self-repair includes exercise media store', async () => {
  const source = await readFile(new URL('../db.js', import.meta.url), 'utf8');
  assert.match(source, /const DB_VERSION = 12;/);
  assert.match(source, /exerciseMedia:/);
  assert.match(source, /schemaNeedsRepair/);
  assert.match(source, /repairVersion/);
});
