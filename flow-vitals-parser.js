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
    const labelled = text.match(/\\b(?:body\\s*weight|weight|wt)\\b\\s*(?:\\(\\s*(kg|kgs?|lb|lbs)\\s*\\))?\\s*[:=\\-]?\\s*(\\d{2,3}(?:[.,]\\d{1,2})?)\\s*(kg|kgs?|lb|lbs)?\\b/i);
    const unitReadings = [...text.matchAll(/\\b(\\d{2,3}(?:[.,]\\d{1,2})?)\\s*(kg|kgs?|lb|lbs)\\b/gi)];
    // Body-composition scales also display muscle/fat mass. Do not treat the first kg token as body weight.
    const unitReading = unitReadings.length === 1 && !/\\b(?:muscle\\s*mass|fat\\s*mass|bone\\s*mass|fat.free\\s*mass|water\\s*mass)\\b/i.test(text)
      ? unitReadings[0] : null;
    const raw = number(labelled ? labelled[2] : unitReading?.[1]);
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
    if (systolic != null && diastolic != null && systolic > diastolic) {
      values.systolic = systolic;
      values.diastolic = diastolic;
    } else {
      warnings.push("Complete SYS/DIA pair not recognised reliably; review and enter both values manually.");
    }
    if (pulse != null) values.pulse = pulse;
    return { values, warnings };
  }
  throw new Error("Choose scales or blood pressure before analysing a screenshot.");
}
