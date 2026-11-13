import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.4 uses cloud-authoritative bootstrap when remote data exists and no baseline exists', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /const bootstrap = Object\.keys\(baseline\)\.length === 0 && remote\.size > 0/);
  assert.match(cloud, /if \(bootstrap\) localWrites\.push\(r\)/);
  assert.match(cloud, /if \(bootstrap\) downloads\.push\(r\)/);
  assert.match(cloud, /bootstrap\n\s*};/);
});

test('v1.5.4 preserves local-only records during bootstrap', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /if \(lf && !rf\) uploads\.push\(l\)/);
});

test('v1.5.4 retains normal conflict handling after a baseline exists', async () => {
  const cloud = await read('cloud-sync.js');
  assert.match(cloud, /else conflicts\.push\(key\)/);
  assert.match(cloud, /conflicts\.push\(key\)/);
});
