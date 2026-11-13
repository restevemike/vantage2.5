const DB_NAME = 'vantage-training-console';
const DB_VERSION = 12;
const STORE_DEFINITIONS = {
  sessions: { options: { keyPath: 'id' }, indexes: [['date', 'date'], ['templateId', 'templateId']] },
  vitals: { options: { keyPath: 'id' }, indexes: [['date', 'date', { unique: true }]] },
  meals: { options: { keyPath: 'id' }, indexes: [['date', 'date']] },
  templates: { options: { keyPath: 'id' }, indexes: [] },
  settings: { options: { keyPath: 'key' }, indexes: [] },
  exercises: { options: { keyPath: 'id' }, indexes: [['nameKey', 'nameKey'], ['workoutType', 'workoutType']] },
  nutritionDays: { options: { keyPath: 'id' }, indexes: [['date', 'date', { unique: true }]] },
  sessionMedia: { options: { keyPath: 'id' }, indexes: [['sessionId', 'sessionId'], ['date', 'date']] },
  exerciseMedia: { options: { keyPath: 'id' }, indexes: [['exerciseId', 'exerciseId'], ['createdAt', 'createdAt']] },
  recoveryLogs: { options: { keyPath: 'id' }, indexes: [['date', 'date'], ['activityId', 'activityId'], ['classification', 'classification']] },
  bloodTests: { options: { keyPath: 'id' }, indexes: [['date', 'date'], ['fingerprint', 'fingerprint']] },
  bloodAnalyses: { options: { keyPath: 'id' }, indexes: [['date', 'date'], ['bloodTestId', 'bloodTestId']] },
  bodyMeasurements: { options: { keyPath: 'id' }, indexes: [['date', 'date', { unique: true }]] },
  trainingCycles: { options: { keyPath: 'id' }, indexes: [['category', 'category'], ['active', 'active'], ['startDate', 'startDate']] },
  supplements: { options: { keyPath: 'id' }, indexes: [['nameKey', 'nameKey'], ['category', 'category'], ['active', 'active']] },
  supplementEvents: { options: { keyPath: 'id' }, indexes: [['supplementId', 'supplementId'], ['effectiveDate', 'effectiveDate']] },
  supplementMedia: { options: { keyPath: 'id' }, indexes: [['supplementId', 'supplementId'], ['createdAt', 'createdAt']] },
  programs: { options: { keyPath: 'id' }, indexes: [['profileId', 'profileId'], ['active', 'active'], ['nameKey', 'nameKey']] }
};
const STORES = Object.keys(STORE_DEFINITIONS);

function notifyLocalChange(storeName, operation) {
  if (globalThis.__vantageCloudApplying) return;
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent('vantage-db-change', { detail: { storeName, operation, at: Date.now() } }));
}

let databasePromise;

function ensureSchema(database, transaction) {
  for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
    const store = database.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : database.createObjectStore(name, definition.options);
    for (const [indexName, keyPath, indexOptions] of definition.indexes) {
      if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, indexOptions);
    }
  }
}

function openRequest(version = null, { upgrade = false } = {}) {
  return new Promise((resolve, reject) => {
    const request = version == null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      if (upgrade || request.oldVersion === 0) ensureSchema(request.result, request.transaction);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onblocked = () => reject(new Error('VANTAGE database update is blocked. Close every other VANTAGE tab/app window, then reopen it.'));
    request.onerror = () => reject(request.error);
  });
}

function schemaNeedsRepair(database) {
  for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
    if (!database.objectStoreNames.contains(name)) return true;
    if (!definition.indexes.length) continue;
    const transaction = database.transaction(name, 'readonly');
    const store = transaction.objectStore(name);
    for (const [indexName] of definition.indexes) {
      if (!store.indexNames.contains(indexName)) return true;
    }
  }
  return false;
}

async function openAndRepairDatabase() {
  // Open the database at its current version first. This avoids VersionError if a
  // prior self-repair has already advanced beyond the build's base version.
  let database = await openRequest();
  if (!schemaNeedsRepair(database)) return database;

  const repairVersion = Math.max(DB_VERSION, Number(database.version || 0) + 1);
  database.close();
  database = await openRequest(repairVersion, { upgrade: true });
  if (schemaNeedsRepair(database)) {
    database.close();
    throw new Error('VANTAGE could not repair its local database schema. Do not reset the app; export a backup and report this error.');
  }
  return database;
}

export function openDatabase() {
  if (!databasePromise) {
    databasePromise = openAndRepairDatabase().catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function transact(storeName, mode, callback) {
  let database = await openDatabase();
  if (!database.objectStoreNames.contains(storeName)) {
    database.close();
    databasePromise = null;
    database = await openDatabase();
    if (!database.objectStoreNames.contains(storeName)) throw new Error(`Local storage area ${storeName} is unavailable.`);
  }
  return new Promise((resolve, reject) => {
    const activeDatabase = database.objectStoreNames.contains(storeName) ? database : null;
    if (!activeDatabase) return reject(new Error(`Local storage area ${storeName} is unavailable.`));
    const transaction = activeDatabase.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).index(indexName).getAll(key));
}

export async function get(storeName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const result = await transact(storeName, 'readwrite', store => store.put(value));
  notifyLocalChange(storeName, 'put');
  return result;
}

export async function putMany(storeName, values) {
  if (!values.length) return;
  const result = await transact(storeName, 'readwrite', store => {
    for (const value of values) store.put(value);
  });
  notifyLocalChange(storeName, 'putMany');
  return result;
}

export async function remove(storeName, key) {
  const result = await transact(storeName, 'readwrite', store => store.delete(key));
  notifyLocalChange(storeName, 'remove');
  return result;
}

export async function clear(storeName) {
  return transact(storeName, 'readwrite', store => store.clear());
}

export async function clearAll() {
  for (const store of STORES) await clear(store);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl).split(',');
  const type = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

export async function exportDatabase() {
  const output = { schemaVersion: 12, exportedAt: new Date().toISOString(), app: 'VANTAGE Training Console' };
  for (const store of STORES) {
    const rows = await getAll(store);
    if (['sessionMedia', 'exerciseMedia', 'supplementMedia'].includes(store)) {
      output[store] = await Promise.all(rows.map(async item => ({
        ...item,
        blob: undefined,
        dataUrl: item.blob instanceof Blob ? await blobToDataUrl(item.blob) : item.dataUrl || null
      })));
    } else {
      output[store] = rows;
    }
  }
  return output;
}

export async function importDatabase(payload, { replace = true } = {}) {
  if (!payload || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(payload.schemaVersion)) throw new Error('Unsupported or invalid backup');
  if (replace) await clearAll();
  for (const store of STORES) {
    let rows = Array.isArray(payload[store]) ? payload[store] : [];
    if (['sessionMedia', 'exerciseMedia', 'supplementMedia'].includes(store)) {
      rows = rows.map(item => ({
        ...item,
        blob: item.dataUrl ? dataUrlToBlob(item.dataUrl) : item.blob,
        dataUrl: undefined
      })).filter(item => item.blob instanceof Blob);
    }
    await putMany(store, rows);
  }
}

export { STORES };
