import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {decodeHeartRateMeasurement,heartRateZone,summarizeHeartRate} from '../noop-metrics.js';

test('NOOP isolated browser module parses without crashing VANTAGE startup',()=>{
 const result=spawnSync(process.execPath,['--check',new URL('../noop-integration-ui.js',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||'syntax error');
});
test('NOOP live-HR parser reads both Bluetooth Heart Rate formats and ignores invalid sensor values',()=>{
 const u8=new DataView(new Uint8Array([0,129]).buffer);
 const u16=new DataView(new Uint8Array([1,155,0]).buffer);
 assert.equal(decodeHeartRateMeasurement(u8),129);
 assert.equal(decodeHeartRateMeasurement(u16),155);
 assert.equal(decodeHeartRateMeasurement(new DataView(new Uint8Array([1]).buffer)),null);
 assert.equal(decodeHeartRateMeasurement(new DataView(new Uint8Array([0,0]).buffer)),null);
});
test('NOOP workout HR zone needs a user-supplied HR max and supports summary statistics',()=>{
 assert.equal(heartRateZone(120,0),'No HR max set');
 assert.equal(heartRateZone(150,190),'Zone 2');
 const s=summarizeHeartRate([{bpm:120},{bpm:140},{bpm:160},{bpm:0}]);
 assert.deepEqual(s,{count:3,average:140,peak:160,minimum:120});
});
test('NOOP code cannot overwrite VANTAGE daily vitals or the manual workout store',async()=>{
 const source=await readFile(new URL('../noop-integration-ui.js',import.meta.url),'utf8');
 assert.match(source,/vantage_noop_connections/);
 assert.match(source,/vantage_noop_records/);
 assert.match(source,/vantage_noop_reviews/);
 assert.match(source,/crypto\.getRandomValues/);
 assert.match(source,/heart_rate_measurement/);
 assert.match(source,/db\.put\("settings"/);
 assert.doesNotMatch(source,/db\.put\("vitals"/);
 assert.doesNotMatch(source,/db\.put\("sessions"/);
 assert.doesNotMatch(source,/vantage_cloud_records/);
});
test('NOOP separate tab and workout badge are present without replacing normal tabs',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="noopScreen" class="screen" data-screen="noop"/);
 assert.match(html,/data-nav="noop"/);
 assert.match(html,/id="noopWorkoutStatus"/);
 assert.match(html,/id="noopLiveStatus"/);
 assert.match(html,/noop-integration-ui\.js\?v=1\.6\.1/);
 for(const target of ['dashboard','workout','meals','vitals','recovery','cloud'])
  assert.match(html,new RegExp('data-nav="'+target+'"'));
});
test('NOOP PWA module cached and v1.6.1 app identity preserved',async()=>{
 const files=await Promise.all(['sw.js','manifest.webmanifest','app.js','package.json'].map(
  p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
 const [sw,manifestSource,app,pkg]=files;
 assert.match(sw,/vantage-training-console-v16-1/);
 assert.match(sw,/noop-integration-ui\.js/);
 assert.match(sw,/noop-metrics\.js/);
 const manifest=JSON.parse(manifestSource);
 assert.equal(manifest.id,'./vantage-training-console-v133');
 assert.equal(manifest.start_url,'./?pwa=161');
 assert.match(app,/APP_VERSION = '1\.6\.1'/);
 assert.equal(JSON.parse(pkg).version,'1.6.1');
});
test('NOOP receiver restricts accepted streams and requires independent bearer auth',async()=>{
 const source=await readFile(new URL('../supabase/functions/vantage-noop-push/index.ts',import.meta.url),'utf8');
 assert.match(source,/const STREAMS = \["hrSample","rrInterval","dailyMetric","sleepSession","workout"\]/);
 assert.match(source,/authorization/);
 assert.match(source,/token_hash/);
 assert.match(source,/vantage_noop_accept_secure/);
 assert.match(source,/content-encoding/);
 assert.doesNotMatch(source,/console\.log\(.*token/);
});
test('NOOP workout Markdown export includes linked live HR evidence',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/vantage-noop-live-summary/);
 assert.match(source,/state\.currentSession\.noopLiveHr/);
 assert.match(source,/## Live Bluetooth HR evidence \(NOOP companion\)/);
});
