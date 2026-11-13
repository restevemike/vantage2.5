import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('gallery controls use explicit Android-safe button triggers', () => {
  assert.match(html, /id="openLissGalleryButton"/);
  assert.match(html, /id="lissGalleryInput"[^>]*multiple/);
  assert.match(js, /openLissGalleryButton[^\n]+lissGalleryInput/);
  assert.match(js, /exercise-reference-gallery-button/);
});

test('image import reports progress and normalises missing MIME types', () => {
  assert.match(js, /function inferredImageType/);
  assert.match(js, /setImageImportStatus/);
  assert.match(js, /could not be decoded/);
  assert.match(css, /image-import-status/);
});

test('touch reorder uses pointer capture and a visible placeholder', () => {
  assert.match(js, /setPointerCapture/);
  assert.match(js, /exercise-drag-placeholder/);
  assert.match(js, /position: 'fixed'/);
  assert.match(css, /exercise-drag-placeholder/);
});

test('service worker cache is advanced for v1.3.10.6', () => {
  assert.match(sw, /vantage-training-console-v15-2/);
});

test('LISS review captures source-separated metrics and media roles', () => {
  assert.match(html, /data-liss-source="vantageStrap"/);
  assert.match(html, /data-liss-source="watchDevice"/);
  assert.match(html, /data-liss-source="treadmillMachine"/);
  assert.match(js, /liss-media-role/);
  assert.match(html, /id="lissPendingMediaReview"/);
  assert.match(html, /id="savePendingLissMediaButton"/);
  assert.match(js, /stageLissGalleryImages/);
  assert.match(js, /sourceRoleConfirmed/);
});


test('LISS analysis import preserves structured values until explicit confirmation', () => {
  assert.match(js, /compareLissSources/);
  assert.match(js, /Analysis values derived from screenshots are evidence, not overwrite commands/);
  assert.match(js, /data-liss-conflict-action/);
  assert.match(js, /confirmationAudit/);
  assert.match(css, /liss-conflict-review/);
  assert.match(js, /buildLissMediaRoleSuggestions/);
  assert.match(js, /resolveLissSourceImageOnly/);
  assert.match(js, /resolveLissMediaRoleSuggestion/);
});


test('workout UX exposes setup references, removal and manual rest entry per set', () => {
  assert.match(html, /exercise-reference-feature/);
  assert.match(html, /id="removeExerciseButton"/);
  assert.match(html, /<span>Rest<\/span>/);
  assert.match(js, /Rest after set in seconds/);
  assert.match(js, /restSeconds/);
  assert.doesNotMatch(html, /data-rest-timer/);
  assert.doesNotMatch(js, /startRestTimer/);
  assert.doesNotMatch(js, /launchAndroidSystemTimer/);
  assert.match(css, /exercise-reference-feature/);
});

test('LISS export guards against stale images and requires manual duration', () => {
  assert.match(js, /This write is deliberately the FIRST asynchronous dependency in Finish LISS/);
  assert.match(js, /staleMedia/);
  assert.match(html, /id="lissManualDurationMinutes"/);
  assert.match(js, /Enter the LISS duration in minutes before finishing/);
  assert.doesNotMatch(js, /timestampDurationSeconds/);
  assert.match(js, /Session saved — Coach Pack requires evidence review/);
  assert.match(js, /no .* console image attached\. Coach Pack export left for History/);
});

test('LISS captures pre-session BP, hydration and bulk screenshot confirmation', () => {
  assert.match(html, /id="lissPreSystolic"/);
  assert.match(html, /id="lissPreDiastolic"/);
  assert.match(html, /id="lissPrePulse"/);
  assert.match(html, /id="lissCoconutWaterMl"/);
  assert.match(html, /id="lissWaterMl"/);
  assert.match(html, /id="openLissBpButton"/);
  assert.match(js, /updatePreLissBpFromForm/);
  assert.match(js, /updateLissHydrationFromForm/);
  assert.match(js, /Populate all \$\{allImageOnly\.length\} clear screenshot/);
  assert.match(js, /source === 'all'/);
});


test('NOOP Strap and walking source roles are explicit in the LISS UI', () => {
  assert.match(html, /data-liss-activity="outdoor-walk"/);
  assert.match(html, /data-liss-activity="walking"/);
  assert.match(html, /NOOP Strap session summary/);
  assert.match(html, /outdoorWalkGpsSummary/);
  assert.match(js, /noopStrapSessionSummary/);
  assert.match(js, /sourceSystem: 'NOOP'/);
  assert.match(js, /sensor: 'noopStrap'/);
  assert.match(css, /liss-source-badges/);
});
