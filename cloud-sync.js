import * as db from './db.js?v=1.4.3';

const CONFIG_KEY = 'vantage-cloud-config-v1';
const DEFAULT_CLOUD_CONFIG = {
  url: 'https://uikytbpxkbbosjqgrtqr.supabase.co',
  key: 'sb_publishable_BqXRkEGOj0Erzr14GGcScA_UsIY2wSD'
};
const MEDIA_STORES = new Set(['sessionMedia', 'exerciseMedia', 'supplementMedia']);
const CORE_STORES = db.STORES.filter(name => !MEDIA_STORES.has(name));

let supabase = null;
let currentSession = null;
let authSubscription = null;

function readConfig() {
  try { return { ...DEFAULT_CLOUD_CONFIG, ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}) }; } catch { return { ...DEFAULT_CLOUD_CONFIG }; }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

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

export function cloudConfig() {
  return readConfig();
}

export async function cloudSession() {
  await loadSupabase();
  return currentSession;
}

export async function sendMagicLink(email) {
  const client = await loadSupabase();
  const address = String(email || '').trim();
  if (!address || !address.includes('@')) throw new Error('Enter a valid email address.');
  const redirect = location.href.split('#')[0].split('?')[0];
  const { error } = await client.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: redirect }
  });
  if (error) throw error;
  return true;
}

export async function signOutCloud() {
  const client = await loadSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

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
  const client = await loadSupabase();
  const session = currentSession || (await client.auth.getSession()).data.session;
  if (!session?.user?.id) throw new Error('Sign in before syncing.');
  const payload = await buildCoreSnapshot();
  const row = {
    user_id: session.user.id,
    schema_version: payload.schemaVersion,
    snapshot_format: payload.snapshotFormat,
    payload,
    record_counts: snapshotCounts(payload),
    client_updated_at: new Date().toISOString()
  };
  const { data, error } = await client
    .from('vantage_cloud_snapshots')
    .upsert(row, { onConflict: 'user_id' })
    .select('updated_at, client_updated_at, schema_version, record_counts')
    .single();
  if (error) throw error;
  localStorage.setItem('vantage-cloud-last-push', data.updated_at || row.client_updated_at);
  return data;
}

export async function inspectCloudSnapshot() {
  const client = await loadSupabase();
  const session = currentSession || (await client.auth.getSession()).data.session;
  if (!session?.user?.id) throw new Error('Sign in before restoring.');
  const { data, error } = await client
    .from('vantage_cloud_snapshots')
    .select('schema_version,snapshot_format,record_counts,updated_at,client_updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function restoreCoreSnapshot() {
  const client = await loadSupabase();
  const session = currentSession || (await client.auth.getSession()).data.session;
  if (!session?.user?.id) throw new Error('Sign in before restoring.');
  const { data, error } = await client
    .from('vantage_cloud_snapshots')
    .select('payload,updated_at')
    .eq('user_id', session.user.id)
    .single();
  if (error) throw error;
  const payload = data?.payload;
  if (!payload || payload.snapshotFormat !== 'vantage-cloud-core-v1') throw new Error('No compatible VANTAGE cloud snapshot was found.');

  // Core-only restore deliberately preserves local photo/media stores.
  for (const store of CORE_STORES) {
    await db.clear(store);
    const rows = Array.isArray(payload[store]) ? payload[store] : [];
    if (rows.length) await db.putMany(store, rows);
  }
  localStorage.setItem('vantage-cloud-last-restore', new Date().toISOString());
  return { updatedAt: data.updated_at, counts: snapshotCounts(payload) };
}
