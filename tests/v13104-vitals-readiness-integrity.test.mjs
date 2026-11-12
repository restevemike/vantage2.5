import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { calculateReadiness } from '../readiness.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const md26 = '```vantage-vitals\n' + JSON.stringify({
  schema:'vantage-vitals-v1', date:'2026-08-26', recovery:90, charge:90, rest:90,
  status:'Solid', synthesis:'Peak', guidance:'Maintain', hrv:70, hrvBaselineDelta:'+11 vs baseline',
  restingHr:43, restingHrBaselineDelta:'at baseline', respiratoryRate:16.0, stress:0.9, stressBand:'Low',
  sleep:'7h31m', sleepPerformance:100, sleepEfficiency:90, sleepDebt:'0m', hoursVsNeededPercent:100,
  restorativeSleepPercent:60, sleepLedger:'+2h07 surplus', bloodPressure:'139/72', bloodPressurePulse:51,
  weight:89.0, symptoms:false
}) + '\n```';

test('v1.3.10.6 keeps HRV and RHR baseline state independent on the 26 August dataset', () => {
  const r = parseVitalsMarkdown(md26);
  assert.equal(r.values.hrv, 70);
  assert.equal(r.values.hrvDeltaFromBaseline, 11);
  assert.equal(r.values.hrvBaselineStatus, 'above-baseline');
  assert.equal(r.values.restingHr, 43);
  assert.equal(r.values.rhrDeltaFromBaseline, null);
  assert.equal(r.values.rhrBaselineStatus, 'at-baseline');
  assert.equal(r.values.status, 'Solid');
  assert.equal(r.values.synthesis, 'Peak');
  assert.equal(r.values.guidance, 'Maintain');
  assert.equal(r.values.sleepHours, 7.52);
  assert.equal(r.values.sleepPerformance, 100);
  assert.equal(r.values.sleepEfficiency, 90);
  assert.equal(r.values.sleepDebt, 0);
  assert.equal(r.values.pulse, 51);
});

test('v1.3.10.6 does not generate false Red from at-baseline RHR', () => {
  const vitals = parseVitalsMarkdown(md26).values;
  const r = calculateReadiness(vitals);
  assert.notEqual(r.level, 'red');
  assert.doesNotMatch(r.reasons.join(' | '), /Resting HR is well above baseline/i);
  assert.equal(r.calculationAudit.rhrBaselineStatus, 'at-baseline');
  assert.equal(r.calculationAudit.rhrDelta, null);
});

test('v1.3.10.6 explicitly ignores a conflicting copied RHR delta when source says at baseline', () => {
  const r = calculateReadiness({ recovery:90, restScore:90, hrv:70, hrvDeltaFromBaseline:11, restingHr:43, rhrDeltaFromBaseline:11, rhrBaselineStatus:'at-baseline', synthesis:'Peak', stress:0.9, stressBand:'Low' });
  assert.notEqual(r.level, 'red');
  assert.equal(r.calculationAudit.rhrDelta, null);
  assert.ok(r.validationWarnings.some(w => /at baseline/i.test(w)));
});

test('v1.3.10.6 preserves current sleep summary while retaining detail conflict status', () => {
  const r = parseVitalsMarkdown('```vantage-vitals\n' + JSON.stringify({
    date:'2026-08-26', sleepSummary:{ sleep:'7h31m', performance:100, efficiency:90, debt:'0m', detailStatus:'date-conflict' }
  }) + '\n```');
  assert.equal(r.values.sleepHours, 7.52);
  assert.equal(r.values.sleepPerformance, 100);
  assert.equal(r.values.sleepEfficiency, 90);
  assert.equal(r.values.sleepDebt, 0);
  assert.equal(r.values.sleepStageDetailStatus, 'date-conflict');
});

test('v1.3.10.6 warns when structured vitals fields are unsupported instead of silently dropping them', () => {
  const r = parseVitalsMarkdown('```vantage-vitals\n' + JSON.stringify({date:'2026-08-26', recovery:90, futureMetric:{x:1}}) + '\n```');
  assert.ok(r.unsupportedFields.includes('futureMetric'));
  assert.ok(r.warnings.some(w => /Unknown VANTAGE vitals field: futureMetric/i.test(w)));
});

test('v1.3.10.6 workout Coach Pack exposes baseline states and readiness audit', () => {
  const vitals = parseVitalsMarkdown(md26).values;
  const readiness = calculateReadiness(vitals);
  const session = {id:'legs-26',date:'2026-08-26',sessionType:'Legs',startedAt:'2026-08-26T17:00:00Z',completedAt:'2026-08-26T18:00:00Z',exercises:[]};
  const md = createWorkoutMarkdown({session,vitals,readiness,appVersion:'1.3.10.6'});
  assert.match(md,/synthesis \/ guidance:\*\* Solid \/ Peak \/ Maintain/i);
  assert.match(md,/Resting HR.*At baseline/);
  assert.match(md,/Sleep.*7h31m/);
  assert.match(md,/readinessCalculationAudit/);
  assert.doesNotMatch(md,/Resting HR is well above baseline/);
});

test('v1.3.10.6 app persists import metadata, baseline status and weight-context checks', async () => {
  const [app,html] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url),'utf8'),
    readFile(new URL('../index.html', import.meta.url),'utf8')
  ]);
  assert.match(app,/pendingVitalsImport/);
  assert.match(app,/weightChangeContext/);
  assert.match(app,/thresholdKg:\s*2/);
  assert.match(html,/name="rhrBaselineStatus"/);
  assert.match(html,/option value="at-baseline">At baseline/);
  assert.match(html,/option>Peak<\/option>/);
});
