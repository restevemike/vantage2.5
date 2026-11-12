const encoder = new TextEncoder();

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day = ((year - 1980) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

async function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  return encoder.encode(String(value ?? ''));
}

function safePath(name) {
  return String(name || 'file')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .join('/');
}

export async function sha256Hex(value) {
  if (!crypto?.subtle) return null;
  const bytes = await bytesFrom(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createZip(entries, { modifiedAt = new Date() } = {}) {
  const files = [];
  const usedNames = new Set();
  for (const entry of entries || []) {
    let name = safePath(entry.name);
    if (!name) name = 'file';
    const original = name;
    let counter = 2;
    while (usedNames.has(name)) {
      const dot = original.lastIndexOf('.');
      name = dot > -1 ? `${original.slice(0, dot)}_${counter}${original.slice(dot)}` : `${original}_${counter}`;
      counter += 1;
    }
    usedNames.add(name);
    files.push({ name, nameBytes: encoder.encode(name), data: await bytesFrom(entry.data), modifiedAt: entry.modifiedAt || modifiedAt });
  }

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const checksum = crc32(file.data);
    const { time, day } = dosDateTime(file.modifiedAt);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(checksum), u32(file.data.length), u32(file.data.length),
      u16(file.nameBytes.length), u16(0), file.nameBytes, file.data
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(checksum), u32(file.data.length), u32(file.data.length),
      u16(file.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), file.nameBytes
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(offset), u16(0)
  ]);
  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}
