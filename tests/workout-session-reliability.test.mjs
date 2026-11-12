import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('exercise reference import uses the active workout date and no undefined session variable', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /const currentSessionDate = state\.currentSession\?\.date \|\| today\(\);/);
  assert.doesNotMatch(app, /but this LISS session is \$\{session\.date\}/);
});

test('strength and LISS screens expose dedicated HR screenshot uploads', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="workoutHrInput"/);
  assert.match(html, /id="lissHrInput"/);
  assert.match(html, /Finish session &amp; export full Coach Pack/);
});

test('repeated workouts clone prior set structure and show prior values above each row', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(app, /findPreviousTemplateSession/);
  assert.match(app, /latestCompatibleExerciseHistory/);
  assert.match(app, /previousWeekSubstitution/);
  assert.match(app, /sessionSubstitution/);
  assert.match(app, /previous-set-reference/);
  assert.match(css, /\.previous-set-reference/);
});

test('workout completion validates zero-rep work sets and creates a full media Coach Pack', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /validateZeroRepWorkSets/);
  assert.match(app, /buildWorkoutCoachPack/);
  assert.match(app, /vantage-strength-coach-pack-manifest-v3/);
});
