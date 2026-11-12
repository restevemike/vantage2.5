import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { ocrValidationState, ocrMediaAuthoritative } from '../evidence-integrity.js';
import { classifyLissSession } from '../liss-markdown.js';
import { parseTreadmillData, parseStairClimberData, FTMS_UUID } from '../ftms-bluetooth.js';
import { exerciseIdentityOverlapReviews } from '../strength-integrity.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const strength16 = `Weightlifting 16/08/2026 TIME 12:18-13:41 DURATION 1h23m
AVG 94 bpm PEAK 127 bpm LOW 65 bpm CALORIES 37 kcal THIS SESSION EFFORT 0.0
HR ZONES From strap HR Z1 68% 39m Z2 31% 18m Z3 1% 0m Z4 0% Z5 0%`;
const liss17 = `Treadmill walk 17/08/2026 TIME 18:12-19:00 DURATION 47m
AVG 102 bpm PEAK 138 bpm LOW 73 bpm CALORIES 428 kcal THIS SESSION EFFORT 7.4
HR ZONES From strap HR Z1 51% 23m Z2 47% 21m Z3 1% 0m Z4 0% Z5 0%`;

test('v1.3.9 shared NOOP parser correctly maps 16 August strength evidence', () => {
  const r = parseFitnessSummaryText(strength16, { expectedContext: 'workout' });
  assert.equal(r.metrics.avgHr, 94);
  assert.equal(r.metrics.maxHr, 127);
  assert.equal(r.metrics.minHr, 65);
  assert.equal(r.metrics.effort, 0);
  assert.equal(r.metrics.hrZones.z1Minutes, 39);
  assert.equal(r.metrics.hrZones.z2Minutes, 18);
  assert.equal(r.metrics.hrZones.z3Minutes, 0);
  assert.equal(r.sourceQuality.calories, 'suspicious');
  assert.equal(r.sourceQuality.effort, 'suspicious');
  assert.equal(r.analysisEligibility.useForEnergyAnalysis, false);
  assert.equal(r.analysisEligibility.useForTrainingLoadAnalysis, false);
});

test('v1.3.9 shared NOOP parser correctly maps 17 August LISS evidence and decimal effort', () => {
  const r = parseFitnessSummaryText(liss17, { expectedContext: 'liss' });
  assert.equal(r.metrics.avgHr, 102);
  assert.equal(r.metrics.maxHr, 138);
  assert.equal(r.metrics.minHr, 73);
  assert.equal(r.metrics.effort, 7.4);
  assert.equal(r.metrics.hrZones.z1Minutes, 23);
  assert.equal(r.metrics.hrZones.z2Minutes, 21);
  assert.equal(r.metrics.hrZones.z3Minutes, 0);
  assert.equal(r.metrics.hrZones.z4Percent, 0);
  assert.equal(r.metrics.hrZones.z4Minutes, null);
  assert.equal(r.metrics.durationMinutesDisplayed, 47);
  assert.equal(r.metrics.durationMinutesFromTimeRange, 48);
});

test('v1.3.9 validation state cannot call blocked OCR confirmed', () => {
  const parsed = { validation: { level: 'red', blockedFields: ['minHr'], warnings: ['Minimum HR equals average HR; automatic promotion blocked.'] } };
  const state = ocrValidationState(parsed, { userConfirmedMetrics: true, ocrReviewed: true });
  assert.equal(state.metricsValidated, false);
  assert.equal(state.metricsConfirmed, false);
  assert.equal(state.validationStatus, 'review-required');
  assert.equal(state.extractionStatus, 'review-required');
  assert.equal(ocrMediaAuthoritative({ metricsConfirmed: true, metricsValidated: false, validationStatus: 'review-required', ocrBlockedFields: ['minHr'] }), false);
});

test('v1.3.9 user-confirmed HR artefact preserves raw max while excluding it from classification', () => {
  const result = classifyLissSession({
    session: { cardio: { activityType: 'treadmill-walk', sensorArtifacts: [{ field:'vantageStrap.maxHr', rawValue:138, artifactSuspected:true, artifactConfirmedByUser:true, artifactReason:'strap moved at end', excludedFromClassification:true }] } },
    sources: { vantageStrap: { durationMinutes:47, avgHr:102, maxHr:138, minHr:73, effort:7.4, hrZones:{ z1Percent:51,z1Minutes:23,z2Percent:47,z2Minutes:21,z3Percent:1,z3Minutes:0,z4Percent:0,z4Minutes:null,z5Percent:0,z5Minutes:null } } },
    vitals: { recovery: 28, synthesis: 'Low' }, readiness: { level: 'amber' }
  });
  assert.equal(result.physiologicalClassification, 'true-liss');
  assert.equal(result.readinessCompliance, 'above-recovery-target');
  assert.equal(result.guardrail.rawMaxHr, 138);
  assert.equal(result.guardrail.effectiveMaxHr, null);
  assert.ok(result.guardrail.warnings.some(w => /47 minutes/.test(w)));
  assert.ok(result.guardrail.warnings.some(w => /average strap HR 102/.test(w)));
  assert.ok(!result.guardrail.warnings.some(w => /maximum strap HR 138/.test(w)));
});

test('v1.3.9 FTMS treadmill parser keeps machine workload data separate', () => {
  const flags = (1<<1)|(1<<2)|(1<<3)|(1<<7)|(1<<9)|(1<<10)|(1<<12);
  const bytes = new Uint8Array(25);
  const v = new DataView(bytes.buffer);
  let o=0; v.setUint16(o,flags,true); o+=2;
  v.setUint16(o,550,true); o+=2;        // instantaneous speed 5.50 km/h
  v.setUint16(o,540,true); o+=2;        // average speed 5.40 km/h
  bytes[o++]=0x66; bytes[o++]=0x0a; bytes[o++]=0x00; // 2662 m
  v.setInt16(o,47,true); o+=2; v.setInt16(o,0,true); o+=2; // 4.7% incline
  v.setUint16(o,437,true); o+=2; v.setUint16(o,560,true); o+=2; bytes[o++]=9; // energy
  bytes[o++]=24;                        // 2.4 MET
  v.setUint16(o,2819,true); o+=2;       // 46:59 elapsed
  v.setInt16(o,0,true); o+=2; v.setInt16(o,136,true); o+=2; // power
  const parsed = parseTreadmillData(new DataView(bytes.buffer,0,o));
  assert.equal(parsed.instantaneousSpeedKmh,5.5);
  assert.equal(parsed.averageSpeedKmh,5.4);
  assert.equal(parsed.totalDistanceMetres,2662);
  assert.equal(parsed.inclinePercent,4.7);
  assert.equal(parsed.totalEnergyKcal,437);
  assert.equal(parsed.metabolicEquivalent,2.4);
  assert.equal(parsed.elapsedSeconds,2819);
  assert.equal(parsed.powerWatts,136);
});

test('v1.3.9 FTMS StairMaster/Stair Climber parser exposes standard machine stream fields', () => {
  const flags = (1<<1)|(1<<2)|(1<<3)|(1<<5)|(1<<6)|(1<<7)|(1<<8);
  const bytes = new Uint8Array(24); const v = new DataView(bytes.buffer); let o=0;
  v.setUint16(o,flags,true); o+=2;
  v.setUint16(o,120,true); o+=2;   // floors
  v.setUint16(o,72,true); o+=2;    // steps/min
  v.setUint16(o,70,true); o+=2;    // avg step rate
  v.setUint16(o,250,true); o+=2;   // elevation
  v.setUint16(o,430,true); o+=2; v.setUint16(o,520,true); o+=2; bytes[o++]=8; // energy
  bytes[o++]=104; bytes[o++]=80;   // HR, 8.0 MET
  v.setUint16(o,2520,true); o+=2;  // elapsed
  const parsed = parseStairClimberData(new DataView(bytes.buffer,0,o));
  assert.equal(parsed.machineType,'stair-climber');
  assert.equal(parsed.floors,120);
  assert.equal(parsed.stepsPerMinute,72);
  assert.equal(parsed.totalEnergyKcal,430);
  assert.equal(parsed.heartRateBpm,104);
  assert.equal(parsed.metabolicEquivalent,8);
  assert.equal(parsed.elapsedSeconds,2520);
});

test('v1.3.9 exercise overlap review warns but never auto-merges ambiguous presses', () => {
  const session={exercises:[
    {id:'a',name:'Iso-Lateral Bench Press',machineBrand:'Hammer Strength',movementPattern:'horizontal-press',notes:'Decline iso lateral press plate loaded'},
    {id:'b',name:'Hammer Strength Iso Lateral Decline plate press',machineBrand:'Hammer Strength',movementPattern:'horizontal-press',notes:'Decline press'}
  ]};
  const reviews=exerciseIdentityOverlapReviews(session);
  assert.equal(reviews.length,1);
  assert.equal(reviews[0].exerciseIdentityReviewRequired,true);
  assert.equal(reviews[0].duplicateRisk,'possible');
  assert.deepEqual(session.exercises.map(x=>x.id),['a','b']);
});

test('v1.3.9 strength export retains structured symptom and temporary substitution evidence', () => {
  const session={id:'s',date:'2026-08-17',sessionType:'Chest & Biceps',startedAt:'2026-08-17T10:00:00Z',completedAt:'2026-08-17T11:00:00Z',exercises:[{
    id:'e',sourceExerciseId:'replacement',lineNumber:2,name:'Cable Fly',sets:[{id:'set',setNumber:1,setType:'Work',weightKg:25,reps:10,rpe:8}],
    sessionSubstitution:{temporary:true,originalSourceExerciseId:'machine-fly',originalName:'Machine Fly',replacementName:'Cable Fly'},
    symptom:{symptomPresent:true,symptomArea:'right shoulder',symptomType:'discomfort + clicking',symptomTrigger:'deep stretch / eccentric',severity:null,actionTaken:'reduced ROM'}
  }]};
  const md=createWorkoutMarkdown({session});
  assert.match(md,/"temporarySubstitutions"/);
  assert.match(md,/"originalName": "Machine Fly"/);
  assert.match(md,/"structuredSymptoms"/);
  assert.match(md,/"symptomArea": "right shoulder"/);
});

test('v1.3.10.6 UI removes FTMS from normal LISS while retaining temporary substitution', async () => {
  const [html,app,sw] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url),'utf8'),
    readFile(new URL('../app.js', import.meta.url),'utf8'),
    readFile(new URL('../sw.js', import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(html,/id="ftmsBluetoothPanel"/);
  assert.match(html,/Experimental FTMS Bluetooth is no longer part of the workout flow/);
  assert.match(sw,/ftms-bluetooth\.js/);
  assert.match(html,/change-exercise-button/);
  assert.match(html,/id="replaceExerciseDialog"/);
  assert.match(sw,/ftms-bluetooth\.js/);
  assert.match(app,/previousWeekSubstitution/);
  assert.match(app,/Previous week substitution/);
  assert.match(app,/lineNumber: target\.lineNumber \|\| index \+ 1/);
  assert.match(app,/persistToTemplate: false/);
  assert.match(app,/substituted for today; the template was not changed/);
  assert.equal(FTMS_UUID.service,0x1826);
});
