import { assessOcrPromotion, timeRangeMinutes } from './evidence-integrity.js';
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let loaderPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-vantage-ocr="${src}"]`);
    if (existing) {
      if (window.Tesseract) return resolve(window.Tesseract);
      existing.addEventListener('load', () => resolve(window.Tesseract), { once: true });
      existing.addEventListener('error', () => reject(new Error('OCR library failed to load. Check the network connection.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.vantageOcr = src;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('OCR library failed to load. Check the network connection.'));
    document.head.appendChild(script);
  });
}

async function getTesseract() {
  if (window.Tesseract?.createWorker) return window.Tesseract;
  loaderPromise ||= loadScript(TESSERACT_CDN);
  const api = await loaderPromise;
  if (!api?.createWorker) throw new Error('OCR engine loaded but did not initialise correctly.');
  return api;
}

async function imageBitmapFromBlob(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function preprocessImage(blob) {
  const bitmap = await imageBitmapFromBlob(blob);
  const originalWidth = bitmap.width || bitmap.naturalWidth;
  const originalHeight = bitmap.height || bitmap.naturalHeight;
  const maxWidth = 1800;
  const scale = Math.min(2, maxWidth / Math.max(1, originalWidth));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  // Mild grayscale/contrast pass. Avoid a hard threshold because NOOP screens use coloured text.
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    const contrasted = Math.max(0, Math.min(255, (luminance - 128) * 1.35 + 128));
    data[index] = data[index + 1] = data[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
}

export async function runExperimentalOcr(blob, { onProgress = () => {} } = {}) {
  if (!(blob instanceof Blob)) throw new Error('No valid image was supplied to OCR.');
  onProgress({ status: 'Preparing image', progress: 0.02 });
  const prepared = await preprocessImage(blob);
  const Tesseract = await getTesseract();
  onProgress({ status: 'Loading English OCR model', progress: 0.05 });
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: message => onProgress({ status: String(message.status || 'Reading image'), progress: Number(message.progress || 0) })
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const result = await worker.recognize(prepared);
    return { text: result?.data?.text || '', confidence: Number(result?.data?.confidence || 0) };
  } finally {
    await worker.terminate();
  }
}

function normalise(text) {
  return String(text || '')
    .replace(/[|]/g, 'I')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function foregroundSessionText(text) {
  const value = normalise(text);
  const labels = ['Yoga', 'Weightlifting', 'Treadmill walk', 'Walking', 'Outdoor walk', 'StairMaster'];
  const lower = value.toLowerCase();
  const candidates = [];
  for (const label of labels) {
    let offset = 0;
    const target = label.toLowerCase();
    while (offset < lower.length) {
      const index = lower.indexOf(target, offset);
      if (index < 0) break;
      const window = value.slice(index, Math.min(value.length, index + 1800));
      const score = [
        /\bduration\b|\btotal time\b/i,
        /\bavg(?:erage)?\s*hr\b|\bavg\b.*\bpeak\b.*\blow\b/i,
        /\bmax(?:imum)?\s*hr\b|\bpeak\b/i,
        /\bcalories\b|\bkcal\b/i,
        /\beffort\b/i,
        /\bhr zones\b|\bz\s*1\b/i,
        /\b\d{1,2}:\d{2}\s*(?:-|to)\s*\d{1,2}:\d{2}\b/i
      ].reduce((total, pattern) => total + (pattern.test(window) ? 1 : 0), 0);
      candidates.push({ index, window, score });
      offset = index + target.length;
    }
  }
  if (!candidates.length) return value;
  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  return candidates[0].window;
}

function hrTriplet(text) {
  const value = normalise(text);
  // NOOP activity summaries may place HR after the AVG/PEAK/LOW labels. Keep
  // these patterns tightly label-anchored so zone values can never masquerade
  // as the three heart-rate readings.
  const patterns = [
    /\bAVG(?:\s*HR)?\b\s*[:\-]?\s*(\d{2,3})(?:\s*bpm)?.{0,100}?\b(?:PEAK|MAX)(?:\s*HR)?\b\s*[:\-]?\s*(\d{2,3})(?:\s*bpm)?.{0,100}?\b(?:LOW|MIN|MINIMUM)(?:\s*HR)?\b\s*[:\-]?\s*(\d{2,3})(?:\s*bpm)?/i,
    /(\d{2,3})\s*bpm\s*\bAVG(?:\s*HR)?\b.{0,100}?(\d{2,3})\s*bpm\s*\b(?:PEAK|MAX)(?:\s*HR)?\b.{0,100}?(\d{2,3})\s*bpm\s*\b(?:LOW|MIN|MINIMUM)(?:\s*HR)?\b/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const triplet = {
      avg: checkedNumber(match[1], { min: 20, max: 220 }),
      max: checkedNumber(match[2], { min: 20, max: 240 }),
      min: checkedNumber(match[3], { min: 20, max: 220 })
    };
    if (triplet.avg != null && triplet.max != null && triplet.min != null
      && triplet.max >= triplet.avg && triplet.avg >= triplet.min) return triplet;
  }
  return { avg: null, max: null, min: null };
}

function noopHrColumnTriplet(text) {
  const value = normalise(text);
  const header = /\bAVG(?:ERAGE)?(?:\s*HR)?\b.{0,45}?\b(?:PEAK|MAX)(?:IMUM)?(?:\s*HR)?\b.{0,45}?\b(?:LOW|MIN|MINIMUM)(?:\s*HR)?\b/i.exec(value);
  if (!header) return { avg: null, max: null, min: null };
  // Column-layout NOOP OCR places all three labels before the three numeric
  // readings. If the matched header already contains BPM values, this is the
  // ordinary label/value layout and hrTriplet() is the safer parser.
  if (/\b\d{2,3}\s*bpm\b/i.test(header[0])) return { avg: null, max: null, min: null };
  const tail = value.slice(header.index + header[0].length, header.index + header[0].length + 180);
  const bpmTokens = [...tail.matchAll(/(\d{2,3})\s*bpm\b/gi)].map(match => Number(match[1])).filter(number => number >= 20 && number <= 240);
  const plainTokens = [...tail.matchAll(/\b(\d{2,3})\b/g)].map(match => Number(match[1])).filter(number => number >= 20 && number <= 240);
  const tokens = bpmTokens.length >= 3 ? bpmTokens : plainTokens;
  if (tokens.length < 3) return { avg: null, max: null, min: null };
  const [avg, max, min] = tokens;
  if (max >= avg && avg >= min) return { avg, max, min };
  return { avg: null, max: null, min: null };
}

function extractHrZones(text) {
  const value = normalise(text);
  const zones = {};
  for (let zone = 1; zone <= 5; zone += 1) {
    const marker = new RegExp(`\\bZ\\s*${zone}\\b`, 'i');
    const match = marker.exec(value);
    let block = '';
    if (match) {
      const start = match.index + match[0].length;
      const remainder = value.slice(start);
      const nextMarker = zone < 5 ? new RegExp(`\\bZ\\s*${zone + 1}\\b`, 'i').exec(remainder) : null;
      block = remainder.slice(0, nextMarker ? nextMarker.index : Math.min(remainder.length, 160));
    }
    const percent = block.match(/(\d{1,3})\s*%/i);
    const minutes = block.match(/(\d{1,3})\s*(?:m|min|mins|minutes)\b/i);
    zones[`z${zone}Percent`] = checkedNumber(percent?.[1], { min: 0, max: 100 });
    zones[`z${zone}Minutes`] = checkedNumber(minutes?.[1], { min: 0, max: 600 });
  }

  // NOOP often OCRs the five labels first, then a percentage row and a minutes row.
  // Map by column position rather than letting Z1 consume or overwrite the other zones.
  const header = value.match(/\bZ\s*1\b.{0,45}?\bZ\s*2\b.{0,45}?\bZ\s*3\b.{0,45}?\bZ\s*4\b.{0,45}?\bZ\s*5\b/i);
  // Only use the column-table fallback when the normal per-zone label parser
  // did not already find the inline percentage/minute pairs. This prevents a
  // correctly parsed `Z1 67% 46m Z2 ...` layout from being cleared simply
  // because all five labels are also present in the same OCR string.
  const independentlyParsed = [1,2,3,4,5].filter(zone => zones[`z${zone}Percent`] != null || zones[`z${zone}Minutes`] != null).length;
  if (header && independentlyParsed < 3) {
    const tail = value.slice((header.index || 0) + header[0].length, (header.index || 0) + header[0].length + 420);
    // Column-layout parsing is authoritative for the visible NOOP zone table.
    // Clear any loose per-zone minute guesses first so a Z1 token can never leak into Z5.
    for (let zone = 1; zone <= 5; zone += 1) zones[`z${zone}Minutes`] = null;
    const percentageMatches = [...tail.matchAll(/(\d{1,3})\s*%/g)].slice(0, 5);
    const percentages = percentageMatches.map(match => checkedNumber(match[1], { min: 0, max: 100 }));
    if (percentages.length === 5) percentages.forEach((number, index) => { zones[`z${index + 1}Percent`] = number; });

    // In the NOOP column layout the percentage row comes before the minute row.
    // Start looking for minutes only after the final visible percentage; otherwise
    // unrelated duration/debt tokens earlier in the screen can shift every zone.
    if (percentageMatches.length === 5) {
      const minuteTail = tail.slice((percentageMatches[4].index || 0) + percentageMatches[4][0].length);
      const minutes = [...minuteTail.matchAll(/(\d{1,3})\s*(?:m|min|mins|minutes)\b/gi)]
        .slice(0, 5)
        .map(match => checkedNumber(match[1], { min: 0, max: 600 }));
      // NOOP commonly exposes only the minute tokens that are visibly rendered. Pair
      // those tokens left-to-right with Z1..Zn and leave the remaining minutes null.
      // Never manufacture 0m solely because a displayed percentage is 0%.
      if (minutes.length > 0 && minutes.length <= 5) minutes.forEach((number, index) => { zones[`z${index + 1}Minutes`] = number; });
    }
  }
  return zones;
}

function checkedNumber(raw, options = {}) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(String(raw).replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  if (options.min != null && value < options.min) return null;
  if (options.max != null && value > options.max) return null;
  return value;
}

const OCR_NUMBER_TOKEN = '[0-9]+(?:\\s*[.,]\\s*[0-9]+)?';

function rawNumberNearLabel(text, labels) {
  const escaped = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const after = text.match(new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*(${OCR_NUMBER_TOKEN})`, 'i'));
  const before = text.match(new RegExp(`(${OCR_NUMBER_TOKEN})\\s*(?:${escaped})`, 'i'));
  return (after || before)?.[1] || null;
}

function numberAfter(text, labels, options = {}) {
  const label = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`(?:${label})\\s*[:\\-]?\\s*(${OCR_NUMBER_TOKEN})`, 'i');
  const match = text.match(pattern);
  return match ? checkedNumber(match[1], options) : null;
}

function numberNearLabel(text, labels, options = {}) {
  return checkedNumber(rawNumberNearLabel(text, labels), options);
}

function numberBeforeLabel(text, labels, options = {}) {
  const escaped = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(${OCR_NUMBER_TOKEN})\\s*(?:${escaped})`, 'i'));
  return checkedNumber(match?.[1], options);
}

function numberAfterLabel(text, labels, options = {}) {
  const escaped = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*(${OCR_NUMBER_TOKEN})`, 'i'));
  return checkedNumber(match?.[1], options);
}

function textTimeNearLabel(text, labels) {
  const escaped = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const after = text.match(new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*(\\d{1,2}:\\d{2}(?::\\d{2})?)`, 'i'));
  const before = text.match(new RegExp(`(\\d{1,2}:\\d{2}(?::\\d{2})?)\\s*(?:${escaped})`, 'i'));
  return (after || before)?.[1] || null;
}

function contextualPair(text, heading, unit = '') {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const unitPart = unit ? `\\s*${unit}` : '';
  const slice = text.match(new RegExp(`${escapedHeading}(.{0,180})`, 'i'))?.[1] || '';
  const max = slice.match(new RegExp(`max(?:imum)?\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)${unitPart}`, 'i'))
    || slice.match(new RegExp(`([0-9]+(?:[.,][0-9]+)?)${unitPart}\\s*max(?:imum)?`, 'i'));
  const avg = slice.match(new RegExp(`(?:avg|average)\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)${unitPart}`, 'i'))
    || slice.match(new RegExp(`([0-9]+(?:[.,][0-9]+)?)${unitPart}\\s*(?:avg|average)`, 'i'));
  return {
    max: checkedNumber(max?.[1]),
    average: checkedNumber(avg?.[1])
  };
}

function contextualTimePair(text, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slice = text.match(new RegExp(`${escapedHeading}(.{0,180})`, 'i'))?.[1] || '';
  const max = slice.match(/max(?:imum)?\s*[:\-]?\s*(\d{1,2}:\d{2})/i)
    || slice.match(/(\d{1,2}:\d{2})\s*max(?:imum)?/i);
  const avg = slice.match(/(?:avg|average)\s*[:\-]?\s*(\d{1,2}:\d{2})/i)
    || slice.match(/(\d{1,2}:\d{2})\s*(?:avg|average)/i);
  return { max: max?.[1] || null, average: avg?.[1] || null };
}

function timeRange(text) {
  const match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/i);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}-${match[3].padStart(2, '0')}:${match[4]}` : null;
}

function dateShown(text) {
  const iso = text.match(/\b(20\d{2})[\/.\-](0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const numericDmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-](20\d{2})\b/);
  if (numericDmy) return `${numericDmy[3]}-${numericDmy[2].padStart(2, '0')}-${numericDmy[1].padStart(2, '0')}`;
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!dmy) return null;
  const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const month = months[dmy[2].slice(0,3).toLowerCase()];
  return `${dmy[3]}-${String(month).padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
}

function labelledBpmReading(text, labels, { min = 20, max = 260 } = {}) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*([0-9]{2,3})(?:\\s*bpm)?`, 'i'),
      new RegExp(`([0-9]{2,3})\\s*bpm\\s*(?:${escaped})`, 'i'),
      new RegExp(`([0-9]{2,3})\\s*(?:${escaped})\\s*bpm`, 'i')
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = Number(match?.[1]);
      if (Number.isFinite(value) && value >= min && value <= max) return { value, rawToken: match[1], label };
    }
  }
  return { value: null, rawToken: null, label: null };
}

function labelledBpm(text, labels, options = {}) {
  return labelledBpmReading(text, labels, options).value;
}

function durationReading(text) {
  const value = normalise(text);
  const hourMinutePatterns = [
    /(?:duration|total time|exercise duration)\s*[:\-]?\s*(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)\s*(?:m|min|mins|minute|minutes)\b/i,
    /\b(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)\s*(?:m|min|mins|minute|minutes)\b/i
  ];
  for (const pattern of hourMinutePatterns) {
    const match = value.match(pattern);
    if (match) return { minutes: Number(match[1]) * 60 + Number(match[2]), rawToken: match[0].trim(), mode: 'hours-minutes' };
  }

  const labelledClock = value.match(/(?:duration|total time|exercise duration)\s*[:\-]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (labelledClock) {
    const minutes = labelledClock[3] != null
      ? Number(labelledClock[1]) * 60 + Number(labelledClock[2]) + Number(labelledClock[3]) / 60
      : Number(labelledClock[1]) + Number(labelledClock[2]) / 60;
    return { minutes, rawToken: labelledClock[0].trim(), mode: labelledClock[3] != null ? 'clock-hms' : 'clock-min-sec' };
  }

  const labelledMinutes = value.match(/(?:duration|total time|exercise duration)\s*[:\-]?\s*(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (labelledMinutes) return { minutes: Number(labelledMinutes[1]), rawToken: labelledMinutes[0].trim(), mode: 'minutes' };

  const compactMinutes = value.match(/\b(\d+)\s*(?:min|mins|minutes)\b/i);
  if (compactMinutes) return { minutes: Number(compactMinutes[1]), rawToken: compactMinutes[0].trim(), mode: 'minutes' };

  const range = timeRange(value);
  if (range) {
    const [startTime, endTime] = range.split('-');
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (minutes < 0) minutes += 24 * 60;
    if (minutes > 0 && minutes <= 24 * 60) return { minutes, rawToken: range, mode: 'time-range' };
  }
  return { minutes: null, rawToken: null, mode: null };
}

function durationMinutes(text) {
  return durationReading(text).minutes;
}

function distanceKm(text) {
  const match = text.match(/(?:distance)?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*km\b/i);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function activityFromText(text, expectedContext) {
  const lower = text.toLowerCase();
  if (/\byoga\b/.test(lower)) return { shown: 'Yoga', type: 'recovery' };
  if (/weightlifting|strength training|weight lifting/.test(lower)) return { shown: 'Weightlifting', type: 'strength' };
  if (/stair\s*master|stairmaster/.test(lower)) return { shown: 'StairMaster', type: 'stairmaster' };
  if (/treadmill\s*walk|treadmill/.test(lower)) return { shown: 'Treadmill walk', type: 'treadmill-walk' };
  if (/outdoor\s*walk/.test(lower)) return { shown: 'Outdoor walk', type: 'outdoor-walk' };
  if (/\bwalking\b|\bwalk\b/.test(lower)) return { shown: 'Walking', type: expectedContext === 'workout' ? 'strength' : 'walking' };
  return { shown: null, type: null };
}

function zoneValue(text, zone, kind) {
  const escapedZone = String(zone).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slice = text.match(new RegExp(`\\b${escapedZone}\\b(.{0,80})`, 'i'))?.[1] || '';
  const percent = slice.match(/([0-9]{1,3})\s*%/i);
  const minutes = slice.match(/([0-9]{1,3})\s*(?:m|min|mins|minutes)\b/i);
  if (kind === 'percent') return checkedNumber(percent?.[1], { min: 0, max: 100 });
  return checkedNumber(minutes?.[1], { min: 0, max: 600 });
}

function distanceMiles(text) {
  const match = text.match(/(?:distance\s*[:\-]?\s*)?([0-9]+(?:[.,][0-9]+)?)\s*(?:mi|mile|miles)\b/i);
  return checkedNumber(match?.[1], { min: 0, max: 1000 });
}

function machineConsoleMetrics(text) {
  const speed = contextualPair(text, 'speed', '(?:mph|mi/h)');
  const incline = contextualPair(text, 'incline', '%');
  const pace = contextualTimePair(text, 'pace');
  const heartRatePrimary = contextualPair(text, 'heart rate', '(?:bpm)?');
  const heartRateShort = contextualPair(text, 'hr', '(?:bpm)?');
  const heartRate = {
    max: heartRatePrimary.max ?? heartRateShort.max,
    average: heartRatePrimary.average ?? heartRateShort.average
  };
  const wattsMets = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:avg(?:erage)?\s*)?watts?\s*\/\s*mets?/i)
    || text.match(/(?:avg(?:erage)?\s*)?watts?\s*\/\s*mets?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const avgWatts = checkedNumber(wattsMets?.[1], { min: 0, max: 5000 })
    ?? numberNearLabel(text, ['avg watts', 'average watts'], { min: 0, max: 5000 });
  const avgMets = checkedNumber(wattsMets?.[2], { min: 0, max: 30 })
    ?? numberNearLabel(text, ['avg mets', 'average mets'], { min: 0, max: 30 });
  const ambiguousVisibleValues = [];
  if (/watts?\s*\/\s*mets?/i.test(text) && avgWatts == null && avgMets == null) {
    const tail = text.match(/watts?\s*\/\s*mets?(.{0,90})/i)?.[1] || '';
    for (const match of tail.matchAll(/[0-9]+(?:\s*[.,]\s*[0-9]+)?/g)) {
      const value = checkedNumber(match[0]);
      if (value != null && !ambiguousVisibleValues.includes(value)) ambiguousVisibleValues.push(value);
    }
  }
  return {
    totalTime: textTimeNearLabel(text, ['total time', 'time']),
    distanceMiles: distanceMiles(text),
    calories: numberBeforeLabel(text, ['kcal', 'calories', 'calorie'], { min: 0, max: 5000 }) ?? numberAfterLabel(text, ['calories', 'calorie'], { min: 0, max: 5000 }),
    verticalDistanceFeet: numberBeforeLabel(text, ['ft\s*vertical distance gained', 'feet\s*vertical distance gained', 'ft'], { min: 0, max: 100000 }) ?? numberAfterLabel(text, ['vertical distance gained', 'vertical distance'], { min: 0, max: 100000 }),
    avgWatts,
    avgMets,
    ambiguousVisibleValues,
    maxSpeedMph: speed.max,
    avgSpeedMph: speed.average,
    maxPacePerMile: pace.max,
    avgPacePerMile: pace.average,
    maxInclinePercent: incline.max,
    avgInclinePercent: incline.average,
    avgHr: heartRate.average ?? labelledBpm(text, ['avg hr', 'average hr'], { min: 20, max: 220 }),
    maxHr: heartRate.max ?? labelledBpm(text, ['max hr', 'maximum hr', 'peak hr'], { min: 20, max: 240 })
  };
}

function genericMetric(text, label, unit = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const unitPart = unit ? `\\s*${unit}` : '';
  const match = text.match(new RegExp(`${escaped}\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)${unitPart}`, 'i'));
  return match ? Number(match[1].replace(',', '.')) : null;
}

function deriveRole(text, expectedContext, roleHint = null) {
  const allowedHints = new Set([
    'noopStrapSessionSummary', 'noopStrapHrZones', 'watchDeviceExerciseSummary',
    'watchDevicePaceSpeedCadence', 'treadmillMachineConsole', 'outdoorWalkGpsSummary',
    'noopSessionStreamSaved', 'noopHistoricalWorkoutCard', 'preLissBloodPressure', 'postLissBloodPressure', 'workoutHrSummary'
  ]);
  if (allowedHints.has(roleHint)) return roleHint;
  const lower = text.toLowerCase();
  if (/last workouts?|workout history|historical workout/i.test(text)) return 'noopHistoricalWorkoutCard';
  // Context and activity evidence outrank BP detection. A generic OCR token such as
  // "bpm" must never cause an exercise summary to be treated as blood pressure.
  if (expectedContext === 'workout' || expectedContext === 'recovery' || /weightlifting|strength training|\byoga\b/.test(lower)) return 'workoutHrSummary';
  if (/incline|vertical distance|watts|mets|technogym|total time.*distance.*kcal/i.test(text)) return 'treadmillMachineConsole';
  if (/from strap hr|hr zones|\bz1\b.*\bz2\b/i.test(text)) return 'noopStrapSessionSummary';
  if (/\bsaved\b.*\b(?:avg|average)\b.*\bbpm\b|route map|top zone/i.test(text)) return 'noopSessionStreamSaved';
  if (/cadence|steps|min cadence|max cadence|avg pace/i.test(text)) return 'watchDeviceExerciseSummary';
  if (/\b(?:systolic|diastolic|blood pressure|cuff)\b/i.test(text) || /\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(text)) return roleHint && ['preLissBloodPressure','postLissBloodPressure'].includes(roleHint) ? roleHint : 'unknown';
  return 'unknown';
}


function effortReading(text) {
  const rawToken = rawNumberNearLabel(text, ['effort']);
  const value = checkedNumber(rawToken, { min: 0, max: 100 });
  return { rawToken, value };
}

function configuredHrSettings(text) {
  const configuredMaxHr = numberAfterLabel(text, ['configured max hr', 'max hr setting'], { min: 80, max: 250 })
    ?? checkedNumber(text.match(/\b(\d{2,3})\s*max\s*hr\b/i)?.[1], { min: 80, max: 250 })
    ?? checkedNumber(text.match(/\b(\d{2,3})\s*max\s*bpm\b/i)?.[1], { min: 80, max: 250 });
  const configuredTopZoneThreshold = checkedNumber(text.match(/top\s*zone[^\d]{0,12}(?:>=|≥|>)?\s*(\d{2,3})\s*bpm?/i)?.[1], { min: 80, max: 250 });
  return { configuredMaxHr, configuredTopZoneThreshold };
}

function historicalWorkoutCardMetrics(text) {
  const duration = durationReading(text);
  return {
    dateShown: dateShown(text),
    durationMinutes: duration.minutes,
    durationDisplayText: duration.rawToken,
    calories: numberBeforeLabel(text, ['kcal', 'calories', 'calorie'], { min: 0, max: 5000 }) ?? numberAfterLabel(text, ['calories', 'calorie'], { min: 0, max: 5000 }),
    activityShown: activityFromText(text, 'liss').shown
  };
}

export function parseFitnessSummaryText(rawText, { expectedContext = 'liss', roleHint = null } = {}) {
  const text = normalise(rawText);
  const focusText = foregroundSessionText(rawText);
  const activity = activityFromText(focusText, expectedContext);
  const sourceRole = deriveRole(focusText, expectedContext, roleHint);
  const machine = sourceRole === 'treadmillMachineConsole'
    ? Object.fromEntries(Object.entries(machineConsoleMetrics(focusText)).filter(([, value]) => value !== null && value !== undefined && value !== ''))
    : {};
  const historical = sourceRole === 'noopHistoricalWorkoutCard' ? historicalWorkoutCardMetrics(focusText) : {};
  const configured = sourceRole === 'noopSessionStreamSaved' ? configuredHrSettings(focusText) : { configuredMaxHr: null, configuredTopZoneThreshold: null };
  const durationEvidence = durationReading(focusText);
  const labelTriplet = hrTriplet(focusText);
  const columnTriplet = noopHrColumnTriplet(focusText);
  const triplet = columnTriplet.avg != null ? columnTriplet : labelTriplet;
  const avgReading = labelledBpmReading(focusText, ['avg hr', 'average hr', 'avg', 'average'], { min: 20, max: 220 });
  const maxReading = labelledBpmReading(focusText, ['max hr', 'peak hr', 'maximum hr', 'max', 'peak'], { min: 20, max: 240 });
  const minReading = labelledBpmReading(focusText, ['low hr', 'min hr', 'minimum hr', 'low', 'minimum'], { min: 20, max: 220 });
  const hasExplicitLowLabel = /low hr|min hr|minimum hr|\blow\b|\bminimum\b/i.test(focusText);
  const fallbackMin = minReading.value == null && hasExplicitLowLabel && triplet.min === (avgReading.value ?? triplet.avg) ? null : triplet.min;
  const effortEvidence = effortReading(focusText);
  const visibleTimeRange = timeRange(focusText);
  const durationFromRange = timeRangeMinutes(visibleTimeRange);
  const savedStreamMaxIsConfiguration = sourceRole === 'noopSessionStreamSaved' && configured.configuredMaxHr != null && /top\s*zone|route\s*map/i.test(focusText);
  const metrics = {
    activityShown: activity.shown,
    dateShown: dateShown(focusText),
    timeRange: visibleTimeRange,
    durationMinutes: durationEvidence.minutes,
    durationMinutesDisplayed: durationEvidence.mode === 'time-range' ? null : durationEvidence.minutes,
    durationMinutesFromTimeRange: durationFromRange,
    durationDisplayText: durationEvidence.rawToken,
    // The labelled triplet is the canonical NOOP activity-summary layout. When all
    // three fields are present, prefer its independently anchored values over broad
    // generic label searches that can accidentally reuse AVG for LOW.
    avgHr: triplet.avg ?? avgReading.value,
    maxHr: savedStreamMaxIsConfiguration ? null : (triplet.max ?? maxReading.value),
    minHr: triplet.min ?? (minReading.value ?? fallbackMin),
    calories: numberNearLabel(focusText, ['calories', 'calorie', 'kcal'], { min: 0, max: 5000 }),
    distanceKm: distanceKm(focusText),
    effort: effortEvidence.value,
    avgSpeedKmh: genericMetric(focusText, 'avg speed', '(?:km/h|kmh)'),
    fastestSpeedKmh: genericMetric(focusText, 'fastest speed', '(?:km/h|kmh)'),
    steps: numberNearLabel(focusText, ['steps'], { min: 0, max: 200000 }),
    avgCadence: numberNearLabel(focusText, ['avg cadence', 'average cadence'], { min: 0, max: 300 }),
    maxCadence: numberNearLabel(focusText, ['max cadence', 'maximum cadence'], { min: 0, max: 300 }),
    hrSource: /from strap hr|strap hr/i.test(focusText) ? 'strap' : null,
    hrZones: {},
    configuredMaxHr: configured.configuredMaxHr,
    configuredTopZoneThreshold: configured.configuredTopZoneThreshold,
    ...historical,
    ...machine
  };
  if (sourceRole === 'treadmillMachineConsole') {
    metrics.durationMinutes = metrics.totalTime ? durationMinutes(`Total time ${metrics.totalTime}`) : metrics.durationMinutes;
    metrics.avgHr = machine.avgHr ?? metrics.avgHr;
    metrics.maxHr = machine.maxHr ?? metrics.maxHr;
  }
  metrics.hrZones = extractHrZones(focusText);

  const found = Object.entries(metrics).filter(([key, value]) => key !== 'hrZones' && value != null).length
    + Object.values(metrics.hrZones).filter(value => value != null).length;
  const warnings = [];
  if (metrics.calories != null && Number(metrics.calories) <= 5 && Number(metrics.durationMinutes || 0) >= 20) warnings.push(`Calories show ${metrics.calories} despite a substantial session. Preserve as screenshot evidence only and exclude it from energy-expenditure analysis.`);
  if (activity.type === 'strength' && Number(metrics.durationMinutes || 0) >= 60 && metrics.calories != null && Number(metrics.calories) < 150) warnings.push('Calories appear low for the recorded strength-session duration. Preserve the visible screenshot value and do not invent a replacement.');
  if (metrics.effort === 0 && Number(metrics.durationMinutes || 0) >= 45) warnings.push('Effort shows 0 despite a long session. Preserve as screenshot evidence only.');
  if (sourceRole === 'unknown') warnings.push('Screenshot source is unclear. Confirm whether this is NOOP Strap, watch/device or machine console.');
  if (savedStreamMaxIsConfiguration) warnings.push('Max HR on the saved/current-stream screen is a configured device setting, not the session peak HR. It is stored separately.');
  if (!metrics.avgHr && /avg hr|average hr/i.test(focusText)) warnings.push('Average HR label was detected but the number was not reliable.');
  if (metrics.minHr != null && metrics.avgHr != null && metrics.minHr === metrics.avgHr && /low hr|min hr|minimum hr|\blow\b/i.test(focusText)) {
    warnings.push('Minimum HR matched average HR even though a separate low-HR label was detected. Check the OCR result before applying it.');
  }
  if (metrics.minHr != null && metrics.avgHr != null && metrics.minHr > metrics.avgHr) {
    warnings.push('Minimum HR is higher than average HR. Check the OCR result before applying it.');
  }
  const zonePairs = [1,2,3,4,5].map(zone => `${metrics.hrZones[`z${zone}Percent`] ?? 'x'}:${metrics.hrZones[`z${zone}Minutes`] ?? 'x'}`);
  if (new Set(zonePairs.filter(pair => pair !== 'x:x')).size === 1 && zonePairs.filter(pair => pair !== 'x:x').length >= 3) warnings.push('Several HR zones were read as identical. Do not apply the duplicated zone values; review the screenshot manually.');
  const visibleZoneMinutes = [1,2,3,4,5].map(zone => metrics.hrZones[`z${zone}Minutes`]).filter(value => value != null).reduce((sum,value)=>sum+Number(value),0);
  if (visibleZoneMinutes && metrics.durationMinutes && Math.abs(visibleZoneMinutes - metrics.durationMinutes) > 5) warnings.push('Visible HR-zone minutes do not sum to session duration. Preserve visible values and do not infer missing minutes.');
  if (sourceRole === 'treadmillMachineConsole' && !metrics.totalTime && /total time/i.test(focusText)) warnings.push('Treadmill total-time label was detected but the value was not reliable.');
  const promotion = assessOcrPromotion(metrics, focusText);
  warnings.push(...promotion.warnings);
  const sourceQuality = {
    calories: (metrics.calories != null && ((Number(metrics.calories) <= 5 && Number(metrics.durationMinutes || 0) >= 20) || (activity.type === 'strength' && Number(metrics.durationMinutes || 0) >= 60 && Number(metrics.calories) < 150))) ? 'suspicious' : (metrics.calories != null ? 'usable' : 'missing'),
    effort: (metrics.effort === 0 && Number(metrics.durationMinutes || 0) >= 45) ? 'suspicious' : (metrics.effort != null ? 'usable' : 'missing')
  };
  const metricQuality = {
    calories: sourceQuality.calories === 'usable' ? 'valid' : sourceQuality.calories === 'suspicious' ? 'suspect' : sourceQuality.calories === 'missing' ? 'not-recorded' : 'invalid',
    effort: sourceQuality.effort === 'usable' ? 'valid' : sourceQuality.effort === 'suspicious' ? 'suspect' : sourceQuality.effort === 'missing' ? 'not-recorded' : 'invalid'
  };
  const zoneMinutesIncomplete = [1,2,3,4,5].some(zone => metrics.hrZones[`z${zone}Percent`] != null && metrics.hrZones[`z${zone}Minutes`] == null);
  const confidence = found >= 12 ? 'high' : found >= 6 ? 'medium' : 'low';
  const parsedEvidence = {
    duration: metrics.durationMinutes != null ? { rawToken: durationEvidence.rawToken, value: metrics.durationMinutes, mode: durationEvidence.mode, confidence } : null,
    avgHr: metrics.avgHr != null ? { rawToken: avgReading.rawToken || (triplet.avg != null ? String(triplet.avg) : null), value: metrics.avgHr, label: avgReading.label || 'AVG', confidence } : null,
    maxHr: metrics.maxHr != null ? { rawToken: maxReading.rawToken || (triplet.max != null ? String(triplet.max) : null), value: metrics.maxHr, label: maxReading.label || 'PEAK/MAX', confidence } : null,
    minHr: metrics.minHr != null ? { rawToken: minReading.rawToken || (triplet.min != null ? String(triplet.min) : null), value: metrics.minHr, label: minReading.label || 'LOW/MIN', confidence } : null,
    calories: metrics.calories != null ? { rawToken: rawNumberNearLabel(focusText, ['calories', 'calorie', 'kcal']), value: metrics.calories, confidence } : null,
    effort: metrics.effort != null ? { rawToken: effortEvidence.rawToken, value: metrics.effort, confidence } : null,
    hrZones: metrics.hrZones,
    durationMinutesFromTimeRange: durationFromRange,
    configuredMaxHr: configured.configuredMaxHr,
    configuredTopZoneThreshold: configured.configuredTopZoneThreshold
  };
  return {
    sourceRole,
    sourceSystem: sourceRole.startsWith('noop') || sourceRole === 'workoutHrSummary' ? 'NOOP' : sourceRole.startsWith('watch') ? 'watchDevice' : sourceRole.includes('treadmill') ? 'treadmillMachine' : sourceRole.includes('BloodPressure') ? 'manualEntry' : 'unknown',
    sensor: sourceRole === 'noopSessionStreamSaved' ? 'noopAppSessionStream' : sourceRole === 'noopHistoricalWorkoutCard' ? 'noopHistoricalCard' : sourceRole.startsWith('noop') || sourceRole === 'workoutHrSummary' ? 'noopStrap' : sourceRole.startsWith('watch') ? 'watchOptical' : sourceRole.includes('treadmill') ? 'treadmillConsole' : sourceRole.includes('BloodPressure') ? 'manualBpCuff' : 'unknown',
    activityShown: activity.shown,
    activityType: activity.type,
    metrics,
    parsedEvidence,
    promotionMetrics: promotion.promotionMetrics,
    validation: { level: promotion.level, blockedFields: promotion.blockedFields, warnings: promotion.warnings },
    sourceQuality,
    metricQuality,
    zoneMinutesIncomplete,
    analysisEligibility: {
      useForEnergyAnalysis: sourceQuality.calories === 'usable',
      useForTrainingLoadAnalysis: sourceQuality.effort === 'usable'
    },
    confidence,
    extractionConfidence: confidence,
    confirmationStatus: 'ocr-suggestion-awaiting-user-confirmation',
    warnings,
    rawText: rawText || ''
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
}

export function ocrResultRows(result) {
  const metrics = result?.metrics || {};
  const rows = [
    ['Suggested role', result?.sourceRole || 'unknown'],
    ['Activity', result?.activityShown || 'Not read'],
    ['Date', metrics.dateShown || 'Not read'],
    ['Time', metrics.timeRange || 'Not read'],
    ['Duration', metrics.durationMinutes != null ? `${Math.round(metrics.durationMinutes * 10) / 10} min${metrics.durationDisplayText ? ` · shown as ${metrics.durationDisplayText}` : ''}` : 'Not read'],
    ['Average HR', metrics.avgHr != null ? `${metrics.avgHr} bpm` : 'Not read'],
    ['Maximum HR', metrics.maxHr != null ? `${metrics.maxHr} bpm` : 'Not read'],
    ['Minimum HR', metrics.minHr != null ? `${metrics.minHr} bpm` : 'Not read'],
    ['Calories', metrics.calories != null ? `${metrics.calories} kcal` : 'Not read'],
    ['Distance', metrics.distanceKm != null ? `${metrics.distanceKm} km` : 'Not read'],
    ['Effort', metrics.effort != null ? metrics.effort : 'Not read'],
    ['Configured Max HR', metrics.configuredMaxHr != null ? `${metrics.configuredMaxHr} bpm (device setting)` : 'Not read'],
    ['Top Zone threshold', metrics.configuredTopZoneThreshold != null ? `≥${metrics.configuredTopZoneThreshold} bpm (device setting)` : 'Not read'],
    ['Z1', metrics.hrZones?.z1Percent != null ? `${metrics.hrZones.z1Percent}% / ${metrics.hrZones.z1Minutes ?? '–'}m` : 'Not read'],
    ['Z2', metrics.hrZones?.z2Percent != null ? `${metrics.hrZones.z2Percent}% / ${metrics.hrZones.z2Minutes ?? '–'}m` : 'Not read'],
    ['Z3', metrics.hrZones?.z3Percent != null ? `${metrics.hrZones.z3Percent}% / ${metrics.hrZones.z3Minutes ?? '–'}m` : 'Not read'],
    ['Z4', metrics.hrZones?.z4Percent != null ? `${metrics.hrZones.z4Percent}% / ${metrics.hrZones.z4Minutes ?? '–'}m` : 'Not read'],
    ['Z5', metrics.hrZones?.z5Percent != null ? `${metrics.hrZones.z5Percent}% / ${metrics.hrZones.z5Minutes ?? '–'}m` : 'Not read'],
    ['Machine total time', metrics.totalTime || 'Not read'],
    ['Machine distance', metrics.distanceMiles != null ? `${metrics.distanceMiles} mi` : 'Not read'],
    ['Vertical distance', metrics.verticalDistanceFeet != null ? `${metrics.verticalDistanceFeet} ft` : 'Not read'],
    ['Average watts / METs', metrics.avgWatts != null || metrics.avgMets != null ? `${metrics.avgWatts ?? '–'} W / ${metrics.avgMets ?? '–'} METs` : 'Not read'],
    ['Machine speed', metrics.avgSpeedMph != null || metrics.maxSpeedMph != null ? `avg ${metrics.avgSpeedMph ?? '–'} / max ${metrics.maxSpeedMph ?? '–'} mph` : 'Not read'],
    ['Machine pace', metrics.avgPacePerMile || metrics.maxPacePerMile ? `avg ${metrics.avgPacePerMile ?? '–'} / max ${metrics.maxPacePerMile ?? '–'} min/mi` : 'Not read'],
    ['Machine incline', metrics.avgInclinePercent != null || metrics.maxInclinePercent != null ? `avg ${metrics.avgInclinePercent ?? '–'} / max ${metrics.maxInclinePercent ?? '–'}%` : 'Not read']
  ];
  const html = rows.map(([label, value]) => `<div class="ocr-result-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const warnings = (result?.warnings || []).map(warning => `<div class="ocr-result-row ocr-result-warning"><span>Review</span><strong>${escapeHtml(warning)}</strong></div>`).join('');
  return html + warnings;
}
