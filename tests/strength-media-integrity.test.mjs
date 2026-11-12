import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStrengthAnalysisMarkdown, strengthAnalysisTemplate } from '../strength-analysis.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const prompt = await readFile(new URL('../VANTAGE_STRENGTH_COACH_PROMPT.md', import.meta.url), 'utf8');
const workoutSource = await readFile(new URL('../workout-markdown.js', import.meta.url), 'utf8');

test('strength media UI separates active references from current-session images', () => {
  assert.match(html, /Reference image/);
  assert.match(html, /Current session images/);
  assert.match(html, /includeActiveReferencePhotosCheckbox/);
  assert.match(html, /includeArchivedReferencePhotosCheckbox/);
  assert.match(html, /exerciseSessionPhoto/);
  assert.match(html, /exerciseTechniquePhoto/);
  assert.match(html, /invalidPhoto/);
  assert.match(css, /archived-reference/);
  assert.match(app, /session-media-card/);
});

test('strength media export excludes references and invalid media by default', () => {
  assert.match(app, /includeActiveReferencePhotos: false/);
  assert.match(app, /includeArchivedReferencePhotos: false/);
  assert.match(app, /item\.sourceRole !== 'invalidPhoto'/);
  assert.match(app, /sourceRole: 'exerciseReferencePhoto'/);
  assert.match(app, /userAttachedThisSession/);
  assert.match(app, /workoutMediaAudit/);
  assert.match(app, /legacyReferencePhotos/);
  assert.match(app, /sha256/);
});

test('replacing a reference archives the former active image and reuses exact duplicates', () => {
  assert.match(app, /Replacing the active reference image/);
  assert.match(app, /item\.archived = !selected/);
  assert.match(app, /Existing reference reused; no duplicate image was created/);
  assert.match(app, /previous reference was archived/i);
});

test('exercise identity is editable and old names are retained as aliases', () => {
  assert.match(html, /Exercise identity and machine details/);
  assert.match(app, /exercise\.aliases \|\|=/);
  assert.match(app, /exercise\.aliases\.push\(previousName\)/);
  assert.match(app, /machineBrand/);
  assert.match(app, /movementPattern/);
  assert.match(workoutSource, /comparisonConfidence/);
});

test('strength Coach analysis is evidence until explicit user confirmation', () => {
  assert.match(app, /parseStrengthAnalysisMarkdown/);
  assert.match(app, /structured values were not overwritten/);
  assert.match(app, /Use confirmed HR screenshot values/);
  assert.match(app, /confirmationAudit/);
  assert.match(prompt, /Old or archived reference images are not current-session evidence/);
  assert.match(prompt, /Keep cuff pulse separate from NOOP resting HR/);
});

test('strength analysis parser enforces one exact block and preserves session identity', () => {
  const template = strengthAnalysisTemplate({ id: 'session-1', date: '2026-07-28', sessionType: 'Chest & Biceps' });
  const parsed = parseStrengthAnalysisMarkdown(template);
  assert.equal(parsed.sessionId, 'session-1');
  assert.equal(parsed.date, '2026-07-28');
  assert.throws(() => parseStrengthAnalysisMarkdown(`${template}\n${template}`), /exactly one/);
});

test('vitals import preserves explicit deltas, rejects conflicting baselines and keeps cuff pulse separate', () => {
  const result = parseVitalsMarkdown(`\`\`\`vantage-vitals
{
  "date": "2026-07-28",
  "hrv": 59,
  "hrvBaseline": 90,
  "restingHr": 41,
  "rhrBaseline": 58,
  "bloodPressure": "137/80",
  "pulse": 46,
  "synthesis": "Steady",
  "notes": "HRV 59 ms, -6 vs baseline | Resting HR 41 bpm at baseline"
}
\`\`\``);
  assert.equal(result.values.hrvBaseline, null);
  assert.equal(result.values.hrvDeltaFromBaseline, -6);
  assert.equal(result.values.rhrBaseline, null);
  assert.equal(result.values.rhrDeltaFromBaseline, null);
  assert.equal(result.values.rhrBaselineStatus, 'at-baseline');
  assert.equal(result.values.pulse, 46);
  assert.equal(result.values.synthesis, 'Steady');
  assert.ok(result.warnings.some(item => item.includes('HRV baseline conflict')));
  assert.ok(result.warnings.some(item => item.includes('RHR baseline conflict')));
});

test('completed strength report separates media, pulse, nutrition and zero-load warnings', () => {
  const session = {
    id: 'session-1',
    date: '2026-07-28',
    sessionType: 'Chest & Biceps',
    mode: 'normal',
    startedAt: '2026-07-28T17:16:44.000Z',
    completedAt: '2026-07-28T18:20:27.000Z',
    decision: { readinessTitle: 'Amber — controlled session' },
    workoutHrEvidence: { timeRange: '18:16-19:19', avgHr: 96, maxHr: 123, minHr: 70, calories: 4, effort: 9.3, confirmationStatus: 'screenshot-evidence-present' },
    exercises: [{
      id: 'x1', sourceExerciseId: 'press-1', name: 'Incline press', machineBrand: 'Arsenal Strength', movementPattern: 'incline-press', sets: [
        { setNumber: 1, setType: 'Work', weightKg: 0, reps: 5, rpe: 8, failure: false }
      ]
    }],
    exportOptions: { includeActiveReferencePhotos: false }
  };
  const report = createWorkoutMarkdown({
    session,
    sessions: [],
    vitals: { hrv: 59, hrvBaseline: 65, restingHr: 41, rhrBaseline: 41, synthesis: 'Steady', systolic: 137, diastolic: 80, pulse: 46 },
    readiness: { title: 'Amber — controlled session' },
    meals: [],
    nutritionSummary: null,
    media: [{
      id: 'm1', archivePath: 'media/session/hr.png', sourceRole: 'workoutHrSummary', userAttachedThisSession: true, linkedExerciseName: null
    }],
    mediaAudit: { totalFiles: 3, currentSessionPhotos: 0, activeReferencePhotos: 1, archivedReferencePhotos: 1, legacyReferencePhotos: 2, invalidOrSuspiciousPhotos: 0, orphanPhotos: 0, warnings: [] }
  });
  assert.match(report, /Cuff pulse:\*\* 46 bpm/);
  assert.match(report, /Screenshot evidence — not automatically authoritative/);
  assert.match(report, /4 kcal/);
  assert.match(report, /Nutrition pending Alex macro file import/);
  assert.match(report, /Work set load is 0 kg/);
  assert.match(report, /Legacy references predating this workout:\*\* 2/);
  assert.match(report, /vantage-strength-coach-pack-v3/);
});
