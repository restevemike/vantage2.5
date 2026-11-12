import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimate1RM, estimatedEffectiveReps, flattenStrengthSets, metricsOverview,
  exerciseProgress, muscleDistribution, weightSeries, readinessAlignment
} from '../metrics-engine.js';

const sessions = [
  { id: 's1', date: '2026-07-01', sessionType: 'Chest', startedAt: '2026-07-01T17:00:00Z', completedAt: '2026-07-01T18:00:00Z', decision: { readinessLevel: 'green' }, exercises: [
    { id: 'x1', name: 'Bench Press', sets: [
      { setType: 'Warm-up', weightKg: 40, reps: 10, rpe: 4 },
      { setType: 'Work', weightKg: 100, reps: 5, rpe: 9, failure: false }
    ] }
  ]},
  { id: 's2', date: '2026-07-08', sessionType: 'Chest', startedAt: '2026-07-08T17:00:00Z', completedAt: '2026-07-08T18:00:00Z', decision: { readinessLevel: 'amber' }, mode: 'deload', exercises: [
    { id: 'x2', name: 'Bench Press', sets: [{ setType: 'Work', weightKg: 102.5, reps: 5, rpe: 9.5, failure: true }] }
  ]},
  { id: 'r1', date: '2026-07-09', category: 'rest', templateId: 'rest-day', decision: { readinessLevel: 'red' } }
];
const exercises = [{ id: 'bench', name: 'Bench Press', bodyGroup: 'Chest' }];

test('e1RM formulas are calculated', () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.ok(Math.abs(estimate1RM(100, 5) - 116.67) < 0.1);
  assert.ok(estimate1RM(100, 5, 'brzycki') > 112);
});

test('effective reps heuristic follows proximity to failure', () => {
  assert.equal(estimatedEffectiveReps(10, 10), 5);
  assert.equal(estimatedEffectiveReps(10, 8), 3);
  assert.equal(estimatedEffectiveReps(10, 5), 0);
});

test('strength rows preserve warm-up and muscle metadata', () => {
  const rows = flattenStrengthSets(sessions, exercises, 'all', '2026-07-31');
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(row => row.warmup).length, 1);
  assert.equal(rows[0].bodyGroup, 'Chest');
});

test('overview calculates volume and hard-set metrics', () => {
  const overview = metricsOverview(sessions, exercises, 'all', '2026-07-31');
  assert.equal(overview.strengthSessions, 2);
  assert.equal(overview.workSets, 2);
  assert.equal(overview.volume, 40 * 10 + 100 * 5 + 102.5 * 5);
  assert.ok(overview.avgRpe > 9);
});

test('exercise progress and muscle distribution work', () => {
  const progress = exerciseProgress(sessions, 'Bench Press', 'all', '2026-07-31');
  assert.equal(progress.points.length, 2);
  assert.ok(progress.latest.e1rm > progress.points[0].e1rm);
  const muscles = muscleDistribution(sessions, exercises, 'all', '2026-07-31');
  assert.equal(muscles[0].name, 'Chest');
  assert.equal(muscles[0].sets, 2);
});

test('weight sources prefer measurements over vitals and summaries', () => {
  const result = weightSeries([{ date: '2026-07-01', weight: 92 }], [{ date: '2026-07-01', weight: 93 }], [{ date: '2026-07-01', weight: 91.5 }], 'all', '2026-07-31');
  assert.equal(result[0].value, 91.5);
  assert.equal(result[0].source, 'measurements');
});

test('readiness alignment recognises green training, amber deload and red rest', () => {
  const result = readinessAlignment(sessions, 'all', '2026-07-31');
  assert.equal(result.total, 3);
  assert.equal(result.aligned, 3);
  assert.equal(result.alignmentRate, 100);
});
