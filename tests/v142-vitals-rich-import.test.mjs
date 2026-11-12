import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVitalsMarkdown, KNOWN_VANTAGE_VITALS_EXTENSIONS } from '../vitals-markdown.js';

function md(obj){ return '```vantage-vitals\n'+JSON.stringify(obj)+'\n```'; }

test('v1.4.3 parses rich sleep object and duration strings',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',sleep:{sleepDuration:'7h57m',sleepPerformance:100,sleepEfficiencyPercent:87,hoursVsNeededPercent:106,sleepDebt:'9m',restorativeSleepPercent:66,sleepWindow:'23:07-08:15',sleepStages:{rem:'2h22m / 26%'}}}));
  assert.equal(r.values.sleepHours,7.95);
  assert.equal(r.values.sleepPerformance,100);
  assert.equal(r.values.sleepEfficiency,87);
  assert.equal(r.values.sleepDebt,0.15);
  assert.equal(r.values.extensions.sleepWindow,'23:07-08:15');
  assert.deepEqual(r.values.sleepStages,{rem:'2h22m / 26%'});
  assert.ok(!r.warnings.some(x=>/sleepHours was not a valid number/i.test(x)));
});

test('v1.4.3 normalises weightKg and nested BP',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',weightKg:89.5,bloodPressure:{systolic:139,diastolic:78,pulse:49,time:'09:33'}}));
  assert.equal(r.values.weight,89.5);
  assert.equal(r.values.systolic,139);
  assert.equal(r.values.diastolic,78);
  assert.equal(r.values.pulse,49);
  assert.equal(r.values.extensions.bloodPressureTime,'09:33');
  assert.equal(r.warnings.length,0);
});

test('v1.4.3 preserves recognised extensions silently',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',recovery:91,effort:0,autonomicBalanceLfHf:0.9,deviceReportedMetabolicMarkers:{bloodGlucoseMmolL:{average:4.35}}}));
  assert.equal(r.values.extensions.effort,0);
  assert.equal(r.values.extensions.autonomicBalanceLfHf,0.9);
  assert.deepEqual(r.values.extensions.deviceReportedMetabolicMarkers,{bloodGlucoseMmolL:{average:4.35}});
  assert.equal(r.warnings.length,0);
  assert.ok(KNOWN_VANTAGE_VITALS_EXTENSIONS.has('deviceReportedMetabolicMarkers'));
});

test('v1.4.3 body composition is structured and queryable',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',weightKg:89.5,bodyFatPercent:24.2,muscleRatePercent:60.4,boneMassKg:3.2,bmrKcal:1738,proteinRatePercent:15.3,metabolicAge:40,subcutaneousFatPercent:25.2,standardWeightKg:71.4,weightControlKg:-18.1,fatFreeMassKg:67.8,muscleMassKg:54.1,proteinMassKg:13.7,bodyScore:80}));
  assert.equal(r.values.bodyComposition.weightKg,89.5);
  assert.equal(r.values.bodyComposition.muscleRatePercent,60.4);
  assert.equal(r.values.bodyComposition.bmrKcal,1738);
  assert.equal(r.values.bodyComposition.fatFreeMassKg,67.8);
  assert.equal(r.warnings.length,0);
});

test('v1.4.3 unknown fields create one concise warning',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',recovery:91,madeUpMetric:123}));
  assert.deepEqual(r.warnings.filter(x=>/madeUpMetric/.test(x)),['Unknown VANTAGE vitals field: madeUpMetric']);
});

test('v1.4.3 older flat vitals remain compatible',()=>{
  const r=parseVitalsMarkdown(md({date:'2026-10-26',recovery:91,charge:91,restScore:92,hrv:60,restingHr:42,sleepHours:7.95,systolic:139,diastolic:78,weight:89.5}));
  assert.equal(r.values.sleepHours,7.95); assert.equal(r.values.weight,89.5); assert.equal(r.values.systolic,139); assert.equal(r.warnings.length,0);
});
