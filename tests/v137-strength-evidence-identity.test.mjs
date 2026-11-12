import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';
import { comparisonConfidence, duplicateSourceExerciseIds, strengthIdentityBlockingIssues } from '../strength-integrity.js';

const correctionOcr = `Weightlifting 06/08/2026 18:09-19:38 Duration 1h 29m
AVG 105 bpm PEAK 157 bpm LOW 82 bpm Calories 122 Effort 21.4
HR zones Z1 48% 39m Z2 39% 32m Z3 10% 8m Z4 3% 2m Z5 0% 0m`;

test('v1.3.7 imports the corrected strength HR evidence without flattening it', () => {
  const result = parseFitnessSummaryText(correctionOcr, { expectedContext: 'workout' });
  assert.equal(result.metrics.timeRange, '18:09-19:38');
  assert.equal(result.metrics.durationMinutes, 89);
  assert.equal(result.metrics.durationDisplayText, 'Duration 1h 29m');
  assert.equal(result.metrics.avgHr, 105);
  assert.equal(result.metrics.maxHr, 157);
  assert.equal(result.metrics.minHr, 82);
  assert.equal(result.metrics.calories, 122);
  assert.equal(result.metrics.effort, 21.4);
  assert.deepEqual(result.metrics.hrZones, {
    z1Percent: 48, z1Minutes: 39,
    z2Percent: 39, z2Minutes: 32,
    z3Percent: 10, z3Minutes: 8,
    z4Percent: 3, z4Minutes: 2,
    z5Percent: 0, z5Minutes: 0
  });
  assert.equal(result.parsedEvidence.avgHr.rawToken, '105');
  assert.equal(result.parsedEvidence.maxHr.rawToken, '157');
  assert.equal(result.parsedEvidence.minHr.rawToken, '82');
  assert.equal(result.parsedEvidence.effort.rawToken, '21.4');
  assert.ok(result.warnings.some(item => /Calories appear low/.test(item)));
  assert.ok(result.warnings.some(item => /do not infer missing minutes/i.test(item)));
});

test('v1.3.7 duration parser retains full hour-plus-minute values', () => {
  for (const [shown, expected] of [['1h 6m', 66], ['1h 24m', 84], ['1h 29m', 89], ['2h 05m', 125]]) {
    const result = parseFitnessSummaryText(`Weightlifting Duration ${shown} AVG 100 PEAK 140 LOW 70`, { expectedContext: 'workout' });
    assert.equal(result.metrics.durationMinutes, expected, shown);
    assert.match(result.metrics.durationDisplayText, new RegExp(shown.replace(/ /g, '\\s+'), 'i'));
  }
});

test('v1.3.7 imports cuff pulse from same-day vitals notes and keeps it separate', () => {
  const parsed = parseVitalsMarkdown('```vantage-vitals\n{"date":"2026-08-06","bloodPressure":"118/83","restingHr":41,"notes":"Manual cuff 118/83 pulse 46 at 05:22"}\n```');
  assert.equal(parsed.values.pulse, 46);
  assert.equal(parsed.values.restingHr, 41);
});

test('v1.3.7 rejects a stale matching source ID as proof of exercise equivalence', () => {
  const result = comparisonConfidence(
    { id: 'current', sourceExerciseId: 'curl-1', name: 'Prime Arm Curl', machineBrand: 'Prime' },
    { exercise: { id: 'prior', sourceExerciseId: 'curl-1', name: 'Seated Hammer Curl', machineBrand: 'Hammer Strength' } }
  );
  assert.notEqual(result.level, 'high');
  assert.match(result.reason, /machine brand|identity/i);
});


test('v1.3.7 invalidates only the former source identity and allows future corrected comparisons', () => {
  const corrected = { sourceExerciseId: 'prime-curl-new', name: 'Prime Arm Curl', comparisonHistoryInvalidated: true };
  const oldHistory = { exercise: { sourceExerciseId: 'hammer-curl-old', name: 'Seated Hammer Curl', aliases: ['Prime Arm Curl'] } };
  const newHistory = { exercise: { sourceExerciseId: 'prime-curl-new', name: 'Prime Arm Curl', comparisonHistoryInvalidated: true } };
  assert.equal(comparisonConfidence(corrected, oldHistory).level, 'blocked');
  assert.equal(comparisonConfidence(corrected, newHistory).level, 'high');
});

test('v1.3.7 flags duplicate source IDs even when stale stored names are identical', () => {
  const session = { exercises: [
    { id: 'row-9', sourceExerciseId: 'curl-1', name: 'Seated Hammer Curl' },
    { id: 'row-10', sourceExerciseId: 'curl-1', name: 'Seated Hammer Curl' }
  ] };
  const duplicates = duplicateSourceExerciseIds(session);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].sourceExerciseId, 'curl-1');
});

test('v1.3.7 blocks ambiguous current-session media links', () => {
  const session = { exercises: [
    { id: 'row-9', sourceExerciseId: 'curl-1', name: 'Seated Hammer Curl' },
    { id: 'row-10', sourceExerciseId: 'curl-1', name: 'Prime Arm Curl' }
  ] };
  const issues = strengthIdentityBlockingIssues(session, [{
    id: 'photo-prime', name: '17860414737242925356636538182866.jpg', sourceRole: 'exerciseSessionPhoto', linkedExerciseId: 'curl-1', currentSession: true
  }]);
  assert.ok(issues.some(item => item.type === 'duplicate-source-exercise-id'));
  assert.ok(issues.some(item => item.type === 'ambiguous-current-session-media-link'));
});

test('v1.3.7 strength report preserves pending nutrition, cuff pulse, all zones and media source identity', () => {
  const session = {
    id: 'session-0608', date: '2026-08-06', sessionType: 'Chest & Biceps', mode: 'normal',
    startedAt: '2026-08-06T17:09:00.000Z', completedAt: '2026-08-06T18:38:00.000Z',
    workoutHrEvidence: {
      sourceFile: '36638.png', timeRange: '18:09-19:38', durationMinutes: 89,
      avgHr: 105, maxHr: 157, minHr: 82, calories: 122, effort: 21.4,
      hrZones: { z1Percent: 48, z1Minutes: 39, z2Percent: 39, z2Minutes: 32, z3Percent: 10, z3Minutes: 8, z4Percent: 3, z4Minutes: 2, z5Percent: 0, z5Minutes: 0 },
      suspiciousValues: ['Calories displayed as 122 kcal for an 89-minute resistance session. Preserve as visible source evidence but flag as suspicious.']
    },
    exercises: [{ id: 'press-row', sourceExerciseId: 'press-source', name: 'Iso-Lateral Bench Press', sets: [{ setNumber: 1, setType: 'Work', weightKg: 100, reps: 8, rpe: 8, notes: 'Iso-Lateral Bench Press' }] }]
  };
  const report = createWorkoutMarkdown({
    session, sessions: [], vitals: { systolic: 118, diastolic: 83, pulse: 46, restingHr: 41 },
    meals: [], nutritionSummary: null,
    media: [{ id: 'photo', file: '17860380266677717357336199141616.jpg', sourceRole: 'exerciseSessionPhoto', linkedExerciseId: 'press-row', sourceExerciseId: 'press-source', linkedExerciseName: 'Iso-Lateral Bench Press', userAttachedThisSession: true, currentSession: true }]
  });
  assert.match(report, /Nutrition pending Alex macro file import/);
  assert.match(report, /Cuff pulse:\*\* 46 bpm/);
  assert.match(report, /Z4:\*\* 3% \/ 2 min/);
  assert.match(report, /Z5:\*\* 0% \/ 0 min/);
  assert.match(report, /Effort:\*\* 21\.4/);
  assert.match(report, /122 kcal/);
  assert.match(report, /sourceExerciseId\": \"press-source/);
});

test('v1.3.7 app exposes confirmed identity/media correction and unique session-media linkage', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const prompt = await readFile(new URL('../VANTAGE_STRENGTH_COACH_PROMPT.md', import.meta.url), 'utf8');
  assert.match(app, /Apply confirmed exercise and media corrections/);
  assert.match(app, /applyStrengthAnalysisCorrections/);
  assert.match(app, /linkedExerciseId: exerciseSessionMediaKey\(exercise\)/);
  assert.match(app, /sourceExerciseId: exercise\.sourceExerciseId/);
  assert.match(app, /Coach Pack blocked/);
  assert.match(prompt, /matching source ID alone/i);
});
