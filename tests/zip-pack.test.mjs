import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, crc32 } from '../zip-pack.js';

test('creates a valid store-only ZIP containing named files', async () => {
  const blob = await createZip([
    { name: 'report.md', data: '# Report' },
    { name: 'media/photo.jpg', data: new Uint8Array([1, 2, 3, 4]) }
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /report\.md/);
  assert.match(text, /media\/photo\.jpg/);
  assert.equal(blob.type, 'application/zip');
});

test('CRC32 matches a known value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
