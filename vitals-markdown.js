const ACTIVITY_NAMES = [
  'Inversion', 'Acupressure', 'Sauna', 'Steam room', 'Cold plunge',
  'Massage', 'Yoga', 'Casual walk', 'Post-meal walk'
];

export const KNOWN_VANTAGE_VITALS_EXTENSIONS = new Set([
  'effort','autonomicBalanceLfHf','sleepLedger14Day','sleepDurationConflict','sleepStagesShownForSegment',
  'weightKg','muscleRatePercent','boneMassKg','bmrKcal','proteinRatePercent','metabolicAge','subcutaneousFatPercent',
  'standardWeightKg','weightControlKg','fatFreeMassKg','proteinMassKg','heartRateToday','deviceReportedMetabolicMarkers',
  'additionalMetrics','dataQualityNotes'
]);

const BODY_COMPOSITION_FIELDS = new Set([
  'weightKg','bmi','bodyFatPercent','muscleRatePercent','bodyWaterPercent','boneMassKg','bmrKcal','proteinRatePercent',
  'metabolicAge','visceralFatIndex','subcutaneousFatPercent','standardWeightKg','weightControlKg','fatMassKg',
  'fatFreeMassKg','muscleMassKg','proteinMassKg','bodyScore'
]);

const FIELD_ALIASES = new Map([
  ['date', 'date'],
  ['reading date', 'date'],
  ['noop recovery', 'recovery'],
  ['noop recovery %', 'recovery'],
  ['recovery', 'recovery'],
  ['recovery %', 'recovery'],
  ['charge', 'charge'],
  ['charge %', 'charge'],
  ['rest score', 'restScore'],
  ['rest', 'restScore'],
  ['status', 'status'],
  ['guidance', 'guidance'],
  ['synthesis', 'synthesis'],
  ['synthesis state', 'synthesis'],
  ['hrv', 'hrv'],
  ['hrv ms', 'hrv'],
  ['hrv baseline', 'hrvBaseline'],
  ['hrv baseline ms', 'hrvBaseline'],
  ['hrv delta', 'hrvDeltaFromBaseline'],
  ['hrv delta from baseline', 'hrvDeltaFromBaseline'],
  ['hrv change from baseline', 'hrvDeltaFromBaseline'],
  ['hrvbaselinedelta', 'hrvDeltaFromBaseline'],
  ['hrv baseline delta', 'hrvDeltaFromBaseline'],
  ['hrv baseline status', 'hrvBaselineStatus'],
  ['hrvbaselinestatus', 'hrvBaselineStatus'],
  ['resting hr', 'restingHr'],
  ['resting heart rate', 'restingHr'],
  ['rhr', 'restingHr'],
  ['rhr baseline', 'rhrBaseline'],
  ['resting hr baseline', 'rhrBaseline'],
  ['rhr delta', 'rhrDeltaFromBaseline'],
  ['rhr delta from baseline', 'rhrDeltaFromBaseline'],
  ['resting hr delta from baseline', 'rhrDeltaFromBaseline'],
  ['rhrbaselinedelta', 'rhrDeltaFromBaseline'],
  ['restinghrbaselinedelta', 'rhrDeltaFromBaseline'],
  ['resting hr baseline delta', 'rhrDeltaFromBaseline'],
  ['rhr baseline delta', 'rhrDeltaFromBaseline'],
  ['rhr baseline status', 'rhrBaselineStatus'],
  ['rhrbaselinestatus', 'rhrBaselineStatus'],
  ['resting hr baseline status', 'rhrBaselineStatus'],
  ['resting hr status', 'rhrBaselineStatus'],
  ['restinghrbaselinestatus', 'rhrBaselineStatus'],
  ['stress', 'stress'],
  ['stress score', 'stress'],
  ['stress band', 'stressBand'],
  ['respiratory rate', 'respiratoryRate'],
  ['respiratory rate rpm', 'respiratoryRate'],
  ['sleep duration', 'sleepHours'],
  ['sleep', 'sleepHours'],
  ['sleep duration hours', 'sleepHours'],
  ['sleep hours', 'sleepHours'],
  ['sleep performance', 'sleepPerformance'],
  ['sleep performance %', 'sleepPerformance'],
  ['sleep efficiency', 'sleepEfficiency'],
  ['sleep efficiency %', 'sleepEfficiency'],
  ['sleep debt', 'sleepDebt'],
  ['sleep debt today', 'sleepDebt'],
  ['sleepdebttoday', 'sleepDebt'],
  ['sleep debt hours', 'sleepDebt'],
  ['sleepdebtminutes', 'sleepDebtMinutes'],
  ['sleep debt minutes', 'sleepDebtMinutes'],
  ['hours vs needed percent', 'hoursVsNeededPercent'],
  ['hoursvsneededpercent', 'hoursVsNeededPercent'],
  ['restorative sleep percent', 'restorativeSleepPercent'],
  ['restorativesleeppercent', 'restorativeSleepPercent'],
  ['sleep ledger', 'sleepLedger'],
  ['sleepledger', 'sleepLedger'],
  ['sleep stage detail status', 'sleepStageDetailStatus'],
  ['sleepstagedetailstatus', 'sleepStageDetailStatus'],
  ['blood pressure', 'bloodPressure'],
  ['bp', 'bloodPressure'],
  ['cuff bp', 'bloodPressure'],
  ['systolic', 'systolic'],
  ['systolic bp', 'systolic'],
  ['diastolic', 'diastolic'],
  ['diastolic bp', 'diastolic'],
  ['pulse', 'pulse'],
  ['cuff pulse', 'pulse'],
  ['blood pressure pulse', 'pulse'],
  ['bloodpressurepulse', 'pulse'],
  ['weight', 'weight'],
  ['weight kg', 'weight'], ['weightkg', 'weight'],
  ['muscle rate percent', 'muscleRatePercent'], ['muscleratepercent', 'muscleRatePercent'],
  ['bone mass kg', 'boneMassKg'], ['bonemasskg', 'boneMassKg'],
  ['bmr kcal', 'bmrKcal'], ['bmrkcal', 'bmrKcal'],
  ['protein rate percent', 'proteinRatePercent'], ['proteinratepercent', 'proteinRatePercent'],
  ['metabolic age', 'metabolicAge'], ['metabolicage', 'metabolicAge'],
  ['subcutaneous fat percent', 'subcutaneousFatPercent'], ['subcutaneousfatpercent', 'subcutaneousFatPercent'],
  ['standard weight kg', 'standardWeightKg'], ['standardweightkg', 'standardWeightKg'],
  ['weight control kg', 'weightControlKg'], ['weightcontrolkg', 'weightControlKg'],
  ['fat free mass kg', 'fatFreeMassKg'], ['fatfreemasskg', 'fatFreeMassKg'],
  ['protein mass kg', 'proteinMassKg'], ['proteinmasskg', 'proteinMassKg'],
  ['daily hydration consumed', 'dailyHydrationConsumedLitres'],
  ['daily hydration consumed l', 'dailyHydrationConsumedLitres'],
  ['daily hydration target', 'dailyHydrationTargetLitres'],
  ['daily hydration target l', 'dailyHydrationTargetLitres'],
  ['user feeling', 'feeling'],
  ['feeling', 'feeling'],
  ['symptoms', 'symptoms'],
  ['symptoms present', 'symptoms'],
  ['notes', 'notes'],
  ['soreness', 'notes'],
  ['soreness symptoms notes', 'notes'],
  ['blood pressure time', 'bloodPressureTime'], ['bloodpressuretime', 'bloodPressureTime'],
  ['blood pressure status', 'bloodPressureStatus'], ['bloodpressurestatus', 'bloodPressureStatus'],
  ['weight change kg', 'weightChangeKg'], ['weightchangekg', 'weightChangeKg'],
  ['body fat percent', 'bodyFatPercent'], ['bodyfatpercent', 'bodyFatPercent'],
  ['muscle mass kg', 'muscleMassKg'], ['musclemasskg', 'muscleMassKg'],
  ['body water percent', 'bodyWaterPercent'], ['bodywaterpercent', 'bodyWaterPercent'],
  ['visceral fat index', 'visceralFatIndex'], ['visceralfatindex', 'visceralFatIndex'],
  ['fat mass kg', 'fatMassKg'], ['fatmasskg', 'fatMassKg'],
  ['weight without fat kg', 'weightWithoutFatKg'], ['weightwithoutfatkg', 'weightWithoutFatKg'],
  ['body score', 'bodyScore'], ['bodyscore', 'bodyScore'], ['bmi', 'bmi'],
  ['sleep window', 'sleepWindow'], ['sleepwindow', 'sleepWindow'], ['time in bed', 'timeInBed'], ['timeinbed', 'timeInBed'],
  ['sleep consistency', 'sleepConsistency'], ['sleepconsistency', 'sleepConsistency'], ['sleep stages', 'sleepStages'], ['sleepstages', 'sleepStages'],
  ['baevsky stress index', 'baevskyStressIndex'], ['baevskystressindex', 'baevskyStressIndex'],
  ['autonomic balance', 'autonomicBalance'], ['autonomicbalance', 'autonomicBalance'],
  ['calm time percent', 'calmTimePercent'], ['calmtimepercent', 'calmTimePercent'],
  ['blood oxygen', 'bloodOxygen'], ['bloodoxygen', 'bloodOxygen'],
  ['training recommendation', 'trainingRecommendation'], ['trainingrecommendation', 'trainingRecommendation'],
  ['nutrition targets approx', 'nutritionTargetsApprox'], ['nutritiontargetsapprox', 'nutritionTargetsApprox'],
  ['blood components', 'bloodComponents'], ['bloodcomponents', 'bloodComponents'],
  ['respiratory rate sources', 'respiratoryRateSources'], ['respiratoryratesources', 'respiratoryRateSources'],
  ['device trend estimates', 'deviceTrendEstimates'], ['devicetrendestimates', 'deviceTrendEstimates'],
  ['recovery activities', 'recoveryActivities'],
  ['recovery and stressors', 'recoveryActivities'],
  ['activities', 'recoveryActivities']
]);

const DIRECT_FIELDS = new Set([
  'date', 'recovery', 'charge', 'restScore', 'status', 'guidance', 'synthesis', 'hrv', 'hrvBaseline', 'hrvDeltaFromBaseline', 'hrvBaselineStatus',
  'restingHr', 'rhrBaseline', 'rhrDeltaFromBaseline', 'rhrBaselineStatus', 'stress', 'stressBand', 'respiratoryRate', 'sleepHours', 'sleepPerformance', 'sleepEfficiency',
  'sleepDebt', 'systolic', 'diastolic', 'pulse', 'bloodPressure', 'weight', 'dailyHydrationConsumedLitres', 'dailyHydrationTargetLitres', 'feeling',
  'symptoms', 'notes', 'recoveryActivities', 'sleepDebtMinutes', 'hoursVsNeededPercent', 'restorativeSleepPercent', 'sleepLedger', 'sleepStageDetailStatus',
  'bloodPressureTime','bloodPressureStatus','weightChangeKg','bodyFatPercent','muscleMassKg','bodyWaterPercent','visceralFatIndex','fatMassKg','weightWithoutFatKg','bodyScore','bmi',
  'muscleRatePercent','boneMassKg','bmrKcal','proteinRatePercent','metabolicAge','subcutaneousFatPercent','standardWeightKg','weightControlKg','fatFreeMassKg','proteinMassKg',
  'sleepWindow','timeInBed','sleepConsistency','sleepStages','baevskyStressIndex','autonomicBalance','calmTimePercent','bloodOxygen','trainingRecommendation','nutritionTargetsApprox','bloodComponents','respiratoryRateSources','deviceTrendEstimates'
]);

const NUMERIC_RANGES = {
  recovery: [0, 100], charge: [0, 100], restScore: [0, 100], stress: [0, 100], respiratoryRate: [5, 60],
  sleepPerformance: [0, 100], sleepEfficiency: [0, 100], hrv: [1, 400], hrvBaseline: [1, 400], hrvDeltaFromBaseline: [-400, 400],
  restingHr: [20, 220], rhrBaseline: [20, 220], rhrDeltaFromBaseline: [-200, 200], sleepHours: [0, 24],
  sleepDebt: [0, 24], hoursVsNeededPercent: [0, 200], restorativeSleepPercent: [0, 100], dailyHydrationConsumedLitres: [0, 20], dailyHydrationTargetLitres: [0, 20], systolic: [50, 260], diastolic: [30, 180], pulse: [20, 220], weight: [20, 400],
  weightChangeKg: [-30, 30], bodyFatPercent: [0, 80], muscleMassKg: [0, 250], bodyWaterPercent: [0, 100], visceralFatIndex: [0, 100], fatMassKg: [0, 250], weightWithoutFatKg: [0, 300], bodyScore: [0, 100], bmi: [5, 100],
  muscleRatePercent: [0,100], boneMassKg: [0,20], bmrKcal: [500,6000], proteinRatePercent: [0,40], metabolicAge: [1,120], subcutaneousFatPercent: [0,80], standardWeightKg: [20,400], weightControlKg: [-200,200], fatFreeMassKg: [0,300], proteinMassKg: [0,100],
  sleepConsistency: [0, 100], baevskyStressIndex: [0, 1000], autonomicBalance: [-100, 100], calmTimePercent: [0, 100]
};

function normaliseLabel(value) {
  return String(value ?? '')
    .replace(/[*_`#]/g, '')
    .replace(/\([^)]*\)/g, match => match.toLowerCase().includes('hour') || match.toLowerCase().includes('ms') || match.toLowerCase().includes('kg') ? ` ${match.slice(1, -1)}` : '')
    .replace(/[%:]/g, match => match === '%' ? ' %' : '')
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalField(key) {
  if (DIRECT_FIELDS.has(key)) return key;
  const normalised = normaliseLabel(key);
  if (FIELD_ALIASES.has(normalised)) return FIELD_ALIASES.get(normalised);
  const compact = normalised.replace(/\s+/g, '');
  return [...DIRECT_FIELDS].find(field => field.toLowerCase() === compact.toLowerCase()) || null;
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseHours(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  const compactHoursMinutes = text.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})(?:\s*m)?$/);
  if (compactHoursMinutes) return Number(compactHoursMinutes[1]) + Number(compactHoursMinutes[2]) / 60;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hours || minutes) return Number(hours?.[1] || 0) + Number(minutes?.[1] || 0) / 60;
  return parseNumber(text);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', 'present', '1', 'on'].includes(text)) return true;
  if (['no', 'n', 'false', 'none', '0', 'off', 'not present'].includes(text)) return false;
  return null;
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const uk = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  return null;
}

function parseBloodPressure(value) {
  if (Array.isArray(value) && value.length >= 2) return [parseNumber(value[0]), parseNumber(value[1])];
  if (value && typeof value === 'object') return [parseNumber(value.systolic ?? value.sys), parseNumber(value.diastolic ?? value.dia)];
  const match = String(value ?? '').match(/(\d{2,3})\s*[\/]\s*(\d{2,3})/);
  return match ? [Number(match[1]), Number(match[2])] : [null, null];
}

function normaliseSynthesis(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text.startsWith('peak')) return 'Peak';
  if (text.startsWith('build')) return 'Building';
  if (text.startsWith('steady')) return 'Steady';
  if (text.startsWith('maintain')) return 'Maintain';
  if (text.startsWith('balanc')) return 'Balanced';
  if (text.startsWith('drain')) return 'Draining';
  if (text.startsWith('deplet')) return 'Depleted';
  if (text.startsWith('low')) return 'Low';
  if (text.startsWith('prim')) return 'Primed';
  if (text.startsWith('solid')) return 'Solid';
  return '';
}

function normaliseBaselineStatus(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[–—]/g, '-');
  if (!text) return '';
  if (/^(?:at|on)\s*baseline$/.test(text) || text === 'baseline' || /no\s+(?:change|delta)/.test(text)) return 'at-baseline';
  if (/above\s*baseline|elevated|higher/.test(text)) return 'above-baseline';
  if (/below\s*baseline|suppressed|lower/.test(text)) return 'below-baseline';
  if (/known|recorded|numeric/.test(text)) return 'known';
  if (/unknown|not\s*(?:recorded|known)|missing|n\/?a/.test(text)) return 'unknown';
  return '';
}

function statusFromDelta(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'unknown';
  const number = Number(value);
  if (number === 0) return 'at-baseline';
  return number > 0 ? 'above-baseline' : 'below-baseline';
}

function normaliseFeeling(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['good', 'great', 'strong', 'positive', 'well'].includes(text) || text.startsWith('green')) return 'good';
  if (['average', 'ok', 'okay', 'fair', 'neutral', 'normal'].includes(text) || text.startsWith('amber')) return 'average';
  if (['poor', 'bad', 'rough', 'unwell', 'low'].includes(text) || text.startsWith('red')) return 'poor';
  return '';
}

function normaliseActivity(value) {
  const text = normaliseLabel(value);
  const aliases = {
    'steam': 'Steam room', 'steam room': 'Steam room', 'cold': 'Cold plunge',
    'cold plunge': 'Cold plunge', 'post meal walk': 'Post-meal walk',
    'postmeal walk': 'Post-meal walk', 'walk after meal': 'Post-meal walk',
    'walking after meals': 'Post-meal walk', 'walk': 'Casual walk', 'casual walk': 'Casual walk'
  };
  if (aliases[text]) return aliases[text];
  return ACTIVITY_NAMES.find(item => normaliseLabel(item) === text) || null;
}

function parseActivities(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,;|\n]+/);
  return [...new Set(source.map(normaliseActivity).filter(Boolean))];
}

function extractJsonObject(text) {
  const fenced = [...text.matchAll(/```(?:vantage-vitals|json)?\s*([\s\S]*?)```/gi)];
  for (const match of fenced) {
    const candidate = match[1].trim();
    if (!candidate.startsWith('{')) continue;
    try { return JSON.parse(candidate); } catch { /* try the next block */ }
  }

  // Be tolerant of files generated with a missing closing code fence.
  // The JSON itself remains authoritative; only the Markdown wrapper is malformed.
  const unterminated = text.match(/```(?:vantage-vitals|json)?\s*([\s\S]*)$/i);
  if (unterminated) {
    const candidate = unterminated[1].trim().replace(/```\s*$/, '').trim();
    if (candidate.startsWith('{')) {
      try { return JSON.parse(candidate); } catch { /* use markdown fallback */ }
    }
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* use markdown fallback */ }
  }
  return null;
}

function extractMarkdownPairs(text) {
  const pairs = [];
  for (const line of text.split(/\r?\n/)) {
    const table = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|?\s*$/);
    if (table) {
      const left = table[1].trim();
      const right = table[2].trim();
      if (!/^[-: ]+$/.test(left) && !/^[-: ]+$/.test(right) && !/^field$/i.test(left)) pairs.push([left, right]);
      continue;
    }
    const keyValue = line.match(/^\s*(?:[-*+]\s*)?(?:\*\*|__)?([^:]+?)(?:\*\*|__)?\s*:\s*(.+?)\s*$/);
    if (keyValue) pairs.push([keyValue[1].trim(), keyValue[2].trim()]);
  }
  return pairs;
}

function collectRawValues(text) {
  const object = extractJsonObject(text);
  if (object) {
    const source = object.vitals && typeof object.vitals === 'object' ? object.vitals : object;
    const entries = [];
    const unsupported = [];
    const metadataKeys = new Set(['schema','source','sourceFile','generatedAt','appVersion','version']);
    const pushEntry = (key, value, sourceKey = key) => entries.push([key, value, sourceKey]);
    for (const [key, value] of Object.entries(source)) {
      if (metadataKeys.has(key)) continue;
      if (key === 'sleep' && value && typeof value === 'object' && !Array.isArray(value)) {
        const map = { sleepDuration:'sleepHours', duration:'sleepHours', sleepHours:'sleepHours', sleepPerformance:'sleepPerformance', performance:'sleepPerformance', sleepEfficiencyPercent:'sleepEfficiency', sleepEfficiency:'sleepEfficiency', hoursVsNeededPercent:'hoursVsNeededPercent', sleepDebt:'sleepDebt', restorativeSleepPercent:'restorativeSleepPercent', sleepWindow:'sleepWindow', sleepStages:'sleepStages' };
        for (const [nestedKey,nestedValue] of Object.entries(value)) {
          if (map[nestedKey]) pushEntry(map[nestedKey], nestedValue, `sleep.${nestedKey}`);
          else if (KNOWN_VANTAGE_VITALS_EXTENSIONS.has(nestedKey)) pushEntry(nestedKey, nestedValue, `sleep.${nestedKey}`);
          else unsupported.push(`sleep.${nestedKey}`);
        }
        continue;
      }
      if (key === 'bloodPressure' && value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.systolic != null) pushEntry('systolic', value.systolic, 'bloodPressure.systolic');
        if (value.diastolic != null) pushEntry('diastolic', value.diastolic, 'bloodPressure.diastolic');
        if (value.pulse != null) pushEntry('pulse', value.pulse, 'bloodPressure.pulse');
        if (value.time != null) pushEntry('bloodPressureTime', value.time, 'bloodPressure.time');
        continue;
      }
      if (key === 'bodyComposition' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [nestedKey,nestedValue] of Object.entries(value)) {
          if (nestedKey === 'weightKg') pushEntry('weight', nestedValue, 'bodyComposition.weightKg');
          else if (BODY_COMPOSITION_FIELDS.has(nestedKey)) pushEntry(nestedKey, nestedValue, `bodyComposition.${nestedKey}`);
          else unsupported.push(`bodyComposition.${nestedKey}`);
        }
        continue;
      }
      if (key === 'baselineStatus' && value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.hrv != null) pushEntry('hrvBaselineStatus', value.hrv, 'baselineStatus.hrv');
        if (value.restingHr != null) pushEntry('rhrBaselineStatus', value.restingHr, 'baselineStatus.restingHr');
        if (value.rhr != null) pushEntry('rhrBaselineStatus', value.rhr, 'baselineStatus.rhr');
        continue;
      }
      if ((key === 'sleepSummary' || key === 'sleepCurrentSummary') && value && typeof value === 'object' && !Array.isArray(value)) {
        const map = {
          sleep: 'sleepHours', duration: 'sleepHours', sleepHours: 'sleepHours',
          performance: 'sleepPerformance', sleepPerformance: 'sleepPerformance',
          efficiency: 'sleepEfficiency', sleepEfficiency: 'sleepEfficiency',
          debt: 'sleepDebt', sleepDebt: 'sleepDebt', sleepDebtMinutes: 'sleepDebtMinutes',
          hoursVsNeededPercent: 'hoursVsNeededPercent', restorativeSleepPercent: 'restorativeSleepPercent',
          ledger: 'sleepLedger', sleepLedger: 'sleepLedger', detailStatus: 'sleepStageDetailStatus', sleepStageDetailStatus: 'sleepStageDetailStatus',
          sleepWindow: 'sleepWindow', timeInBed: 'timeInBed', sleepStages: 'sleepStages', sleepConsistency: 'sleepConsistency'
        };
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (map[nestedKey]) pushEntry(map[nestedKey], nestedValue, `${key}.${nestedKey}`);
          else unsupported.push(`${key}.${nestedKey}`);
        }
        continue;
      }
      pushEntry(key, value, key);
    }
    return { sourceFormat: 'structured JSON block', entries, unsupported };
  }
  return { sourceFormat: 'Markdown fields', entries: extractMarkdownPairs(text).map(([k,v]) => [k,v,k]), unsupported: [] };
}
function appendNotes(current, next) {
  const value = String(next ?? '').trim();
  if (!value) return current || '';
  return [current, value].filter(Boolean).join(' | ');
}

function sourcePriority(canonical, sourceKey) {
  const source = String(sourceKey || '');
  if (source === canonical || (canonical === 'weight' && source === 'weight')) return 40;
  if (source.includes('.')) return 30;
  if (/kg$|percent$|kcal$|age$/i.test(source) || source === 'weightKg') return 20;
  return 25;
}

function normaliseBloodOxygen(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const copy = structuredClone(value);
  const note = String(copy.note || '');
  const separate = /separate|blood[- ]oxygen monitor/i.test(note);
  const noopNoData = /noop[^.\n]*no data/i.test(note);
  if (!separate && !noopNoData) return copy;
  const { note: _note, ...monitor } = copy;
  return { noopStatus: noopNoData ? 'No Data' : 'Unknown', separateMonitor: monitor, note };
}

export function parseVitalsMarkdown(text) {
  if (!String(text ?? '').trim()) throw new Error('The Markdown file is empty.');
  const { sourceFormat, entries, unsupported = [] } = collectRawValues(String(text));
  const raw = {};
  const fieldSources = {};
  const fieldPriority = {};
  const warnings = [];
  const unsupportedFields = [...unsupported];
  const extensions = {};
  for (const [inputKey, value, sourceKey = inputKey] of entries) {
    const key = canonicalField(inputKey);
    if (!key) {
      const normalised = normaliseLabel(inputKey);
      if (KNOWN_VANTAGE_VITALS_EXTENSIONS.has(inputKey) || KNOWN_VANTAGE_VITALS_EXTENSIONS.has(sourceKey)) { extensions[sourceKey] = value; continue; }
      if (normalised && !['schema','source','source file','generated at','app version','version'].includes(normalised)) { unsupportedFields.push(sourceKey); extensions[sourceKey] = value; }
      continue;
    }
    if (value == null || value === '') continue;
    if (key === 'notes') { raw.notes = appendNotes(raw.notes, value); fieldSources[key] = sourceKey; continue; }
    const priority = sourcePriority(key, sourceKey);
    if (raw[key] !== undefined && raw[key] !== value) {
      const previousPriority = fieldPriority[key] ?? 0;
      const conflict = { field:key, retained: previousPriority >= priority ? raw[key] : value, alternate: previousPriority >= priority ? value : raw[key], retainedSource: previousPriority >= priority ? fieldSources[key] : sourceKey, alternateSource: previousPriority >= priority ? sourceKey : fieldSources[key] };
      extensions.importConflicts = [...(extensions.importConflicts || []), conflict];
      if (previousPriority >= priority) continue;
    }
    raw[key] = value; fieldPriority[key] = priority; fieldSources[key] = sourceKey;
  }
  for (const field of [...new Set(unsupportedFields)]) warnings.push(`Unknown VANTAGE vitals field: ${field}`);
  const recognisedRawFields = Object.keys(raw).filter(key => key !== 'recoveryActivities');
  if (recognisedRawFields.length === 0) throw new Error('No supported VANTAGE vital fields were found in the Markdown file.');

  const values = {};
  if (raw.sleepHours != null && typeof raw.sleepHours === 'string') values.sleepDisplay = String(raw.sleepHours).trim();

  if (raw.pulse == null && raw.notes) {
    const pulseMatch = String(raw.notes).match(/(?:cuff\s*pulse|blood\s*pressure\s*pulse|bp\s*pulse|pulse)\s*[:\-]?\s*(\d{2,3})\b/i);
    const pulse = Number(pulseMatch?.[1]);
    if (Number.isFinite(pulse) && pulse >= 20 && pulse <= 220) raw.pulse = pulse;
  }

  if (raw.sleepDebt == null && raw.sleepDebtMinutes != null) {
    const minutes = parseNumber(raw.sleepDebtMinutes);
    if (minutes != null && minutes >= 0 && minutes <= 1440) raw.sleepDebt = minutes / 60;
    else warnings.push('sleepDebtMinutes was not a valid value between 0 and 1440 minutes.');
  }

  const date = parseDate(raw.date);
  if (raw.date != null && !date) warnings.push(`Date “${raw.date}” was not recognised; use YYYY-MM-DD or DD/MM/YYYY.`);
  if (date) values.date = date;

  const explicitHrvStatus = normaliseBaselineStatus(raw.hrvBaselineStatus);
  const explicitRhrStatus = normaliseBaselineStatus(raw.rhrBaselineStatus ?? raw.rhrDeltaFromBaseline);
  if (raw.hrvBaselineStatus != null && !explicitHrvStatus) warnings.push(`HRV baseline status “${raw.hrvBaselineStatus}” was not recognised.`);
  if (raw.rhrBaselineStatus != null && !explicitRhrStatus) warnings.push(`RHR baseline status “${raw.rhrBaselineStatus}” was not recognised.`);

  for (const field of Object.keys(NUMERIC_RANGES)) {
    if (raw[field] == null) continue;
    if (field === 'rhrDeltaFromBaseline' && normaliseBaselineStatus(raw[field]) === 'at-baseline') continue;
    if (field === 'hrvDeltaFromBaseline' && normaliseBaselineStatus(raw[field]) === 'at-baseline') continue;
    const number = field === 'sleepHours' || field === 'sleepDebt' ? parseHours(raw[field]) : parseNumber(raw[field]);
    if (number == null) { warnings.push(`${field} was not a valid number.`); continue; }
    const [min, max] = NUMERIC_RANGES[field];
    if (number < min || number > max) { warnings.push(`${field} value ${number} is outside the supported range ${min}–${max} and was skipped.`); continue; }
    values[field] = Math.round(number * 100) / 100;
  }

  if (raw.bloodPressure != null) {
    const [systolic, diastolic] = parseBloodPressure(raw.bloodPressure);
    if (systolic != null && systolic >= 50 && systolic <= 260) values.systolic = systolic;
    else warnings.push('Blood pressure systolic value was missing or invalid.');
    if (diastolic != null && diastolic >= 30 && diastolic <= 180) values.diastolic = diastolic;
    else warnings.push('Blood pressure diastolic value was missing or invalid.');
  }
  if (values.pulse != null) values.cuffPulse = values.pulse;

  if (raw.synthesis != null) {
    const synthesis = normaliseSynthesis(raw.synthesis);
    if (synthesis) values.synthesis = synthesis;
    else warnings.push(`Synthesis state “${raw.synthesis}” was not recognised.`);
  }
  if (raw.status != null) values.status = String(raw.status).trim();
  if (raw.guidance != null) values.guidance = String(raw.guidance).trim();
  if (raw.stressBand != null) values.stressBand = String(raw.stressBand).trim();
  if (raw.sleepLedger != null) values.sleepLedger = String(raw.sleepLedger).trim();
  if (raw.sleepStageDetailStatus != null) values.sleepStageDetailStatus = String(raw.sleepStageDetailStatus).trim();
  for (const field of ['bloodPressureTime','bloodPressureStatus','sleepWindow','timeInBed']) if (raw[field] != null) values[field] = String(raw[field]).trim();
  for (const field of ['sleepStages','trainingRecommendation','nutritionTargetsApprox','bloodComponents','respiratoryRateSources','deviceTrendEstimates']) {
    if (raw[field] != null) values[field] = typeof raw[field] === 'object' ? structuredClone(raw[field]) : raw[field];
  }
  if (raw.bloodOxygen != null) values.bloodOxygen = normaliseBloodOxygen(raw.bloodOxygen);
  if (raw.feeling != null) {
    const feeling = normaliseFeeling(raw.feeling);
    if (feeling) values.feeling = feeling;
    else warnings.push(`Feeling “${raw.feeling}” was not recognised.`);
  }
  if (raw.symptoms != null) {
    const symptoms = parseBoolean(raw.symptoms);
    if (symptoms == null) warnings.push(`Symptoms value “${raw.symptoms}” was not recognised as yes or no.`);
    else values.symptoms = symptoms;
  }
  if (raw.notes != null) values.notes = String(raw.notes).trim();
  if (raw.recoveryActivities != null) warnings.push('Recovery activities in this vitals file were ignored. Recovery actions are now logged in the dedicated Recovery section.');

  const noteText = String(values.notes || '');
  if (values.hrv != null) {
    const deltaMatch = noteText.match(/HRV[^\n|]*?([+-]?\d+(?:\.\d+)?)\s*(?:ms)?\s*(?:vs|from)\s*baseline/i);
    if (deltaMatch && values.hrvDeltaFromBaseline == null) {
      values.hrvDeltaFromBaseline = Number(deltaMatch[1]);
      values.hrvDeltaSource = 'explicit-note';
    }
    if (values.hrvDeltaFromBaseline != null && values.hrvBaseline != null) {
      const impliedDelta = Math.round((values.hrv - values.hrvBaseline) * 100) / 100;
      if (Math.abs(impliedDelta - values.hrvDeltaFromBaseline) > 1) {
        values.hrvBaselineReported = values.hrvBaseline;
        values.hrvBaselineConflict = { reported: values.hrvBaseline, recordedDelta: values.hrvDeltaFromBaseline, impliedDelta };
        warnings.push(`HRV baseline conflict: ${values.hrvBaseline} ms implies ${impliedDelta >= 0 ? '+' : ''}${impliedDelta} ms, but the recorded delta is ${values.hrvDeltaFromBaseline >= 0 ? '+' : ''}${values.hrvDeltaFromBaseline} ms. The baseline was left unknown rather than guessed.`);
        values.hrvBaseline = null;
        values.hrvBaselineSource = 'conflict-left-unknown';
      }
    }
  }
  if (values.restingHr != null) {
    const deltaMatch = noteText.match(/(?:resting\s*HR|RHR)[^\n|]*?([+-]?\d+(?:\.\d+)?)\s*(?:bpm)?\s*(?:vs|from)\s*baseline/i);
    if (deltaMatch && values.rhrDeltaFromBaseline == null && !explicitRhrStatus) {
      values.rhrDeltaFromBaseline = Number(deltaMatch[1]);
      values.rhrDeltaSource = 'explicit-note';
    }
    if (/(?:resting\s*HR|RHR)[^\n|]*?at baseline/i.test(noteText)) values.rhrBaselineStatus = 'at-baseline';
    if (values.rhrDeltaFromBaseline != null && values.rhrBaseline != null) {
      const impliedDelta = Math.round((values.restingHr - values.rhrBaseline) * 100) / 100;
      if (Math.abs(impliedDelta - values.rhrDeltaFromBaseline) > 1) {
        values.rhrBaselineReported = values.rhrBaseline;
        values.rhrBaselineConflict = { reported: values.rhrBaseline, recordedDelta: values.rhrDeltaFromBaseline, impliedDelta };
        warnings.push(`RHR baseline conflict: ${values.rhrBaseline} bpm implies ${impliedDelta >= 0 ? '+' : ''}${impliedDelta} bpm, but the recorded delta is ${values.rhrDeltaFromBaseline >= 0 ? '+' : ''}${values.rhrDeltaFromBaseline} bpm. The baseline was left unknown rather than guessed.`);
        values.rhrBaseline = null;
        values.rhrBaselineSource = 'conflict-left-unknown';
      }
    }
  }

  values.hrvBaselineStatus = explicitHrvStatus || values.hrvBaselineStatus || (values.hrvBaseline != null ? 'known' : statusFromDelta(values.hrvDeltaFromBaseline));
  values.rhrBaselineStatus = explicitRhrStatus || values.rhrBaselineStatus || (values.rhrBaseline != null ? 'known' : statusFromDelta(values.rhrDeltaFromBaseline));

  if (values.rhrBaselineStatus === 'at-baseline' && values.rhrBaseline != null && values.restingHr != null && Math.abs(values.restingHr - values.rhrBaseline) > 1) {
    values.rhrBaselineReported = values.rhrBaseline;
    warnings.push(`RHR baseline conflict: source status says at baseline, but reported baseline ${values.rhrBaseline} bpm does not match resting HR ${values.restingHr} bpm. The numerical baseline was left unknown.`);
    values.rhrBaseline = null;
    values.rhrBaselineSource = 'conflict-left-unknown';
  }

  if (values.rhrBaselineStatus === 'at-baseline') {
    if (values.rhrDeltaFromBaseline != null && Number(values.rhrDeltaFromBaseline) !== 0) warnings.push(`RHR source says at baseline, so conflicting delta ${values.rhrDeltaFromBaseline >= 0 ? '+' : ''}${values.rhrDeltaFromBaseline} bpm was blocked.`);
    values.rhrDeltaFromBaseline = null;
    values.rhrDeltaSource = 'blocked-by-at-baseline-status';
  }
  if (values.hrvBaselineStatus === 'at-baseline') values.hrvDeltaFromBaseline = null;

  // Integrity guard: a copied non-zero HRV delta must not silently become the RHR delta.
  if (values.hrvDeltaFromBaseline != null && values.rhrDeltaFromBaseline != null && Number(values.hrvDeltaFromBaseline) !== 0 && Number(values.hrvDeltaFromBaseline) === Number(values.rhrDeltaFromBaseline)) {
    const hrvSource = String(fieldSources.hrvDeltaFromBaseline || '');
    const rhrSource = String(fieldSources.rhrDeltaFromBaseline || '');
    const independentlyNamed = /hrv/i.test(hrvSource) && /(?:rhr|resting)/i.test(rhrSource);
    warnings.push(`Import integrity warning: HRV and RHR share the same non-zero delta (${values.hrvDeltaFromBaseline}). Confirm both were independently supplied.`);
    if (!independentlyNamed) {
      values.rhrDeltaFromBaseline = null;
      values.rhrBaselineStatus = values.rhrBaselineStatus === 'unknown' ? 'unknown' : values.rhrBaselineStatus;
      values.rhrDeltaSource = 'blocked-possible-cross-field-copy';
    }
  }

  if (raw.bloodPressureTime != null) extensions.bloodPressureTime = raw.bloodPressureTime;
  if (values.sleepWindow != null) extensions.sleepWindow = values.sleepWindow;
  if (values.sleepStages != null) extensions.sleepStages = structuredClone(values.sleepStages);
  if (extensions.deviceReportedMetabolicMarkers != null) extensions.deviceReportedMetabolicMarkersProvenance = 'device/app-derived estimate; not laboratory bloodwork';
  const bodyComposition = {};
  const bodyMap = ['bmi','bodyFatPercent','muscleRatePercent','bodyWaterPercent','boneMassKg','bmrKcal','proteinRatePercent','metabolicAge','visceralFatIndex','subcutaneousFatPercent','standardWeightKg','weightControlKg','fatMassKg','fatFreeMassKg','muscleMassKg','proteinMassKg','bodyScore'];
  if (values.weight != null) bodyComposition.weightKg = values.weight;
  for (const field of bodyMap) if (values[field] != null) bodyComposition[field] = values[field];
  if (Object.keys(bodyComposition).length) values.bodyComposition = bodyComposition;
  if (Object.keys(extensions).length) values.extensions = { ...(values.extensions || {}), ...extensions };
  values.baselineStatus = { hrv: values.hrvBaselineStatus || 'unknown', restingHr: values.rhrBaselineStatus || 'unknown' };
  const dedupedWarnings = [...new Set(warnings.map(item => String(item).trim()).filter(Boolean))];
  warnings.length = 0; warnings.push(...dedupedWarnings);
  values.importIntegrityWarnings = [...warnings];
  values.importFieldSources = fieldSources;

  const importedFields = Object.keys(values).filter(key => !['importIntegrityWarnings','importFieldSources'].includes(key));
  if (importedFields.length === 0) throw new Error('No supported VANTAGE vital fields were found in the Markdown file.');
  return { values, warnings, sourceFormat, importedFields, unsupportedFields: [...new Set(unsupportedFields)], fieldSources };
}
export function applyVitalsToForm(form, values, fallbackDate) {
  form.reset();
  form.elements.date.value = values.date || fallbackDate || '';
  form.elements.hrvBaseline.value = values.hrvBaseline ?? '';
  form.elements.rhrBaseline.value = values.rhrBaseline ?? '';
  if (form.elements.hrvBaselineStatus) form.elements.hrvBaselineStatus.value = values.hrvBaselineStatus || 'unknown';
  if (form.elements.rhrBaselineStatus) form.elements.rhrBaselineStatus.value = values.rhrBaselineStatus || 'unknown';

  const simpleFields = [
    'recovery', 'charge', 'restScore', 'status', 'guidance', 'synthesis', 'hrv', 'hrvBaseline', 'hrvDeltaFromBaseline', 'hrvBaselineStatus', 'restingHr',
    'rhrBaseline', 'rhrDeltaFromBaseline', 'rhrBaselineStatus', 'stress', 'stressBand', 'respiratoryRate', 'sleepHours', 'sleepPerformance', 'sleepEfficiency', 'sleepDebt', 'systolic',
    'diastolic', 'pulse', 'weight', 'dailyHydrationConsumedLitres', 'dailyHydrationTargetLitres', 'feeling', 'notes'
  ];
  for (const field of simpleFields) {
    if (values[field] != null && form.elements[field]) form.elements[field].value = values[field];
  }
  form.elements.symptoms.checked = Boolean(values.symptoms);
  // v1.3.10.2: recovery actions are owned by the Recovery screen, not the vitals import.
  // Older files may still contain recoveryActivities; they are intentionally ignored here.
}

export const VITALS_FILE_PROMPT = `Create a downloadable Markdown file for import into the VANTAGE Training Console vitals page.

File name: VANTAGE_Vitals_YYYY-MM-DD.md

Use exactly one fenced code block labelled vantage-vitals containing valid JSON in this structure:

\`\`\`vantage-vitals
{
  "schema": "vantage-vitals-v1",
  "date": "YYYY-MM-DD",
  "recovery": null,
  "charge": null,
  "restScore": null,
  "status": null,
  "guidance": null,
  "synthesis": "Peak, Building, Maintain, Steady, Balanced, Primed, Solid, Low, Draining or Depleted",
  "hrv": null,
  "hrvBaseline": null,
  "hrvDeltaFromBaseline": null,
  "hrvBaselineStatus": "known, at-baseline, above-baseline, below-baseline or unknown",
  "restingHr": null,
  "rhrBaseline": null,
  "rhrDeltaFromBaseline": null,
  "rhrBaselineStatus": "known, at-baseline, above-baseline, below-baseline or unknown",
  "stress": null,
  "stressBand": null,
  "respiratoryRate": null,
  "sleepHours": null,
  "sleepPerformance": null,
  "sleepEfficiency": null,
  "sleepDebt": null,
  "hoursVsNeededPercent": null,
  "restorativeSleepPercent": null,
  "sleepLedger": null,
  "sleepStageDetailStatus": null,
  "bloodPressure": "systolic/diastolic",
  "pulse": null,
  "weight": null,
  "dailyHydrationConsumedLitres": null,
  "dailyHydrationTargetLitres": null,
  "bloodPressureTime": null,
  "bloodPressureStatus": null,
  "weightChangeKg": null,
  "bodyFatPercent": null,
  "muscleMassKg": null,
  "bodyWaterPercent": null,
  "visceralFatIndex": null,
  "fatMassKg": null,
  "weightWithoutFatKg": null,
  "bloodOxygen": null,
  "sleepWindow": null,
  "timeInBed": null,
  "sleepStages": null,
  "sleepConsistency": null,
  "baevskyStressIndex": null,
  "autonomicBalance": null,
  "calmTimePercent": null,
  "trainingRecommendation": null,
  "nutritionTargetsApprox": null,
  "feeling": "good, average or poor",
  "symptoms": false,
  "notes": ""
}
\`\`\`

Rules:
- Use only values I actually provide; do not invent missing readings.
- Remove fields with no supplied value rather than guessing.
- Keep HRV and resting-HR deltas/statuses independent; never copy one metric’s delta into another.
- If resting HR is explicitly at baseline and no numeric delta is supplied, use rhrBaselineStatus = at-baseline and omit rhrDeltaFromBaseline.
- Preserve current sleep summary values even when detailed sleep-stage evidence has a date conflict; mark the detail status instead of deleting current totals.
- Keep blood pressure as systolic/diastolic and keep cuff pulse separate from NOOP resting HR.
- Do not include recovery actions in the vitals file; they are logged separately in VANTAGE Recovery.
- You may add a short human-readable summary outside the code block, but keep the JSON block valid.
- Return the result as an actual downloadable .md file, not only pasted chat text.`;

export function createVitalsMarkdownExample(date = new Date().toISOString().slice(0, 10)) {
  return `# VANTAGE Vitals\n\nReview the values below before importing.\n\n\`\`\`vantage-vitals\n${JSON.stringify({
    schema: 'vantage-vitals-v1', date, recovery: 78, charge: 74, restScore: 82,
    synthesis: 'Steady', hrv: 96, hrvBaseline: 90, hrvDeltaFromBaseline: 6, restingHr: 54,
    rhrBaseline: 54, rhrDeltaFromBaseline: 0, stress: 22, sleepHours: 7.4, sleepPerformance: 88,
    sleepDebt: 0.5, bloodPressure: '126/76', weight: 98, feeling: 'good',
    symptoms: false, notes: 'No unusual symptoms. Mild leg soreness.'
  }, null, 2)}\n\`\`\`\n`;
}
