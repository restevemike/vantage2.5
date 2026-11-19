import { runExperimentalOcr } from "./ocr-engine.js?v=1.6.1";
import { parseVitalsScreenText } from "./flow-vitals-parser.js?v=1.6.4";

const $ = selector => document.querySelector(selector);
const configs = {
  Weight: {
    kind: "scales", prefix: "flowWeightOcr",
    fields: [["weight", "Body weight (kg)", 20, 400, "0.01"]],
    section: "#flowWeightSection", name: "Weight"
  },
  Bp: {
    kind: "bp", prefix: "flowBpOcr",
    fields: [["systolic", "Systolic SYS (mmHg)", 50, 260, "1"],
             ["diastolic", "Diastolic DIA (mmHg)", 30, 180, "1"],
             ["pulse", "Cuff pulse PUL (bpm) — optional", 20, 220, "1"]],
    section: "#flowBpSection", name: "Blood pressure"
  }
};
const sessions = new Map();
const badges = new Map();
const get = (cfg, suffix) => $("#" + cfg.prefix + suffix);
const readNumber = input => input && input.value.trim() !== "" && Number.isFinite(Number(input.value)) ? Number(input.value) : null;
function showReview(cfg, reading, note = "") {
  const host = get(cfg, "Review");
  if (!host) return;
  host.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "flow-ocr-review-hint";
  intro.textContent = note || "Check the screenshot and correct anything the OCR misread. Only confirmed values are applied.";
  host.append(intro);
  for (const [field, label, min, max, step] of cfg.fields) {
    const wrap = document.createElement("label");
    wrap.className = "flow-ocr-field";
    wrap.textContent = label;
    const input = document.createElement("input");
    input.name = field;
    input.type = "number";
    input.inputMode = "decimal";
    input.min = String(min); input.max = String(max); input.step = step;
    if (reading?.values?.[field] != null) {
      input.value = String(reading.values[field]);
      wrap.classList.add("flow-ocr-detected");
    }
    wrap.append(input);
    host.append(wrap);
  }
  const warnings = document.createElement("p");
  warnings.className = "flow-ocr-review-warnings";
  warnings.textContent = (reading?.warnings || []).join(" ");
  host.append(warnings);
  host.hidden = false;
  get(cfg,"Confirm").disabled = false;
}
function setImage(cfg, file) {
  const current=sessions.get(cfg.kind);
  if (current?.url) URL.revokeObjectURL(current.url);
  const url=file ? URL.createObjectURL(file) : null;
  sessions.set(cfg.kind, {file,url,recognized:null});
  const image=get(cfg,"Preview");
  image.hidden=!url;
  if (url) image.src=url; else image.removeAttribute("src");
  get(cfg,"Raw").textContent="No OCR text yet.";
  get(cfg,"Confirm").disabled=!file;
  get(cfg,"Review").hidden=!file;
  if(file) showReview(cfg, null, "Screenshot loaded. Run OCR, or enter the readings yourself and confirm.");
  get(cfg,"Status").textContent=file ? file.name+" selected. Run OCR or enter values in review fields." : "No screenshot selected.";
}
function score(result, cfg, confidence) {
  const count=cfg.fields.filter(([name])=>result.values[name]!=null).length;
  const needed=cfg.kind==="bp"&&result.values.systolic!=null&&result.values.diastolic!=null ? 4 : 0;
  return count*10+needed+Math.min(Number(confidence)||0,100)/100;
}
async function recognise(cfg) {
  const current=sessions.get(cfg.kind);
  const status=get(cfg,"Status");
  if (!current?.file) {status.textContent="Choose a "+cfg.name.toLowerCase()+" screenshot first.";return;}
  if(current.file.size>12*1024*1024) {status.textContent="Image exceeds 12 MB. Use a smaller screenshot or image.";return;}
  const button=get(cfg,"Run");
  button.disabled=true;
  get(cfg,"Confirm").disabled=true;
  status.textContent="Preparing OCR…";
  try {
    const response=await runExperimentalOcr(current.file, {
      deviceMode:true,
      onProgress: progress=> { status.textContent=String(progress.status||"Reading image")+" "+Math.round(Number(progress.progress||0)*100)+"%"; }
    });
    if(sessions.get(cfg.kind)!==current){return;} // Don't apply results to a newly selected image.
    const candidates=(response.candidates?.length?response.candidates:[response]).map(item=>{
      const parsed=parseVitalsScreenText(item.text||"",cfg.kind);
      return {text:item.text||"",confidence:Number(item.confidence||0),parsed,score:score(parsed,cfg,item.confidence)};
    }).sort((a,b)=>b.score-a.score);
    const best=candidates[0]||{text:"",confidence:0,parsed:parseVitalsScreenText("",cfg.kind),score:0};
    current.recognized=best;
    get(cfg,"Raw").textContent=best.text||"(No readable text found)";
    showReview(cfg,best.parsed);
    const matches=Object.keys(best.parsed.values).length;
    status.textContent=matches ?
      cfg.name+" OCR found "+matches+" value(s) ("+Math.round(best.confidence)+"% text confidence). Confirm each field against the screenshot." :
      "OCR did not recognise the values. The review fields remain editable: enter what you see and confirm.";
  } catch(error) {
    if(sessions.get(cfg.kind)!==current)return;
    showReview(cfg,null,"OCR failed; enter the readings manually from the screenshot.");
    status.textContent="OCR could not read this image: "+String(error?.message||error)+". You can enter the values manually.";
  } finally { button.disabled=false; }
}
function highlight(field, value, source) {
  const form=$("#vitalsForm");
  const input=form?.elements.namedItem(field);
  if(!input)return;
  input.value=String(value);
  const label=input.closest("label");
  input.classList.add("flow-ocr-confirmed-input");
  if (label) {
    label.classList.add("flow-ocr-confirmed-label");
    let tag=label.querySelector(".flow-ocr-confirmed-tag");
    if(!tag){tag=document.createElement("span");tag.className="flow-ocr-confirmed-tag";label.append(tag);}
    tag.textContent="✓ Confirmed "+source+" · not saved yet";
    badges.set(field,tag);
  }
}
function confirmReadings(cfg) {
  const status=get(cfg,"Status"), form=$("#vitalsForm"), host=get(cfg,"Review");
  if(!form||!host||host.hidden){status.textContent="Choose a screenshot and review it first.";return;}
  const values={};
  for(const [field,label,min,max] of cfg.fields) {
    const input=host.querySelector('input[name="'+field+'"]');
    const value=readNumber(input);
    if(value==null){
      if(field==="pulse")continue;
      status.textContent="Please confirm "+label+" before applying.";
      return;
    }
    if(value<min||value>max){
      status.textContent=label+" is out of range — check the screenshot.";
      return;
    }
    values[field]=value;
  }
  if(cfg.kind==="bp" && values.systolic<=values.diastolic){
    status.textContent="SYS must be above DIA. Check the cuff image before confirming.";
    return;
  }
  const different=Object.entries(values).filter(([field,value])=>{
    const old=form.elements.namedItem(field);
    return old?.value?.trim() && Number(old.value)!==value;
  }).map(([field])=>field);
  if(different.length&&!window.confirm("Replace existing Vitals entries for "+different.join(", ")+"? Your other vitals will not change."))return;
  for(const [field,value] of Object.entries(values)) highlight(field,value,cfg.kind==="bp"?"cuff":"scales");
  form.dispatchEvent(new Event("input",{bubbles:true}));
  const summary=$("#flowOcrAppliedSummary");
  summary.hidden=false;
  const confirmation=cfg.kind==="bp"
    ? "BP "+values.systolic+"/"+values.diastolic+(values.pulse==null?"":" · cuff pulse "+values.pulse+" bpm")
    : "Weight "+values.weight+" kg";
  const messages=summary.dataset.confirmed ? summary.dataset.confirmed.split(" | ") : [];
  const withoutKind=messages.filter(m=>!m.startsWith(cfg.kind==="bp"?"BP ":"Weight "));
  withoutKind.push(confirmation);
  summary.dataset.confirmed=withoutKind.join(" | ");
  summary.textContent="✓ Confirmed from screenshot: "+summary.dataset.confirmed+". Fields highlighted below. Review the date and tap Save vitals to record.";
  status.textContent=confirmation+" confirmed and highlighted in Vitals. Not saved until you tap Save vitals.";
  const first=form.elements.namedItem(cfg.fields[0][0]);
  first?.closest("label")?.scrollIntoView({behavior:"smooth",block:"center"});
}
function clearHighlights(){
  document.querySelectorAll(".flow-ocr-confirmed-input").forEach(node=>node.classList.remove("flow-ocr-confirmed-input"));
  document.querySelectorAll(".flow-ocr-confirmed-label").forEach(node=>node.classList.remove("flow-ocr-confirmed-label"));
  document.querySelectorAll(".flow-ocr-confirmed-tag").forEach(node=>node.remove());
  const summary=$("#flowOcrAppliedSummary");
  if(summary){summary.hidden=true;summary.textContent="";delete summary.dataset.confirmed;}
  badges.clear();
}
function init(){
  if(!$("#flowWeightOcrInput")||!$("#flowBpOcrInput"))return;
  for(const [key,cfg] of Object.entries(configs)) {
    get(cfg,"Input").addEventListener("change",event=>setImage(cfg,event.target.files?.[0]||null));
    get(cfg,"Run").addEventListener("click",()=>void recognise(cfg));
    get(cfg,"Confirm").addEventListener("click",()=>confirmReadings(cfg));
    if(key==="Weight")$("#flowOpenWeight")?.addEventListener("click",()=>setTimeout(()=>$(cfg.section)?.scrollIntoView({behavior:"smooth",block:"start"}),150));
    if(key==="Bp")$("#flowOpenBp")?.addEventListener("click",()=>setTimeout(()=>$(cfg.section)?.scrollIntoView({behavior:"smooth",block:"start"}),150));
  }
  $("#vitalsForm")?.elements.namedItem("date")?.addEventListener("change",clearHighlights);
  window.addEventListener("vantage-vitals-saved",()=>{
    for(const tag of badges.values())tag.textContent=tag.textContent.replace("not saved yet","saved");
    const summary=$("#flowOcrAppliedSummary");
    if(summary&&!summary.hidden)summary.textContent=summary.textContent.replace("tap Save vitals to record","readings saved");
  });
  window.addEventListener("pagehide",()=>{
    for(const item of sessions.values())if(item.url)URL.revokeObjectURL(item.url);
  },{once:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
