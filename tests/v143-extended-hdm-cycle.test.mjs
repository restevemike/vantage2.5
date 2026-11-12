import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PROGRAM_PRESETS, HDM_EXTENDED_META, HDM_EXTENDED_SCHEDULE, hdmTransitionGate } from '../programs.js';
import { builtInExerciseLibrary } from '../exercise-catalogue.js';

const read = f => fs.readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.4.3 exposes Extended HDM v1.2 metadata and six-week schedule', () => {
  assert.equal(HDM_EXTENDED_META.programmeId,'VANTAGE-HDM-EXTENDED-2026-10');
  assert.equal(HDM_EXTENDED_META.startDate,'2026-10-25');
  assert.equal(HDM_EXTENDED_META.plannedEndDate,'2026-12-06');
  assert.equal(HDM_EXTENDED_SCHEDULE.length,42);
  assert.deepEqual(HDM_EXTENDED_SCHEDULE.slice(0,4).map(x=>x.status),['existing','existing','existing','existing']);
  assert.equal(HDM_EXTENDED_SCHEDULE[4].sessionId,'HDM-C');
  assert.equal(HDM_EXTENDED_SCHEDULE[7].sessionId,'HDM-D');
});

test('v1.4.3 Extended HDM preset adds C and D without redefining A/B history', () => {
  const preset=PROGRAM_PRESETS.find(x=>x.id==='hdm-extended');
  assert.ok(preset);
  assert.deepEqual(preset.routineBlueprints.map(x=>x.sessionId),['HDM-C','HDM-D']);
  assert.match(preset.description,/Preserves existing A\/B\/LISS history/i);
});

test('maintenance exit gate requires every explicit review domain', () => {
  const good={recovery:true,bp:true,weightWaist:true,performance:true,shoulder:true};
  assert.equal(hdmTransitionGate(good),true);
  assert.equal(hdmTransitionGate({...good,bp:false}),false);
  assert.equal(hdmTransitionGate({}),false);
});

test('new C/D identities exist as exact catalogue exercises', () => {
  const names=new Set(builtInExerciseLibrary.map(x=>x.name));
  for(const name of [
    'Hammer Strength Iso-Lateral Decline Plate Press','Close-Grip Neutral Lat Pulldown','Plate-Loaded Low Row',
    'Straight-Arm Cable Pulldown','Neutral-Grip Machine Shoulder Press','Leaning Single-Arm Cable Lateral Raise',
    'Bent-Over Rear Cable Fly','Preacher Curl — Machine','Rope Hammer Curl'
  ]) assert.ok(names.has(name),`missing exact exercise identity: ${name}`);
});

test('v1.4.3 UI exposes merge button and gated exit review', async()=>{
  const html=await read('index.html'); const app=await read('app.js');
  assert.match(html,/extendHybridHeavyDutyButton/);
  assert.match(html,/hdmExtendedPanel/);
  assert.match(app,/extendHybridHeavyDutyProgramme/);
  assert.match(app,/saveHdmMaintenanceExitReview/);
  assert.match(app,/Lean-mass activation changes the phase\/RIR guidance only/);
});

test('v1.4.3 keeps historical sessions immutable by extending program metadata only', async()=>{
  const app=await read('app.js');
  assert.match(app,/Existing A\/B\/LISS history is preserved/);
  assert.match(app,/firstPending/);
});
