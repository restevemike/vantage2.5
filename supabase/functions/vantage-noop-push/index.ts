import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.79.0";

/**
 * NOOP v1 experimental self-hosted push receiver.
 * No anonymous writes: NOOP uses its own 256-bit bearer token (NOT a Supabase JWT).
 * Deployment must use verify_jwt=false; this handler authenticates every request.
 * Never log bearer tokens, raw samples or incoming bodies.
 */
const VERSION = "1.0";
const STREAMS = ["hrSample","rrInterval","dailyMetric","sleepSession","workout"] as const;
type StreamName = typeof STREAMS[number];
const KEYS: Record<StreamName,string[]> = {
 hrSample:["ts"], rrInterval:["ts","rrMs","seq"],
 dailyMetric:["day"],sleepSession:["startTs"],workout:["startTs","sport"],
};
const DATA:Record<StreamName,string[]> = {
 hrSample:["bpm"],
 rrInterval:["ord","srcChannel","tsSuspect"],
 dailyMetric:["totalSleepMin","efficiency","deepMin","remMin","lightMin","disturbances","restingHr","avgHrv","recovery","strain","exerciseCount","spo2Pct","skinTempDevC","respRateBpm","steps","activeKcalEst","spo2Red","spo2Ir"],
 sleepSession:["endTs","efficiency","restingHr","avgHrv","stagesJSON","userEdited","startTsAdjusted","motionJSON","sleepStateJSON","stagingSparse"],
 workout:["endTs","source","durationS","energyKcal","avgHr","maxHr","strain","distanceM","zonesJSON","notes","routePolyline","steps"],
};
const MAX_DECODED = 4194304;
const MAX_WIRE = 4259840;
const headers = {"Content-Type":"application/json","Cache-Control":"no-store"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(status:number,code:string){return new Response(JSON.stringify({error:{code}}),{status,headers});}
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const integer=(x:unknown):x is number=>finite(x)&&Number.isInteger(x);
async function sha(s:string):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
async function decodeBody(req:Request):Promise<string>{
 const len=req.headers.get("content-length");
 if(len && Number(len)>MAX_WIRE)throw new Error("413");
 const encoded=new Uint8Array(await req.arrayBuffer());
 if(encoded.length>MAX_WIRE)throw new Error("413");
 const coding=req.headers.get("content-encoding")?.toLowerCase()??"identity";
 let stream:ReadableStream<Uint8Array>=new Blob([encoded]).stream();
 if(coding==="gzip"){
  if(typeof DecompressionStream==="undefined")throw new Error("415");
  stream=stream.pipeThrough(new DecompressionStream("gzip"));
 }else if(coding!=="identity")throw new Error("415");
 const reader=stream.getReader();
 const chunks:Uint8Array[]=[];
 let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_DECODED)throw new Error("413");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{/* reader already closed */}}
 const decoded=new Uint8Array(total);let pos=0;
 for(const x of chunks){decoded.set(x,pos);pos+=x.length;}
 return new TextDecoder("utf-8",{fatal:true}).decode(decoded);
}
function dateStr(x:unknown):x is string{
 return typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z"))&&new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
}
function validRow(stream:StreamName,row:unknown):boolean{
 if(!obj(row)||row.type!=="record"||!obj(row.key)||!obj(row.data))return false;
 const keys=KEYS[stream],dataFields=DATA[stream];
 if(Object.keys(row.key).length!==keys.length||!keys.every(k=>k in row.key))return false;
 if(Object.keys(row.data).some(k=>!dataFields.includes(k)))return false;
 if(stream==="hrSample")return integer(row.key.ts)&&integer(row.data.bpm)&&row.data.bpm>=0&&row.data.bpm<=300;
 if(stream==="rrInterval")return integer(row.key.ts)&&integer(row.key.rrMs)&&integer(row.key.seq)&&row.key.rrMs>0;
 if(stream==="dailyMetric"&&!dateStr(row.key.day))return false;
 if((stream==="sleepSession"||stream==="workout")&&!integer(row.key.startTs))return false;
 if(stream==="workout"&&typeof row.key.sport!=="string")return false;
 if(stream==="sleepSession"&&(!integer(row.data.endTs)||typeof row.data.userEdited!=="boolean"))return false;
 if(stream==="workout"&&(!integer(row.data.endTs)||typeof row.data.source!=="string"))return false;
 for(const value of Object.values(row.data)){
  if(value!==null&&typeof value!=="number"&&typeof value!=="boolean"&&typeof value!=="string")return false;
  if(typeof value==="number"&&!Number.isFinite(value))return false;
  if(typeof value==="string"&&value.length>50000)return false;
 }
 return true;
}
function validatePacket(header:unknown,rows:unknown[]):string|null{
 if(!obj(header)||header.type!=="batch"||header.protocolVersion!==VERSION||
 !uuid.test(String(header.batchId??""))||!uuid.test(String(header.sourceId??""))||
 typeof header.deviceId!=="string"||!header.deviceId.trim()||header.deviceId.length>180||
 !STREAMS.includes(header.stream as StreamName)||!integer(header.recordCount)||header.recordCount!==rows.length||
 rows.length>5000)return "invalid_batch_header";
 const stream=header.stream as StreamName;
 if(!rows.every(row=>validRow(stream,row)))return "invalid_record";
 const append=["hrSample","rrInterval"].includes(stream);
 if(append && header.delivery!=="append")return "invalid_delivery";
 if(!append && header.delivery!=="replace_window")return "invalid_delivery";
 if(append){
  const ec=header.endCursor,sc=header.startCursor;
  const cursor=(v:unknown)=>obj(v)&&integer(v.rowId)&&v.rowId>=0&&typeof v.keySha256==="string"&&/^[0-9a-f]{64}$/.test(v.keySha256);
  if(header.window!==undefined||!cursor(ec)||(sc!==null&&!cursor(sc))||rows.length===0)return "invalid_cursor";
 }else{
  if(header.endCursor!==null||header.startCursor!==null||!obj(header.window))return "invalid_window";
  const w=header.window;
  if(!uuid.test(String(w.replacementId??""))||!integer(w.part)||!integer(w.parts)||w.part<1||w.parts<1||w.part>w.parts||w.parts>100)return "invalid_window";
  const selector=stream==="dailyMetric"?"day":"startTs";
  if(w.selector!==selector)return "invalid_window";
  if(selector==="day"){
   if(!dateStr(w.startInclusive)||!dateStr(w.endExclusive)||w.startInclusive>=w.endExclusive)return "invalid_window";
  }else if(!integer(w.startInclusive)||!integer(w.endExclusive)||w.startInclusive>=w.endExclusive)return "invalid_window";
  for(const row of rows){
   const key=(row as {key:Record<string,unknown>}).key[selector] as string|number;
   if(key<w.startInclusive || key>=w.endExclusive)return "out_of_window";
  }
 }
 return null;
}
const url=Deno.env.get("SUPABASE_URL");
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!url||!serviceKey)throw new Error("Missing edge function server credentials");
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(request:Request)=>{
 if(!["GET","POST"].includes(request.method))return fail(405,"method_not_allowed");
 // No CORS; this is a native NOOP-to-server endpoint, never a public web form.
 const match=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("authorization")??"");
 if(!match)return fail(401,"authentication_required");
 const tokenHash=await sha(match[1]);
 const {data:conn,error:authError}=await admin.from("vantage_noop_connections")
 .select("user_id,receiver_state_id").eq("token_hash",tokenHash).eq("enabled",true).maybeSingle();
 if(authError)return fail(503,"auth_unavailable");
 if(!conn)return fail(401,"invalid_token");
 if(request.method==="GET"){
  const accept=request.headers.get("noop-push-accept-version")??"";
  if(!accept.split(",").map(s=>s.trim()).includes(VERSION))return fail(406,"unsupported_version");
  return new Response(JSON.stringify({type:"capabilities",protocolVersion:VERSION,
   receiverStateId:conn.receiver_state_id,streams:STREAMS}),{headers});
 }
 if(!/application\/x-ndjson/i.test(request.headers.get("content-type")??""))return fail(415,"unsupported_content_type");
 let body:string;
 try{body=await decodeBody(request)}catch(e){
  const message=e instanceof Error?e.message:"400";
  return fail(["413","415"].includes(message)?Number(message):400,"invalid_body");
 }
 if(!body.endsWith("\n")||body.startsWith("\uFEFF")||body.includes("\r"))return fail(400,"invalid_ndjson");
 const lines=body.slice(0,-1).split("\n");
 if(lines.length<2||lines.length>5001||lines.some(s=>s.length===0))return fail(400,"invalid_ndjson");
 let packet:unknown[];
 try{packet=lines.map(line=>JSON.parse(line))}catch{return fail(400,"malformed_json")}
 const [h,...rows]=packet;
 const validation=validatePacket(h,rows);
 if(validation)return fail(422,validation);
 // SHA of uncompressed bytes: stable between gzip and identity retries.
 const decodedHash=await sha(body);
 const {data:ack,error}=await admin.rpc("vantage_noop_accept_secure",{
  p_user_id:conn.user_id,p_envelope:{header:h,records:rows},p_hash:decodedHash
 });
 if(error){
  const conflict=/conflict|inconsistent|incomplete|reuse/i.test(error.message);
  return fail(conflict?409:503,conflict?"batch_conflict":"receiver_unavailable");
 }
 return new Response(JSON.stringify(ack),{headers});
});