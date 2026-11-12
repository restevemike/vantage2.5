import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { assessOcrPromotion } from '../evidence-integrity.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { calculateReadiness } from '../readiness.js';
import { comparisonConfidence } from '../strength-integrity.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const noop20 = `Weightlifting 20/08/2026 TIME 18:19-19:45 DURATION 1h26m
AVG 96 bpm PEAK 145 bpm LOW 64 bpm CALORIES 33 kcal THIS SESSION EFFORT 0.0
HR ZONES From strap HR Z1 67% 46m Z2 28% 19m Z3 4% 2m Z4 1% 0m Z5 0%`;

test('v1.3.10.6 parses 20 August NOOP HR, zones and suspicious visible source values exactly', () => {
  const r = parseFitnessSummaryText(noop20, { expectedContext: 'workout' });
  assert.equal(r.metrics.avgHr, 96);
  assert.equal(r.metrics.maxHr, 145);
  assert.equal(r.metrics.minHr, 64);
  assert.equal(r.metrics.effort, 0);
  assert.equal(r.metrics.calories, 33);
  assert.deepEqual(r.metrics.hrZones, {
    z1Percent:67,z1Minutes:46,z2Percent:28,z2Minutes:19,z3Percent:4,z3Minutes:2,z4Percent:1,z4Minutes:0,z5Percent:0,z5Minutes:null
  });
  assert.equal(r.sourceQuality.calories, 'suspicious');
  assert.equal(r.sourceQuality.effort, 'suspicious');
  assert.equal(r.analysisEligibility.useForEnergyAnalysis, false);
  assert.equal(r.analysisEligibility.useForTrainingLoadAnalysis, false);
});

test('v1.3.10.6 field validation blocks only corrupt LOW and Z5 minutes', () => {
  const bad = {
    avgHr:96,maxHr:145,minHr:96,calories:33,effort:0,durationMinutes:86,
    hrZones:{z1Percent:67,z1Minutes:46,z2Percent:28,z2Minutes:19,z3Percent:4,z3Minutes:2,z4Percent:1,z4Minutes:0,z5Percent:0,z5Minutes:46}
  };
  const result = assessOcrPromotion(bad, noop20);
  assert.equal(result.promotionMetrics.avgHr, 96);
  assert.equal(result.promotionMetrics.maxHr, 145);
  assert.equal(result.promotionMetrics.hrZones.z1Minutes, 46);
  assert.equal(result.promotionMetrics.minHr, null);
  assert.equal(result.promotionMetrics.hrZones.z5Minutes, null);
  assert.ok(result.blockedFields.includes('minHr'));
  assert.ok(result.blockedFields.includes('hrZones.z5Minutes'));
  assert.ok(result.validatedFields.includes('avgHr'));
});

test('v1.3.10.6 vitals import carries canonical readiness fields and ignores legacy recovery actions', () => {
  const md='```vantage-vitals\n'+JSON.stringify({date:'2026-08-20',recovery:47,rest:93,status:'Solid',synthesis:'Low',guidance:'Maintain',hrv:52,hrvBaselineDelta:'-9 vs base',restingHr:42,restingHrBaselineDelta:'0 vs base',respiratoryRate:13.3,stress:1.9,stressBand:'Medium',sleep:'8h17m',sleepPerformance:100,sleepEfficiency:89,sleepDebtToday:'0m',recoveryActivities:['Inversion','Acupressure']})+'\n```';
  const r=parseVitalsMarkdown(md);
  assert.equal(r.values.status,'Solid');
  assert.equal(r.values.guidance,'Maintain');
  assert.equal(r.values.respiratoryRate,13.3);
  assert.equal(r.values.sleepEfficiency,89);
  assert.equal(r.values.sleepHours,8.28);
  assert.equal(r.values.recoveryActivities,undefined);
  assert.ok(r.warnings.some(w=>/dedicated Recovery section/i.test(w)));
});

test('v1.3.10.6 amber readiness explicitly permits controlled strength', () => {
  const r=calculateReadiness({recovery:47,synthesis:'Low',hrv:52,hrvDeltaFromBaseline:-9,restingHr:42,rhrDeltaFromBaseline:0,sleepHours:8.28});
  assert.equal(r.level,'amber');
  assert.equal(r.title,'Amber — controlled training permitted');
  assert.ok(r.allowedActions.includes('controlled-strength'));
  assert.equal(r.recommendedIntensity,'controlled');
});

test('v1.3.10.6 large load change with incomplete machine metadata is review confidence', () => {
  const previous={sourceExerciseId:'push',name:'Tricep cable push down',sets:[{setType:'Work',weightKg:100,reps:6}]};
  const current={sourceExerciseId:'push',name:'Tricep cable push down',sets:[{setType:'Work',weightKg:45,reps:6}]};
  const r=comparisonConfidence(current,previous);
  assert.equal(r.level,'review');
  assert.match(r.reason,/Large load change detected/);
});

test('v1.3.10.6 strength report flags contradictory set, exposes version/revision and separates hydration', () => {
  const session={id:'s20',date:'2026-08-20',sessionType:'Shoulders & Triceps',coachPackRevision:2,hydration:{recorded:true,amountMl:1000,items:['EAAs','electrolytes']},exercises:[{id:'e',name:'Skull crusher',sets:[{id:'set',setNumber:1,setType:'Work',weightKg:40,reps:4,rpe:4,failure:true}]}]};
  const md=createWorkoutMarkdown({session,vitals:{dailyHydrationConsumedLitres:3,dailyHydrationTargetLitres:4},appVersion:'1.3.10.6',coachPackRevision:2});
  assert.match(md,/VANTAGE App Version:\*\* 1\.3\.10/);
  assert.match(md,/Coach Pack Revision:\*\* 2/);
  assert.match(md,/Failure = Yes conflicts with RPE 4/);
  assert.match(md,/Session hydration total:/);
  assert.match(md,/Daily hydration target:/);
  assert.doesNotMatch(md,/Recovery activities:/);
});

test('v1.3.10.6 normal LISS removes Bluetooth controls and saves session before export review', async () => {
  const [html,app,sw]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../app.js',import.meta.url),'utf8'),
    readFile(new URL('../sw.js',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(html,/id="ftmsBluetoothPanel"|id="connectFtmsButton"/);
  assert.match(html,/Experimental FTMS Bluetooth is no longer part of the workout flow/);
  assert.match(sw,/ftms-bluetooth\.js/);
  const start=app.indexOf('async function completeCurrentLissSession()');
  const end=app.indexOf('async function importLissAnalysisFile',start);
  const fn=app.slice(start,end);
  assert.match(fn,/await db\.put\('sessions', completedSession\)/);
  assert.doesNotMatch(fn,/await launchLissShare/);
  assert.match(fn,/void finaliseSavedLissSessionAfterClose\(completedSession\)/);
  assert.match(fn,/LISS saved successfully/);
  assert.match(app,/Coach Pack requires evidence review/);
});

test('v1.3.10.6 recovery defaults live in Recovery section, not vitals import UI', async () => {
  const [html,app]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),readFile(new URL('../app.js',import.meta.url),'utf8')]);
  assert.match(app,/DEFAULT_DAILY_RECOVERY_ROUTINE/);
  assert.match(app,/inversion-wake/);
  assert.match(app,/acupressure-pre-bed/);
  assert.match(html,/Default recovery routine today/);
  assert.doesNotMatch(html,/id="vitalsRecoveryActivities"/);
});
