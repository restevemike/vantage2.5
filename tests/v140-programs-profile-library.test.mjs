import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { builtInExerciseLibrary } from '../exercise-catalogue.js';
import { PROGRAM_PRESETS, nextProgramSlot, advanceProgramProgress } from '../programs.js';

test('v1.4.0 ships a substantial searchable built-in exercise library', () => {
  assert.ok(builtInExerciseLibrary.length >= 400, `expected >=400, got ${builtInExerciseLibrary.length}`);
  assert.ok(builtInExerciseLibrary.some(x => /bench press/i.test(x.name)));
  assert.ok(builtInExerciseLibrary.some(x => /lat pulldown/i.test(x.name)));
  assert.ok(builtInExerciseLibrary.some(x => /stair/i.test(x.name)));
});

test('v1.4.0 includes flexible split presets and custom programming', () => {
  const ids = new Set(PROGRAM_PRESETS.map(x => x.id));
  for (const id of ['custom','full-body-3','upper-lower-4','ppl-6','heavy-duty-ab']) assert.ok(ids.has(id), id);
});

test('program rotation advances through arbitrary workout and rest slots', () => {
  const p={scheduleMode:'rotation',days:[{id:'a',kind:'template',templateId:'push'},{id:'b',kind:'rest'},{id:'c',kind:'template',templateId:'pull'}]};
  assert.equal(nextProgramSlot(p,{nextIndex:0}).templateId,'push');
  assert.equal(advanceProgramProgress(p,{nextIndex:0},'push').nextIndex,1);
  assert.equal(advanceProgramProgress(p,{nextIndex:2},'pull').nextIndex,0);
});

test('v1.4.0 database adds profile-scoped programs without changing PWA identity', async () => {
  const [db,manifestText,pkgText]=await Promise.all([
    readFile(new URL('../db.js',import.meta.url),'utf8'),
    readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'),
    readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  assert.match(db,/const DB_VERSION = 12;/);
  assert.match(db,/programs:/);
  assert.match(db,/schemaVersion: 12/);
  const manifest=JSON.parse(manifestText); const pkg=JSON.parse(pkgText);
  assert.equal(manifest.id,'./vantage-training-console-v133');
  assert.equal(manifest.start_url,'./?pwa=157');
  assert.equal(pkg.version,'1.5.7');
});

test('v1.4.0 UI exposes phases, program builder, routine builder, module toggles and historical import', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const token of ['Programs &amp; splits','Routine builder','Historical Markdown import','feature_vitals','feature_macros','feature_recovery','feature_metrics','feature_supplements','feature_bloodwork','feature_bodyMeasurements','exerciseBodyGroupFilter','exerciseEquipmentFilter']) assert.match(html,new RegExp(token));
});

test('v1.4.0 app migrates current split and supports extensible phases/program progress', async () => {
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  for(const token of ['ensureV140ProgramFoundation','adjustTrainingCycleWeeks','advanceActiveProgramAfterSession','createProgramFromPreset','renderProgramManager','renderRoutineBuilder']) assert.match(app,new RegExp(token));
});

test('v1.4.0 service worker caches program and exercise modules', async () => {
  const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(sw,/vantage-training-console-v15-7/);
  assert.match(sw,/exercise-catalogue\.js/);
  assert.match(sw,/programs\.js/);
});
