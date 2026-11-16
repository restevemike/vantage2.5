import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRemoteRows } from '../cloud-sync.js';

function fakeCloud(rows,{errorAtPage=null}={}){
  const ranges=[];
  const orders=[];
  const sorted=[...rows].sort((a,b)=>
    a.store_name.localeCompare(b.store_name) || a.record_id.localeCompare(b.record_id)
  );
  const client={
    from(table){
      assert.ok(['vantage_cloud_records','vantage_cloud_media'].includes(table));
      return {
        select(columns){assert.match(columns,/store_name,record_id/);return this;},
        eq(column,value){assert.equal(column,'user_id');assert.equal(value,'test-user');return this;},
        order(field,opts){orders.push(field);assert.equal(opts.ascending,true);return this;},
        async range(from,to){
          ranges.push([from,to]);
          if(from===errorAtPage)return {data:null,error:new Error('page-fetch-failed')};
          return {data:sorted.slice(from,to+1),error:null};
        },
      };
    },
  };
  return {client,ranges,orders};
}
test('v1.5.8 fetches all 1,674 cloud rows beyond the 1,000-row REST cap',async()=>{
  const make=(name,count)=>Array.from({length:count},(_,i)=>({
    store_name:name,record_id:name+'-'+String(i).padStart(5,'0'),
    payload:{id:name+'-'+i},fingerprint:'f-'+i
  }));
  const rows=[
    ...make('exercises',601),...make('meals',531),...make('nutritionDays',150),
    ...make('sessions',126),...make('settings',151),...make('vitals',115),
  ];
  assert.equal(rows.length,1674);
  const {client,ranges,orders}=fakeCloud(rows);
  const all=await fetchAllRemoteRows(client,'vantage_cloud_records','test-user','store_name,record_id',500);
  assert.equal(all.length,1674);
  assert.equal(all.filter(x=>x.store_name==='vitals').length,115);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499],[1500,1999]]);
  assert.deepEqual(orders,['store_name','record_id','store_name','record_id','store_name','record_id','store_name','record_id']);
});
test('v1.5.8 aborts on a failed middle page instead of returning a truncated cloud snapshot',async()=>{
  const rows=Array.from({length:1200},(_,i)=>({store_name:'vitals',record_id:String(i)}));
  const {client,ranges}=fakeCloud(rows,{errorAtPage:500});
  await assert.rejects(
    ()=>fetchAllRemoteRows(client,'vantage_cloud_records','test-user','store_name,record_id',500),
    /page-fetch-failed/
  );
  assert.deepEqual(ranges,[[0,499],[500,999]]);
});
test('v1.5.8 rejects invalid oversized sync page sizes',async()=>{
  const {client}=fakeCloud([]);
  await assert.rejects(()=>fetchAllRemoteRows(client,'vantage_cloud_records','test-user','x',1001),/Invalid sync page size/);
});
test('v1.5.8 protects both workout/session and media sync from partial cloud listings',async()=>{
  const {readFile}=await import('node:fs/promises');
  const cloud=await readFile(new URL('../cloud-sync.js',import.meta.url),'utf8');
  assert.match(cloud,/remoteCoreMap\(client, userId\)[\s\S]*?fetchAllRemoteRows\(client, 'vantage_cloud_records'/);
  assert.match(cloud,/remoteMediaMap\(client, userId\)[\s\S]*?fetchAllRemoteRows\(client, 'vantage_cloud_media'/);
});
