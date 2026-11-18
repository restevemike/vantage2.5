import * as db from "./db.js?v=1.6.1";
import { calculateReadiness } from "./readiness.js?v=1.6.1";
import { cloudAuthenticatedClient } from "./cloud-sync.js?v=1.6.1";
import { runExperimentalOcr } from "./ocr-engine.js?v=1.6.1";
import { parseVitalsScreenText } from "./flow-vitals-parser.js?v=1.6.3";

// Flow is a read-only synthesis of local confirmed vitals and NOOP historical snapshots.
// No inferred measurement is written to the vitals store.
const $ = selector => document.querySelector(selector);
const n = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const fmt = (value, digits = 0) => n(value) == null ? "—" : Number(n(value).toFixed(digits)).toLocaleString("en-GB");
const dayUK = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/London",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type)?.value;
  return [part("year"), part("month"), part("day")].join("-");
};
const dayLabel = day => day ? new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", {day:"numeric",month:"short"}) : "No date";
const metricFields = ["recovery","avgHrv","restingHr","totalSleepMin","deepMin","remMin","lightMin","respRateBpm","spo2Pct"];
const complete = row => metricFields.filter(key => n(row?.datum?.[key]) != null).length;
function chooseNoop(rows) {
  return [...(rows || [])].sort((a,b) =>
    String(b.record_key?.day || "").localeCompare(String(a.record_key?.day || "")) ||
    complete(b) - complete(a) ||
    String(b.received_at || "").localeCompare(String(a.received_at || ""))
  )[0] || null;
}
const tile = (name, value, source, accent = "") => {
  const node = document.createElement("article");
  node.className = "flow-tile" + (accent ? " flow-tile-" + accent : "");
  const heading = document.createElement("span");heading.textContent = name;
  const number = document.createElement("strong");number.textContent = value;
  const footer = document.createElement("small");footer.textContent = source;
  node.append(heading, number, footer);
  return node;
};
let flowBusy = false;
async function refreshFlow() {
  const panel = $("#flowPanel"), host = $("#flowTiles"), status = $("#flowStatus");
  if (!panel || !host || flowBusy) return;
  flowBusy = true;
  try {
    const currentDay = dayUK();
    const vitals = await db.getAll("vitals");
    const ordered = vitals.filter(row => row?.date && row.date <= currentDay).sort((a,b) =>
      String(b.date).localeCompare(String(a.date)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
    const todayVitals = ordered.find(row => row.date === currentDay) || null;
    const latestWeight = ordered.find(row => n(row.weight) != null);
    const latestBp = ordered.find(row => n(row.systolic) != null && n(row.diastolic) != null);
    let noop = null, cloudNote = "NOOP not signed in or temporarily unavailable";
    try {
      const { client, userId } = await cloudAuthenticatedClient();
      const result = await client.from("vantage_noop_records")
        .select("datum,record_key,device_id,received_at")
        .eq("user_id",userId).eq("stream","dailyMetric")
        .order("received_at",{ascending:false}).limit(160);
      if (result.error) throw result.error;
      noop = chooseNoop(result.data);
      cloudNote = noop ? "NOOP " + dayLabel(noop.record_key?.day) + " · " + (noop.device_id || "device") : "No NOOP daily snapshot yet";
    } catch (error) { cloudNote = String(error?.message || cloudNote); }
    const noopDate = noop?.record_key?.day || null;
    const noopToday = noopDate === currentDay ? (noop?.datum || null) : null;
    const display = noop?.datum || {};
    const fused = {...(todayVitals || {})};
    // Fill only absent fields and only from a same-date NOOP snapshot.
    if (noopToday) {
      const mapping = [["recovery","recovery"],["hrv","avgHrv"],["restingHr","restingHr"]];
      for (const [target, source] of mapping) if (n(fused[target]) == null && n(noopToday[source]) != null) fused[target] = n(noopToday[source]);
      if (n(fused.sleepHours) == null && n(noopToday.totalSleepMin) != null) fused.sleepHours = n(noopToday.totalSleepMin) / 60;
    }
    const hasSignals = [fused.recovery,fused.hrv,fused.restingHr,fused.sleepHours,fused.systolic,fused.diastolic].some(value => n(value) != null) || Boolean(todayVitals?.symptoms);
    const advice = $("#flowAdvice"), source = $("#flowSource");
    const result = calculateReadiness(fused);
    const actualBp = n(todayVitals?.systolic) != null && n(todayVitals?.diastolic) != null;
    const noBp = !actualBp;
    const severeBp = actualBp && (n(todayVitals.systolic) >= 180 || n(todayVitals.diastolic) >= 120);
    let title = "Readings needed", message = "Add a recent BP reading and confirm recovery, sleep and symptoms before deciding on heavy training.";
    let accent = "neutral";
    if (hasSignals) {
      accent = result.level;
      title = result.level === "red" ? "Recovery / rest priority" : result.level === "amber" ? "Controlled training or recovery" : "Training signals broadly favourable";
      message = result.message;
      if (noBp && result.level === "green") {
        title = "Provisional — check blood pressure";
        message = "Current recovery signals look favourable, but there is no confirmed BP for today. Confirm BP, symptoms and how you feel before heavy lifting.";
        accent = "amber";
      } else if (noBp) {
        message += " No confirmed BP today — check it before heavy lifting.";
      }
      if (severeBp) {
        accent = "red";
        title = "Very high BP — do not train";
        message = "Sit quietly and repeat the measurement. Seek urgent medical guidance if it stays very high. Call 999 for chest pain, severe breathlessness, stroke-like symptoms or other emergency symptoms.";
      }
    }
    advice.className = "flow-advice flow-advice-" + accent;
    advice.replaceChildren();
    const h = document.createElement("strong");h.textContent = title;
    const p = document.createElement("p");p.textContent = message;
    advice.append(h,p);
    source.textContent = "Readiness: confirmed local vitals" + (noopToday ? " + same-day NOOP" : "") +
      ". Imported NOOP data are snapshots, not real-time measurements. Missing readings never count as normal.";
    const latestVitals = ordered[0] || null;
    const bp = latestBp ? fmt(latestBp.systolic) + "/" + fmt(latestBp.diastolic) + " mmHg" : "—";
    const weight = latestWeight ? fmt(latestWeight.weight,2) + " kg" : "—";
    const rows = [
      ["Recovery",n(todayVitals?.recovery)!=null?fmt(todayVitals.recovery)+"%":fmt(display.recovery)+"%",n(todayVitals?.recovery)!=null?"Vitals today":cloudNote],
      ["HRV",n(todayVitals?.hrv)!=null?fmt(todayVitals.hrv,1)+" ms":fmt(display.avgHrv,1)+" ms",n(todayVitals?.hrv)!=null?"Vitals today":cloudNote],
      ["Resting HR",n(todayVitals?.restingHr)!=null?fmt(todayVitals.restingHr)+" bpm":fmt(display.restingHr)+" bpm",n(todayVitals?.restingHr)!=null?"Vitals today":cloudNote],
      ["Sleep",n(todayVitals?.sleepHours)!=null?fmt(todayVitals.sleepHours,1)+" h":n(display.totalSleepMin)!=null?fmt(n(display.totalSleepMin)/60,1)+" h":"—",n(todayVitals?.sleepHours)!=null?"Vitals today":cloudNote],
      ["Blood pressure",bp,latestBp?"Cuff · "+dayLabel(latestBp.date):"No confirmed cuff reading"],
      ["Weight",weight,latestWeight?"Scale · "+dayLabel(latestWeight.date):"No confirmed scale reading"],
      ["Strain",fmt(display.strain,1),cloudNote],
      ["Steps",fmt(display.steps),cloudNote],
    ];
    host.replaceChildren();
    for (const [name, value, provenance] of rows) {
      const accentName = name === "Blood pressure" && actualBp && result.bpStatus !== "normal" ? (result.bpStatus === "high" ? "red" : "amber") : "";
      host.append(tile(name, value, provenance, accentName));
    }
    if (latestWeight) {
      const earlier = ordered.find(row => row.date < latestWeight.date && n(row.weight) != null);
      const delta = earlier ? n(latestWeight.weight)-n(earlier.weight) : null;
      const weightTrend = $("#flowWeightTrend");
      weightTrend.textContent = delta == null ? "Weight trend requires another dated reading." :
        "Weight vs previous reading: " + (delta >= 0 ? "+" : "") + fmt(delta,2) +
        " kg · single-day variation may reflect hydration and glycogen.";
    }
    status.textContent = "Flow refreshed " + new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) +
      (latestVitals?.date === currentDay ? " · vitals saved today" : " · no saved vitals today");
  } catch (error) {
    status.textContent = "Flow unavailable: " + String(error?.message || error);
  } finally {flowBusy = false;}
}
let ocrFile = null, ocrResult = null, imageUrl = null;
const fields = {scales:[["weight","Weight (kg)",20,400]], bp:[["systolic","Systolic (mmHg)",50,260],["diastolic","Diastolic (mmHg)",30,180],["pulse","Cuff pulse (bpm)",20,220]]};
function renderReview(kind, result) {
  const host = $("#flowOcrReview"); host.replaceChildren();
  const caption=document.createElement("p");
  caption.textContent="Verify each reading against the screenshot. You can correct the OCR values before applying them. No record is saved at this step.";
  host.append(caption);
  for (const [key,label,min,max] of fields[kind]) {
    const wrap=document.createElement("label");wrap.textContent=label;
    const input=document.createElement("input");input.type="number";input.step=key==="weight"?"0.01":"1";
    input.min=String(min);input.max=String(max);input.name=key;
    if (result.values[key]!=null) input.value=String(result.values[key]);
    wrap.append(input);host.append(wrap);
  }
  const warnings=document.createElement("p");
  warnings.textContent=result.warnings.join(" ");
  host.append(warnings);
  host.hidden=false;
  $("#flowOcrApply").disabled=false;
}
async function runScreenshotOcr() {
  const status=$("#flowOcrStatus"), kind=$("#flowOcrKind").value;
  if (!ocrFile) {status.textContent="Choose a screenshot first.";return;}
  if (ocrFile.size > 12*1024*1024){status.textContent="Choose an image under 12 MB.";return;}
  const button=$("#flowOcrRun");button.disabled=true;ocrResult=null;
  $("#flowOcrReview").hidden=true;$("#flowOcrApply").disabled=true;
  try {
    const response=await runExperimentalOcr(ocrFile,{
      onProgress:progress=>{status.textContent=(progress.status||"Reading image")+" "+Math.round((progress.progress||0)*100)+"%";}
    });
    const parsed=parseVitalsScreenText(response.text,kind);
    ocrResult={kind,parsed,confidence:response.confidence};
    $("#flowOcrRaw").textContent=response.text || "(no readable text)";
    renderReview(kind,parsed);
    status.textContent="OCR complete (engine confidence "+Math.round(response.confidence)+"%). Confirm values and click Apply to vitals form.";
  } catch (error) {status.textContent="OCR failed: "+String(error?.message||error)+". Enter the readings manually in Vitals.";}
  finally {button.disabled=false;}
}
function applyReview() {
  const status=$("#flowOcrStatus"), kind=ocrResult?.kind, host=$("#flowOcrReview"), form=$("#vitalsForm");
  if (!kind||!host||!form) return;
  const selected={};
  for(const [key,label,min,max] of fields[kind]){
    const input=host.querySelector('input[name="'+key+'"]');
    if (!input?.value.trim()) continue;
    const value=n(input.value);
    if (value==null||value<min||value>max){
      status.textContent="Check "+label+"; the value is outside the supported range.";return;
    }
    selected[key]=value;
  }
  if(kind==="bp"){
    if(n(selected.systolic)==null||n(selected.diastolic)==null||selected.systolic<=selected.diastolic){
      status.textContent="Enter and confirm a valid SYS/DIA pair before applying.";return;
    }
  }else if(n(selected.weight)==null){status.textContent="Enter a confirmed weight before applying.";return;}
  const conflicts=Object.entries(selected).filter(([key,value])=>form.elements[key]?.value.trim() && n(form.elements[key].value)!==value);
  if(conflicts.length && !window.confirm("Replace existing unsaved vitals form values for "+conflicts.map(([key])=>key).join(", ")+"?"))return;
  for(const [key,value] of Object.entries(selected))form.elements[key].value=String(value);
  form.dispatchEvent(new Event("input",{bubbles:true}));
  status.textContent="Reviewed values applied to the Vitals form. Check the date and tap Save vitals to persist them. OCR image was not uploaded or saved.";
  form.scrollIntoView({behavior:"smooth",block:"start"});
}
function init() {
  if (!$("#flowPanel")||!$("#flowOcrInput"))return;
  $("#flowRefresh").addEventListener("click",()=>void refreshFlow());
  const input=$("#flowOcrInput");
  input.addEventListener("change",()=>{
    ocrFile=input.files?.[0]||null;
    $("#flowOcrStatus").textContent=ocrFile ? "Selected "+ocrFile.name+" — choose the device and run OCR." : "Choose an image.";
    $("#flowOcrReview").hidden=true;$("#flowOcrApply").disabled=true;ocrResult=null;
    if(imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl=ocrFile?URL.createObjectURL(ocrFile):null;
    const preview=$("#flowOcrPreview");
    preview.hidden=!imageUrl;if(imageUrl)preview.src=imageUrl;else preview.removeAttribute("src");
  });
  $("#flowOcrKind").addEventListener("change",()=>{$("#flowOcrReview").hidden=true;$("#flowOcrApply").disabled=true;ocrResult=null;});
  $("#flowOcrRun").addEventListener("click",()=>void runScreenshotOcr());
  $("#flowOcrApply").addEventListener("click",applyReview);
  window.addEventListener("vantage-vitals-saved",()=>void refreshFlow());
  window.addEventListener("vantage-cloud-data-applied",()=>void refreshFlow());
  window.addEventListener("vantage-cloud-auth-change",()=>void refreshFlow());
  window.addEventListener("focus",()=>void refreshFlow());
  window.addEventListener("vantage-db-change",event=>{if(event.detail?.storeName==="vitals")void refreshFlow();});
  setInterval(()=>{if(document.visibilityState==="visible" && $("#dashboardScreen")?.classList.contains("active"))void refreshFlow();},180000);
  setTimeout(()=>void refreshFlow(),1600);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
