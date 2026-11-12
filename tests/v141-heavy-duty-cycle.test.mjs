import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = f => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.4.3 ships the Hybrid Heavy Duty maintenance cycle preset', async () => {
  const programs = await read('programs.js');
  assert.match(programs,/hdm-maintenance/);
  assert.match(programs,/Hybrid Heavy Duty Maintenance/);
  assert.match(programs,/durationWeeks:8/);
  assert.match(programs,/Week 1 · Mon — Workout A/);
  assert.match(programs,/Week 2 · Fri — Workout B/);
  assert.match(programs,/Leg Press/);
  assert.match(programs,/Neutral-Grip Cable Lat Pulldown/);
});

test('v1.4.3 UI exposes Cycles Routines Exercises and quick HDM creation', async () => {
  const html = await read('index.html');
  const app = await read('app.js');
  assert.match(html,/data-training-builder-tab="cycles"/);
  assert.match(html,/data-training-builder-tab="routines"/);
  assert.match(html,/data-training-builder-tab="exercises"/);
  assert.match(html,/createHybridHeavyDutyCycleButton/);
  assert.match(app,/createHybridHeavyDutyCycle/);
  assert.match(app,/saveRoutineExercisePrescription/);
});

test('v1.4.3 uses Flint Grey without losing readiness semantic colours', async () => {
  const css = await read('styles.css');
  assert.match(css,/--bg: #111315/);
  assert.match(css,/--accent: #899197/);
  assert.match(css,/--green: #63c88a/);
  assert.match(css,/\.readiness-green \{ border-left-color: var\(--green\)/);
});
