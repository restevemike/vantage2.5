import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('v1.5.9 bottom tabs navigate every screen (regression: $ vs $$ selector)', async () => {
 const source = await readFile(new URL('../app.js',import.meta.url),'utf8');
 const start = source.indexOf('function showScreen(screen) {');
 const end = source.indexOf('/** Populate Vitals',start);
 assert.ok(start >= 0 && end > start, 'Expected the navigation function');
 const fn = source.slice(start,end);
 assert.match(fn, /\$\$\('\.screen'\)\.forEach/);
 const screens = ['dashboard','workout','vitals','recovery','noop'].map(name=>({
  dataset:{screen:name},active:false,
  classList:{toggle(_,v){ this.active=v; }},
 }));
 const navs = ['dashboard','workout','vitals','recovery','noop'].map(name=>({
  dataset:{nav:name},isActive:false,
  classList:{toggle(_,v){this.isActive=v;}},
  scrollIntoView(){},
 }));
 let vitalsReloads=0,scrolls=0;
 const sandbox={
  vitalsFormDirty:false,
  loadSavedVitalsIntoForm:()=>{vitalsReloads++;},
  '$': selector=>{assert.equal(selector,'.screen');return screens[0];},
  '$$': selector=>selector==='.screen'?screens:selector==='.bottom-nav button'?navs:[],
  window:{scrollTo:()=>{scrolls++;}},
 };
 vm.runInNewContext(fn+'\nthis.openTab=showScreen;',sandbox);
 for (const name of ['workout','vitals','recovery','dashboard']) {
  sandbox.openTab(name);
  assert.deepEqual(screens.map(x=>x.classList.active),screens.map(x=>x.dataset.screen===name));
  assert.deepEqual(navs.map(x=>x.classList.isActive),navs.map(x=>x.dataset.nav===name));
 }
 assert.equal(vitalsReloads,1);
 assert.equal(scrolls,4);
});

test('v1.5.9 binds navigation and cloud apply without leaving one-screen selector',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/\$\$\('\.bottom-nav button'\)\.forEach\(button => button\.addEventListener\('click', \(\) => showScreen\(button\.dataset\.nav\)\)\)/);
 assert.match(source,/window\.addEventListener\('vantage-cloud-data-applied'/);
 assert.doesNotMatch(source,/\n\s*\$\('\.screen'\)\.forEach/);
});