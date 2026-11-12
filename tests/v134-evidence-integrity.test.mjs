import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { buildLissImageReadingConflicts, classifyLissSession, createLissMarkdown } from '../liss-markdown.js';
import { createRecoveryMarkdown } from '../recovery-markdown.js';

const savedStreamText = `
Walking saved
02/08/2026
16:41 - 17:23
42 min
4.80 km
113 avg bpm
173 max bpm
1 kcal
Route map
Top zone ≥156 bpm
`;

test('v1.3.4 recognises a NOOP saved-session stream without flattening it into the Strap summary', () => {
  const result = parseFitnessSummaryText(savedStreamText, { expectedContext: 'liss' });
  assert.equal(result.sourceRole, 'noopSessionStreamSaved');
  assert.equal(result.metrics.dateShown, '2026-08-02');
  assert.equal(result.metrics.timeRange, '16:41-17:23');
  assert.equal(result.metrics.durationMinutes, 42);
  assert.equal(result.metrics.distanceKm, 4.8);
  assert.equal(result.metrics.avgHr, 113);
  assert.equal(result.metrics.maxHr, null);
  assert.equal(result.metrics.configuredMaxHr, 173);
  assert.equal(result.metrics.configuredTopZoneThreshold, 156);
  assert.equal(result.metrics.calories, 1);
  assert.ok(result.warnings.some(item => /exclude it from energy-expenditure analysis/i.test(item)));
});

test('v1.3.4 preserves conflicts between separate NOOP screenshots', () => {
  const conflicts = buildLissImageReadingConflicts([
    { sourceFile: 'media/noop-strap.png', sourceRole: 'noopStrapSessionSummary', metrics: { durationMinutes: 42, avgHr: 105, maxHr: 134, calories: 1 } },
    { sourceFile: 'media/noop-saved.png', sourceRole: 'noopSessionStreamSaved', metrics: { durationMinutes: 42, avgHr: 113, maxHr: 173, calories: 1 } }
  ]);
  assert.ok(conflicts.some(item => item.field === 'avgHr'));
  assert.ok(conflicts.some(item => item.field === 'maxHr'));
  assert.equal(conflicts.find(item => item.field === 'avgHr').sources['media/noop-strap.png'], 105);
  assert.equal(conflicts.find(item => item.field === 'avgHr').sources['media/noop-saved.png'], 113);
  assert.match(conflicts[0].resolution, /Preserve every screenshot reading separately/);
});

test('v1.3.4 does not call a session hard conditioning from a brief max-HR spike alone', () => {
  const result = classifyLissSession({
    session: { cardio: { activityType: 'outdoor-walk' } },
    sources: {
      vantageStrap: {
        durationMinutes: 42, avgHr: 105, maxHr: 173, effort: 24,
        hrZones: { z1Percent: 28, z1Minutes: 10, z2Percent: 67, z2Minutes: 25, z3Percent: 5, z3Minutes: 2, z4Percent: 0, z4Minutes: 0, z5Percent: 0, z5Minutes: 0 }
      }
    }
  });
  assert.equal(result.type, 'true-liss');
  assert.equal(result.displayLabel, 'True LISS');
});

test('v1.3.4 LISS export keeps actual session time separate from export time and includes per-image conflicts', () => {
  const markdown = createLissMarkdown({
    session: {
      id: 'walk-2026-08-02', date: '2026-08-02', startedAt: '2026-08-02T15:41:00.000Z', completedAt: '2026-08-02T16:23:00.000Z',
      cardio: {
        activityType: 'outdoor-walk', elapsedSeconds: 2520, manualStartTime: '16:41', manualEndTime: '17:23', nasalBreathing: true,
        sources: { vantageStrap: { activityShown: 'Walking', timeRange: '16:41-17:23', durationMinutes: 42, avgHr: 105, maxHr: 134, calories: 1, effort: 24, hrZones: { z1Percent: 28, z1Minutes: 10, z2Percent: 67, z2Minutes: 25, z3Percent: 5, z3Minutes: 2, z4Percent: 0, z4Minutes: 0, z5Percent: 0, z5Minutes: 0 } } },
        hydration: {}
      }
    },
    generatedAt: '2026-08-02T16:31:00.000Z',
    media: [
      { id: 'strap', name: 'strap.png', archivePath: 'media/strap.png', sourceRole: 'noopStrapSessionSummary', sourceRoleConfirmed: true, extractionStatus: 'ocr-confirmed', ocrMetrics: { avgHr: 105, maxHr: 134, calories: 1 } },
      { id: 'saved', name: 'saved.png', archivePath: 'media/saved.png', sourceRole: 'noopSessionStreamSaved', sourceRoleConfirmed: true, extractionStatus: 'ocr-confirmed', ocrMetrics: { avgHr: 113, maxHr: 173, calories: 1 } }
    ]
  });
  assert.match(markdown, /"actualSessionTime"/);
  assert.match(markdown, /"exportTime"/);
  assert.match(markdown, /"manualStartTime": "16:41"/);
  assert.match(markdown, /"generatedAtUtc": "2026-08-02T16:31:00.000Z"/);
  assert.match(markdown, /"scope": "image-evidence"/);
  assert.match(markdown, /NOOP saved-session \/ route evidence/);
  assert.match(markdown, /Nutrition pending Alex macro file import\./);
});

test('v1.3.4 recovery export does not let screenshot evidence overwrite structured HR zones', () => {
  const markdown = createRecoveryMarkdown({
    session: {
      id: 'yoga', date: '2026-08-01', sessionType: 'Yoga / Recovery', startedAt: '2026-08-01T07:55:00.000Z', completedAt: '2026-08-01T09:01:00.000Z',
      recoverySession: { activity: 'Yoga', durationMinutes: 66, startTime: '08:55', endTime: '10:01' },
      workoutHrSummary: { timeRange: '08:55-10:01', durationMinutes: 66, hrZones: { z1Percent: 82, z1Minutes: 11, z2Percent: 17, z2Minutes: 2 } },
      workoutHrEvidence: { hrZones: { z1Percent: 99, z1Minutes: 50, z3Percent: 1, z3Minutes: 0 } }
    }
  });
  assert.match(markdown, /"z1Percent": 82/);
  assert.match(markdown, /"z1Minutes": 11/);
  assert.match(markdown, /"z3Percent": 1/);
  assert.match(markdown, /Nutrition pending Alex macro file import\./);
});

test('v1.3.4 app exposes the saved-session source role and current-session manifest flags', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(html, /noopSessionStreamSaved/);
  assert.match(app, /noopSessionStreamSaved/);
  assert.match(app, /currentSession: true/);
  assert.match(app, /userAttachedThisSession: true/);
  assert.match(app, /actualSessionTime:/);
  assert.match(app, /exportTime: \{ generatedAtUtc: generatedAt \}/);
});
