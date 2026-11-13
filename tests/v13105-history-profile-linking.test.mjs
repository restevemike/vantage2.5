import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findBestPreviousStrengthSession, exerciseCompatibility, canonicalExerciseIdentity } from '../workout-history.js';
import { parseVitalsMarkdown } from '../vitals-markdown.js';

function ex(name, id, extra={}) { return { id:`row-${id}`, sourceExerciseId:id, name, sets:[], ...extra }; }

test('v1.3.10.6 previous workout selection prioritises latest same body-group session over older perfect template match', () => {
  const template={id:'template-back',name:'Back',exercises:[ex('Dumbbell Row','row')]};
  const sessions=[
    {id:'old-perfect',date:'2026-08-25',completedAt:'2026-08-25T19:00:00Z',templateId:'template-back',sessionType:'Back',category:'strength',exercises:[ex('Dumbbell Row','row')]},
    {id:'latest-varied',date:'2026-09-01',completedAt:'2026-09-01T19:00:00Z',templateId:'template-back',sessionType:'Back',category:'strength',exercises:[ex('Cable Pulldown','pulldown',{variation:'Cable'})]}
  ];
  assert.equal(findBestPreviousStrengthSession(sessions,template,{beforeDate:'2026-09-08'}).id,'latest-varied');
});

test('v1.3.10.6 source ID alone cannot compare dumbbell row with cable substitution', () => {
  const stored=ex('Bent over row dumbbell DY style','same',{variation:'Dumbbell',notes:'This week high low cable wide grip pull down'});
  const prior=ex('Bent over row dumbbell DY style','same',{variation:'Dumbbell'});
  const r=exerciseCompatibility(stored,prior);
  assert.equal(r.compatible,false);
  assert.equal(r.level,'review');
  assert.match(r.reason,/notes contradict/i);
});

test('v1.3.10.6 canonical comparison identity does not fragment solely because source IDs changed', () => {
  const a=ex('Chest Supported Row','legacy-a',{variation:'Machine',machineBrand:'Prime'});
  const b=ex('Chest Supported Row','new-b',{variation:'Machine',machineBrand:'Prime'});
  assert.equal(canonicalExerciseIdentity(a),canonicalExerciseIdentity(b));
});

test('v1.3.10.6 expanded vitals schema retains body composition, oxygen, autonomic data and future extensions', () => {
  const md='```vantage-vitals\n'+JSON.stringify({
    date:'2026-09-08', recovery:80, bloodPressureTime:'08:12', weightChangeKg:-0.4,
    bodyFatPercent:24.2,muscleMassKg:57.1,bodyWaterPercent:55.0,visceralFatIndex:9,
    bloodOxygen:{averagePercent:97,apneaFrequency:0,hypoxiaTimeMinutes:0,cardiacLoad:33},
    sleepWindow:'22:30-06:30',timeInBed:'8h',sleepStages:{deep:'2h'},sleepConsistency:72,
    baevskyStressIndex:7,autonomicBalance:0.7,calmTimePercent:50,
    trainingRecommendation:{action:'controlled-strength'},nutritionTargetsApprox:{protein:[180,200]},
    futureMetric:{x:1}
  })+'\n```';
  const r=parseVitalsMarkdown(md);
  assert.equal(r.values.bodyFatPercent,24.2);
  assert.equal(r.values.muscleMassKg,57.1);
  assert.equal(r.values.bloodOxygen.averagePercent,97);
  assert.equal(r.values.sleepStages.deep,'2h');
  assert.equal(r.values.baevskyStressIndex,7);
  assert.deepEqual(r.values.extensions.futureMetric,{x:1});
  assert.ok(r.warnings.some(w=>/Unknown VANTAGE vitals field: futureMetric/i.test(w)));
});

test('v1.3.10.6 app contains profile foundation, same-date vitals resolver, macro relink, hydration linking and administration events', async () => {
  const [app,html,sw]=await Promise.all([
    readFile(new URL('../app.js',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../sw.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/ensureProfileFoundation/);
  assert.match(app,/resolveVitalsForSession/);
  assert.match(app,/applyV13105HistoryRepair/);
  assert.match(app,/applyV13105VitalsLinkRepair/);
  assert.match(app,/vitalsSnapshot/);
  assert.match(app,/relinkNutritionForDate/);
  assert.match(app,/linkSessionHydrationToDailyLedger/);
  assert.match(app,/eventType:\s*'administration'/);
  assert.match(html,/id="profileForm"/);
  assert.match(html,/id="administrationForm"/);
  assert.match(html,/History matching audit/);
  assert.match(sw,/vantage-training-console-v14-4/);
});
