import {
  configureCloud, cloudConfig, cloudSession, sendMagicLink, signOutCloud,
  pushCoreSnapshot, inspectCloudSnapshot, restoreCoreSnapshot
} from './cloud-sync.js?v=1.4.4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function panelHtml() {
  const cfg = cloudConfig();
  return `
    <section id="cloudSyncPanel" class="panel data-actions">
      <div class="panel-heading">
        <div><p class="eyebrow">Phase 2A</p><h3>VANTAGE Cloud Sync</h3></div>
        <span id="cloudSyncBadge" class="source-badge">Local-first</span>
      </div>
      <p>Secure account-based cloud snapshot for VANTAGE core data. Local IndexedDB remains primary. Photos/media are deliberately excluded in Phase 2A and remain on this device.</p>
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
        <button id="cloudPushSnapshot" class="button button-success button-wide" type="button" disabled>Sync core data now</button>
        <button id="cloudRestoreSnapshot" class="button button-ghost button-wide" type="button" disabled>Restore core data from cloud</button>
      </div>
      <div id="cloudSyncStatus" class="import-status" aria-live="polite"><div class="empty-state compact-empty">No cloud sync completed yet.</div></div>
      <p class="camera-storage-note"><strong>Phase 2A:</strong> sessions, vitals, meals, templates, settings, exercises, nutrition summaries, recovery, bloodwork, measurements, cycles, supplements and programmes sync. Session/exercise/supplement images do not sync yet.</p>
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

async function refreshAuth() {
  const account = document.querySelector('#cloudAccountStatus');
  const push = document.querySelector('#cloudPushSnapshot');
  const restore = document.querySelector('#cloudRestoreSnapshot');
  const signOut = document.querySelector('#cloudSignOut');
  const badge = document.querySelector('#cloudSyncBadge');
  try {
    const session = await cloudSession();
    if (session?.user) {
      account.innerHTML = `<div class="alert alert-info"><strong>Signed in</strong><br>${escapeHtml(session.user.email || session.user.id)}</div>`;
      push.disabled = false;
      restore.disabled = false;
      signOut.hidden = false;
      badge.textContent = 'Cloud connected';
      const remote = await inspectCloudSnapshot();
      if (remote) {
        setStatus(`Cloud snapshot available · schema ${remote.schema_version} · updated ${new Date(remote.updated_at).toLocaleString('en-GB')}`, 'info');
      }
      return;
    }
  } catch (error) {
    if (cloudConfig().url && cloudConfig().key) setStatus(error.message, 'warning');
  }
  account.innerHTML = '<div class="empty-state compact-empty">Cloud account not signed in.</div>';
  push.disabled = true;
  restore.disabled = true;
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
      await sendMagicLink(document.querySelector('#cloudEmail').value);
      setStatus('Sign-in link sent. Open it on this device to connect VANTAGE.', 'info');
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
  refreshAuth();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPanel);
else installPanel();
