import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('v1.5.6 binds all bottom-nav and data-go controls with the multi-selector helper', async () => {
  const app = await read('app.js');
  assert.match(app, /\$\$\('\.bottom-nav button'\)\.forEach/);
  assert.match(app, /\$\$\('\[data-go\]'\)\.forEach/);
  assert.doesNotMatch(app, /\$\('\.bottom-nav button'\)\.forEach/);
  assert.doesNotMatch(app, /\$\('\[data-go\]'\)\.forEach/);
});
