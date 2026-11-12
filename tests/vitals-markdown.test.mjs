import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVitalsMarkdown } from '../vitals-markdown.js';

test('parses preferred vantage-vitals JSON block', () => {
  const result = parseVitalsMarkdown(`# Vitals\n\n\`\`\`vantage-vitals\n{
    "date":"2026-07-14", "recovery":78, "hrv":"96 ms", "bloodPressure":"126/76",
    "sleepHours":"7h 30m", "feeling":"Great", "symptoms":false,
    "recoveryActivities":["Inversion", "post meal walk"]
  }\n\`\`\``);
  assert.equal(result.values.date, '2026-07-14');
  assert.equal(result.values.recovery, 78);
  assert.equal(result.values.hrv, 96);
  assert.equal(result.values.systolic, 126);
  assert.equal(result.values.diastolic, 76);
  assert.equal(result.values.sleepHours, 7.5);
  assert.equal(result.values.feeling, 'good');
  assert.equal(result.values.recoveryActivities, undefined);
  assert.ok(result.warnings.some(item => /Recovery activities in this vitals file were ignored/i.test(item)));
});

test('parses Markdown table and UK date', () => {
  const result = parseVitalsMarkdown(`| Field | Value |\n|---|---|\n| Date | 14/07/2026 |\n| NOOP recovery (%) | 81% |\n| Resting HR | 52 bpm |\n| BP | 132/78 |\n| Symptoms present | No |`);
  assert.equal(result.values.date, '2026-07-14');
  assert.equal(result.values.recovery, 81);
  assert.equal(result.values.restingHr, 52);
  assert.equal(result.values.systolic, 132);
  assert.equal(result.values.symptoms, false);
});

test('rejects unsupported content', () => {
  assert.throws(() => parseVitalsMarkdown('# Nothing useful here'), /No supported VANTAGE vital fields/);
});

test('skips unsafe out-of-range values with warnings', () => {
  const result = parseVitalsMarkdown('**HRV:** 9999\n**Weight:** 98 kg');
  assert.equal(result.values.hrv, undefined);
  assert.equal(result.values.weight, 98);
  assert.ok(result.warnings.length > 0);
});

test('accepts the 30 July extended vitals schema and a missing closing fence', () => {
  const result = parseVitalsMarkdown(`\`\`\`vantage-vitals
{
  "schema": "vantage-vitals-v1",
  "date": "2026-07-30",
  "recovery": 91,
  "charge": 91,
  "restScore": 89,
  "synthesis": "Maintain",
  "hrv": 78,
  "hrvBaselineDelta": 14,
  "restingHr": 40,
  "rhrBaselineDelta": -1,
  "stress": 0.5,
  "sleepHours": 7.37,
  "sleepPerformance": 98,
  "sleepDebtMinutes": 8,
  "bloodPressure": "133/79",
  "bloodPressurePulse": 46,
  "weight": 91.4,
  "feeling": "green; leg day approved",
  "symptoms": false
}`);
  assert.equal(result.values.date, '2026-07-30');
  assert.equal(result.values.synthesis, 'Maintain');
  assert.equal(result.values.hrvDeltaFromBaseline, 14);
  assert.equal(result.values.rhrDeltaFromBaseline, -1);
  assert.equal(result.values.sleepDebt, 0.13);
  assert.equal(result.values.pulse, 46);
  assert.equal(result.values.feeling, 'good');
  assert.equal(result.values.systolic, 133);
  assert.equal(result.values.diastolic, 79);
});
