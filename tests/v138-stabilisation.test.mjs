import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFitnessSummaryText } from '../ocr-engine.js';
import { classifyLissSession, createLissMarkdown } from '../liss-markdown.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';
import { mediaHashAudit, roleContentValidation, normaliseHydrationContents, hydrationSemanticStatus, laterSourceCorrectionCandidates } from '../evidence-integrity.js';
import { createWorkoutMarkdown } from '../workout-markdown.js';

const strengthText = `Weightlifting 10/08/2026 07:27-08:25 Duration 57m AVG 101 bpm PEAK 132 bpm LOW 72 bpm Calories 4 kcal Effort 22.6 HR zones Z1 50% 24m Z2 45% 22m Z3 4% 2m Z4 0% 0m Z5 0% 0m From Strap HR`;
const walkText = `Walking 11/08/2026 18:23-19:11 Duration 47m Distance 4.9 km AVG 105 bpm PEAK 126 bpm LOW 71 bpm Calories 0 kcal Effort 16.0 HR zones Z1 31% 14m Z2 68% 30m Z3 1% 0m Z4 0% Z5 0% From Strap HR`;
const savedText = `Walking saved 47 min 4.90 km 91 avg bpm Max HR 173 max bpm Top Zone >=156 bpm Route map`;

test('v1.3.8 parses 10 August strength evidence without flattening duration or decimals', () => {
  const r = parseFitnessSummaryText(strengthText, { expectedContext: 'workout' });
  assert.equal(r.metrics.minHr, 72); assert.equal(r.metrics.effort, 22.6);
  assert.equal(r.metrics.durationMinutesDisplayed, 57); assert.equal(r.metrics.durationMinutesFromTimeRange, 58);
  assert.deepEqual(r.metrics.hrZones, {z1Percent:50,z1Minutes:24,z2Percent:45,z2Minutes:22,z3Percent:4,z3Minutes:2,z4Percent:0,z4Minutes:0,z5Percent:0,z5Minutes:0});
  assert.equal(r.metrics.calories, 4); assert.ok(r.warnings.some(w => /exclude it from energy-expenditure/i.test(w)));
});

test('v1.3.8 parses 11 August NOOP summary and does not invent unseen Z4/Z5 minutes', () => {
  const r = parseFitnessSummaryText(walkText, { expectedContext: 'liss' });
  assert.equal(r.sourceRole, 'noopStrapSessionSummary');
  assert.equal(r.metrics.avgHr,105); assert.equal(r.metrics.maxHr,126); assert.equal(r.metrics.minHr,71); assert.equal(r.metrics.effort,16);
  assert.equal(r.metrics.hrZones.z1Minutes,14); assert.equal(r.metrics.hrZones.z2Minutes,30); assert.equal(r.metrics.hrZones.z3Minutes,0);
  assert.equal(r.metrics.hrZones.z4Percent,0); assert.equal(r.metrics.hrZones.z4Minutes,null); assert.equal(r.metrics.hrZones.z5Minutes,null);
});

test('v1.3.8 separates saved-stream configured HR from session HR', () => {
  const r = parseFitnessSummaryText(savedText, { expectedContext: 'liss' });
  assert.equal(r.sourceRole,'noopSessionStreamSaved'); assert.equal(r.metrics.avgHr,91); assert.equal(r.metrics.maxHr,null);
  assert.equal(r.metrics.configuredMaxHr,173); assert.equal(r.metrics.configuredTopZoneThreshold,156);
});

test('v1.3.8 physiology and red-day readiness compliance are separate', () => {
  const r = classifyLissSession({session:{cardio:{activityType:'outdoor-walk'}},sources:{vantageStrap:{durationMinutes:47,avgHr:105,maxHr:126,effort:16,hrZones:{z1Percent:31,z1Minutes:14,z2Percent:68,z2Minutes:30,z3Percent:1,z3Minutes:0,z4Percent:0,z4Minutes:null,z5Percent:0,z5Minutes:null}}},vitals:{recovery:10,synthesis:'Depleted'},readiness:{level:'red'}});
  assert.equal(r.physiologicalClassification,'true-liss'); assert.equal(r.readinessCompliance,'above-target-for-red-recovery-day');
  assert.equal(r.guardrail.recommendedDurationMinutes.max,30);
});

test('v1.3.8 full vitals aliases link sleep, rest, deltas, stress band and cuff pulse', () => {
  const md='```vantage-vitals\n'+JSON.stringify({date:'2026-08-11',recovery:10,charge:10,rest:89,status:'Solid',synthesis:'Depleted',guidance:'Maintain',hrv:41,hrvBaselineDelta:'-26 vs baseline',restingHr:49,restingHrBaselineDelta:'+8 vs baseline',respiratoryRate:14.1,stress:3,stressBand:'High',sleep:'7h13m',sleepPerformance:96,sleepEfficiency:92,sleepDebtToday:'17m',bloodPressure:'128/78',bloodPressurePulse:56})+'\n```';
  const {values}=parseVitalsMarkdown(md);
  assert.equal(values.restScore,89); assert.equal(values.hrvDeltaFromBaseline,-26); assert.equal(values.rhrDeltaFromBaseline,8); assert.equal(values.sleepHours,7.22); assert.equal(values.sleepEfficiency,92); assert.equal(values.pulse,56); assert.equal(values.stressBand,'High');
});

test('v1.3.8 media audit blocks duplicate hashes with incompatible roles and validates BP content', () => {
  const audit=mediaHashAudit([{id:'a',sha256:'abc',sourceRole:'noopStrapSessionSummary'},{id:'b',sha256:'abc',sourceRole:'preLissBloodPressure'}]);
  assert.equal(audit.blocking.length,1);
  const role=roleContentValidation('preLissBloodPressure','Walking 47m AVG 105 bpm HR zones Z1 31% Z2 68% Effort 16.0');
  assert.equal(role.valid,false); assert.equal(role.level,'red');
});

test('v1.3.8 hydration deduplicates EAA/electrolyte variants and uses explicit semantic state', () => {
  assert.deepEqual(normaliseHydrationContents(['Eaas and electrolytes','EAAs and electrolytes','eAAs and electrolytes']),['EAAs','electrolytes']);
  assert.equal(hydrationSemanticStatus({declined:true}),'explicitly-none');
});

test('v1.3.8 strength report exports structured intensity techniques', () => {
  const session={id:'s',date:'2026-08-10',sessionType:'Shoulders & Triceps',startedAt:'2026-08-10T07:27:00Z',completedAt:'2026-08-10T08:25:00Z',exercises:[{id:'e',name:'Dumbbell Lateral Raise',variation:'Dumbbell',sets:[{id:'set',setNumber:1,setType:'Work',weightKg:12,reps:8,rpe:9,failure:true,forcedNegativeReps:2,partialReps:4,restPause:true,notes:'last rep'}]}]};
  const md=createWorkoutMarkdown({session});
  assert.match(md,/2 forced negatives; 4 partials; rest-pause/);
  assert.match(md,/"forcedNegativeReps": 2/);
});


test('v1.3.8 later historical NOOP values become correction candidates instead of overwrites', () => {
  const candidates=laterSourceCorrectionCandidates([
    {sourceRole:'workoutHrSummary',sourceFile:'current.png',metrics:{calories:4,durationMinutes:57}},
    {sourceRole:'noopHistoricalWorkoutCard',sourceFile:'later.png',metrics:{calories:424,durationMinutes:58}}
  ]);
  assert.ok(candidates.some(item => item.field==='calories' && item.originalValue===4 && item.laterValue===424 && item.status==='correction-candidate'));
});

test('v1.3.10.6 app shell and migration are versioned without changing PWA identity', async () => {
  const [html,app,sw,manifestText]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),readFile(new URL('../app.js',import.meta.url),'utf8'),readFile(new URL('../sw.js',import.meta.url),'utf8'),readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8')]);
  const manifest=JSON.parse(manifestText);
  assert.match(html,/v1\.5\.4/); assert.match(html,/app\.js\?v=1\.5\.4/); assert.match(sw,/vantage-training-console-v15-4/);
  assert.match(app,/applyV138ExerciseIdentityRepair/); assert.match(app,/mediaHashAudit/); assert.match(app,/metricsConfirmed/);
  assert.equal(manifest.id,'./vantage-training-console-v133'); assert.equal(manifest.start_url,'./?pwa=154');
});
