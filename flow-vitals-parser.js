// Conservative device-screen OCR parsing. This module never writes to a vitals record.
// A human must confirm every suggested value before the existing Save vitals action.
const number = raw => {
  const value = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
};
const inRange = (value, min, max) => value != null && value >= min && value <= max ? value : null;
const field = (text, label, min, max) => {
  const after = text.match(new RegExp("\\b(?:" + label + ")\\b\\s*(?:mm\\s*hg)?\\s*[:=\\-]?\\s*(\\d{2,3})(?!\\d)", "i"));
  const before = text.match(new RegExp("\\b(\\d{2,3})\\s*(?:mm\\s*hg)?\\s*(?:" + label + ")\\b", "i"));
  return inRange(number((after || before)?.[1]), min, max);
};
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
export function parseVitalsScreenText(input, kind = "scales") {
  const text = String(input || "").replace(/[\u2013\u2014]/g, "-").replace(/[\t ]+/g, " ");
  const values = {};
  const warnings = ["OCR is a suggestion only. Confirm the screen values, units and date before saving."];
  if (kind === "scales") {
    const labelled = text.match(/\b(?:body\s*weight|weight|wt)\b\s*(?:\(\s*(kg|kgs?|lb|lbs)\s*\))?\s*[:=\-]?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg|kgs?|lbs?)?(?=\s|$|[)%])/i);
    const unitReadings = [...text.matchAll(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg|kgs?|lbs?)\b/gi)];
    // Body-composition scales also display muscle/fat mass. Do not treat the first kg token as body weight.
    const unitReading = unitReadings.length === 1 && !/\b(?:muscle\s*mass|fat\s*mass|bone\s*mass|fat.free\s*mass|water\s*mass)\b/i.test(text)
      ? unitReadings[0] : null;
    // Offer an explicitly reviewed guess when OCR sees only a single bare decimal.
    const bareDecimal = !labelled && !unitReading && !/\b(?:fat|bmi|water|muscle|bone)\b/i.test(text)
      ? [...text.matchAll(/\b(\d{2,3}[.,]\d{1,2})\b/g)] : [];
    const guessed = bareDecimal.length === 1 ? bareDecimal[0] : null;
    if (guessed) warnings.push("Unlabelled scale number guessed; verify against screenshot.");
    const raw = number(labelled ? labelled[2] : (unitReading?.[1] ?? guessed?.[1]));
    const unit = String(labelled ? (labelled[3] || labelled[1] || "") : (unitReading?.[2] || "")).toLowerCase();
    const kg = raw == null ? null : unit.startsWith("lb") ? raw / 2.2046226218 : raw;
    const checked = inRange(kg, 20, 400);
    if (checked != null) {
      values.weight = round(checked, 2);
      if (unit.startsWith("lb")) warnings.push("Converted pounds to kilograms. Confirm the scale unit.");
      if (!unit) warnings.push("No unit detected by OCR; assuming kilograms. Verify before applying.");
    } else warnings.push("No reliable labelled weight was found. Enter it manually in the review fields.");
    return { values, warnings };
  }
  if (kind === "bp") {
    let systolic = field(text, "sys|systolic", 50, 260);
    let diastolic = field(text, "dia|diastolic", 30, 180);
    const pulse = field(text, "pul(?:se)?|bpm|heart\\s*rate", 20, 220);
    if (systolic == null || diastolic == null) {
      const pair = text.match(/\b(\d{2,3})\s*[/\\]\s*(\d{2,3})\b/);
      if (pair) {
        systolic ??= inRange(number(pair[1]), 50, 260);
        diastolic ??= inRange(number(pair[2]), 30, 180);
      }
    }
    // BP displays can show a SYS/DIA/PUL header and a separate column of values.
    const flattened = text.replace(/\s+/g," ");
    const header = flattened.match(/\bSYS(?:TOLIC)?\b[\s:/-]*\bDIA(?:STOLIC)?\b(?:[\s:/-]*\bPUL(?:SE)?\b)?/i);
    let reviewedPulse = pulse;
    if (header) {
      const nums = [...flattened.slice(header.index+header[0].length).matchAll(/\b(\d{2,3})\b/g)].slice(0,3).map(m=>Number(m[1]));
      if(nums.length>=2 && nums[0]>=50 && nums[0]<=260 && nums[1]>=30 && nums[1]<=180 && nums[0]>nums[1]){
        systolic=nums[0];diastolic=nums[1];
        if(nums[2]>=20&&nums[2]<=220)reviewedPulse=nums[2];
        warnings.push("BP numbers paired by column order. Verify SYS, DIA and pulse.");
      }
    }
    if((systolic==null||diastolic==null)&&!/\b(?:SYS|SYSTOLIC|DIA|DIASTOLIC|PUL|PULSE)\b/i.test(flattened)){
      const nums=[...flattened.matchAll(/\b(\d{2,3})\b/g)].map(m=>Number(m[1]));
      if(nums.length>=2&&nums.length<=3&&nums[0]>=50&&nums[0]<=260&&nums[1]>=30&&nums[1]<=180&&nums[0]>nums[1]){
        systolic=nums[0];diastolic=nums[1];
        if(nums[2]>=20&&nums[2]<=220)reviewedPulse=nums[2];
        warnings.push("Labels missing: BP numbers guessed by order. Verify before applying.");
      }
    }
    if (systolic != null && diastolic != null && systolic > diastolic) {
      values.systolic = systolic;
      values.diastolic = diastolic;
    } else {
      warnings.push("Complete SYS/DIA pair not recognised reliably; review and enter both values manually.");
    }
    if (reviewedPulse != null) values.pulse = reviewedPulse;
    return { values, warnings };
  }
  throw new Error("Choose scales or blood pressure before analysing a screenshot.");
}
