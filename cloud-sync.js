import * as db from './db.js?v=1.5.2';

const CONFIG_KEY = 'vantage-cloud-config-v1';
const DEFAULT_CLOUD_CONFIG = {
  url: 'https://uikytbpxkbbosjqgrtqr.supabase.co',
  key: 'sb_publishable_BqXRkEGOj0Erzr14GGcScA_UsIY2wSD'
};
const MEDIA_STORES = new Set(['sessionMedia', 'exerciseMedia', 'supplementMedia']);
const CORE_STORES = db.STORES.filter(name => !MEDIA_STORES.has(name));
const MEDIA_BUCKET = 'vantage-media';
const CORE_BASELINE_PREFIX = 'vantage-cloud-core-baseline-v2:';
const MEDIA_BASELINE_PREFIX = 'vantage-cloud-media-baseline-v1:';

let supabase = null;
let currentSession = null;
let authSubscription = null;

function readConfig() {
  try { return { ...DEFAULT_CLOUD_CONFIG, ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}) }; }
  catch { return { ...DEFAULT_CLOUD_CONFIG }; }
}
function saveConfig(config) { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }

async function loadSupabase() {
  if (supabase) return supabase;
  const config = readConfig();
  if (!config.url || !config.key) throw new Error('Enter your Supabase project URL and publishable key first.');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  currentSession = data.session || null;
  if (!authSubscription) {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      currentSession = session || null;
      window.dispatchEvent(new CustomEvent('vantage-cloud-auth-change', { detail: { session: currentSession } }));
    });
    authSubscription = listener?.subscription || null;
  }
  return supabase;
}

async function requireSession() {
  const client = await loadSupabase();
  const session = currentSession || (await client.auth.getSession()).data.session;
  if (!session?.user?.id) throw new Error('Sign in before syncing.');
  currentSession = session;
  return { client, session };
}

export async function configureCloud({ url, key }) {
  const cleanUrl = String(url || '').trim().replace(/\/$/, '');
  const cleanKey = String(key || '').trim();
  if (!/^https:\/\/.+\.supabase\.co$/.test(cleanUrl)) throw new Error('Enter a valid Supabase project URL.');
  if (!cleanKey) throw new Error('Enter the Supabase publishable key.');
  saveConfig({ url: cleanUrl, key: cleanKey });
  authSubscription?.unsubscribe?.();
  authSubscription = null;
  supabase = null;
  currentSession = null;
  return loadSupabase();
}
export function cloudConfig() { return readConfig(); }
export async function cloudSession() { await loadSupabase(); return currentSession; }

export async function sendMagicLink(email) {
  const client = await loadSupabase();
  const address = String(email || '').trim().toLowerCase();
  if (!address) throw new Error('Enter your email address.');
  const redirect = new URL('./', window.location.href);
  redirect.hash = '';
  redirect.search = '';
  const { error } = await client.auth.signInWithOtp({
    email: address,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirect.toString()
    }
  });
  if (error) throw error;
  return { email: address, redirectTo: redirect.toString() };
}

export async function signOutCloud() {
  const client = await loadSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
async function sha256Text(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function rowFingerprint(row) { return sha256Text(stable(row)); }
function rowId(store, row) {
  const value = row?.id ?? row?.key;
  if (value === undefined || value === null || value === '') throw new Error(`A ${store} record is missing its primary key.`);
  return String(value);
}
function compositeKey(store, id) { return `${store}\u0000${id}`; }
function readBaseline(prefix, userId) {
  try { return JSON.parse(localStorage.getItem(prefix + userId) || '{}') || {}; } catch { return {}; }
}
function saveBaseline(prefix, userId, value) {
  localStorage.setItem(prefix + userId, JSON.stringify(value));
}

async function localCoreMap() {
  const map = new Map();
  for (const store of CORE_STORES) {
    for (const row of await db.getAll(store)) {
      const id = rowId(store, row);
      map.set(compositeKey(store, id), { store, id, payload: row, fingerprint: await rowFingerprint(row) });
    }
  }
  return map;
}
async function remoteCoreMap(client, userId) {
  const { data, error } = await client.from('vantage_cloud_records')
    .select('store_name,record_id,payload,fingerprint,updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return new Map((data || []).map(row => [
    compositeKey(row.store_name, row.record_id),
    { store: row.store_name, id: String(row.record_id), payload: row.payload, fingerprint: row.fingerprint, updatedAt: row.updated_at }
  ]));
}

export async function syncCoreIncremental() {
  const { client, session } = await requireSession();
  const userId = session.user.id;
  const local = await localCoreMap();
  const remote = await remoteCoreMap(client, userId);
  const baseline = readBaseline(CORE_BASELINE_PREFIX, userId);
  const nextBaseline = { ...baseline };
  const uploads = [];
  const remoteDeletes = [];
  const localWrites = [];
  const localDeletes = [];
  const conflicts = [];
  const keys = new Set([...local.keys(), ...remote.keys(), ...Object.keys(baseline)]);

  for (const key of keys) {
    const l = local.get(key);
    const r = remote.get(key);
    const base = baseline[key] || null;
    const lf = l?.fingerprint || null;
    const rf = r?.fingerprint || null;

    if (!base) {
      if (lf && !rf) uploads.push(l);
      else if (!lf && rf) localWrites.push(r);
      else if (lf && rf && lf !== rf) conflicts.push(key);
      if (lf === rf && lf) nextBaseline[key] = lf;
      continue;
    }

    const localChanged = lf !== base;
    const remoteChanged = rf !== base;
    if (!localChanged && !remoteChanged) { nextBaseline[key] = base; continue; }

    if (localChanged && !remoteChanged) {
      if (l) uploads.push(l); else remoteDeletes.push(r);
      continue;
    }
    if (!localChanged && remoteChanged) {
      if (r) localWrites.push(r); else localDeletes.push(l);
      continue;
    }
    if (lf === rf) {
      if (lf) nextBaseline[key] = lf; else delete nextBaseline[key];
    } else {
      conflicts.push(key);
    }
  }

  if (uploads.length) {
    const rows = uploads.map(item => ({
      user_id: userId, store_name: item.store, record_id: item.id,
      payload: item.payload, fingerprint: item.fingerprint, client_updated_at: new Date().toISOString()
    }));
    const { error } = await client.from('vantage_cloud_records').upsert(rows, { onConflict: 'user_id,store_name,record_id' });
    if (error) throw error;
    for (const item of uploads) nextBaseline[compositeKey(item.store, item.id)] = item.fingerprint;
  }
  for (const item of remoteDeletes.filter(Boolean)) {
    const { error } = await client.from('vantage_cloud_records').delete()
      .eq('user_id', userId).eq('store_name', item.store).eq('record_id', item.id);
    if (error) throw error;
    delete nextBaseline[compositeKey(item.store, item.id)];
  }
  globalThis.__vantageCloudApplying = true;
  try {
    for (const item of localWrites) {
      if (!CORE_STORES.includes(item.store)) continue;
      await db.put(item.store, item.payload);
      nextBaseline[compositeKey(item.store, item.id)] = item.fingerprint;
    }
    for (const item of localDeletes.filter(Boolean)) {
      await db.remove(item.store, item.id);
      delete nextBaseline[compositeKey(item.store, item.id)];
    }
  } finally {
    globalThis.__vantageCloudApplying = false;
  }

  saveBaseline(CORE_BASELINE_PREFIX, userId, nextBaseline);
  localStorage.setItem('vantage-cloud-last-incremental-sync', new Date().toISOString());
  return {
    uploaded: uploads.length,
    downloaded: localWrites.length,
    remoteDeleted: remoteDeletes.filter(Boolean).length,
    localDeleted: localDeletes.filter(Boolean).length,
    conflicts: conflicts.map(key => key.replace('\u0000', ':'))
  };
}

function stripBlob(row) {
  const { blob, dataUrl, ...metadata } = row || {};
  return metadata;
}
async function blobDigest(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function localMediaMap() {
  const map = new Map();
  for (const store of MEDIA_STORES) {
    for (const row of await db.getAll(store)) {
      if (!(row?.blob instanceof Blob)) continue;
      const id = rowId(store, row);
      const metadata = stripBlob(row);
      const contentHash = await blobDigest(row.blob);
      const fingerprint = await sha256Text(stable(metadata) + ':' + contentHash);
      map.set(compositeKey(store, id), {
        store, id, payload: metadata, blob: row.blob, fingerprint,
        mimeType: row.blob.type || 'application/octet-stream', byteSize: row.blob.size
      });
    }
  }
  return map;
}
async function remoteMediaMap(client, userId) {
  const { data, error } = await client.from('vantage_cloud_media')
    .select('store_name,record_id,payload,fingerprint,object_path,mime_type,byte_size,updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return new Map((data || []).map(row => [
    compositeKey(row.store_name, row.record_id),
    {
      store: row.store_name, id: String(row.record_id), payload: row.payload,
      fingerprint: row.fingerprint, objectPath: row.object_path,
      mimeType: row.mime_type, byteSize: row.byte_size, updatedAt: row.updated_at
    }
  ]));
}
function mediaPath(userId, store, id) {
  return `${userId}/${store}/${encodeURIComponent(id)}`;
}
async function downloadRemoteMedia(client, item) {
  const { data, error } = await client.storage.from(MEDIA_BUCKET).download(item.objectPath);
  if (error) throw error;
  return data;
}

export async function syncMediaIncremental() {
  const { client, session } = await requireSession();
  const userId = session.user.id;
  const local = await localMediaMap();
  const remote = await remoteMediaMap(client, userId);
  const baseline = readBaseline(MEDIA_BASELINE_PREFIX, userId);
  const nextBaseline = { ...baseline };
  const uploads = [];
  const downloads = [];
  const remoteDeletes = [];
  const localDeletes = [];
  const conflicts = [];
  const keys = new Set([...local.keys(), ...remote.keys(), ...Object.keys(baseline)]);

  for (const key of keys) {
    const l = local.get(key), r = remote.get(key), base = baseline[key] || null;
    const lf = l?.fingerprint || null, rf = r?.fingerprint || null;
    if (!base) {
      if (lf && !rf) uploads.push(l);
      else if (!lf && rf) downloads.push(r);
      else if (lf && rf && lf !== rf) conflicts.push(key);
      if (lf === rf && lf) nextBaseline[key] = lf;
      continue;
    }
    const lc = lf !== base, rc = rf !== base;
    if (!lc && !rc) { nextBaseline[key] = base; continue; }
    if (lc && !rc) { if (l) uploads.push(l); else remoteDeletes.push(r); continue; }
    if (!lc && rc) { if (r) downloads.push(r); else localDeletes.push(l); continue; }
    if (lf === rf) { if (lf) nextBaseline[key] = lf; else delete nextBaseline[key]; }
    else conflicts.push(key);
  }

  for (const item of uploads) {
    const objectPath = mediaPath(userId, item.store, item.id);
    const uploaded = await client.storage.from(MEDIA_BUCKET).upload(objectPath, item.blob, {
      upsert: true, contentType: item.mimeType, cacheControl: '3600'
    });
    if (uploaded.error) throw uploaded.error;
    const { error } = await client.from('vantage_cloud_media').upsert({
      user_id: userId, store_name: item.store, record_id: item.id,
      payload: item.payload, fingerprint: item.fingerprint, object_path: objectPath,
      mime_type: item.mimeType, byte_size: item.byteSize, client_updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,store_name,record_id' });
    if (error) throw error;
    nextBaseline[compositeKey(item.store, item.id)] = item.fingerprint;
  }

  globalThis.__vantageCloudApplying = true;
  try {
    for (const item of downloads) {
      if (!MEDIA_STORES.has(item.store)) continue;
      const blob = await downloadRemoteMedia(client, item);
      await db.put(item.store, { ...item.payload, blob });
      nextBaseline[compositeKey(item.store, item.id)] = item.fingerprint;
    }
  } finally {
    globalThis.__vantageCloudApplying = false;
  }

  for (const item of remoteDeletes.filter(Boolean)) {
    const { error: storageError } = await client.storage.from(MEDIA_BUCKET).remove([item.objectPath]);
    if (storageError) throw storageError;
    const { error } = await client.from('vantage_cloud_media').delete()
      .eq('user_id', userId).eq('store_name', item.store).eq('record_id', item.id);
    if (error) throw error;
    delete nextBaseline[compositeKey(item.store, item.id)];
  }

  globalThis.__vantageCloudApplying = true;
  try {
    for (const item of localDeletes.filter(Boolean)) {
      await db.remove(item.store, item.id);
      delete nextBaseline[compositeKey(item.store, item.id)];
    }
  } finally {
    globalThis.__vantageCloudApplying = false;
  }

  saveBaseline(MEDIA_BASELINE_PREFIX, userId, nextBaseline);
  localStorage.setItem('vantage-cloud-last-media-sync', new Date().toISOString());
  return {
    uploaded: uploads.length, downloaded: downloads.length,
    remoteDeleted: remoteDeletes.filter(Boolean).length,
    localDeleted: localDeletes.filter(Boolean).length,
    conflicts: conflicts.map(key => key.replace('\u0000', ':'))
  };
}

export async function syncAllIncremental() {
  const core = await syncCoreIncremental();
  const media = await syncMediaIncremental();
  return { core, media };
}

export async function cloudSyncStatus() {
  const { client, session } = await requireSession();
  const userId = session.user.id;
  const [{ count: coreCount, error: coreError }, { count: mediaCount, error: mediaError }] = await Promise.all([
    client.from('vantage_cloud_records').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('vantage_cloud_media').select('*', { count: 'exact', head: true }).eq('user_id', userId)
  ]);
  if (coreError) throw coreError;
  if (mediaError) throw mediaError;
  return {
    coreRecords: coreCount || 0,
    mediaRecords: mediaCount || 0,
    lastCoreSync: localStorage.getItem('vantage-cloud-last-incremental-sync'),
    lastMediaSync: localStorage.getItem('vantage-cloud-last-media-sync')
  };
}

// Phase 2A snapshot compatibility is retained as a rollback path.
export async function buildCoreSnapshot() {
  const exported = await db.exportDatabase();
  const snapshot = {
    snapshotFormat: 'vantage-cloud-core-v1',
    app: exported.app,
    schemaVersion: exported.schemaVersion,
    exportedAt: exported.exportedAt,
    cloudCreatedAt: new Date().toISOString(),
    mediaExcluded: true,
    excludedStores: [...MEDIA_STORES]
  };
  for (const store of CORE_STORES) snapshot[store] = exported[store] || [];
  return snapshot;
}
function snapshotCounts(snapshot) {
  return Object.fromEntries(CORE_STORES.map(store => [store, Array.isArray(snapshot?.[store]) ? snapshot[store].length : 0]));
}
export async function pushCoreSnapshot() {
  const { client, session } = await requireSession();
  const payload = await buildCoreSnapshot();
  const row = {
    user_id: session.user.id,
    schema_version: payload.schemaVersion,
    snapshot_format: payload.snapshotFormat,
    payload,
    record_counts: snapshotCounts(payload),
    client_updated_at: new Date().toISOString()
  };
  const { data, error } = await client.from('vantage_cloud_snapshots')
    .upsert(row, { onConflict: 'user_id' })
    .select('updated_at,client_updated_at,schema_version,record_counts').single();
  if (error) throw error;
  localStorage.setItem('vantage-cloud-last-push', data.updated_at || row.client_updated_at);
  return data;
}
export async function inspectCloudSnapshot() {
  const { client, session } = await requireSession();
  const { data, error } = await client.from('vantage_cloud_snapshots')
    .select('schema_version,snapshot_format,record_counts,updated_at,client_updated_at')
    .eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data || null;
}
export async function restoreCoreSnapshot() {
  const { client, session } = await requireSession();
  const { data, error } = await client.from('vantage_cloud_snapshots')
    .select('payload,updated_at').eq('user_id', session.user.id).single();
  if (error) throw error;
  const payload = data?.payload;
  if (!payload || payload.snapshotFormat !== 'vantage-cloud-core-v1') throw new Error('No compatible VANTAGE cloud snapshot was found.');
  for (const store of CORE_STORES) {
    await db.clear(store);
    const rows = Array.isArray(payload[store]) ? payload[store] : [];
    if (rows.length) await db.putMany(store, rows);
  }
  localStorage.setItem('vantage-cloud-last-restore', new Date().toISOString());
  return { updatedAt: data.updated_at, counts: snapshotCounts(payload) };
}
