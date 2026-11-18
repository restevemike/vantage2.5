import {cloudAuthenticatedClient,cloudConfig} from "./cloud-sync.js?v=1.6.1";
import * as db from "./db.js?v=1.6.1";
import {decodeHeartRateMeasurement,heartRateZone,summarizeHeartRate} from "./noop-metrics.js?v=1.6.1";

// Optional module: failures never interrupt the main VANTAGE application.
const $=selector=>document.querySelector(selector);
const show=(selector,message)=>{const el=$(selector);if(el)el.textContent=String(message);};
const value=x=>x===null||x===undefined||x===""?"—":String(x);
const moment=t=>t?new Date(t).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Never";
let tokenOnce=null,refreshing=false,liveDevice=null,liveCharacteristic=null,liveStarted=null,points=[],lastBpm=null;
async function cloud(){return await cloudAuthenticatedClient();}
function endpoint(){return (cloudConfig().url||"").replace(/\/$/,"")+"/functions/v1/vantage-noop-push";}
async function copy(text,label){try{await navigator.clipboard.writeText(text);show("#noopStatus",label+" copied.");}catch{show("#noopStatus","Copy manually from the text field.");}}
async function generateToken(){
 try{
  const {client,userId}=await cloud();
  if(!confirm("Rotate NOOP connection token? This replaces your previous token and needs updating in NOOP."))return;
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  tokenOnce="vnoop_"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
  const hashed=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(tokenOnce)));
  const token_hash=Array.from(hashed,x=>x.toString(16).padStart(2,"0")).join("");
  const {error}=await client.from("vantage_noop_connections").upsert({
   user_id:userId,token_hash,enabled:true,timezone:"Europe/London",updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)throw error;
  $("#noopToken").value=tokenOnce;
  $("#noopTokenGroup").hidden=false;
  show("#noopStatus","Token ready. Copy it into NOOP's Experimental self-hosted push. It is displayed only in this page session.");
  await refresh();
 }catch(e){show("#noopStatus","Token setup failed: "+(e?.message||e));}
}
function appendLine(host,text){
 const p=document.createElement("p");p.className="medical-note";p.textContent=text;host.append(p);
}
function showLatest(row){
 const target=$("#noopLatest");target.replaceChildren();
 if(!row){appendLine(target,"No NOOP readings received yet. Enable push in NOOP and use Export now.");return;}
 const d=row.datum||{},date=row.record_key?.day||"Date unknown";
 appendLine(target,"Source: NOOP daily snapshot from "+date+" (not a live remeasurement).");
 appendLine(target,"Recovery "+value(d.recovery)+"% · HRV "+value(d.avgHrv)+" ms · RHR "+value(d.restingHr)+" bpm");
 appendLine(target,"Sleep "+(d.totalSleepMin==null?"—":(Number(d.totalSleepMin)/60).toFixed(1))+" h · strain "+value(d.strain)+
 " · SpO₂ "+value(d.spo2Pct)+"% · respiratory "+value(d.respRateBpm));
}
function showReviews(rows){
 const target=$("#noopReviews");target.replaceChildren();
 if(!rows?.length){appendLine(target,"No scheduled reviews yet. They run at 07:00, 14:00 and 21:00 UK time after enabling the receiver.");return;}
 for(const row of rows.slice(0,9)){
  const s=row.summary||{},d=s.dailyMetric||{};
  const card=document.createElement("div");card.className="session-card";
  const title=document.createElement("h3");title.textContent=row.slot+" · "+row.review_date;
  card.append(title);
  appendLine(card,"Source date "+value(s.latestDailyDate)+" · "+value(s.dataStatus)+
   " · last review "+moment(row.generated_at));
  appendLine(card,"Recovery "+value(d.recovery)+"% · HRV "+value(d.avgHrv)+" ms · RHR "+value(d.restingHr)+" bpm");
  appendLine(card,"HR samples in previous four hours: "+value(s.hrSampleCount)+" · mean "+value(s.hrAverageBpm)+
   " bpm · peak "+value(s.hrPeakBpm)+" bpm");
  appendLine(card,"Prior 7-day HRV baseline: "+value(s.prior7DayAvgHrvMs)+" ms · difference "+value(s.hrvDeltaMs)+" ms.");
  target.append(card);
 }
}
async function refresh(){
 if(refreshing)return;refreshing=true;
 try{
  const {client,userId}=await cloud();
  const [conn,daily,reviews]=await Promise.all([
   client.from("vantage_noop_connections").select("enabled,last_received_at").eq("user_id",userId).maybeSingle(),
   client.from("vantage_noop_records").select("datum,record_key,received_at").eq("user_id",userId)
    .eq("stream","dailyMetric").order("received_at",{ascending:false}).limit(60),
   client.from("vantage_noop_reviews").select("review_date,slot,summary,generated_at").eq("user_id",userId)
    .order("review_date",{ascending:false}).order("generated_at",{ascending:false}).limit(18)
  ]);
  if(conn.error||daily.error||reviews.error)throw conn.error||daily.error||reviews.error;
  show("#noopConnectionInfo",conn.data?
    (conn.data.enabled?"Active":"Disabled")+" · Last NOOP upload "+moment(conn.data.last_received_at):
    "No NOOP connection configured");
  const latest=(daily.data||[]).sort((a,b)=>String(b.record_key?.day||"").localeCompare(String(a.record_key?.day||"")))[0];
  showLatest(latest);showReviews(reviews.data||[]);
  if($("#noopHomeCard")){
   $("#noopHomeCard").hidden=false;
   if(latest){
    const d=latest.datum||{};
    show("#noopHomeSummary","NOOP "+value(latest.record_key?.day)+" · Recovery "+value(d.recovery)+
     "% · HRV "+value(d.avgHrv)+" ms · RHR "+value(d.restingHr)+
     " bpm. Historical imported snapshot — not an updated live measurement.");
   }
  }
  show("#noopStatus","Cloud readings refreshed "+moment(new Date().toISOString()));
 }catch(e){show("#noopStatus","NOOP data unavailable: "+(e?.message||e)+". Check Cloud sign-in.");}
 finally{refreshing=false;}
}
const elapsed=()=>liveStarted?Math.max(0,Math.round((Date.now()-liveStarted)/1000)):0;
function renderLive(){
 const summary=summarizeHeartRate(points),bpm=lastBpm===null?"—":String(lastBpm);
 const maxHr=Number($("#noopMaxHr")?.value||0);
 show("#noopLiveBpm",bpm+" bpm");
 show("#noopLiveAvg",value(summary.average)+" bpm");
 show("#noopLivePeak",value(summary.peak)+" bpm");
 show("#noopLiveZone",lastBpm===null?"—":heartRateZone(lastBpm,maxHr));
 show("#noopLiveElapsed",liveStarted?Math.floor(elapsed()/60)+"m "+elapsed()%60+"s":"—");
 show("#noopWorkoutStatus",liveStarted?"Live HR "+bpm+" bpm · "+heartRateZone(lastBpm,maxHr):
   "No live HR sensor connected. Open the NOOP tab to connect.");
}
function onHeartRate(event){
 const bpm=decodeHeartRateMeasurement(event.target?.value);
 if(bpm===null)return;
 lastBpm=bpm;points.push({ts:Date.now(),bpm});
 if(points.length>12000)points=points.slice(-12000);
 renderLive();
}
async function connect(){
 try{
  if(!navigator.bluetooth)throw new Error("Web Bluetooth is unavailable; use Android Chrome.");
  if(liveStarted)throw new Error("Already recording. Stop first.");
  show("#noopLiveStatus","Select your WHOOP/HR sensor in the Bluetooth chooser.");
  liveDevice=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:["heart_rate"]});
  const server=await liveDevice.gatt.connect();
  const service=await server.getPrimaryService("heart_rate");
  liveCharacteristic=await service.getCharacteristic("heart_rate_measurement");
  liveCharacteristic.addEventListener("characteristicvaluechanged",onHeartRate);
  await liveCharacteristic.startNotifications();
  points=[];lastBpm=null;liveStarted=Date.now();renderLive();
  show("#noopLiveStatus","Connected to "+(liveDevice.name||"heart-rate strap")+". Live recording.");
  liveDevice.addEventListener("gattserverdisconnected",()=>{
   show("#noopLiveStatus","Bluetooth disconnected. Save your recorded session with Stop and save.");
  });
 }catch(e){show("#noopLiveStatus","Bluetooth connection: "+(e?.message||e));}
}
async function stop(){
 if(!liveStarted){show("#noopLiveStatus","No active recording.");return;}
 const summary=summarizeHeartRate(points);
 const record={source:"Bluetooth Heart Rate Profile",device:liveDevice?.name||"HR sensor",
  startedAt:new Date(liveStarted).toISOString(),endedAt:new Date().toISOString(),
  durationSeconds:elapsed(),summary,points,reviewed:false};
 try{
  const draft=JSON.parse(localStorage.getItem("vantage-current-session")||"null");
  if(draft?.id)record.workoutSessionId=draft.id;
 }catch{/* no active workout */}
 try{
  await db.put("settings",{key:"noop-live-hr-"+record.startedAt,value:record});
  window.dispatchEvent(new CustomEvent("vantage-noop-live-summary",{
   detail:{source:record.source,device:record.device,startedAt:record.startedAt,
    endedAt:record.endedAt,durationSeconds:record.durationSeconds,summary:record.summary}
  }));
 }catch(e){show("#noopLiveStatus","Save failed: "+(e?.message||e)+". Do not leave this screen yet.");return;}
 try{await liveCharacteristic?.stopNotifications();}catch{/* already disconnected */}
 try{liveCharacteristic?.removeEventListener("characteristicvaluechanged",onHeartRate);}catch{/* no-op */}
 try{liveDevice?.gatt?.disconnect();}catch{/* no-op */}
 liveStarted=null;liveDevice=null;liveCharacteristic=null;points=[];lastBpm=null;renderLive();
 show("#noopLiveStatus","Saved "+summary.count+" HR samples locally, average "+value(summary.average)+
 " bpm, peak "+value(summary.peak)+" bpm. VANTAGE cloud sync will include the record.");
}
function init(){
 if(!$("#noopScreen"))return;
 $("#noopEndpoint").value=endpoint();
 $("#noopCreateToken").addEventListener("click",generateToken);
 $("#noopCopyEndpoint").addEventListener("click",()=>copy($("#noopEndpoint").value,"NOOP receiver URL"));
 $("#noopCopyToken").addEventListener("click",()=>copy(tokenOnce||"","NOOP token"));
 $("#noopRefresh").addEventListener("click",refresh);
 $("#noopBleConnect").addEventListener("click",connect);
 $("#noopBleStop").addEventListener("click",stop);
 $("#noopMaxHr").addEventListener("input",renderLive);
 $('[data-nav="noop"]')?.addEventListener("click",()=>void refresh());
 window.addEventListener("vantage-cloud-auth-change",()=>{
  $("#noopEndpoint").value=endpoint();
  void refresh();
 });
 setInterval(()=>{if($("#noopScreen").classList.contains("active"))void refresh();},180000);
 setTimeout(()=>void refresh(),2500);
 setInterval(()=>{if(liveStarted)renderLive();},1000);
 renderLive();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
