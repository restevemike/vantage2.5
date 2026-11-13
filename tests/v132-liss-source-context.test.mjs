import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { classifyLissSession, createLissMarkdown } from '../liss-markdown.js';

const noopText = `
Treadmill walk
31 Jul 2026
TIME 17:58 - 18:46
DURATION 48m
AVG HR 97 bpm
MAX HR 128 bpm
LOW HR 73 bpm
CALORIES 345 kcal
THIS SESSION EFFORT 2.2
HR ZONES From strap HR
Z1 81% 36m
Z2 19% 8m
Z3 0% 0m
Z4 0% 0m
Z5 0% 0m
`;

const treadmillText = `
47:00 Total Time
2.62 mi Distance
453 KCAL
739 ft Vertical Distance Gained
141 / 2.4 Avg Watts / Mets
Speed Max 3.5 mph Avg 3.4 mph
Pace Max 17:08 min/mi Avg 17:38 min/mi
Incline Max 6.0% Avg 5.3%
Heart Rate Max 97 Avg 87
`;

test('v1.3.3 OCR keeps NOOP low HR, effort and zones distinct', () => {
  const result = parseFitnessSummaryText(noopText, { roleHint: 'noopStrapSessionSummary' });
  assert.equal(result.sourceRole, 'noopStrapSessionSummary');
  assert.equal(result.metrics.avgHr, 97);
  assert.equal(result.metrics.maxHr, 128);
  assert.equal(result.metrics.minHr, 73);
  assert.equal(result.metrics.effort, 2.2);
  assert.equal(result.metrics.calories, 345);
  assert.deepEqual(result.metrics.hrZones, {
    z1Percent: 81, z1Minutes: 36,
    z2Percent: 19, z2Minutes: 8,
    z3Percent: 0, z3Minutes: 0,
    z4Percent: 0, z4Minutes: 0,
    z5Percent: 0, z5Minutes: 0
  });
});

test('v1.3.3 OCR extracts treadmill console metrics without flattening sources', () => {
  const result = parseFitnessSummaryText(treadmillText, { roleHint: 'treadmillMachineConsole' });
  assert.equal(result.sourceRole, 'treadmillMachineConsole');
  assert.equal(result.metrics.totalTime, '47:00');
  assert.equal(result.metrics.distanceMiles, 2.62);
  assert.equal(result.metrics.calories, 453);
  assert.equal(result.metrics.verticalDistanceFeet, 739);
  assert.equal(result.metrics.avgWatts, 141);
  assert.equal(result.metrics.avgMets, 2.4);
  assert.equal(result.metrics.maxSpeedMph, 3.5);
  assert.equal(result.metrics.avgSpeedMph, 3.4);
  assert.equal(result.metrics.maxPacePerMile, '17:08');
  assert.equal(result.metrics.avgPacePerMile, '17:38');
  assert.equal(result.metrics.maxInclinePercent, 6);
  assert.equal(result.metrics.avgInclinePercent, 5.3);
  assert.equal(result.metrics.avgHr, 87);
  assert.equal(result.metrics.maxHr, 97);
});

test('v1.3.3 classifies the example as recovery-LISS with explicit cautions', () => {
  const sources = {
    vantageStrap: {
      activityShown: 'Treadmill walk', durationMinutes: 48,
      avgHr: 97, maxHr: 128, minHr: 73, calories: 345, effort: 2.2,
      hrZones: { z1Percent: 81, z1Minutes: 36, z2Percent: 19, z2Minutes: 8, z3Percent: 0, z3Minutes: 0, z4Percent: 0, z4Minutes: 0, z5Percent: 0, z5Minutes: 0 }
    },
    treadmillMachine: { totalTime: '47:00', avgInclinePercent: 5.3 }
  };
  const result = classifyLissSession({ session: { cardio: { activityType: 'treadmill-walk' } }, sources });
  assert.equal(result.type, 'true-liss');
  assert.equal(result.confidence, 'high');
  assert.equal(result.readinessCompliance, 'within-target');
  assert.ok(result.reasons.some(item => /Z1\/Z2 100%/.test(item)));
});

test('v1.3.3 Coach Pack includes both images, source conflicts, hydration and potato correction', () => {
  const noop = parseFitnessSummaryText(noopText, { roleHint: 'noopStrapSessionSummary' }).metrics;
  const machine = parseFitnessSummaryText(treadmillText, { roleHint: 'treadmillMachineConsole' }).metrics;
  const session = {
    id: 'liss-2026-07-31', date: '2026-07-31', startedAt: '2026-07-31T16:58:00Z', completedAt: '2026-07-31T17:46:00Z',
    cardio: {
      activityType: 'treadmill-walk', elapsedSeconds: 2880, manualDurationMinutes: 48,
      nasalBreathing: true, comments: 'Previous day was a long leg session.',
      sources: { vantageStrap: noop, treadmillMachine: machine },
      hydration: { otherFluidMl: 500, aminoAcids: 'EAAs', electrolytes: 'Electrolytes' },
      macroContextCorrection: 'Meal 2 used cooked potatoes, not rice.'
    }
  };
  const markdown = createLissMarkdown({
    session,
    meals: [{ mealNumber: 2, foods: '250g cooked chicken, 250g cooked rice, greens/salad', protein: 75, carbs: 70, fat: 7, calories: 650 }],
    media: [
      { id: 'noop', name: 'noop.png', archivePath: 'media/noop.png', type: 'image/png', size: 1000, sourceRole: 'noopStrapSessionSummary', sourceRoleConfirmed: true, mappingConfidence: 'user-confirmed', extractionStatus: 'ocr-confirmed', ocrMetrics: noop },
      { id: 'machine', name: 'machine.jpg', archivePath: 'media/machine.jpg', type: 'image/jpeg', size: 1000, sourceRole: 'treadmillMachineConsole', sourceRoleConfirmed: true, mappingConfidence: 'user-confirmed', extractionStatus: 'ocr-confirmed', ocrMetrics: machine }
    ]
  });

  assert.match(markdown, /media\/noop\.png/);
  assert.match(markdown, /media\/machine\.jpg/);
  assert.match(markdown, /NOOP Strap session summary/);
  assert.match(markdown, /Treadmill\/machine console/);
  assert.match(markdown, /345 kcal/);
  assert.match(markdown, /453 kcal/);
  assert.match(markdown, /500 ml · contains EAAs \+ electrolytes · hydration only/);
  assert.match(markdown, /250g cooked chicken, 250g cooked potatoes, greens\/salad/);
  assert.match(markdown, /"type": "true-liss"/);
  assert.match(markdown, /"noopStrapSessionSummary": 345/);
  assert.match(markdown, /"treadmillMachineConsole": 453/);
  assert.match(markdown, /"field": "duration"/);
});

import { readFile } from 'node:fs/promises';

test('v1.3.3 UI exposes per-image OCR, hydration correction and cache-busted launcher assets', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.match(app, /Run OCR on this image/);
  assert.match(html, /id="lissOtherFluidMl"/);
  assert.match(html, /id="lissAminoAcids"/);
  assert.match(html, /id="lissMacroCorrection"/);
  assert.match(app, /openOcrReview\('liss', item\.id\)/);
  assert.match(sw, /vantage-training-console-v15-0/);
  assert.equal(manifest.id, './vantage-training-console-v133');
  assert.equal(manifest.start_url, './?pwa=150');
  assert.equal(manifest.icons[0].src, 'icons/vantage-icon-192-v133.png');
});
