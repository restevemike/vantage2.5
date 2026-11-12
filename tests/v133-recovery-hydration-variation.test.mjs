import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { createRecoveryMarkdown } from '../recovery-markdown.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const yogaText = `
BACKGROUND DASHBOARD AVG/SESS 28m
Yoga
1 Aug 2026
TIME 08:55 - 10:01
DURATION 1h 6m
AVG HR 74 bpm
MAX HR 124 bpm
LOW HR 49 bpm
CALORIES 144 kcal
THIS SESSION EFFORT 3.4
HR ZONES From strap HR
Z1 82% 11m
Z2 17% 2m
Z3 1% 0m
Z4 0%
Z5 0%
`;

const strengthText = `
Weightlifting
1 Aug 2026
TIME 17:37 - 19:02
DURATION 1h 24m
AVG HR 97 bpm
MAX HR 134 bpm
LOW HR 76 bpm
CALORIES 120 kcal
THIS SESSION EFFORT 1.4
HR ZONES From strap HR
Z1 68% 47m
Z2 31% 21m
Z3 1% 0m
Z4 0%
Z5 0%
`;

test('v1.3.3 OCR prioritises the foreground Yoga card and preserves every HR field', () => {
  const result = parseFitnessSummaryText(yogaText, { expectedContext: 'recovery' });
  assert.equal(result.sourceRole, 'workoutHrSummary');
  assert.equal(result.activityShown, 'Yoga');
  assert.equal(result.metrics.durationMinutes, 66);
  assert.equal(result.metrics.avgHr, 74);
  assert.equal(result.metrics.maxHr, 124);
  assert.equal(result.metrics.minHr, 49);
  assert.equal(result.metrics.effort, 3.4);
  assert.deepEqual(result.metrics.hrZones, {
    z1Percent: 82, z1Minutes: 11,
    z2Percent: 17, z2Minutes: 2,
    z3Percent: 1, z3Minutes: 0,
    z4Percent: 0, z4Minutes: null,
    z5Percent: 0, z5Minutes: null
  });
  assert.ok(result.warnings.some(item => /do not sum/i.test(item)));
});

test('v1.3.3 OCR converts hour-plus-minute strength duration and flags suspicious visible calories', () => {
  const result = parseFitnessSummaryText(strengthText, { expectedContext: 'workout' });
  assert.equal(result.metrics.durationMinutes, 84);
  assert.equal(result.metrics.avgHr, 97);
  assert.equal(result.metrics.maxHr, 134);
  assert.equal(result.metrics.minHr, 76);
  assert.equal(result.metrics.effort, 1.4);
  assert.equal(result.metrics.calories, 120);
  assert.equal(result.metrics.hrZones.z1Percent, 68);
  assert.equal(result.metrics.hrZones.z2Percent, 31);
  assert.ok(result.warnings.some(item => /Calories appear low/i.test(item)));
});

test('v1.3.3 recovery report uses recovery schema without fake strength sets', () => {
  const session = {
    id: 'yoga-2026-08-01', date: '2026-08-01', sessionType: 'Yoga / Recovery', category: 'recovery',
    startedAt: '2026-08-01T07:55:00.000Z', completedAt: '2026-08-01T09:01:00.000Z', exercises: [],
    recoverySession: { activity: 'Yoga', durationMinutes: 66, startTime: '08:55', endTime: '10:01', notes: 'Mobility and breathing.', tags: ['mobility','recovery'] },
    workoutHrSummary: { activityShown: 'Yoga', timeRange: '08:55-10:01', durationMinutes: 66, avgHr: 74, maxHr: 124, minHr: 49, calories: 144, effort: 3.4, hrSource: 'strap', hrZones: { z1Percent:82,z1Minutes:11,z2Percent:17,z2Minutes:2,z3Percent:1,z3Minutes:0,z4Percent:0,z4Minutes:null,z5Percent:0,z5Minutes:null } },
    hydration: { recorded: false, declined: true }
  };
  const markdown = createRecoveryMarkdown({ session, media: [{ file:'media/session/yoga.png', sourceRole:'workoutHrSummary', photoType:'current-session-evidence', currentSession:true }] });
  assert.match(markdown, /vantage-recovery-session-v1/);
  assert.match(markdown, /Actual action:\*\* Yoga \/ recovery/);
  assert.match(markdown, /74 \/ 124 \/ 49 bpm/);
  assert.match(markdown, /3\.4/);
  assert.doesNotMatch(markdown, /0 kg/);
  assert.doesNotMatch(markdown, /Completed exercises|fake strength|0 kg \| 0 reps/i);
});

test('v1.3.3 strength report stores variation and treats legacy zero rest as not recorded', () => {
  const session = {
    id:'s1', date:'2026-08-01', sessionType:'Shoulders & Triceps', mode:'normal', startedAt:'2026-08-01T16:37:00Z', completedAt:'2026-08-01T18:02:00Z',
    exercises:[{ id:'e1', sourceExerciseId:'lat', lineNumber:1, name:'Lateral raise', variation:'Machine', machineBrand:'', machineModel:'', nickname:'', movementPattern:'lateral-raise', notes:'', sets:[{ id:'set1', setType:'Work', setNumber:1, weightKg:65, reps:5, rpe:8, failure:false, holdSeconds:0, restSeconds:0, restRecorded:false, notes:'' }] }],
    hydration:{ recorded:false, reminderSkipped:true }
  };
  const markdown = createWorkoutMarkdown({ session, sessions:[] });
  assert.match(markdown, /Variation:\*\* Machine/);
  assert.match(markdown, /Not recorded/);
  assert.match(markdown, /\| 1 \| Work \| 65 kg \| 5 \| 8 \| Not recorded \| No \| — \|/);
});

test('v1.3.3 UI includes hydration reminder, recovery schema and exercise variation persistence', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /id="hydrationReminderDialog"/);
  assert.match(html, /No hydration taken/);
  assert.match(html, /Finish anyway/);
  assert.match(html, /id="recoverySessionPanel"/);
  assert.match(html, /class="exercise-variation"/);
  assert.match(app, /requestHydrationReminder/);
  assert.match(app, /vantage-recovery-session-manifest-v1/);
  assert.match(app, /variation: sessionExercise\.variation/);
  assert.match(sw, /recovery-markdown\.js/);
  assert.match(sw, /VANTAGE_RECOVERY_COACH_PROMPT\.md/);
});
