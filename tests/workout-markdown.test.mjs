import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkoutMarkdown, workoutMarkdownFilename } from '../workout-markdown.js';

const session = {
  id: 'session-1', date: '2026-07-14', sessionType: 'Legs', mode: 'normal',
  startedAt: '2026-07-14T17:30:00.000Z', completedAt: '2026-07-14T18:10:00.000Z', notes: 'Controlled session',
  exercises: [{ lineNumber: 1, name: 'Leg Extension', notes: 'Slow negative', sets: [
    { setNumber: 1, setType: 'Warm-up', weightKg: 45, reps: 12, rpe: 4, failure: false, holdSeconds: 0, notes: '' },
    { setNumber: 2, setType: 'Work', weightKg: 66, reps: 12, rpe: 8, failure: false, holdSeconds: 2, notes: 'No grind' }
  ] }]
};

test('creates a readable workout Markdown report', () => {
  const markdown = createWorkoutMarkdown({ session, vitals: { recovery: 78, hrv: 96, systolic: 126, diastolic: 76 }, readiness: { title: 'Green — productive session allowed' } });
  assert.match(markdown, /VANTAGE Completed Workout Report/);
  assert.match(markdown, /Leg Extension/);
  assert.match(markdown, /66 kg/);
  assert.match(markdown, /No grind/);
  assert.doesNotMatch(markdown, /Android timer/);
  assert.match(markdown, /Machine-readable VANTAGE data/);
});

test('creates a safe filename', () => {
  assert.equal(workoutMarkdownFilename({ date: '2026-07-14', sessionType: 'Chest & Biceps' }), 'VANTAGE_Workout_2026-07-14_Chest_and_Biceps.md');
});
