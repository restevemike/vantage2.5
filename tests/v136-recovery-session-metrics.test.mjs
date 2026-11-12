import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sessionFamilyForSession, strengthSessionFamilies, nutritionSessionPerformanceAnalysis } from '../metrics-engine.js';

const sessions = [
  { id:'b1', date:'2026-07-01', templateId:'back', sessionType:'Back', exercises:[
    {name:'Pulldown', machineBrand:'A', sets:[{setType:'Work',weightKg:80,reps:8,rpe:8}]},
    {name:'Row', machineBrand:'A', sets:[{setType:'Work',weightKg:90,reps:8,rpe:8}]}
  ]},
  { id:'b2', date:'2026-07-08', templateId:'back-v2', sessionType:'Back session', exercises:[
    {name:'Pulldown', machineBrand:'A', sets:[{setType:'Work',weightKg:82.5,reps:8,rpe:8}]},
    {name:'Row', machineBrand:'A', sets:[{setType:'Work',weightKg:92.5,reps:8,rpe:8}]},
    {name:'Pullover', machineBrand:'A', sets:[{setType:'Work',weightKg:40,reps:10,rpe:8}]}
  ]},
  { id:'b3', date:'2026-07-15', templateId:'pull', sessionType:'Pull / Back', exercises:[
    {name:'Pulldown', machineBrand:'A', sets:[{setType:'Work',weightKg:85,reps:8,rpe:9}]},
    {name:'Row', machineBrand:'A', sets:[{setType:'Work',weightKg:95,reps:8,rpe:9}]}
  ]}
];
const nutrition = [
  {date:'2026-07-01',protein:180,carbs:220,fat:60,calories:2140},
  {date:'2026-07-08',protein:185,carbs:260,fat:60,calories:2320},
  {date:'2026-07-15',protein:190,carbs:300,fat:60,calories:2500}
];

test('v1.3.6 groups variable Back workouts into one session family', () => {
  assert.equal(sessionFamilyForSession(sessions[1]).key, 'back');
  const families = strengthSessionFamilies(sessions, 'all', '2026-07-31');
  assert.equal(families[0].key, 'back');
  assert.equal(families[0].sessions, 3);
  assert.equal(sessionFamilyForSession({ id:'r1', date:'2026-07-20', category:'recovery', templateId:'recovery', recoverySession:{activity:'Yoga'}, exercises:[] }), null);
});

test('v1.3.6 session fuel analysis keeps workouts when an exercise is added or removed', () => {
  const result = nutritionSessionPerformanceAnalysis(sessions, [], nutrition, 'back', 'all', '2026-07-31', 'epley', 'same-day', 'sessionPerformanceIndex');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].exerciseCount, 3);
  assert.equal(result.rows[2].exerciseCount, 2);
  assert.equal(result.outputSampleSize, 2);
  assert.equal(result.rows[1].comparableExercises, 2);
  assert.ok(result.rows[1].sessionPerformanceIndex > 100);
});

test('v1.3.6 UI uses section dropdowns, bottom add-set placement and session-family metrics', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(html, /id="metricsFuelSessionFamilySelect"/);
  assert.match(html, /class="add-set-row"><button class="button button-ghost add-set-button"/);
  assert.doesNotMatch(html, /exercise-card-actions">\s*<button class="text-button add-set-button"/);
  assert.match(app, /data-recovery-section-select/);
  assert.match(app, /nutritionSessionPerformanceAnalysis/);
  assert.match(css, /\.recovery-session-picker/);
  assert.match(css, /\.add-set-row/);
});
