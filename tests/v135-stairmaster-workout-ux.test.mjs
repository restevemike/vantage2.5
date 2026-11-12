import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { classifyLissSession, createLissMarkdown } from '../liss-markdown.js';
import { calculateReadiness } from '../readiness.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { findBestPreviousStrengthSession, matchExerciseFromSession } from '../workout-history.js';

const noopStairmasterText = `
Treadmill walk
04/08/2026
17:53 - 18:41
Duration 48 min
AVG 109 bpm PEAK 133 bpm LOW 81 bpm
Calories 495 kcal
Effort 19 . 1
HR Zones
Z1 Z2 Z3 Z4 Z5
16% 78% 6% 0% 0%
7m 36m 2m 0m 0m
From Strap HR
`;

test('v1.3.5 preserves decimal effort and label-pairs all five NOOP zones', () => {
  const result = parseFitnessSummaryText(noopStairmasterText, { expectedContext: 'liss', roleHint: 'noopStrapSessionSummary' });
  assert.equal(result.metrics.effort, 19.1);
  assert.deepEqual(result.metrics.hrZones, {
    z1Percent: 16, z1Minutes: 7,
    z2Percent: 78, z2Minutes: 36,
    z3Percent: 6, z3Minutes: 2,
    z4Percent: 0, z4Minutes: 0,
    z5Percent: 0, z5Minutes: 0
  });
  assert.equal(result.parsedEvidence.effort.rawToken.replace(/\s/g, ''), '19.1');
});

test('v1.3.5 leaves ambiguous StairMaster WATTS/METS values unassigned', () => {
  const result = parseFitnessSummaryText('StairMaster TOTAL TIME 47:00 437 KCAL WATTS / METS 5.9 47', { expectedContext: 'liss', roleHint: 'treadmillMachineConsole' });
  assert.equal(result.metrics.totalTime, '47:00');
  assert.equal(result.metrics.calories, 437);
  assert.equal(result.metrics.avgWatts, undefined);
  assert.equal(result.metrics.avgMets, undefined);
  assert.ok(result.metrics.ambiguousVisibleValues.includes(5.9));
  assert.ok(result.metrics.ambiguousVisibleValues.includes(47));
});

test('v1.3.5 classifies the corrected StairMaster session as moderate-conditioning', () => {
  const result = classifyLissSession({
    session: { cardio: { activityType: 'stairmaster' } },
    sources: { vantageStrap: { durationMinutes: 48, avgHr: 109, maxHr: 133, minHr: 81, effort: 19.1, hrZones: { z1Percent: 16, z1Minutes: 7, z2Percent: 78, z2Minutes: 36, z3Percent: 6, z3Minutes: 2, z4Percent: 0, z4Minutes: 0, z5Percent: 0, z5Minutes: 0 } } }
  });
  assert.equal(result.type, 'moderate-conditioning');
  assert.equal(result.displayLabel, 'Moderate LISS / conditioning-leaning');
});

test('v1.3.5 low recovery and Low synthesis produce amber recovery-work-only readiness', () => {
  const readiness = calculateReadiness({ recovery: 46, synthesis: 'Low', hrv: 64, hrvBaseline: 64, restingHr: 42, rhrBaseline: 41, stress: 1.9, sleepHours: 6.7, systolic: 138, diastolic: 87 });
  assert.equal(readiness.level, 'amber');
  assert.equal(readiness.title, 'Amber — controlled training permitted');
});

test('v1.3.5 vitals import preserves Low synthesis and blood-pressure pulse', () => {
  const parsed = parseVitalsMarkdown('```vantage-vitals\n{"date":"2026-08-04","recovery":46,"synthesis":"Low","bloodPressure":"138/87","bloodPressurePulse":48}\n```');
  assert.equal(parsed.values.synthesis, 'Low');
  assert.equal(parsed.values.pulse, 48);
});

test('v1.3.5 LISS export keeps StairMaster primary, separate timings, readiness and pending nutrition', () => {
  const markdown = createLissMarkdown({
    session: {
      id: 'stair-2026-08-04', date: '2026-08-04', startedAt: '2026-08-04T16:45:39.064Z', completedAt: '2026-08-04T17:43:04.081Z',
      cardio: {
        activityType: 'stairmaster', manualDurationMinutes: 47, elapsedSeconds: 2820,
        sources: {
          vantageStrap: { sourceFile: '36467.png', sourceType: 'screenshot-confirmed', activityShown: 'Treadmill walk', timeRange: '17:53-18:41', durationMinutes: 48, avgHr: 109, maxHr: 133, minHr: 81, calories: 495, effort: 19.1, hrZones: { z1Percent: 16, z1Minutes: 7, z2Percent: 78, z2Minutes: 36, z3Percent: 6, z3Minutes: 2, z4Percent: 0, z4Minutes: 0, z5Percent: 0, z5Minutes: 0 } },
          treadmillMachine: { sourceFile: '36466.jpg', sourceType: 'screenshot-confirmed', totalTime: '47:00', calories: 437 }
        }, hydration: { waterMl: 1000, electrolytes: 'Salt amount not supplied' }
      }
    },
    vitals: { recovery: 46, charge: 46, restScore: 85, synthesis: 'Low', hrv: 64, hrvBaseline: 64, restingHr: 42, rhrBaseline: 41, stress: 1.9, sleepHours: 6.7, systolic: 138, diastolic: 87, pulse: 48 },
    readiness: calculateReadiness({ recovery: 46, synthesis: 'Low', hrv: 64, hrvBaseline: 64, restingHr: 42, rhrBaseline: 41, stress: 1.9, sleepHours: 6.7, systolic: 138, diastolic: 87 }),
    media: [
      { id: 'noop', name: '36467.png', archivePath: 'media/36467.png', sourceRole: 'noopStrapSessionSummary', sourceRoleConfirmed: true },
      { id: 'machine', name: '36466.jpg', archivePath: 'media/36466.jpg', sourceRole: 'treadmillMachineConsole', sourceRoleConfirmed: true }
    ]
  });
  assert.match(markdown, /"activityType": "stairmaster"/);
  assert.match(markdown, /"noopActivityLabel": "Treadmill walk"/);
  assert.match(markdown, /"userEnteredDuration": "47:00"/);
  assert.match(markdown, /"noopDuration": 48/);
  assert.match(markdown, /"machineDuration": "47:00"/);
  assert.match(markdown, /"synthesis": "Low"/);
  assert.match(markdown, /"cuffPulse": 48/);
  assert.match(markdown, /"status": "pending-import"/);
  assert.doesNotMatch(markdown, /"recommendedCorrection": "treadmill-walk"/);
});

test('v1.3.5 finds the previous matching strength session by exercise overlap when template names changed', () => {
  const sessions = [
    { id: 'chest', date: '2026-08-03', completedAt: '2026-08-03T18:00:00Z', templateId: 'old-chest', sessionType: 'Chest', exercises: [{ name: 'Incline press', sets: [] }] },
    { id: 'back-last-week', date: '2026-07-27', completedAt: '2026-07-27T18:00:00Z', templateId: 'legacy-back', sessionType: 'Pull / Back', exercises: [{ name: 'Iso pulldown', sets: [{ weightKg: 120, reps: 6 }] }, { name: 'Chest-supported row', sets: [] }] }
  ];
  const template = { id: 'back-v2', name: 'Back', exercises: [{ name: 'Iso pulldown' }, { name: 'Chest-supported row' }] };
  const previous = findBestPreviousStrengthSession(sessions, template);
  assert.equal(previous.id, 'back-last-week');
  assert.equal(matchExerciseFromSession(previous, template.exercises[0]).sets[0].weightKg, 120);
});

test('v1.3.5 workout and recovery UI provide reliable set controls and dropdown navigation', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(html, /class="add-set-row"><button class="button button-ghost add-set-button" type="button"/);
  assert.match(html, /exercise-collapse-button/);
  assert.match(html, /id="collapseAllExercisesButton"/);
  assert.match(app, /function addSetToExercise/);
  assert.match(app, /previousSessionId/);
  assert.match(app, /missingReferencedFiles/);
  assert.match(app, /labelOnlyActivityConflict/);
  assert.match(app, /<details class="recovery-card"/);
  assert.match(css, /\.exercise-card\.collapsed \.exercise-card-body/);
  assert.match(css, /\.recovery-card > summary/);
});
