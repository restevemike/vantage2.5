import {
  configureCloud, cloudConfig, cloudSession, sendMagicLink, signOutCloud,
  syncCoreIncremental, syncMediaIncremental, syncAllIncremental, cloudSyncStatus,
  pushCoreSnapshot, inspectCloudSnapshot, restoreCoreSnapshot
} from './cloud-sync.js?v=1.5.2';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function panelHtml() {
  const cfg = cloudConfig();
  return `
    <section id="cloudSyncPanel" class="panel data-actions">
      <div class="panel-heading">
        <div><p class="eyebrow">Phase 2C</p><h3>VANTAGE Cloud Sync</h3></div>
        <span id="cloudSyncBadge" class="source-badge">Local-first</span>
      </div>
      <p>Automatic local-first cloud sync for VANTAGE records and private media. Sign in with a magic link; IndexedDB remains the working database and changes sync after a short delay when online.</p>
      <details id="cloudConfigDetails">
        <summary>Cloud connection</summary>
        <div class="form-grid">
          <label class="full-width">Supabase project URL<input id="cloudProjectUrl" type="url" autocomplete="off" value="${escapeHtml(cfg.url || '')}" placeholder="https://your-project.supabase.co"></label>
          <label class="full-width">Publishable key<input id="cloudPublishableKey" type="password" autocomplete="off" value="${escapeHtml(cfg.key || '')}" placeholder="sb_publishable_… / anon key"></label>
        </div>
        <button id="cloudSaveConfig" class="button button-ghost button-wide" type="button">Save cloud connection</button>
      </details>

      <div class="form-grid">
        <label class="full-width">Account email<input id="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
      </div>
      <div class="data-actions">
        <button id="cloudSendLink" class="button button-primary button-wide" type="button">Email sign-in link</button>
        <button id="cloudSignOut" class="button button-ghost button-wide" type="button" hidden>Sign out</button>
      </div>

      <div id="cloudAccountStatus" class="import-summary"><div class="empty-state compact-empty">Cloud account not connected.</div></div>

      <div class="data-actions">
        <button id="cloudSyncCore" class="button button-success button-wide" type="button" disabled>Sync core records</button>
        <button id="cloudSyncMedia" class="button button-primary button-wide" type="button" disabled>Sync private media</button>
        <button id="cloudPushSnapshot" class="button button-ghost button-wide" type="button" disabled>Create fallback snapshot</button>
        <button id="cloudRestoreSnapshot" class="button button-ghost button-wide" type="button" disabled>Restore fallback snapshot</button>
      </div>
      <div id="cloudSyncStatus" class="import-status" aria-live="polite"><div class="empty-state compact-empty">No cloud sync completed yet.</div></div>
      <p class="camera-storage-note"><strong>Phase 2C:</strong> saves trigger a debounced background sync when signed in and online. Manual sync buttons remain available. Conflicting edits are reported instead of silently overwritten.</p>
    </section>`;
}

function setStatus(message, kind = '') {
  const node = document.querySelector('#cloudSyncStatus');
  if (!node) return;
  node.innerHTML = `<div class="${kind ? 'alert alert-' + kind : 'empty-state compact-empty'}">${escapeHtml(message)}</div>`;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label || 'Working…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

const MEDIA_STORE_NAMES = new Set(['sessionMedia', 'exerciseMedia', 'supplementMedia']);
let autoSyncTimer = null;
let autoSyncRunning = false;
let autoSyncQueued = false;
let pendingCoreSync = false;
let pendingMediaSync = false;

function scheduleAutoSync(storeName = null, delayMs = 8000) {
  if (storeName) {
    if (MEDIA_STORE_NAMES.has(storeName)) pendingMediaSync = true;
    else pendingCoreSync = true;
  } else {
    pendingCoreSync = true;
    pendingMediaSync = true;
  }
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(runAutoSync, delayMs);
}

async function runAutoSync() {
  if (autoSyncRunning) {
    autoSyncQueued = true;
    return;
  }
  if (!navigator.onLine || document.visibilityState === 'hidden') {
    autoSyncQueued = true;
    return;
  }
  const session = await cloudSession().catch(() => null);
  if (!session?.user) return;

  autoSyncRunning = true;
  const badge = document.querySelector('#cloudSyncBadge');
  if (badge) badge.textContent = 'Syncing…';
  try {
    const results = [];
    if (pendingCoreSync && pendingMediaSync) {
      const result = await syncAllIncremental();
      results.push({ label: 'core', result: result.core }, { label: 'media', result: result.media });
    } else if (pendingCoreSync) {
      results.push({ label: 'core', result: await syncCoreIncremental() });
    } else if (pendingMediaSync) {
      results.push({ label: 'media', result: await syncMediaIncremental() });
    }
    pendingCoreSync = false;
    pendingMediaSync = false;

    const conflicts = results.flatMap(item => item.result?.conflicts || []);
    const uploaded = results.reduce((sum, item) => sum + Number(item.result?.uploaded || 0), 0);
    const downloaded = results.reduce((sum, item) => sum + Number(item.result?.downloaded || 0), 0);
    setStatus(`Auto sync complete · uploaded ${uploaded} · downloaded ${downloaded}${conflicts.length ? ` · conflicts ${conflicts.length}` : ' · no conflicts'}`, conflicts.length ? 'warning' : 'info');
  } catch (error) {
    autoSyncQueued = true;
    setStatus(`Auto sync pending: ${error.message}`, 'warning');
  } finally {
    autoSyncRunning = false;
    if (badge) badge.textContent = 'Cloud connected';
    if (autoSyncQueued && navigator.onLine && document.visibilityState !== 'hidden') {
      autoSyncQueued = false;
      scheduleAutoSync(null, 3000);
    }
  }
}

async function refreshAuth() {
  const account = document.querySelector('#cloudAccountStatus');
  const push = document.querySelector('#cloudPushSnapshot');
  const restore = document.querySelector('#cloudRestoreSnapshot');
  const syncCore = document.querySelector('#cloudSyncCore');
  const syncMedia = document.querySelector('#cloudSyncMedia');
  const signOut = document.querySelector('#cloudSignOut');
  const badge = document.querySelector('#cloudSyncBadge');
  try {
    const session = await cloudSession();
    if (session?.user) {
      account.innerHTML = `<div class="alert alert-info"><strong>Signed in</strong><br>${escapeHtml(session.user.email || session.user.id)}</div>`;
      push.disabled = false;
      restore.disabled = false;
      syncCore.disabled = false;
      syncMedia.disabled = false;
      signOut.hidden = false;
      badge.textContent = 'Cloud connected';
      scheduleAutoSync(null, 1500);
      try {
        const status = await cloudSyncStatus();
        setStatus(`Cloud ready · ${status.coreRecords} core records · ${status.mediaRecords} media records`, 'info');
      } catch (error) {
        setStatus(`Signed in, but Phase 2B storage is not ready: ${error.message}`, 'warning');
      }
      return;
    }
  } catch (error) {
    if (cloudConfig().url && cloudConfig().key) setStatus(error.message, 'warning');
  }
  account.innerHTML = '<div class="empty-state compact-empty">Cloud account not signed in.</div>';
  push.disabled = true;
  restore.disabled = true;
  syncCore.disabled = true;
  syncMedia.disabled = true;
  signOut.hidden = true;
  badge.textContent = 'Local-first';
}

function installPanel() {
  if (document.querySelector('#cloudSyncPanel')) return;
  const anchor = document.querySelector('#exportJsonButton')?.closest('section');
  if (!anchor) return;
  anchor.insertAdjacentHTML('beforebegin', panelHtml());

  document.querySelector('#cloudSaveConfig')?.addEventListener('click', async () => {
    const button = document.querySelector('#cloudSaveConfig');
    try {
      setBusy(button, true, 'Saving…');
      await configureCloud({
        url: document.querySelector('#cloudProjectUrl').value,
        key: document.querySelector('#cloudPublishableKey').value
      });
      setStatus('Cloud connection saved.', 'info');
      await refreshAuth();
    } catch (error) {
      setStatus(error.message, 'warning');
    } finally {
      setBusy(button, false);
      button.disabled = false;
    }
  });

  document.querySelector('#cloudSendLink')?.addEventListener('click', async () => {
    const button = document.querySelector('#cloudSendLink');
    try {
      setBusy(button, true, 'Sending…');
      const result = await sendMagicLink(document.querySelector('#cloudEmail').value);
      setStatus(`Sign-in link sent to ${result.email}. Open the newest email on this device; it will return to VANTAGE.`, 'info');
    } catch (error) {
      setStatus(error.message, 'warning');
    } finally {
      setBusy(button, false);
      button.disabled = false;
    }
  });

  document.querySelector('#cloudSignOut')?.addEventListener('click', async () => {
    try {
      await signOutCloud();
      setStatus('Signed out. Local VANTAGE data is unchanged.', 'info');
      await refreshAuth();
    } catch (error) { setStatus(error.message, 'warning'); }
  });

  document.querySelector('#cloudSyncCore')?.addEventListener('click', async () => {
    const button = document.querySelector('#cloudSyncCore');
    try {
      setBusy(button, true, 'Syncing records…');
      const result = await syncCoreIncremental();
      const conflicts = result.conflicts?.length ? ` · conflicts ${result.conflicts.length}` : ' · no conflicts';
      setStatus(`Core sync complete · uploaded ${result.uploaded} · downloaded ${result.downloaded}${conflicts}`, result.conflicts?.length ? 'warning' : 'info');
    } catch (error) {
      setStatus(`Core sync failed: ${error.message}`, 'warning');
    } finally {
      setBusy(button, false);
      button.disabled = false;
    }
  });

  document.querySelector('#cloudSyncMedia')?.addEventListener('click', async () => {
    const button = document.querySelector('#cloudSyncMedia');
    try {
      setBusy(button, true, 'Syncing media…');
      const result = await syncMediaIncremental();
      const conflicts = result.conflicts?.length ? ` · conflicts ${result.conflicts.length}` : ' · no conflicts';
      setStatus(`Private media sync complete · uploaded ${result.uploaded} · downloaded ${result.downloaded}${conflicts}`, result.conflicts?.length ? 'warning' : 'info');
    } catch (error) {
      setStatus(`Media sync failed: ${error.message}`, 'warning');
    } finally {
      setBusy(button, false);
      button.disabled = false;
    }
  });

  document.querySelector('#cloudPushSnapshot')?.addEventListener('click', async () => {
    const button = document.querySelector('#cloudPushSnapshot');
    try {
      setBusy(button, true, 'Syncing…');
      const result = await pushCoreSnapshot();
      setStatus(`Core snapshot synced successfully · ${new Date(result.updated_at || result.client_updated_at).toLocaleString('en-GB')}. Media remains local.`, 'info');
    } catch (error) {
      setStatus(`Sync failed: ${error.message}`, 'warning');
    } finally {
      setBusy(button, false);
      button.disabled = false;
    }
  });

  document.querySelector('#cloudRestoreSnapshot')?.addEventListener('click', async () => {
    if (!confirm('Restore VANTAGE core data from the cloud snapshot? Local photo/media stores will be preserved, but core records on this device will be replaced.')) return;
    const button = document.querySelector('#cloudRestoreSnapshot');
    try {
      setBusy(button, true, 'Restoring…');
      const result = await restoreCoreSnapshot();
      setStatus(`Core data restored from cloud · snapshot ${new Date(result.updatedAt).toLocaleString('en-GB')}. Reloading VANTAGE…`, 'info');
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      setStatus(`Restore failed: ${error.message}`, 'warning');
      setBusy(button, false);
      button.disabled = false;
    }
  });

  window.addEventListener('vantage-cloud-auth-change', refreshAuth);
  window.addEventListener('vantage-db-change', event => scheduleAutoSync(event.detail?.storeName || null));
  window.addEventListener('online', () => scheduleAutoSync(null, 1500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAutoSync(null, 1500);
  });
  refreshAuth();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPanel);
else installPanel();
