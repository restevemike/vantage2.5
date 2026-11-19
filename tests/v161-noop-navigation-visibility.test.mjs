import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('NOOP tab appears among the first three items in scrollable mobile navigation',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const nav=html.match(/<nav class="bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert.ok(nav,'Primary navigation exists');
 const items=Array.from(nav.matchAll(/data-nav="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(items.slice(0,4),['dashboard','workout','noop','meals']);
 assert.equal(items.filter(i=>i==='noop').length,1);
});
test('NOOP connection CTA stays visible even before first imported reading',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="noopHomeCard" class="panel"(?! hidden)/);
 assert.match(html,/data-go="noop"/);
 assert.match(html,/id="noopHomeSummary"[^>]*>Connect NOOP/);
 const module=await readFile(new URL('../noop-integration-ui.js',import.meta.url),'utf8');
 assert.match(module,/\$\("#noopHomeCard"\)\.hidden=false/);
 assert.doesNotMatch(module,/\$\("#noopHomeCard"\)\.hidden=!latest/);
});
test('v1.6.1 PWA reloads new index and scripts without altering identity',async()=>{
 const [app,html,manifest,sw]=await Promise.all(
  ['app.js','index.html','manifest.webmanifest','sw.js'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8'))
 );
 assert.match(app,/APP_VERSION = '1\.6\.4'/);
 assert.match(html,/noop-integration-ui\.js\?v=1\.6\.4/);
 assert.match(sw,/vantage-training-console-v16-4/);
 const pwa=JSON.parse(manifest);
 assert.equal(pwa.start_url,'./?pwa=161');
 assert.equal(pwa.id,'./vantage-training-console-v133');
});
