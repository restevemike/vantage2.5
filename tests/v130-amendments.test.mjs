import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { parseNutritionMarkdown } from '../nutrition-markdown.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const workoutMarkdown = await readFile(new URL('../workout-markdown.js', import.meta.url), 'utf8');

 test('v1.3 branding uses the supplied Vantage palette and icon assets', () => {
  assert.match(html, /<h1>Vantage<\/h1>/);
  assert.match(html, /vantage-app-icon-dark\.svg/);
  assert.match(html, /vantage-full-logo\.svg/);
  assert.match(css, /--bg: #111315/);
  assert.match(css, /--accent: #899197/);
  assert.match(css, /--muted: #9ca2a6/);
  assert.equal(manifest.theme_color, '#111315');
  assert.equal(manifest.short_name, 'Vantage');
});

test('all PWA timers are removed and manual duration/rest fields remain', () => {
  assert.doesNotMatch(html, /data-rest-timer|data-rest-action="start"/);
  assert.doesNotMatch(js, /startRestTimer|startRecoveryTimer|startLissTimer|timestampDurationSeconds/);
  assert.match(html, /id="lissManualDurationMinutes"/);
  assert.match(js, /durationInputMode: 'manual'/);
  assert.match(js, /Rest after set in seconds/);
  assert.match(workoutMarkdown, /restSeconds/);
});

test('NOOP summary OCR parses labelled metrics and keeps suspicious zero calories', () => {
  const parsed = parseFitnessSummaryText('Walking 29 Jul 2026 17:59 - 18:46 Duration 47m AVG 95 bpm PEAK 119 bpm LOW 58 bpm CALORIES 0 kcal DISTANCE 4.9 km EFFORT 0.7 From strap HR Z1 87% / 37m Z2 13% / 5m Z3 0% / 0m Z4 0% / 0m Z5 0% / 0m', { expectedContext: 'liss' });
  assert.equal(parsed.sourceRole, 'noopStrapSessionSummary');
  assert.equal(parsed.metrics.dateShown, '2026-07-29');
  assert.equal(parsed.metrics.avgHr, 95);
  assert.equal(parsed.metrics.maxHr, 119);
  assert.equal(parsed.metrics.minHr, 58);
  assert.equal(parsed.metrics.distanceKm, 4.9);
  assert.equal(parsed.metrics.calories, 0);
  assert.equal(parsed.metrics.hrZones.z1Percent, 87);
  assert.ok(parsed.warnings.some(item => /Calories show 0/.test(item)));
});

test('OCR review provides grid, capture guidance and explicit confirmation', () => {
  assert.match(html, /id="ocrReviewDialog"/);
  assert.match(html, /class="ocr-grid"/);
  assert.match(html, /Use one summary screen per image/);
  assert.match(html, /Review every number/);
  assert.match(html, /id="applyOcrSuggestionsButton"/);
  assert.match(js, /Existing structured value preserved/);
});

test('Alex macro files retain targets and coaching notes', () => {
  const parsed = parseNutritionMarkdown('```vantage-macros\n'+JSON.stringify({schema:'vantage-macros-v1',date:'2026-07-31',meals:[],dailyTotals:{protein:155,carbs:145,fat:38,calories:1650},targets:{protein:{min:190,max:220},carbs:{min:260,max:340},fat:{min:45,max:65},calories:{min:2400,max:2800}},coachingNotes:['Carbs are low for leg day.']})+'\n```');
  assert.equal(parsed.macroSource, 'alex-generated-markdown');
  assert.deepEqual(parsed.targets.protein, {min:190,max:220});
  assert.deepEqual(parsed.coachingNotes, ['Carbs are low for leg day.']);
  assert.match(html, /What can I have next\?/);
  assert.match(js, /Macro guidance unavailable/);
});
