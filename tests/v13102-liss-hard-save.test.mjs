import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v1.3.10.6 Finish LISS commits session before all optional post-save work', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function completeCurrentLissSession()');
  const end = app.indexOf('async function importLissAnalysisFile', start);
  const fn = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(fn, /await db\.put\('sessions', completedSession\)/);
  assert.doesNotMatch(fn, /requestHydrationReminder/);
  assert.doesNotMatch(fn, /await sessionMedia/);
  assert.doesNotMatch(fn, /await launchLissShare/);
  assert.match(fn, /void finaliseSavedLissSessionAfterClose\(completedSession\)/);
  assert.match(fn, /state\.currentSession = null/);
  assert.ok(fn.indexOf("await db.put('sessions', completedSession)") < fn.indexOf('state.currentSession = null'));
});

test('v1.3.10.6 post-save LISS finaliser owns evidence, media and export work', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function finaliseSavedLissSessionAfterClose');
  const end = app.indexOf('async function completeCurrentLissSession()', start);
  const fn = app.slice(start, end);
  assert.match(fn, /await sessionMedia\(completedSession\.id\)/);
  assert.match(fn, /sourceCompletenessReview/);
  assert.match(fn, /await launchLissShare\(completedSession, media/);
  assert.match(fn, /LISS session is saved\. Coach Pack needs review in History/);
});

test('v1.3.10.6 app shell and service worker are cache-busted', async () => {
  const [html, sw, pkg] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8')
  ]);
  assert.match(html, /v1\.5\.6/);
  assert.match(html, /app\.js\?v=1\.5\.6/);
  assert.match(sw, /vantage-training-console-v15-6/);
  assert.equal(JSON.parse(pkg).version, '1.5.6');
});
