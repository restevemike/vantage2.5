import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  nutritionPerformanceAnalysis, cycleWeekNumber, cyclePerformanceSummary,
  supplementStateOnDate, supplementPerformanceComparison
} from '../metrics-engine.js';

const sessions = [
  { id:'s1', date:'2026-07-01', sessionType:'Chest', exercises:[{name:'Bench Press',sets:[{setType:'Work',weightKg:100,reps:5,rpe:9}]}]},
  { id:'s2', date:'2026-07-08', sessionType:'Chest', exercises:[{name:'Bench Press',sets:[{setType:'Work',weightKg:102.5,reps:5,rpe:9}]}]},
  { id:'s3', date:'2026-07-15', sessionType:'Chest', exercises:[{name:'Bench Press',sets:[{setType:'Work',weightKg:105,reps:5,rpe:9}]}]}
];
const nutrition = [
  {date:'2026-07-01',protein:180,carbs:220,fat:60,calories:2140},
  {date:'2026-07-08',protein:185,carbs:260,fat:60,calories:2320},
  {date:'2026-07-15',protein:190,carbs:300,fat:60,calories:2500}
];

test('nutrition performance analysis joins macro days to exercise performance', () => {
  const result = nutritionPerformanceAnalysis(sessions, [], nutrition, 'Bench Press', 'all', '2026-07-31', 'epley', 'same-day');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[2].carbs, 300);
  assert.equal(result.pbCount, 2);
  const volumeResult = nutritionPerformanceAnalysis(sessions, [], nutrition, 'Bench Press', 'all', '2026-07-31', 'epley', 'same-day', 'volume');
  assert.equal(volumeResult.outputKey, 'volume');
  assert.equal(volumeResult.outputSampleSize, 3);
  assert.ok('carbs' in volumeResult.correlations);
});

test('cycle week and summaries are calculated', () => {
  const cycle = {id:'c1',name:'Cut',type:'cut',category:'phase',startDate:'2026-07-01',durationWeeks:6,active:true};
  assert.equal(cycleWeekNumber(cycle,'2026-07-08'),2);
  const result = cyclePerformanceSummary(sessions, [], [cycle], 'Bench Press', 'all', '2026-07-31');
  assert.equal(result[0].sessions,3);
  assert.ok(result[0].e1rmChange > 0);
});

test('supplement active events support on/off comparisons', () => {
  const supplement={id:'sup1',name:'Creatine',active:true,createdAt:'2026-07-01'};
  const events=[
    {supplementId:'sup1',effectiveDate:'2026-07-01',active:false,createdAt:'2026-07-01T00:00:00Z'},
    {supplementId:'sup1',effectiveDate:'2026-07-08',active:true,createdAt:'2026-07-08T00:00:00Z'}
  ];
  assert.equal(supplementStateOnDate(supplement,events,'2026-07-01'),false);
  assert.equal(supplementStateOnDate(supplement,events,'2026-07-15'),true);
  const result=supplementPerformanceComparison(sessions,[supplement],events,'sup1','Bench Press','all','2026-07-31');
  assert.equal(result.off.sessions,1);
  assert.equal(result.on.sessions,2);
});

test('cycle and supplement UI and database stores exist', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const db=await readFile(new URL('../db.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(html,/id="trainingCycleForm"/);
  assert.match(html,/id="supplementsScreen"/);
  assert.match(html,/id="metricsFuelWindowSelect"/);
  assert.match(html,/id="metricsFuelOutputSelect"/);
  assert.match(db,/trainingCycles:/);
  assert.match(db,/supplementEvents:/);
  assert.match(db,/supplementMedia:/);
  assert.match(app,/trainingContext:/);
});
