import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../db.js', import.meta.url), 'utf8');

test('database version advances and self-repairs exerciseMedia, recoveryLogs and BioLab stores on existing installs', () => {
  assert.match(source, /const DB_VERSION = 12;/);
  assert.match(source, /exerciseMedia:/);
  assert.match(source, /recoveryLogs:/);
  assert.match(source, /bloodTests:/);
  assert.match(source, /bloodAnalyses:/);
  assert.match(source, /bodyMeasurements:/);
  assert.match(source, /schemaNeedsRepair/);
  assert.match(source, /schemaVersion: 12/);
  assert.match(source, /\[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\]/);
});
