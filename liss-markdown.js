import { normaliseHydrationContents, hydrationSemanticStatus, laterSourceCorrectionCandidates, ocrMediaAuthoritative } from './evidence-integrity.js';
function safe(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function signedNumber(value) {
  const direct = finiteNumber(value);
  if (direct != null) return direct;
  const match = String(value ?? '').match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function sleepDebtValue(vitals = {}) {
  if (vitals.sleepDebtToday != null && vitals.sleepDebtToday !== '') return vitals.sleepDebtToday;
  if (vitals.sleepDebtDisplay != null && vitals.sleepDebtDisplay !== '') return vitals.sleepDebtDisplay;
  const numeric = finiteNumber(vitals.sleepDebt);
  return numeric;
}

function number(value, digits = 0) {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'Not recorded';
  return numeric.toLocaleString('en-GB', { maximumFractionDigits: digits });
}

function durationLabel(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function parseDurationSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return null;
}

function activityLabel(value) {
  return ({
    'treadmill-walk': 'Treadmill walk',
    stairmaster: 'StairMaster',
    'outdoor-walk': 'Outdoor walk',
    walking: 'Walking'
  })[value] || safe(value, 'LISS / cardio');
}

function normaliseActivityType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (['treadmill-walk', 'treadmill walk', 'treadmill'].includes(text)) return 'treadmill-walk';
  if (['stairmaster', 'stair master', 'stairs'].includes(text)) return 'stairmaster';
  if (['outdoor-walk', 'outdoor walk', 'outdoor walking', 'gps walk'].includes(text)) return 'outdoor-walk';
  if (['walking', 'walk'].includes(text)) return 'walking';
  return text;
}

function metricLine(label, value, suffix = '') {
  return `- **${label}:** ${value === null || value === undefined || value === '' ? 'Not recorded' : `${value}${suffix}`}`;
}

function cleanZones(zones = {}) {
  const result = {};
  for (let zone = 1; zone <= 5; zone += 1) {
    result[`z${zone}Minutes`] = finiteNumber(zones[`z${zone}Minutes`] ?? zones[`z${zone}`]?.minutes);
    result[`z${zone}Percent`] = finiteNumber(zones[`z${zone}Percent`] ?? zones[`z${zone}`]?.percent);
  }
  return result;
}

function cleanSources(input = {}) {
  const strap = { ...(input.vantageStrap || {}), ...(input.noopStrapSessionSummary || {}), ...(input.noopStrapHrZones || {}) };
  const watch = { ...(input.watchDevice || {}), ...(input.watchDeviceExerciseSummary || {}), ...(input.watchDevicePaceSpeedCadence || {}), ...(input.outdoorWalkGpsSummary || {}) };
  const machine = { ...(input.treadmillMachine || {}), ...(input.treadmillMachineConsole || {}) };
  const ftms = { ...(input.ftmsMachine || {}), ...(input.ftmsMachineLive || {}) };
  return {
    vantageStrap: {
      sourceType: strap.sourceType || 'entered-or-analysis',
      sourceFile: strap.sourceFile || null,
      sourceSystem: strap.sourceSystem || 'NOOP',
      sensor: strap.sensor || 'noopStrap',
      sourceRole: strap.sourceRole || 'noopStrapSessionSummary',
      extractionConfidence: strap.extractionConfidence || null,
      activityShown: strap.activityShown || strap.activity || null,
      dateShown: strap.dateShown || null,
      timeRange: strap.timeRange || strap.time || null,
      durationDisplayText: strap.durationDisplayText || strap.noopDurationDisplay || null,
      durationMinutes: finiteNumber(strap.durationMinutes),
      durationMinutesDisplayed: finiteNumber(strap.durationMinutesDisplayed ?? strap.noopDurationMinutesDisplayed),
      durationMinutesFromTimeRange: finiteNumber(strap.durationMinutesFromTimeRange ?? strap.noopDurationMinutesFromTimeRange),
      distanceKm: finiteNumber(strap.distanceKm),
      avgHr: finiteNumber(strap.avgHr),
      maxHr: finiteNumber(strap.maxHr),
      minHr: finiteNumber(strap.minHr),
      calories: finiteNumber(strap.calories),
      effort: finiteNumber(strap.effort),
      hrSource: strap.hrSource || null,
      hrZones: cleanZones(strap.hrZones),
      confirmationStatus: strap.confirmationStatus || null,
      notes: strap.notes || ''
    },
    watchDevice: {
      sourceType: watch.sourceType || 'entered-or-analysis',
      sourceFile: watch.sourceFile || null,
      sourceSystem: watch.sourceSystem || 'watchDevice',
      sensor: watch.sensor || 'watchOptical',
      sourceRole: watch.sourceRole || 'watchDeviceExerciseSummary',
      extractionConfidence: watch.extractionConfidence || null,
      dateTime: watch.dateTime || null,
      duration: watch.duration || null,
      distanceKm: finiteNumber(watch.distanceKm),
      calories: finiteNumber(watch.calories),
      avgHr: finiteNumber(watch.avgHr),
      maxHr: finiteNumber(watch.maxHr),
      minHr: finiteNumber(watch.minHr),
      avgSpeedKmh: finiteNumber(watch.avgSpeedKmh),
      fastestSpeedKmh: finiteNumber(watch.fastestSpeedKmh),
      avgPacePerKm: watch.avgPacePerKm || null,
      fastestPacePerKm: watch.fastestPacePerKm || null,
      slowestPacePerKm: watch.slowestPacePerKm || null,
      steps: finiteNumber(watch.steps),
      avgCadence: finiteNumber(watch.avgCadence),
      maxCadence: finiteNumber(watch.maxCadence),
      minCadence: finiteNumber(watch.minCadence),
      pauses: finiteNumber(watch.pauses),
      pauseLength: watch.pauseLength || null,
      caloriesPerMinute: {
        max: finiteNumber(watch.caloriesPerMinute?.max),
        average: finiteNumber(watch.caloriesPerMinute?.average),
        minimum: finiteNumber(watch.caloriesPerMinute?.minimum)
      },
      notes: watch.notes || ''
    },
    treadmillMachine: {
      sourceType: machine.sourceType || 'entered-or-analysis',
      sourceFile: machine.sourceFile || null,
      sourceSystem: machine.sourceSystem || 'treadmillMachine',
      sensor: machine.sensor || 'treadmillConsole',
      sourceRole: machine.sourceRole || 'treadmillMachineConsole',
      extractionConfidence: machine.extractionConfidence || null,
      totalTime: machine.totalTime || null,
      distanceKm: finiteNumber(machine.distanceKm),
      distanceMiles: finiteNumber(machine.distanceMiles),
      calories: finiteNumber(machine.calories),
      verticalDistanceFeet: finiteNumber(machine.verticalDistanceFeet),
      avgWatts: finiteNumber(machine.avgWatts),
      avgMets: finiteNumber(machine.avgMets),
      maxSpeedKmh: finiteNumber(machine.maxSpeedKmh),
      avgSpeedKmh: finiteNumber(machine.avgSpeedKmh),
      maxSpeedMph: finiteNumber(machine.maxSpeedMph),
      avgSpeedMph: finiteNumber(machine.avgSpeedMph),
      avgPacePerKm: machine.avgPacePerKm || null,
      maxPacePerMile: machine.maxPacePerMile || null,
      avgPacePerMile: machine.avgPacePerMile || null,
      maxInclinePercent: finiteNumber(machine.maxInclinePercent),
      avgInclinePercent: finiteNumber(machine.avgInclinePercent),
      avgHr: finiteNumber(machine.avgHr),
      maxHr: finiteNumber(machine.maxHr),
      stairmasterLevel: finiteNumber(machine.stairmasterLevel),
      notes: machine.notes || ''
    },
    ftmsMachine: {
      sourceType: ftms.sourceType || 'bluetooth-ftms',
      sourceFile: ftms.sourceFile || null,
      sourceSystem: ftms.sourceSystem || 'bluetoothFTMS',
      sensor: ftms.sensor || 'fitnessMachine',
      sourceRole: ftms.sourceRole || 'ftmsMachineLive',
      profile: ftms.profile || null,
      deviceId: ftms.deviceId || null,
      deviceName: ftms.deviceName || null,
      machineType: ftms.machineType || null,
      characteristicUuid: ftms.characteristicUuid || null,
      connected: Boolean(ftms.connected),
      sampleCount: finiteNumber(ftms.sampleCount),
      firstSampleAt: ftms.firstSampleAt || null,
      lastSampleAt: ftms.lastSampleAt || ftms.capturedAt || null,
      totalTime: ftms.totalTime || null,
      elapsedSeconds: finiteNumber(ftms.elapsedSeconds),
      distanceKm: finiteNumber(ftms.distanceKm),
      calories: finiteNumber(ftms.calories),
      verticalDistanceMetres: finiteNumber(ftms.verticalDistanceMetres),
      avgWatts: finiteNumber(ftms.avgWatts),
      instantaneousWatts: finiteNumber(ftms.instantaneousWatts),
      avgMets: finiteNumber(ftms.avgMets),
      avgSpeedKmh: finiteNumber(ftms.avgSpeedKmh),
      maxSpeedKmh: finiteNumber(ftms.maxSpeedKmh),
      instantaneousSpeedKmh: finiteNumber(ftms.instantaneousSpeedKmh),
      avgInclinePercent: finiteNumber(ftms.avgInclinePercent),
      maxInclinePercent: finiteNumber(ftms.maxInclinePercent),
      instantaneousInclinePercent: finiteNumber(ftms.instantaneousInclinePercent),
      machineHr: finiteNumber(ftms.machineHr),
      floors: finiteNumber(ftms.floors),
      steps: finiteNumber(ftms.steps),
      stepsPerMinute: finiteNumber(ftms.stepsPerMinute),
      averageStepRate: finiteNumber(ftms.averageStepRate),
      rawPacketHex: ftms.rawPacketHex || null,
      notes: ftms.notes || ''
    }
  };
}


const LEGACY_MEDIA_ROLE_MAP = {
  vantageStrap: 'noopStrapSessionSummary',
  watchDevice: 'watchDeviceExerciseSummary',
  treadmillMachine: 'treadmillMachineConsole',
  other: 'unknown',
  unassigned: 'unknown'
};

const MEDIA_ROLE_METADATA = {
  noopStrapSessionSummary: { sourceSystem: 'NOOP', sensor: 'noopStrap', label: 'NOOP Strap session summary' },
  noopStrapHrZones: { sourceSystem: 'NOOP', sensor: 'noopStrap', label: 'NOOP Strap HR zones' },
  noopSessionStreamSaved: { sourceSystem: 'NOOP', sensor: 'noopAppSessionStream', label: 'NOOP saved session / route stream' },
  noopHistoricalWorkoutCard: { sourceSystem: 'NOOP', sensor: 'noopHistoricalCard', label: 'NOOP historical workout card' },
  noopDailyRecoverySnapshot: { sourceSystem: 'NOOP', sensor: 'noopStrap', label: 'NOOP daily recovery snapshot' },
  watchDeviceExerciseSummary: { sourceSystem: 'watchDevice', sensor: 'watchOptical', label: 'Watch/device exercise summary' },
  watchDevicePaceSpeedCadence: { sourceSystem: 'watchDevice', sensor: 'watchOptical', label: 'Watch pace/speed/cadence' },
  treadmillMachineConsole: { sourceSystem: 'treadmillMachine', sensor: 'treadmillConsole', label: 'Treadmill/machine console' },
  outdoorWalkGpsSummary: { sourceSystem: 'watchDevice', sensor: 'phoneGps', label: 'Outdoor walk GPS summary' },
  preLissBloodPressure: { sourceSystem: 'manualEntry', sensor: 'manualBpCuff', label: 'Pre-LISS blood pressure' },
  postLissBloodPressure: { sourceSystem: 'manualEntry', sensor: 'manualBpCuff', label: 'Post-LISS blood pressure' },
  hydrationEvidence: { sourceSystem: 'userNote', sensor: 'galleryImage', label: 'Hydration evidence' },
  nutritionEvidence: { sourceSystem: 'userNote', sensor: 'userEnteredNutrition', label: 'Nutrition evidence' },
  sessionNotes: { sourceSystem: 'userNote', sensor: 'galleryImage', label: 'Session notes' },
  unknown: { sourceSystem: 'unknown', sensor: 'unknown', label: 'Unknown / unclear' }
};

function normaliseMediaRole(role) {
  return LEGACY_MEDIA_ROLE_MAP[role] || role || 'unknown';
}

function mediaRoleMetadata(role) {
  return MEDIA_ROLE_METADATA[normaliseMediaRole(role)] || MEDIA_ROLE_METADATA.unknown;
}

function canonicalSourceBlocks(input = {}) {
  const clean = cleanSources(input);
  const watchRole = ['outdoorWalkGpsSummary', 'watchDevicePaceSpeedCadence'].includes(clean.watchDevice.sourceRole)
    ? clean.watchDevice.sourceRole
    : 'watchDeviceExerciseSummary';
  const emptyWatch = cleanSources({}).watchDevice;
  return {
    noopStrapSessionSummary: {
      ...clean.vantageStrap,
      sourceSystem: 'NOOP', sensor: 'noopStrap', sourceRole: 'noopStrapSessionSummary'
    },
    watchDeviceExerciseSummary: watchRole === 'watchDeviceExerciseSummary'
      ? { ...clean.watchDevice, sourceSystem: 'watchDevice', sensor: clean.watchDevice.sensor || 'watchOptical', sourceRole: 'watchDeviceExerciseSummary' }
      : { ...emptyWatch, sourceSystem: 'watchDevice', sensor: 'watchOptical', sourceRole: 'watchDeviceExerciseSummary' },
    watchDevicePaceSpeedCadence: watchRole === 'watchDevicePaceSpeedCadence'
      ? { ...clean.watchDevice, sourceSystem: 'watchDevice', sensor: clean.watchDevice.sensor || 'watchOptical', sourceRole: 'watchDevicePaceSpeedCadence' }
      : { ...emptyWatch, sourceSystem: 'watchDevice', sensor: 'watchOptical', sourceRole: 'watchDevicePaceSpeedCadence' },
    outdoorWalkGpsSummary: watchRole === 'outdoorWalkGpsSummary'
      ? { ...clean.watchDevice, sourceSystem: 'watchDevice', sensor: 'phoneGps', sourceRole: 'outdoorWalkGpsSummary' }
      : { ...emptyWatch, sourceSystem: 'watchDevice', sensor: 'phoneGps', sourceRole: 'outdoorWalkGpsSummary' },
    treadmillMachineConsole: {
      ...clean.treadmillMachine,
      sourceSystem: 'treadmillMachine', sensor: 'treadmillConsole', sourceRole: 'treadmillMachineConsole'
    },
    ftmsMachineLive: {
      ...clean.ftmsMachine,
      sourceSystem: 'bluetoothFTMS', sensor: 'fitnessMachine', sourceRole: 'ftmsMachineLive'
    }
  };
}

const SOURCE_METRIC_PATHS = {
  vantageStrap: [
    'activityShown', 'dateShown', 'timeRange', 'durationDisplayText', 'durationMinutes', 'durationMinutesDisplayed', 'durationMinutesFromTimeRange', 'distanceKm', 'avgHr', 'maxHr', 'minHr', 'calories', 'effort', 'hrSource',
    'hrZones.z1Minutes', 'hrZones.z1Percent', 'hrZones.z2Minutes', 'hrZones.z2Percent',
    'hrZones.z3Minutes', 'hrZones.z3Percent', 'hrZones.z4Minutes', 'hrZones.z4Percent',
    'hrZones.z5Minutes', 'hrZones.z5Percent'
  ],
  watchDevice: [
    'dateTime', 'duration', 'distanceKm', 'calories', 'avgHr', 'maxHr', 'minHr', 'avgSpeedKmh', 'fastestSpeedKmh',
    'avgPacePerKm', 'fastestPacePerKm', 'slowestPacePerKm', 'steps', 'avgCadence', 'maxCadence', 'minCadence',
    'pauses', 'pauseLength', 'caloriesPerMinute.max', 'caloriesPerMinute.average', 'caloriesPerMinute.minimum'
  ],
  treadmillMachine: [
    'totalTime', 'distanceKm', 'distanceMiles', 'calories', 'verticalDistanceFeet', 'avgWatts', 'avgMets',
    'maxSpeedKmh', 'avgSpeedKmh', 'maxSpeedMph', 'avgSpeedMph', 'avgPacePerKm', 'maxPacePerMile', 'avgPacePerMile',
    'maxInclinePercent', 'avgInclinePercent', 'avgHr', 'maxHr', 'stairmasterLevel'
  ],
  ftmsMachine: [
    'deviceName', 'machineType', 'totalTime', 'elapsedSeconds', 'distanceKm', 'calories', 'verticalDistanceMetres',
    'avgWatts', 'instantaneousWatts', 'avgMets', 'avgSpeedKmh', 'maxSpeedKmh', 'instantaneousSpeedKmh',
    'avgInclinePercent', 'maxInclinePercent', 'instantaneousInclinePercent', 'machineHr', 'floors', 'steps', 'stepsPerMinute', 'averageStepRate'
  ]
};

function nestedValue(object, path) {
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function hasMetricValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function metricValuesMatch(left, right) {
  if (!hasMetricValue(left) || !hasMetricValue(right)) return false;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return Math.abs(leftNumber - rightNumber) < 0.000001;
  }
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

/**
 * Compare app-recorded source blocks with screenshot-derived evidence.
 * Structured values remain authoritative until Steve explicitly confirms a
 * screenshot value. The returned review never mutates either input.
 */
export function compareLissSources(recordedInput = {}, evidenceInput = {}) {
  const recorded = cleanSources(recordedInput);
  const evidence = cleanSources(evidenceInput);
  const review = [];

  Object.entries(SOURCE_METRIC_PATHS).forEach(([source, paths]) => {
    paths.forEach(path => {
      const recordedValue = nestedValue(recorded[source], path);
      const evidenceValue = nestedValue(evidence[source], path);
      const hasRecorded = hasMetricValue(recordedValue);
      const hasEvidence = hasMetricValue(evidenceValue);
      if (!hasRecorded && !hasEvidence) return;
      let status = 'structured-only';
      if (!hasRecorded && hasEvidence) status = 'image-only';
      if (hasRecorded && hasEvidence) status = metricValuesMatch(recordedValue, evidenceValue) ? 'match' : 'conflict';
      review.push({
        id: `${source}:${path}`,
        source,
        path,
        status,
        recordedValue: hasRecorded ? recordedValue : null,
        evidenceValue: hasEvidence ? evidenceValue : null,
        evidenceSourceType: evidence[source]?.sourceType || 'image-extracted',
        sourceFile: evidence[source]?.sourceFile || null,
        confidence: evidence[source]?.extractionConfidence || null,
        resolution: status === 'match' ? 'matched' : (status === 'structured-only' ? 'structured' : null),
        resolvedAt: null
      });
    });
  });

  return review;
}

function sourcesToLegacyMetrics(sources = {}, fallback = {}) {
  const clean = cleanSources(sources);
  const strap = clean.vantageStrap;
  const watch = clean.watchDevice;
  const machine = clean.treadmillMachine;
  const ftms = clean.ftmsMachine;
  const durationSeconds =
    (strap.durationMinutes != null ? strap.durationMinutes * 60 : null) ??
    parseDurationSeconds(watch.duration) ??
    parseDurationSeconds(machine.totalTime) ??
    finiteNumber(ftms.elapsedSeconds) ?? parseDurationSeconds(ftms.totalTime) ??
    finiteNumber(fallback.durationSeconds);
  return {
    durationSeconds,
    avgHr: strap.avgHr ?? watch.avgHr ?? finiteNumber(fallback.avgHr),
    maxHr: strap.maxHr ?? watch.maxHr ?? finiteNumber(fallback.maxHr),
    minHr: strap.minHr ?? watch.minHr ?? finiteNumber(fallback.minHr),
    distance: watch.distanceKm ?? machine.distanceKm ?? machine.distanceMiles ?? finiteNumber(fallback.distance),
    distanceUnit: watch.distanceKm != null || machine.distanceKm != null || ftms.distanceKm != null ? 'km' : (machine.distanceMiles != null ? 'mi' : (fallback.distanceUnit || null)),
    avgSpeed: watch.avgSpeedKmh ?? machine.avgSpeedKmh ?? machine.avgSpeedMph ?? finiteNumber(fallback.avgSpeed),
    maxSpeed: watch.fastestSpeedKmh ?? machine.maxSpeedKmh ?? machine.maxSpeedMph ?? finiteNumber(fallback.maxSpeed),
    speedUnit: watch.avgSpeedKmh != null || watch.fastestSpeedKmh != null || machine.avgSpeedKmh != null || machine.maxSpeedKmh != null ? 'km/h' : (machine.avgSpeedMph != null || machine.maxSpeedMph != null ? 'mph' : (fallback.speedUnit || null)),
    avgPace: watch.avgPacePerKm ?? machine.avgPacePerKm ?? machine.avgPacePerMile ?? fallback.avgPace ?? null,
    avgIncline: machine.avgInclinePercent ?? finiteNumber(fallback.avgIncline),
    maxIncline: machine.maxInclinePercent ?? finiteNumber(fallback.maxIncline),
    level: machine.stairmasterLevel ?? finiteNumber(fallback.level),
    verticalDistanceFt: machine.verticalDistanceFeet ?? finiteNumber(fallback.verticalDistanceFt),
    steps: watch.steps ?? finiteNumber(fallback.steps),
    avgCadence: watch.avgCadence ?? finiteNumber(fallback.avgCadence),
    avgWatts: machine.avgWatts ?? finiteNumber(fallback.avgWatts),
    mets: machine.avgMets ?? finiteNumber(fallback.mets),
    machineCalories: machine.calories ?? finiteNumber(fallback.machineCalories),
    wearableCalories: watch.calories ?? finiteNumber(fallback.wearableCalories),
    strapCalories: strap.calories ?? finiteNumber(fallback.strapCalories),
    effort: strap.effort ?? finiteNumber(fallback.effort),
    hrZones: { ...cleanZones(fallback.hrZones), ...strap.hrZones }
  };
}

function readableSourceLines(title, values) {
  return [
    `### ${title}`,
    '',
    ...values,
    ''
  ];
}

function londonTimestamp(isoValue) {
  const date = new Date(isoValue || '');
  if (!Number.isFinite(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  const offset = String(parts.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
  const normalisedOffset = /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : (offset === '+1' ? '+01:00' : '+00:00');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${normalisedOffset}`;
}

function londonTimezoneAlias(isoValue) {
  const date = new Date(isoValue || '');
  if (!Number.isFinite(date.getTime())) return 'Europe/London';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' })
    .formatToParts(date).find(part => part.type === 'timeZoneName')?.value || 'Europe/London';
}

function hydrationDetails(cardio = {}) {
  const raw = cardio.hydration || {};
  const coconutWaterMl = finiteNumber(raw.coconutWaterMl);
  const waterMl = finiteNumber(raw.waterMl);
  const otherFluidMl = finiteNumber(raw.otherFluidMl ?? raw.intraFluidMl ?? raw.amountMl);
  const estimatedCarbsG = coconutWaterMl == null ? null : Math.round(coconutWaterMl * 0.044 * 10) / 10;
  const estimatedCalories = estimatedCarbsG == null ? null : Math.round(estimatedCarbsG * 4);
  const contents = normaliseHydrationContents([...(Array.isArray(raw.items) ? raw.items : []), raw.aminoAcids, raw.electrolytes]);
  const duringSession = [];
  if (coconutWaterMl != null && coconutWaterMl > 0) duringSession.push({ name: 'Coconut water', amountMl: coconutWaterMl, estimatedCarbsG, estimatedCalories, macroRelevant: true });
  if (waterMl != null && waterMl > 0) duringSession.push({ name: 'Water', amountMl: waterMl, estimatedCarbsG: 0, estimatedCalories: 0, macroRelevant: false, contents });
  if (otherFluidMl != null && otherFluidMl > 0) duringSession.push({ name: 'Water', amountMl: otherFluidMl, estimatedCarbsG: null, estimatedCalories: null, macroRelevant: false, contents });
  const supplements = contents.map(name => ({ name, amount: null, macroRelevant: false }));
  const hydrationStatus = hydrationSemanticStatus({ ...raw, items: contents, waterMl, otherFluidMl, coconutWaterMl });
  return {
    hydrationStatus,
    recorded: hydrationStatus !== 'not-recorded',
    declined: hydrationStatus === 'explicitly-none',
    reminderSkipped: raw.reminderSkipped === true,
    source: 'user-entered', duringSession, items: supplements,
    electrolytes: contents.find(value => value.toLowerCase() === 'electrolytes') || null,
    aminoAcids: contents.find(value => value.toLowerCase() === 'eaas') || null,
    notes: raw.notes || ''
  };
}

function inferCarbSource(foods = '') {
  const text = String(foods || '').toLowerCase();
  if (/sweet potato/.test(text)) return 'sweet potato';
  if (/potato/.test(text)) return 'potatoes';
  if (/rice/.test(text)) return 'rice';
  if (/cream of rice/.test(text)) return 'cream of rice';
  if (/bread|sourdough/.test(text)) return 'bread';
  return null;
}

function macroContextDetails({ meals = [], nutritionSummary = null, correction = '' } = {}) {
  const userCorrection = String(correction || '').trim();
  const correctionMatch = userCorrection.match(/meal\s*(\d+).*?(potato(?:es)?|rice|sweet potato|cream of rice).*?(?:not|instead of)\s*(rice|potato(?:es)?|sweet potato|cream of rice)/i);
  const correctedMealNumber = correctionMatch ? Number(correctionMatch[1]) : null;
  const correctedCarbSource = correctionMatch ? correctionMatch[2].toLowerCase().replace(/^potato$/, 'potatoes') : null;
  const replacedCarbSource = correctionMatch ? correctionMatch[3].toLowerCase().replace(/^potato$/, 'potatoes') : null;
  const linkedMeals = (meals || []).map(meal => {
    const mealNumber = meal.mealNumber ?? null;
    const originalFoods = meal.foods || '';
    const originalCarbSource = meal.carbSource || inferCarbSource(originalFoods);
    const isCorrectedMeal = correctedMealNumber != null && Number(mealNumber) === correctedMealNumber && correctedCarbSource;
    let foods = originalFoods;
    if (isCorrectedMeal && replacedCarbSource) {
      const replacementPatterns = {
        rice: /\b(?:cooked\s+)?rice\b/ig,
        potatoes: /\b(?:cooked\s+)?potato(?:es)?\b/ig,
        'sweet potato': /\b(?:cooked\s+)?sweet potato(?:es)?\b/ig,
        'cream of rice': /\bcream of rice\b/ig
      };
      const replacementPattern = replacementPatterns[replacedCarbSource] || null;
      const replacementLabel = correctedCarbSource === 'potatoes' ? 'cooked potatoes' : correctedCarbSource;
      if (replacementPattern) foods = originalFoods.replace(replacementPattern, replacementLabel);
    }
    return {
      mealNumber,
      time: meal.time || null,
      foods,
      originalFoods: isCorrectedMeal ? originalFoods : null,
      carbSource: isCorrectedMeal ? correctedCarbSource : originalCarbSource,
      originalCarbSource: isCorrectedMeal ? originalCarbSource : null,
      correctionApplied: Boolean(isCorrectedMeal),
      estimatedProteinG: finiteNumber(meal.protein),
      estimatedCarbsG: finiteNumber(meal.carbs),
      estimatedFatG: finiteNumber(meal.fat),
      estimatedCalories: finiteNumber(meal.calories),
      estimateStatus: isCorrectedMeal ? 'existing-estimate-needs-recalculation-after-food-correction' : 'recorded'
    };
  });
  const corrections = [];
  if (userCorrection) {
    corrections.push({
      source: 'user-entered',
      text: userCorrection,
      mealNumber: correctedMealNumber,
      correctedCarbSource,
      replacedCarbSource,
      appliedToLinkedMeal: linkedMeals.some(meal => meal.correctionApplied),
      macroEstimateStatus: 'requires-confirmed-macro-file-or-recalculation'
    });
  }
  const linked = Boolean(linkedMeals.length || nutritionSummary);
  const status = linked
    ? 'linked'
    : (nutritionSummary?.status === 'not-recorded' || nutritionSummary?.explicitlyNotRecorded ? 'not-recorded' : 'pending-import');
  return {
    linked,
    status,
    source: nutritionSummary?.macroSource || nutritionSummary?.source || (linkedMeals.length ? 'VANTAGE meals' : null),
    sourceConfidence: nutritionSummary?.sourceConfidence || null,
    meals: linkedMeals,
    dailyTotals: nutritionSummary ? {
      proteinG: finiteNumber(nutritionSummary.protein),
      carbsG: finiteNumber(nutritionSummary.carbs),
      fatG: finiteNumber(nutritionSummary.fat),
      calories: finiteNumber(nutritionSummary.calories)
    } : null,
    coachingNotes: nutritionSummary?.coachingNotes || [],
    corrections
  };
}

function sourceHasAnyValue(source = {}) {
  return Object.entries(source).some(([key, value]) => {
    if (['sourceType', 'sourceFile', 'sourceSystem', 'sensor', 'sourceRole', 'extractionConfidence', 'confirmationStatus', 'notes', 'hrSource'].includes(key)) return false;
    if (value && typeof value === 'object') return sourceHasAnyValue(value);
    return value !== null && value !== undefined && value !== '';
  });
}

function distinctSourceValues(entries = {}) {
  const present = Object.fromEntries(Object.entries(entries).filter(([, value]) => hasMetricValue(value)));
  const unique = new Set(Object.values(present).map(value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `n:${numeric}` : `s:${String(value).trim().toLowerCase()}`;
  }));
  return { present, differs: Object.keys(present).length > 1 && unique.size > 1 };
}

export function buildLissImageReadingConflicts(imageReadings = []) {
  const readings = Array.isArray(imageReadings) ? imageReadings : [];
  const fields = ['durationMinutes', 'distanceKm', 'avgHr', 'maxHr', 'minHr', 'calories', 'effort', 'timeRange'];
  const conflicts = [];
  const noopRoles = new Set(['noopStrapSessionSummary', 'noopStrapHrZones', 'noopSessionStreamSaved']);
  const groups = new Map();
  readings.forEach((reading, index) => {
    const role = normaliseMediaRole(reading?.sourceRole);
    const group = noopRoles.has(role) ? 'NOOP-current-session-evidence' : role;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ ...reading, sourceRole: role, _index: index });
  });
  for (const [group, items] of groups) {
    if (items.length < 2) continue;
    for (const field of fields) {
      const entries = {};
      items.forEach((item, index) => {
        const value = item?.metrics?.[field];
        if (!hasMetricValue(value)) return;
        entries[item.sourceFile || `${item.sourceRole || group}#${index + 1}`] = value;
      });
      const { present, differs } = distinctSourceValues(entries);
      if (!differs) continue;
      conflicts.push({
        field,
        scope: 'image-evidence',
        sourceGroup: group,
        sources: present,
        resolution: 'Preserve every screenshot reading separately. Do not merge, average or overwrite one image with another.',
        coachingPreference: field.includes('Hr') ? 'Use the confirmed NOOP Strap HR-zone summary for classification; treat saved-stream spikes as separate evidence.' : null
      });
    }
  }
  return conflicts;
}

export function buildLissSourceConflicts(sourcesInput = {}, manualDurationSeconds = null) {
  const sources = cleanSources(sourcesInput);
  const conflicts = [];
  const add = (field, entries, coachingPreference = null) => {
    const { present, differs } = distinctSourceValues(entries);
    if (!differs) return;
    conflicts.push({
      field,
      sources: present,
      resolution: 'Preserve all values by source. Do not average or overwrite.',
      coachingPreference
    });
  };

  add('calories', {
    noopStrapSessionSummary: sources.vantageStrap.calories,
    watchDeviceExerciseSummary: sources.watchDevice.calories,
    treadmillMachineConsole: sources.treadmillMachine.calories
  }, 'Use the NOOP Strap source only for HR-zone based coaching classification, not as a blended calorie estimate.');

  add('duration', {
    noopStrapSessionSummary: sources.vantageStrap.durationMinutes != null ? `${sources.vantageStrap.durationMinutes}m` : null,
    watchDeviceExerciseSummary: sources.watchDevice.duration,
    treadmillMachineConsole: sources.treadmillMachine.totalTime,
    userEnteredDuration: finiteNumber(manualDurationSeconds) != null ? durationLabel(manualDurationSeconds) : null
  }, 'Preserve all source durations and flag material differences.');

  add('averageHeartRate', {
    noopStrapSessionSummary: sources.vantageStrap.avgHr,
    watchDeviceExerciseSummary: sources.watchDevice.avgHr,
    treadmillMachineConsole: sources.treadmillMachine.avgHr
  }, 'Prefer clearly labelled NOOP Strap HR for zone classification while preserving watch and machine HR separately.');

  add('maximumHeartRate', {
    noopStrapSessionSummary: sources.vantageStrap.maxHr,
    watchDeviceExerciseSummary: sources.watchDevice.maxHr,
    treadmillMachineConsole: sources.treadmillMachine.maxHr
  }, 'Prefer clearly labelled NOOP Strap HR for zone classification while preserving watch and machine HR separately.');

  add('minimumHeartRate', {
    noopStrapSessionSummary: sources.vantageStrap.minHr,
    watchDeviceExerciseSummary: sources.watchDevice.minHr
  }, 'Preserve each device reading by source.');

  add('distance', {
    noopStrapSessionSummaryKm: sources.vantageStrap.distanceKm,
    watchDeviceExerciseSummaryKm: sources.watchDevice.distanceKm,
    treadmillMachineConsoleKm: sources.treadmillMachine.distanceKm,
    treadmillMachineConsoleMiles: sources.treadmillMachine.distanceMiles
  }, 'Do not convert or merge distances unless the source unit is explicit.');

  add('averageSpeed', {
    watchDeviceExerciseSummaryKmh: sources.watchDevice.avgSpeedKmh,
    treadmillMachineConsoleKmh: sources.treadmillMachine.avgSpeedKmh,
    treadmillMachineConsoleMph: sources.treadmillMachine.avgSpeedMph
  }, 'Keep native source units and do not blend device readings.');

  return conflicts;
}

const LISS_ANALYSIS_REQUIRED_KEYS = [
  'schema', 'sessionId', 'date', 'activityType', 'structuredSources', 'imageEvidenceSources',
  'conflicts', 'confirmationPolicy', 'classification', 'summary', 'observations', 'warnings',
  'hydration', 'preLissBloodPressure', 'imageReadings'
];

function validateLissAnalysisPayload(payload = {}) {
  const validationWarnings = [];
  const missing = LISS_ANALYSIS_REQUIRED_KEYS.filter(key => !(key in payload));
  const critical = missing.filter(key => [
    'schema', 'sessionId', 'date', 'activityType', 'structuredSources',
    'imageEvidenceSources', 'classification', 'summary', 'observations', 'warnings'
  ].includes(key));
  if (critical.length) {
    throw new Error(`The LISS analysis file is missing required field${critical.length === 1 ? '' : 's'}: ${critical.join(', ')}.`);
  }
  missing.filter(key => !critical.includes(key)).forEach(key => {
    validationWarnings.push(`${key} was missing and has been treated as an empty/default value.`);
  });
  if ('conflicts' in payload && !Array.isArray(payload.conflicts)) throw new Error('The LISS analysis conflicts field must be an array.');
  if (!Array.isArray(payload.observations)) throw new Error('The LISS analysis observations field must be an array.');
  if (!Array.isArray(payload.warnings)) throw new Error('The LISS analysis warnings field must be an array.');
  if ('imageReadings' in payload && !Array.isArray(payload.imageReadings)) throw new Error('The LISS analysis imageReadings field must be an array.');
  if (!payload.structuredSources || typeof payload.structuredSources !== 'object') throw new Error('The LISS analysis structuredSources field must be an object.');
  if (!payload.imageEvidenceSources || typeof payload.imageEvidenceSources !== 'object') throw new Error('The LISS analysis imageEvidenceSources field must be an object.');
  return validationWarnings;
}

function evidenceFiles(value) {
  return String(value || '')
    .split(/(?:,\s*|\n+|\s+\/\s+)/)
    .map(item => item.trim().replace(/^media\//i, ''))
    .filter(Boolean);
}

export function sanitiseLissAnalysisEvidence(analysis = {}, sessionDate = null) {
  const evidence = cleanSources(analysis.imageEvidenceSources || analysis.sources || {});
  const warnings = [];
  const readings = Array.isArray(analysis.imageReadings) ? analysis.imageReadings : [];
  const roles = ['vantageStrap', 'watchDevice', 'treadmillMachine'];
  const readingSource = reading => {
    const role = normaliseMediaRole(reading?.sourceRole);
    if (['noopStrapSessionSummary', 'noopStrapHrZones'].includes(role)) return 'vantageStrap';
    if (['watchDeviceExerciseSummary', 'watchDevicePaceSpeedCadence', 'outdoorWalkGpsSummary'].includes(role)) return 'watchDevice';
    if (role === 'treadmillMachineConsole') return 'treadmillMachine';
    return reading?.sourceRole;
  };

  roles.forEach(role => {
    const source = evidence[role];
    const sourceFiles = evidenceFiles(source?.sourceFile);
    const matchingReadings = readings.filter(reading => readingSource(reading) === role && (
      !sourceFiles.length || sourceFiles.some(file => String(reading?.sourceFile || '').includes(file))
    ));
    const dated = matchingReadings.filter(reading => reading?.dateShown);
    if (sessionDate && dated.length && dated.every(reading => reading.dateShown !== sessionDate)) {
      warnings.push(`${role} screenshot evidence was excluded because every dated image belongs to another day.`);
      evidence[role] = cleanSources({ [role]: { sourceType: 'image-extracted', notes: 'Excluded as wrong-date screenshot evidence.' } })[role];
      return;
    }
    const stale = sessionDate ? dated.filter(reading => reading.dateShown !== sessionDate) : [];
    if (stale.length) warnings.push(`${stale.length} ${role} image reading${stale.length === 1 ? '' : 's'} from another date were retained only as warnings and must not populate the current session.`);
  });

  return { imageEvidenceSources: evidence, warnings };
}

export function lowRecoveryLissGuardrail({ session = null, vitals = null, readiness = null, sources = {} } = {}) {
  const clean = cleanSources(sources);
  const strap = clean.vantageStrap;
  const maxHrArtifact = (session?.cardio?.sensorArtifacts || []).find(item => item.field === 'vantageStrap.maxHr' && item.excludedFromClassification === true);
  const effectiveMaxHr = maxHrArtifact ? null : strap.maxHr;
  const readinessText = `${readiness?.level || ''} ${readiness?.title || ''}`.toLowerCase();
  const recovery = finiteNumber(vitals?.recovery);
  const depleted = String(vitals?.synthesis || '').toLowerCase().includes('deplet');
  const redRecovery = readinessText.includes('red') || depleted || (recovery != null && recovery <= 15);
  const lowRecovery = redRecovery || readinessText.includes('recovery only') || (recovery != null && recovery < 40);
  const maxDuration = redRecovery ? 30 : 35;
  const duration = strap.durationMinutes ?? (parseDurationSeconds(clean.watchDevice.duration) != null ? parseDurationSeconds(clean.watchDevice.duration) / 60 : null);
  const warnings = [];
  if (lowRecovery) {
    if (duration != null && duration > maxDuration) warnings.push(`Low-recovery guardrail exceeded: ${Math.round(duration)} minutes versus a suggested 20–${maxDuration} minute cap.`);
    if (strap.avgHr != null && strap.avgHr > 100) warnings.push(`Low-recovery guardrail exceeded: average strap HR ${strap.avgHr} bpm versus a suggested 90–100 bpm.`);
    if (effectiveMaxHr != null && effectiveMaxHr > 115) warnings.push(`Low-recovery guardrail exceeded: maximum strap HR ${effectiveMaxHr} bpm versus an ideal ceiling of 110–115 bpm.`);
  }
  return {
    active: lowRecovery,
    intent: lowRecovery ? 'recovery movement, not training' : null,
    recommendedDurationMinutes: lowRecovery ? { min: 20, max: maxDuration } : null,
    recommendedAverageHrBpm: lowRecovery ? { min: 90, max: 100 } : null,
    recommendedMaxHrBpm: lowRecovery ? 115 : null,
    rawMaxHr: strap.maxHr,
    effectiveMaxHr,
    maxHrArtifact: maxHrArtifact || null,
    warnings
  };
}

export function classifyLissSession({ session = null, sources = {}, preLissBp = null, vitals = null, readiness = null } = {}) {
  const clean = cleanSources(sources);
  const strap = clean.vantageStrap;
  const machine = clean.treadmillMachine;
  const ftms = clean.ftmsMachine;
  const maxHrArtifact = (session?.cardio?.sensorArtifacts || []).find(item => item.field === 'vantageStrap.maxHr' && item.excludedFromClassification === true);
  const effectiveMaxHr = maxHrArtifact ? null : strap.maxHr;
  const zones = strap.hrZones || {};
  const zoneValue = (zone, kind) => finiteNumber(zones[`z${zone}${kind}`]);
  const z1 = zoneValue(1, 'Percent'), z2 = zoneValue(2, 'Percent');
  const higherPercents = [3,4,5].map(zone => zoneValue(zone,'Percent')).filter(value => value != null);
  const higherMinutesValues = [3,4,5].map(zone => zoneValue(zone,'Minutes')).filter(value => value != null);
  const hardPercentValues = [4,5].map(zone => zoneValue(zone,'Percent')).filter(value => value != null);
  const hardMinuteValues = [4,5].map(zone => zoneValue(zone,'Minutes')).filter(value => value != null);
  const higherZonePercent = higherPercents.reduce((sum,value)=>sum+value,0);
  const higherZoneMinutes = higherMinutesValues.reduce((sum,value)=>sum+value,0);
  const hardZonePercent = hardPercentValues.reduce((sum,value)=>sum+value,0);
  const hardZoneMinutes = hardMinuteValues.reduce((sum,value)=>sum+value,0);
  const z1z2 = (z1 != null || z2 != null) ? Number(z1 || 0) + Number(z2 || 0) : null;
  const duration = strap.durationMinutes
    ?? (parseDurationSeconds(clean.watchDevice.duration) != null ? parseDurationSeconds(clean.watchDevice.duration) / 60 : null)
    ?? (parseDurationSeconds(machine.totalTime) != null ? parseDurationSeconds(machine.totalTime) / 60 : null)
    ?? (finiteNumber(ftms.elapsedSeconds) != null ? finiteNumber(ftms.elapsedSeconds) / 60 : (parseDurationSeconds(ftms.totalTime) != null ? parseDurationSeconds(ftms.totalTime) / 60 : null));
  const activityType = normaliseActivityType(session?.cardio?.activityType || strap.activityShown);
  const walkingActivity = ['walking','outdoor-walk'].includes(activityType);
  const treadmillActivity = activityType === 'treadmill-walk';
  const reasons = [];
  if (strap.avgHr != null) reasons.push(`Average NOOP Strap HR ${strap.avgHr} bpm`);
  if (strap.maxHr != null) reasons.push(maxHrArtifact ? `Raw maximum NOOP Strap HR ${strap.maxHr} bpm retained but excluded from classification as a user-confirmed sensor artefact` : `Maximum NOOP Strap HR ${strap.maxHr} bpm`);
  if (strap.effort != null) reasons.push(`Effort ${strap.effort}`);
  if (duration != null) reasons.push(`Duration ${Math.round(duration)} minutes`);
  if (strap.distanceKm != null) reasons.push(`Distance ${strap.distanceKm} km`);
  if (z1z2 != null) reasons.push(`Z1/Z2 ${z1z2}%`);
  if (machine.avgInclinePercent != null) reasons.push(`Average machine incline ${machine.avgInclinePercent}%`);
  if (preLissBp?.systolic != null && preLissBp?.diastolic != null) reasons.push(`Pre-LISS BP ${preLissBp.systolic}/${preLissBp.diastolic}`);

  const enoughHrData = strap.avgHr != null && z1z2 != null;
  let type = 'unknown';
  if (enoughHrData) {
    const hard = higherZonePercent >= 20 || higherZoneMinutes >= 10 || Number(strap.effort || 0) >= 30 || strap.avgHr >= 125
      || (Number(effectiveMaxHr || 0) >= 150 && (hardZonePercent >= 3 || hardZoneMinutes >= 2 || higherZonePercent >= 10 || higherZoneMinutes >= 5));
    // Sustained physiology outranks isolated peak HR. This intentionally classifies
    // sessions such as 108 avg / 145 peak with almost all time in Z1-Z2 as LISS.
    const trueLiss = duration != null && duration >= 30 && duration <= 65
      && strap.avgHr >= 90 && strap.avgHr <= 112
      && z1z2 >= 95
      && higherZonePercent <= 5 && higherZoneMinutes <= 2
      && hardZoneMinutes <= 1
      && (strap.effort == null || strap.effort <= 25);
    const recoveryProfile = duration != null && duration <= 45 && strap.avgHr >= 80 && strap.avgHr <= 105
      && (z1 == null || z1 >= 70) && higherZonePercent <= 1 && higherZoneMinutes <= 1
      && (strap.effort == null || strap.effort <= 6);
    const moderate = higherZonePercent > 5 || higherZoneMinutes > 2 || strap.avgHr > 112
      || Number(strap.effort || 0) > 25 || (duration != null && duration > 65)
      || (Number(effectiveMaxHr || 0) > 145 && (higherZonePercent > 2 || higherZoneMinutes > 1));
    if (hard) type = 'hard-conditioning';
    else if (trueLiss) type = 'true-liss';
    else if (recoveryProfile && treadmillActivity) type = 'recovery-liss';
    else if (recoveryProfile && walkingActivity) type = 'recovery-walk';
    else if (moderate) type = 'moderate-conditioning';
  }

  const guardrail = lowRecoveryLissGuardrail({ session, vitals, readiness, sources: clean });
  const recovery = finiteNumber(vitals?.recovery);
  const synthesis = String(vitals?.synthesis || readiness?.title || '').toLowerCase();
  const redRecovery = (recovery != null && recovery <= 15) || synthesis.includes('deplet') || String(readiness?.level || '').toLowerCase().includes('red');
  let readinessCompliance = 'not-assessed';
  if (redRecovery) readinessCompliance = (duration != null && duration > 30) || Number(z2 || 0) > 40 || Number(strap.avgHr || 0) > 100
    ? 'above-target-for-red-recovery-day' : 'within-red-recovery-target';
  else if (guardrail.active) readinessCompliance = guardrail.warnings.length ? 'above-recovery-target' : 'within-recovery-target';
  else if (enoughHrData) readinessCompliance = 'within-target';
  if (guardrail.active) reasons.push('Readiness was low; compliance is reported separately from physiological classification.');

  const warnings = [];
  if (readinessCompliance === 'above-target-for-red-recovery-day') warnings.push('Physiologically this remained LISS, but duration/Z2 exposure was above the intended red-recovery-day brief.');
  const displayLabel = ({'recovery-liss':'Recovery LISS','recovery-walk':'Recovery walk','true-liss':'True LISS','moderate-conditioning':'Moderate LISS / conditioning-leaning','hard-conditioning':'Hard conditioning',unknown:'Unknown'})[type] || type;
  return { type, physiologicalClassification: type, displayLabel, readinessCompliance, source: 'noopStrapSessionSummary', confidence: enoughHrData ? 'high' : 'low', reasons, warnings, guardrail };
}

function lissVitalsSnapshot(vitals = null) {
  if (!vitals) return null;
  const hrv = finiteNumber(vitals.hrv), restingHr = finiteNumber(vitals.restingHr);
  const hrvDelta = signedNumber(vitals.hrvDeltaFromBaseline ?? vitals.hrvBaselineDelta);
  const rhrAtBaseline = String((vitals.rhrBaselineStatus ?? vitals.baselineStatus?.restingHr) || '').toLowerCase() === 'at-baseline';
  const rhrDelta = rhrAtBaseline ? null : signedNumber(vitals.rhrDeltaFromBaseline ?? vitals.restingHrBaselineDelta ?? vitals.rhrBaselineDelta);
  let hrvBaseline = finiteNumber(vitals.hrvBaseline), rhrBaseline = finiteNumber(vitals.rhrBaseline);
  const warnings = [];
  if (hrv != null && hrvDelta != null && hrvBaseline != null && Math.abs((hrv - hrvBaseline) - hrvDelta) > 1) { warnings.push('HRV baseline conflicts with the recorded delta; baseline left unknown.'); hrvBaseline = null; }
  if (restingHr != null && rhrDelta != null && rhrBaseline != null && Math.abs((restingHr - rhrBaseline) - rhrDelta) > 1) { warnings.push('RHR baseline conflicts with the recorded delta; baseline left unknown.'); rhrBaseline = null; }
  return {
    recovery: finiteNumber(vitals.recovery), charge: finiteNumber(vitals.charge), restScore: finiteNumber(vitals.restScore ?? vitals.rest),
    status: vitals.status || null, synthesis: vitals.synthesis || null, guidance: vitals.guidance || null,
    hrv, hrvBaseline, hrvDeltaFromBaseline: hrvDelta, hrvBaselineStatus: vitals.hrvBaselineStatus || vitals.baselineStatus?.hrv || (hrvBaseline != null ? 'known' : 'unknown'),
    restingHr, rhrBaseline, rhrDeltaFromBaseline: rhrDelta, rhrBaselineStatus: vitals.rhrBaselineStatus || vitals.baselineStatus?.restingHr || (rhrBaseline != null ? 'known' : 'unknown'),
    respiratoryRate: finiteNumber(vitals.respiratoryRate), stress: finiteNumber(vitals.stress), stressBand: vitals.stressBand || null,
    highStressTime: vitals.highStressTime || vitals.stressTimeInBand?.high || null,
    sleepHours: finiteNumber(vitals.sleepHours), sleep: vitals.sleepDisplay || vitals.sleep || null,
    sleepPerformance: finiteNumber(vitals.sleepPerformance), sleepEfficiency: finiteNumber(vitals.sleepEfficiency), sleepDebt: sleepDebtValue(vitals),
    systolic: finiteNumber(vitals.systolic), diastolic: finiteNumber(vitals.diastolic), cuffPulse: finiteNumber(vitals.cuffPulse ?? vitals.bpPulse ?? vitals.bloodPressurePulse ?? vitals.pulse),
    weight: finiteNumber(vitals.weight), notes: vitals.notes || '', baselineWarnings: [...warnings, ...(vitals.importWarnings || []), ...(vitals.importIntegrityWarnings || [])], weightChangeContext: vitals.weightChangeContext || null
  };
}

function lissSourceWarnings({ sources = {}, activityType = null, guardrail = null } = {}) {
  const clean = cleanSources(sources);
  const strap = clean.vantageStrap;
  const warnings = [];
  const duration = strap.durationMinutes;
  if (strap.calories != null && strap.calories <= 5 && duration != null && duration >= 20 && (strap.distanceKm == null || strap.distanceKm > 1)) {
    warnings.push({
      field: 'calories', source: 'noopStrapSessionSummary', value: 0, severity: 'warning',
      message: `NOOP Strap shows ${strap.calories} kcal despite ${Math.round(duration)} minutes${strap.distanceKm != null ? ` and ${strap.distanceKm} km` : ''}. Preserve as screenshot evidence but exclude it from energy-expenditure analysis.`
    });
  }
  if (guardrail?.warnings?.length) {
    guardrail.warnings.forEach(message => warnings.push({ field: 'lowRecoveryGuardrail', source: 'VANTAGE', severity: 'amber', message }));
  }
  const shown = normaliseActivityType(strap.activityShown);
  const structured = normaliseActivityType(activityType);
  if (shown && structured && shown !== structured) {
    warnings.push({
      field: 'activityType', source: 'noopStrapSessionSummary', severity: 'review',
      message: `VANTAGE records ${activityLabel(structured)}, while the NOOP screenshot shows ${activityLabel(shown)}. Preserve both until Steve confirms the correction.`,
      recommendedCorrection: structured
    });
  }
  return warnings;
}

export function createLissMarkdown({
  session,
  vitals = null,
  readiness = null,
  meals = [],
  nutritionSummary = null,
  media = [],
  generatedAt = new Date().toISOString()
}) {
  if (!session?.cardio) throw new Error('A LISS session is required.');
  const cardio = session.cardio;
  const sources = cleanSources(cardio.sources || {});
  const mediaOcrEvidence = {};
  for (const item of media || []) {
    if (!item?.ocrMetrics || !Object.keys(item.ocrMetrics).length) continue;
    const role = normaliseMediaRole(item.sourceRole);
    if (!['noopStrapSessionSummary', 'noopStrapHrZones', 'watchDeviceExerciseSummary', 'watchDevicePaceSpeedCadence', 'outdoorWalkGpsSummary', 'treadmillMachineConsole'].includes(role)) continue;
    const candidateConfirmed = ocrMediaAuthoritative(item);
    const candidate = {
      ...(item.ocrMetrics || {}),
      sourceType: candidateConfirmed ? 'ocr-confirmed' : 'ocr-evidence',
      sourceFile: item.archivePath || item.name || null,
      sourceRole: role,
      sourceSystem: item.sourceSystem || mediaRoleMetadata(role).sourceSystem,
      sensor: item.sensor || mediaRoleMetadata(role).sensor,
      extractionConfidence: item.mappingConfidence || null,
      confirmationStatus: candidateConfirmed ? 'user-confirmed-ocr' : (item.validationStatus === 'review-required' ? 'review-required' : 'screenshot-evidence-present')
    };
    const existing = mediaOcrEvidence[role];
    const existingConfirmed = existing?.confirmationStatus === 'user-confirmed-ocr';
    if (!existing || (candidateConfirmed && !existingConfirmed)) mediaOcrEvidence[role] = candidate;
  }
  const importedEvidence = cardio.analysis?.imageEvidenceSources || {};
  const imageEvidenceSources = cleanSources({
    ...mediaOcrEvidence,
    ...importedEvidence
  });
  const canonicalStructuredSources = canonicalSourceBlocks(sources);
  const canonicalImageEvidenceSources = canonicalSourceBlocks(imageEvidenceSources);
  const metrics = sourcesToLegacyMetrics(sources, cardio.metrics || {});
  const strap = sources.vantageStrap;
  const watch = sources.watchDevice;
  const machine = sources.treadmillMachine;
  const ftms = sources.ftmsMachine;
  const zones = strap.hrZones;
  const bloodPressureReadings = Array.isArray(session.bloodPressureReadings) ? session.bloodPressureReadings : [];
  const preLissBp = bloodPressureReadings.find(item => item.context === 'pre-liss') || null;
  const hydration = hydrationDetails(cardio);
  const macroContext = macroContextDetails({
    meals,
    nutritionSummary,
    correction: cardio.macroContextCorrection || cardio.nutritionCorrection || ''
  });
  const classification = classifyLissSession({ session, sources, preLissBp, vitals, readiness });
  const previousCoachClassification = cardio.analysis?.classification && cardio.analysis.classification !== 'unknown'
    ? cardio.analysis.classification : null;
  const sourceConflicts = buildLissSourceConflicts(sources, cardio.elapsedSeconds || metrics.durationSeconds);
  const guardrail = classification.guardrail || lowRecoveryLissGuardrail({ session, vitals, readiness, sources });
  const classificationWarnings = Array.isArray(classification.warnings) ? classification.warnings : [];
  const coachingNotes = [];
  if (classification.type === 'recovery-liss') {
    const caution = classificationWarnings.length
      ? `Session was acceptable as recovery-LISS, but ${classificationWarnings.join(' ')} No further training stress should be added tonight.`
      : 'Session was acceptable as recovery-LISS. Heart rate and zones stayed controlled.';
    coachingNotes.push(caution);
  }
  const lissQuality = {
    status: ['recovery-liss', 'recovery-walk', 'true-liss'].includes(classification.type) ? 'acceptable' : (classification.type === 'unknown' ? 'unknown' : 'review'),
    type: classification.type,
    physiologicalLoad: ['recovery-liss', 'recovery-walk'].includes(classification.type) ? 'low-moderate' : (classification.type === 'true-liss' ? 'moderate' : null),
    averageHrAssessment: strap.avgHr != null && strap.avgHr <= 105 ? 'good' : (strap.avgHr != null ? 'review' : 'unknown'),
    zoneAssessment: Number(zones.z3Percent || 0) + Number(zones.z4Percent || 0) + Number(zones.z5Percent || 0) === 0 && (zones.z1Percent != null || zones.z2Percent != null) ? 'good' : 'review',
    durationAssessment: strap.durationMinutes != null && strap.durationMinutes > 45 ? 'slightly long' : (strap.durationMinutes != null ? 'acceptable' : 'unknown'),
    inclineAssessment: machine.avgInclinePercent != null && machine.avgInclinePercent >= 5 ? 'slightly high for recovery brief' : (machine.avgInclinePercent != null ? 'acceptable' : 'unknown'),
    postLegDayCaution: /leg/i.test(String(cardio.previousTraining || cardio.comments || session.notes || '')) || false
  };
  const vitalsSnapshot = lissVitalsSnapshot(vitals);
  const sourceWarnings = [
    ...lissSourceWarnings({ sources, activityType: cardio.activityType, guardrail }),
    ...lissSourceWarnings({ sources: imageEvidenceSources, activityType: cardio.activityType, guardrail })
  ].filter((item, index, all) => all.findIndex(candidate => candidate.field === item.field && candidate.message === item.message) === index);
  const noopActivityLabel = imageEvidenceSources.vantageStrap.activityShown || strap.activityShown || null;
  const evidenceActivity = normaliseActivityType(noopActivityLabel);
  const recordedActivity = normaliseActivityType(cardio.activityType);
  if (evidenceActivity && recordedActivity && evidenceActivity !== recordedActivity) {
    sourceConflicts.push({
      field: 'activityType',
      sources: { vantageExport: recordedActivity, vantageActivityType: recordedActivity, noopStrapSessionSummary: evidenceActivity, noopActivityLabel },
      resolution: 'Keep the user-selected VANTAGE activity as primary and preserve the NOOP label as separate source evidence.',
      recommendedCorrection: recordedActivity
    });
  }
  const sourceMedia = media.map((item, index) => {
    const role = normaliseMediaRole(item.sourceRole);
    const roleMeta = mediaRoleMetadata(role);
    return {
      id: item.id,
      file: safe(item.archivePath, `media/${safe(item.name, `LISS_image_${index + 1}.jpg`)}`),
      sourceRole: role,
      role,
      sourceSystem: item.sourceSystem || roleMeta.sourceSystem,
      sensor: item.sensor || roleMeta.sensor,
      type: item.type || 'image/jpeg',
      size: item.size || 0,
      sha256: item.sha256 || null,
      captureSource: item.captureSource || 'unknown',
      description: item.description || '',
      fileDate: item.fileDate || null,
      dateDetected: item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate || null,
      dateMatchesSession: Boolean((item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate) && (item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate) === session.date),
      dateUserConfirmed: item.dateUserConfirmed === true || item.dateConfirmed === true,
      dateConfirmed: item.dateUserConfirmed === true || item.dateConfirmed === true,
      sessionDateMatch: !item.fileDate || item.fileDate === session.date,
      roleConfirmed: item.sourceRoleConfirmed === true || item.roleConfirmed === true,
      sourceRoleConfirmed: item.sourceRoleConfirmed === true || item.roleConfirmed === true,
      metricsValidated: item.metricsValidated === true,
      metricsUserConfirmed: item.metricsUserConfirmed === true && ocrMediaAuthoritative(item),
      metricsConfirmed: ocrMediaAuthoritative(item),
      validationStatus: item.validationStatus || (item.metricsValidated === false ? 'review-required' : null),
      ocrReviewed: item.ocrReviewed === true,
      roleAssignedAt: item.sourceRoleAssignedAt || null,
      mappingConfidence: item.mappingConfidence || (item.sourceRoleConfirmed === true ? 'user-confirmed' : 'unconfirmed'),
      extractionStatus: item.extractionStatus || 'not-extracted',
      ocrMetrics: item.ocrMetrics || null,
      ocrWarnings: item.ocrWarnings || [],
      ocrExtractedAt: item.ocrExtractedAt || null
    };
  });
  const mediaBySource = {
    noopStrapSessionSummary: sourceMedia.filter(item => ['noopStrapSessionSummary', 'noopStrapHrZones'].includes(item.role)),
    noopSessionStreamSaved: sourceMedia.filter(item => item.role === 'noopSessionStreamSaved'),
    watchDeviceExerciseSummary: sourceMedia.filter(item => ['watchDeviceExerciseSummary', 'watchDevicePaceSpeedCadence'].includes(item.role)),
    treadmillMachineConsole: sourceMedia.filter(item => item.role === 'treadmillMachineConsole'),
    outdoorWalkGpsSummary: sourceMedia.filter(item => item.role === 'outdoorWalkGpsSummary'),
    preLissBloodPressure: sourceMedia.filter(item => item.role === 'preLissBloodPressure'),
    postLissBloodPressure: sourceMedia.filter(item => item.role === 'postLissBloodPressure'),
    hydrationEvidence: sourceMedia.filter(item => item.role === 'hydrationEvidence'),
    nutritionEvidence: sourceMedia.filter(item => item.role === 'nutritionEvidence'),
    sessionNotes: sourceMedia.filter(item => item.role === 'sessionNotes'),
    unknown: sourceMedia.filter(item => item.role === 'unknown')
  };

  const lines = [
    '# VANTAGE LISS Coach Pack',
    '',
    '> This file is part of a complete VANTAGE Coach Pack ZIP. The metrics below are deliberately separated by source. Do not average conflicting readings.',
    '',
    '## Session overview',
    '',
    `- **Session ID:** ${safe(session.id)}`,
    `- **Date:** ${safe(session.date)}`,
    `- **Activity:** ${activityLabel(cardio.activityType)}`,
    `- **Timezone:** Europe/London (${londonTimezoneAlias(session.completedAt || generatedAt)})`,
    `- **Started UTC:** ${safe(session.startedAt)}`,
    `- **Started local:** ${safe(londonTimestamp(session.startedAt))}`,
    `- **Completed UTC:** ${safe(session.completedAt)}`,
    `- **Completed local:** ${safe(londonTimestamp(session.completedAt))}`,
    `- **User-entered duration:** ${durationLabel(cardio.elapsedSeconds || metrics.durationSeconds)}`,
    `- **Fasted:** ${cardio.fasted ? 'Yes' : 'No / not recorded'}`,
    `- **Nasal breathing throughout:** ${cardio.nasalBreathing ? 'Yes' : 'No'}`,
    `- **Next planned session:** ${safe(cardio.nextPlannedSession)}`,
    `- **Comments:** ${safe(cardio.comments || session.notes)}`,
    '',
    '## Readiness snapshot',
    '',
    metricLine('Readiness', readiness?.title),
    metricLine('NOOP recovery', vitalsSnapshot?.recovery, '%'),
    metricLine('Charge', vitalsSnapshot?.charge, '%'),
    metricLine('Rest', vitalsSnapshot?.restScore),
    metricLine('Status', vitalsSnapshot?.status),
    metricLine('Synthesis', vitalsSnapshot?.synthesis),
    metricLine('Guidance', vitalsSnapshot?.guidance),
    metricLine('HRV', vitalsSnapshot?.hrv, ' ms'),
    metricLine('HRV baseline', vitalsSnapshot?.hrvBaseline, ' ms'),
    metricLine('HRV delta from baseline', vitalsSnapshot?.hrvDeltaFromBaseline, ' ms'),
    metricLine('Resting HR', vitalsSnapshot?.restingHr, ' bpm'),
    metricLine('RHR baseline', vitalsSnapshot?.rhrBaseline, ' bpm'),
    metricLine('RHR delta from baseline', vitalsSnapshot?.rhrDeltaFromBaseline, ' bpm'),
    metricLine('Respiratory rate', vitalsSnapshot?.respiratoryRate, ' rpm'),
    metricLine('Stress', vitalsSnapshot?.stress),
    metricLine('Stress band', vitalsSnapshot?.stressBand),
    metricLine('High-stress time', vitalsSnapshot?.highStressTime),
    metricLine('Sleep', vitalsSnapshot?.sleep || (vitalsSnapshot?.sleepHours != null ? `${vitalsSnapshot.sleepHours} h` : null)),
    metricLine('Sleep performance', vitalsSnapshot?.sleepPerformance, '%'),
    metricLine('Sleep efficiency', vitalsSnapshot?.sleepEfficiency, '%'),
    metricLine('Sleep debt', vitalsSnapshot?.sleepDebt, ' h'),
    metricLine('Blood pressure', vitalsSnapshot?.systolic != null ? `${vitalsSnapshot.systolic}/${safe(vitalsSnapshot.diastolic, '–')}` : null, ' mmHg'),
    metricLine('Cuff pulse', vitalsSnapshot?.cuffPulse, ' bpm'),
    metricLine('Weight', vitalsSnapshot?.weight, ' kg'),
    '',
    '## Source summary',
    '',
    `- **NOOP Strap session summary values:** ${sourceHasAnyValue(strap) ? 'Populated' : 'Not populated'}`,
    `- **NOOP Strap media:** ${mediaBySource.noopStrapSessionSummary.length ? `${mediaBySource.noopStrapSessionSummary.length} file(s) attached` : 'Missing / not attached'}`,
    `- **Watch/device values:** ${sourceHasAnyValue(watch) ? 'Populated' : 'Not populated'}`,
    `- **Watch/device media:** ${mediaBySource.watchDeviceExerciseSummary.length ? `${mediaBySource.watchDeviceExerciseSummary.length} file(s) attached` : 'Missing / not attached'}`,
    `- **Treadmill/machine values:** ${sourceHasAnyValue(machine) ? 'Populated' : 'Not populated'}`,
    `- **Treadmill/machine media:** ${mediaBySource.treadmillMachineConsole.length ? `${mediaBySource.treadmillMachineConsole.length} file(s) attached` : 'Missing / not attached'}`,
    `- **Pre-LISS BP:** ${preLissBp ? 'Captured' : 'Not recorded'}`,
    `- **Hydration:** ${hydration.duringSession.length || hydration.electrolytes ? 'Captured' : 'Not recorded'}`,
    '',
    '## Source-separated LISS metrics',
    '',
    ...readableSourceLines('NOOP Strap session summary', [
      metricLine('Activity shown', strap.activityShown),
      metricLine('Date shown', strap.dateShown),
      metricLine('Time', strap.timeRange),
      metricLine('Duration', strap.durationMinutes, ' min'),
      metricLine('Distance', strap.distanceKm, ' km'),
      metricLine('Average HR', strap.avgHr, ' bpm'),
      metricLine('Maximum HR', strap.maxHr, ' bpm'),
      metricLine('Minimum HR', strap.minHr, ' bpm'),
      metricLine('Calories', strap.calories, ' kcal'),
      metricLine('Effort', strap.effort),
      metricLine('HR source', strap.hrSource),
      metricLine('Z1', zones.z1Minutes != null || zones.z1Percent != null ? `${safe(zones.z1Minutes)} min / ${safe(zones.z1Percent)}%` : null),
      metricLine('Z2', zones.z2Minutes != null || zones.z2Percent != null ? `${safe(zones.z2Minutes)} min / ${safe(zones.z2Percent)}%` : null),
      metricLine('Z3', zones.z3Minutes != null || zones.z3Percent != null ? `${safe(zones.z3Minutes)} min / ${safe(zones.z3Percent)}%` : null),
      metricLine('Z4', zones.z4Minutes != null || zones.z4Percent != null ? `${safe(zones.z4Minutes)} min / ${safe(zones.z4Percent)}%` : null),
      metricLine('Z5', zones.z5Minutes != null || zones.z5Percent != null ? `${safe(zones.z5Minutes)} min / ${safe(zones.z5Percent)}%` : null)
    ]),
    ...readableSourceLines('Watch/device exercise summary', [
      metricLine('Date/time', watch.dateTime),
      metricLine('Duration', watch.duration),
      metricLine('Distance', watch.distanceKm, ' km'),
      metricLine('Calories', watch.calories, ' kcal'),
      metricLine('Average HR', watch.avgHr, ' bpm'),
      metricLine('Maximum HR', watch.maxHr, ' bpm'),
      metricLine('Minimum HR', watch.minHr, ' bpm'),
      metricLine('Average speed', watch.avgSpeedKmh, ' km/h'),
      metricLine('Fastest speed', watch.fastestSpeedKmh, ' km/h'),
      metricLine('Average pace', watch.avgPacePerKm, '/km'),
      metricLine('Fastest pace', watch.fastestPacePerKm, '/km'),
      metricLine('Slowest pace', watch.slowestPacePerKm, '/km'),
      metricLine('Steps', watch.steps),
      metricLine('Average cadence', watch.avgCadence, ' steps/min'),
      metricLine('Maximum cadence', watch.maxCadence, ' steps/min'),
      metricLine('Minimum cadence', watch.minCadence, ' steps/min'),
      metricLine('Pauses', watch.pauses),
      metricLine('Pause length', watch.pauseLength),
      metricLine('Calories/min max', watch.caloriesPerMinute.max),
      metricLine('Calories/min average', watch.caloriesPerMinute.average),
      metricLine('Calories/min minimum', watch.caloriesPerMinute.minimum)
    ]),
    ...readableSourceLines('Treadmill/machine console', [
      metricLine('Total time', machine.totalTime),
      metricLine('Distance km', machine.distanceKm, ' km'),
      metricLine('Distance miles', machine.distanceMiles, ' mi'),
      metricLine('Calories', machine.calories, ' kcal'),
      metricLine('Vertical distance gained', machine.verticalDistanceFeet, ' ft'),
      metricLine('Average watts', machine.avgWatts, ' W'),
      metricLine('Average METs', machine.avgMets),
      metricLine('Maximum speed km/h', machine.maxSpeedKmh, ' km/h'),
      metricLine('Average speed km/h', machine.avgSpeedKmh, ' km/h'),
      metricLine('Maximum speed mph', machine.maxSpeedMph, ' mph'),
      metricLine('Average speed mph', machine.avgSpeedMph, ' mph'),
      metricLine('Average pace', machine.avgPacePerKm, ' min/km'),
      metricLine('Maximum pace', machine.maxPacePerMile, ' min/mi'),
      metricLine('Average pace', machine.avgPacePerMile, ' min/mi'),
      metricLine('Maximum incline', machine.maxInclinePercent, '%'),
      metricLine('Average incline', machine.avgInclinePercent, '%'),
      metricLine('Average machine HR', machine.avgHr, ' bpm'),
      metricLine('Maximum machine HR', machine.maxHr, ' bpm'),
      metricLine('StairMaster level', machine.stairmasterLevel)
    ]),
    ...readableSourceLines('Bluetooth fitness machine (FTMS)', [
      metricLine('Device', ftms.deviceName),
      metricLine('Machine type', ftms.machineType),
      metricLine('Samples', ftms.sampleCount),
      metricLine('Elapsed time', ftms.totalTime),
      metricLine('Distance', ftms.distanceKm, ' km'),
      metricLine('Machine calories', ftms.calories, ' kcal'),
      metricLine('Vertical distance', ftms.verticalDistanceMetres, ' m'),
      metricLine('Average watts', ftms.avgWatts, ' W'),
      metricLine('Average METs', ftms.avgMets),
      metricLine('Average speed', ftms.avgSpeedKmh, ' km/h'),
      metricLine('Maximum speed', ftms.maxSpeedKmh, ' km/h'),
      metricLine('Average incline', ftms.avgInclinePercent, '%'),
      metricLine('Maximum incline', ftms.maxInclinePercent, '%'),
      metricLine('Floors', ftms.floors),
      metricLine('Steps', ftms.steps),
      metricLine('Step rate', ftms.stepsPerMinute, ' /min')
    ]),
    '## Pre-session blood pressure',
    '',
    ...(preLissBp ? [
      metricLine('Context', 'Pre-LISS'),
      metricLine('Time', preLissBp.time),
      metricLine('Blood pressure', preLissBp.systolic != null ? `${preLissBp.systolic}/${safe(preLissBp.diastolic, '–')}` : null, ' mmHg'),
      metricLine('Pulse', preLissBp.pulse, ' bpm'),
      ''
    ] : ['Pre-LISS blood pressure was not recorded.', '']),
    '## Hydration',
    '',
    ...(hydration.duringSession.length
      ? hydration.duringSession.map(item => `- **${item.name}:** ${item.amountMl} ml${item.contents?.length ? ` · contains ${item.contents.join(' + ')}` : ''}${item.macroRelevant ? ` · estimated ${item.estimatedCarbsG} g carbs / ${item.estimatedCalories} kcal · macro-relevant` : ' · hydration only'}`)
      : [hydration.hydrationStatus === 'explicitly-none' ? 'Steve explicitly confirmed no hydration was taken.' : 'Hydration was not recorded.']),
    `- **Hydration status:** ${hydration.hydrationStatus}`,
    ...(hydration.items || []).map(item => `- **${item.name}:** amount not supplied · not counted as carbohydrate/calories`),
    ...(hydration.notes ? [`- **Notes:** ${hydration.notes}`] : []),
    '',
    '## Macro and meal context',
    '',
    ...(macroContext.linked ? [
      `- **Source:** ${safe(macroContext.source)}`,
      `- **Meals linked:** ${macroContext.meals.length}`,
      ...macroContext.meals.map(meal => `- **Meal ${safe(meal.mealNumber, '–')}:** ${safe(meal.foods)}${meal.carbSource ? ` · carb source ${meal.carbSource}` : ''}`)
    ] : ['Nutrition pending Alex macro file import.']),
    ...macroContext.corrections.map(item => `- **Steve correction:** ${item.text}${item.mealNumber ? ` · Meal ${item.mealNumber}` : ''}${item.correctedCarbSource ? ` · corrected carb source ${item.correctedCarbSource}` : ''} · macro estimate requires a corrected Alex macro file or recalculation`),
    '',
    '## Screenshot-derived evidence awaiting confirmation',
    '',
    sourceHasAnyValue(imageEvidenceSources.vantageStrap) || sourceHasAnyValue(imageEvidenceSources.watchDevice) || sourceHasAnyValue(imageEvidenceSources.treadmillMachine)
      ? 'Screenshot values from an imported Coach analysis are preserved below. They do not overwrite structured values until Steve confirms them in Source review.'
      : 'No Coach-extracted screenshot values have been imported yet.',
    '',
    ...(sourceHasAnyValue(imageEvidenceSources.vantageStrap) ? readableSourceLines('NOOP Strap screenshot evidence', [
      metricLine('Activity shown', imageEvidenceSources.vantageStrap.activityShown), metricLine('Date shown', imageEvidenceSources.vantageStrap.dateShown),
      metricLine('Time', imageEvidenceSources.vantageStrap.timeRange), metricLine('Duration', imageEvidenceSources.vantageStrap.durationMinutes, ' min'),
      metricLine('Distance', imageEvidenceSources.vantageStrap.distanceKm, ' km'),
      metricLine('Average HR', imageEvidenceSources.vantageStrap.avgHr, ' bpm'), metricLine('Maximum HR', imageEvidenceSources.vantageStrap.maxHr, ' bpm'),
      metricLine('Minimum HR', imageEvidenceSources.vantageStrap.minHr, ' bpm'), metricLine('Calories', imageEvidenceSources.vantageStrap.calories, ' kcal'), metricLine('Effort', imageEvidenceSources.vantageStrap.effort)
    ]) : []),
    ...(sourceHasAnyValue(imageEvidenceSources.watchDevice) ? readableSourceLines('Watch/device screenshot evidence', [
      metricLine('Date/time', imageEvidenceSources.watchDevice.dateTime), metricLine('Duration', imageEvidenceSources.watchDevice.duration),
      metricLine('Distance', imageEvidenceSources.watchDevice.distanceKm, ' km'), metricLine('Calories', imageEvidenceSources.watchDevice.calories, ' kcal'),
      metricLine('Average HR', imageEvidenceSources.watchDevice.avgHr, ' bpm'), metricLine('Maximum HR', imageEvidenceSources.watchDevice.maxHr, ' bpm'),
      metricLine('Average speed', imageEvidenceSources.watchDevice.avgSpeedKmh, ' km/h'), metricLine('Average pace', imageEvidenceSources.watchDevice.avgPacePerKm, '/km'), metricLine('Steps', imageEvidenceSources.watchDevice.steps)
    ]) : []),
    ...(sourceHasAnyValue(imageEvidenceSources.treadmillMachine) ? readableSourceLines('Treadmill/machine screenshot evidence', [
      metricLine('Total time', imageEvidenceSources.treadmillMachine.totalTime),
      metricLine('Distance', imageEvidenceSources.treadmillMachine.distanceKm, ' km'),
      metricLine('Distance', imageEvidenceSources.treadmillMachine.distanceMiles, ' mi'),
      metricLine('Calories', imageEvidenceSources.treadmillMachine.calories, ' kcal'),
      metricLine('Vertical distance', imageEvidenceSources.treadmillMachine.verticalDistanceFeet, ' ft'),
      metricLine('Average watts', imageEvidenceSources.treadmillMachine.avgWatts, ' W'),
      metricLine('Average METs', imageEvidenceSources.treadmillMachine.avgMets),
      metricLine('Maximum speed', imageEvidenceSources.treadmillMachine.maxSpeedMph, ' mph'),
      metricLine('Average speed', imageEvidenceSources.treadmillMachine.avgSpeedMph, ' mph'),
      metricLine('Maximum pace', imageEvidenceSources.treadmillMachine.maxPacePerMile, ' min/mi'),
      metricLine('Average pace', imageEvidenceSources.treadmillMachine.avgPacePerMile, ' min/mi'),
      metricLine('Maximum incline', imageEvidenceSources.treadmillMachine.maxInclinePercent, '%'),
      metricLine('Average incline', imageEvidenceSources.treadmillMachine.avgInclinePercent, '%'),
      metricLine('Average machine HR', imageEvidenceSources.treadmillMachine.avgHr, ' bpm'),
      metricLine('Maximum machine HR', imageEvidenceSources.treadmillMachine.maxHr, ' bpm')
    ]) : []),
    '## Classification',
    '',
    `- **Physiological classification:** ${classification.physiologicalClassification || classification.type}`,
    `- **Readiness compliance:** ${classification.readinessCompliance || 'not-assessed'}`,
    ...(previousCoachClassification ? [`- **Previous imported Coach classification:** ${previousCoachClassification} (retained as historical analysis; current physiology recalculated)`] : []),
    `- **Source:** ${classification.source}`,
    `- **Confidence:** ${classification.confidence || 'unknown'}`,
    ...classification.reasons.map(reason => `- ${reason}`),
    ...classificationWarnings.map(warning => `- **Caution:** ${warning}`),
    ...coachingNotes.map(note => `- **Coaching note:** ${note}`),
    ...(guardrail.active ? [
      '',
      '### Low-recovery guardrail',
      '',
      '- **Intent:** Recovery movement, not training',
      `- **Suggested LISS cap:** ${guardrail.recommendedDurationMinutes?.min ?? 20}–${guardrail.recommendedDurationMinutes?.max ?? 35} minutes`,
      '- **Suggested average HR:** 90–100 bpm',
      '- **Suggested maximum HR:** ideally under 110–115 bpm',
      ...guardrail.warnings.map(warning => `- **Warning:** ${warning}`)
    ] : []),
    '',
    '## Attached screenshots',
    ''
  ];

  if (sourceMedia.length) {
    const roleLabels = {
      noopStrapSessionSummary: 'NOOP Strap evidence',
      noopSessionStreamSaved: 'NOOP saved-session / route evidence',
      watchDeviceExerciseSummary: 'Watch/device evidence',
      treadmillMachineConsole: 'Treadmill/machine console evidence',
      outdoorWalkGpsSummary: 'Outdoor GPS evidence',
      preLissBloodPressure: 'Pre-LISS blood pressure evidence',
      postLissBloodPressure: 'Post-LISS blood pressure evidence',
      hydrationEvidence: 'Hydration evidence',
      nutritionEvidence: 'Nutrition evidence',
      sessionNotes: 'Session-note evidence',
      unknown: 'Unknown / unconfirmed evidence'
    };
    Object.entries(mediaBySource).forEach(([role, items]) => {
      if (!items.length) return;
      lines.push(`### ${roleLabels[role]}`, '');
      items.forEach((item, index) => {
        const checksum = item.sha256 ? ` · SHA-256 ${item.sha256}` : '';
        const roleState = item.roleConfirmed ? ' · role confirmed by Steve' : ' · role not confirmed';
        lines.push(`${index + 1}. **${item.file}** — role **${item.role}**${roleState} · system **${item.sourceSystem}** · sensor **${item.sensor}** · ${item.type} · ${number(item.size / 1024, 0)} KB · capture ${item.captureSource}${item.fileDate ? ` · file date ${item.fileDate}${item.fileDate === session.date ? '' : ' (different from session date)'}` : ''}${checksum}`);
      });
      lines.push('');
    });
  } else {
    lines.push('No screenshots were attached to this session.');
  }

  const imageReadingTemplate = sourceMedia.map(item => ({
    sourceFile: item.file,
    sourceRole: item.role,
    sourceSystem: item.sourceSystem,
    sensor: item.sensor,
    sourceRoleConfirmed: item.roleConfirmed,
    mappingConfidence: item.mappingConfidence,
    dateShown: item.dateDetected || item.fileDate || null,
    dateDetected: item.dateDetected || null,
    dateMatchesSession: item.dateMatchesSession,
    dateUserConfirmed: item.dateUserConfirmed,
    metricsValidated: item.metricsValidated,
    metricsUserConfirmed: item.metricsUserConfirmed,
    validationStatus: item.validationStatus,
    metrics: item.ocrMetrics || {},
    extractionWarnings: item.ocrWarnings || []
  }));

  sourceConflicts.push(...buildLissImageReadingConflicts(imageReadingTemplate));
  const correctionCandidates = laterSourceCorrectionCandidates(imageReadingTemplate);

  const userDurationMinutes = finiteNumber(cardio.manualDurationMinutes)
    ?? (finiteNumber(cardio.elapsedSeconds) != null ? finiteNumber(cardio.elapsedSeconds) / 60 : null)
    ?? (finiteNumber(metrics.durationSeconds) != null ? finiteNumber(metrics.durationSeconds) / 60 : null);
  const actualSessionTime = {
    userEnteredDuration: userDurationMinutes != null ? durationLabel(Math.round(userDurationMinutes * 60)) : null,
    userEnteredDurationMinutes: userDurationMinutes,
    manualStartTime: cardio.manualStartTime || null,
    manualEndTime: cardio.manualEndTime || null,
    noopTimeRange: strap.timeRange || null,
    noopDurationDisplay: strap.durationDisplayText || (strap.durationMinutesDisplayed != null ? `${strap.durationMinutesDisplayed}m` : null),
    noopDurationMinutesDisplayed: finiteNumber(strap.durationMinutesDisplayed ?? strap.durationMinutes),
    noopDurationMinutesFromTimeRange: finiteNumber(strap.durationMinutesFromTimeRange),
    noopDuration: finiteNumber(strap.durationMinutes),
    machineDuration: machine.totalTime || null,
    ftmsDuration: ftms.totalTime || (ftms.elapsedSeconds != null ? durationLabel(ftms.elapsedSeconds) : null),
    ftmsFirstSampleAt: ftms.firstSampleAt || null,
    ftmsLastSampleAt: ftms.lastSampleAt || null,
    appSessionStarted: londonTimestamp(session.startedAt),
    appSessionCompleted: londonTimestamp(session.completedAt),
    appStartedAtLocal: londonTimestamp(session.startedAt),
    appCompletedAtLocal: londonTimestamp(session.completedAt)
  };
  const exportTime = { generatedAtUtc: generatedAt, generatedAtLocal: londonTimestamp(generatedAt) };
  const sourceCompleteness = {
    morningVitals: Boolean(vitalsSnapshot),
    noopActivitySummary: mediaBySource.noopStrapSessionSummary.length > 0 || sourceHasAnyValue(sources.vantageStrap),
    noopSavedStream: mediaBySource.noopSessionStreamSaved.length > 0,
    watchDevice: mediaBySource.watchDeviceExerciseSummary.length > 0 || sourceHasAnyValue(sources.watchDevice),
    machineConsole: mediaBySource.treadmillMachineConsole.length > 0 || sourceHasAnyValue(sources.treadmillMachine),
    bluetoothFtms: sourceHasAnyValue(sources.ftmsMachine),
    preLissBloodPressure: Boolean(preLissBp),
    hydration: hydration.hydrationStatus !== 'not-recorded',
    macros: macroContext?.status && macroContext.status !== 'not-recorded'
  };

  const coachPayload = {
    schema: 'vantage-liss-analysis-v3',
    sessionId: session.id,
    date: session.date,
    activityType: cardio.activityType,
    timezone: 'Europe/London',
    localTimezoneAlias: londonTimezoneAlias(session.completedAt || generatedAt),
    startedAtUtc: session.startedAt || null,
    completedAtUtc: session.completedAt || null,
    startedAtLocal: londonTimestamp(session.startedAt),
    completedAtLocal: londonTimestamp(session.completedAt),
    actualSessionTime,
    exportTime,
    bloodPressureReadings,
    preLissBloodPressure: preLissBp || {},
    hydration,
    macroContext,
    lissQuality,
    coachingNotes,
    structuredSources: canonicalStructuredSources,
    imageEvidenceSources: canonicalImageEvidenceSources,
    legacyStructuredSources: sources,
    legacyImageEvidenceSources: imageEvidenceSources,
    conflicts: sourceConflicts,
    correctionCandidates,
    confirmationPolicy: 'Structured values remain authoritative. Return screenshot-derived values separately and never replace a structured value unless Steve confirms the screenshot as the correction.',
    classification: classification.type,
    physiologicalClassification: classification.physiologicalClassification || classification.type,
    readinessCompliance: classification.readinessCompliance || 'not-assessed',
    previousCoachClassification,
    summary: '',
    observations: [],
    warnings: [...guardrail.warnings, ...classificationWarnings, ...sourceWarnings.map(item => item.message), ...(vitalsSnapshot?.baselineWarnings || [])],
    sourceWarnings,
    vitalsSnapshot,
    sensorArtifacts: structuredClone(session.cardio?.sensorArtifacts || []),
    sourceCompleteness,
    imageReadings: imageReadingTemplate
  };

  const machinePayload = {
    schema: 'vantage-liss-coach-pack-v4',
    app: 'VANTAGE Training Console',
    generatedAt,
    date: session.date,
    sessionId: session.id,
    sessionType: activityLabel(cardio.activityType),
    activityType: cardio.activityType,
    fasted: Boolean(cardio.fasted),
    nasalBreathing: Boolean(cardio.nasalBreathing),
    nextPlannedSession: cardio.nextPlannedSession || null,
    manualDurationSeconds: cardio.elapsedSeconds || metrics.durationSeconds || null,
    timezone: 'Europe/London',
    localTimezoneAlias: londonTimezoneAlias(session.completedAt || generatedAt),
    startedAtUtc: session.startedAt || null,
    completedAtUtc: session.completedAt || null,
    startedAtLocal: londonTimestamp(session.startedAt),
    completedAtLocal: londonTimestamp(session.completedAt),
    actualSessionTime,
    exportTime,
    structuredSources: {
      userEnteredDuration: {
        sourceSystem: 'VANTAGE', sensor: 'manualEntry', sourceRole: 'userEnteredDuration',
        startedAtLocal: londonTimestamp(session.startedAt), completedAtLocal: londonTimestamp(session.completedAt),
        manualDuration: durationLabel(cardio.elapsedSeconds || metrics.durationSeconds || 0), manualDurationSeconds: cardio.elapsedSeconds || metrics.durationSeconds || null
      },
      ...canonicalStructuredSources
    },
    imageEvidenceSources: canonicalImageEvidenceSources,
    legacyStructuredSources: sources,
    legacyImageEvidenceSources: imageEvidenceSources,
    sources: canonicalStructuredSources,
    bloodPressureReadings,
    hydration,
    macroContext,
    lissQuality,
    coachingNotes,
    calorieSources: {
      noopStrapSessionSummary: strap.calories,
      watchDeviceExerciseSummary: watch.calories,
      treadmillMachineConsole: machine.calories,
      ftmsMachineLive: ftms.calories,
      selectedForCoaching: strap.calories != null ? 'noopStrapSessionSummary' : null,
      selectionReason: strap.calories != null ? 'NOOP Strap is preferred for physiological load; treadmill calories remain a separate machine estimate.' : null
    },
    durationSources: {
      noopStrapSessionSummary: strap.durationMinutes != null ? `${strap.durationMinutes}m` : null,
      watchDeviceExerciseSummary: watch.duration,
      treadmillMachineConsole: machine.totalTime,
      ftmsMachineLive: ftms.totalTime || (ftms.elapsedSeconds != null ? durationLabel(ftms.elapsedSeconds) : null),
      userEnteredDuration: durationLabel(cardio.elapsedSeconds || 0)
    },
    heartRatePolicy: { preferredZoneSource: 'noopStrapSessionSummary', preserveWatchHeartRate: true, doNotOverwriteStrapWithWatch: true },
    sourceRoleDefinitions: {
      noopStrapSessionSummary: 'NOOP strap HR session card containing time, duration, HR, distance, effort and HR zones.',
      watchDeviceExerciseSummary: 'Watch or phone exercise detail containing device-derived pace, speed, steps and cadence.',
      treadmillMachineConsole: 'Photo of a treadmill or cardio-machine console.',
      ftmsMachineLive: 'Live Bluetooth Fitness Machine Service (FTMS) data. Keep separate from console-photo OCR.',
      outdoorWalkGpsSummary: 'GPS or outdoor-walk summary with route, distance, pace or speed.',
      noopSessionStreamSaved: 'NOOP saved-session or route screen. Preserve separately from the Strap HR-zone summary and never use a brief peak alone to force hard-conditioning classification.',
      userEnteredDuration: 'Manual duration and optional start/end times entered by Steve.'
    },
    sourceBadges: [...new Set(['Manual Duration', ...(sourceHasAnyValue(ftms) ? ['Bluetooth FTMS'] : []), ...sourceMedia.map(item => mediaRoleMetadata(item.role).label)])],
    sourceCompleteness,
    sensorArtifacts: structuredClone(session.cardio?.sensorArtifacts || []),
    primaryHrZoneSource: 'noopStrapSessionSummary',
    conflictPolicy: { doNotAverageCalories: true, preserveSourceDurations: true, doNotOverwriteStructuredValuesWithoutConfirmation: true },
    sourceConflicts,
    correctionCandidates,
    sourceWarnings,
    vitalsSnapshot,
    classification,
    lowRecoveryGuardrail: guardrail,
    mediaBySource,
    legacyMetrics: metrics,
    analysisHints: {
      preferredHrSource: 'noopStrapSessionSummary',
      doNotAverageCalories: true,
      structuredValuesAreAuthoritative: true,
      preserveScreenshotConflicts: true,
      overwriteRequiresSteveConfirmation: true,
      imageRolesConfirmedBySteve: sourceMedia.every(item => item.roleConfirmed && item.role !== 'unassigned'),
      classificationInputs: ['duration', 'avgHr', 'hrZones', 'incline', 'pace', 'nasalBreathing', 'readiness', 'nextPlannedSession']
    },
    media: sourceMedia,
    session,
    vitals,
    readiness
  };

  lines.push(
    '',
    '## Analysis instructions for Alex',
    '',
    '1. Treat `structuredSources` as the app-recorded source of truth. Inspect every mapped image only to verify values or provide separate screenshot evidence.',
    '2. Put screenshot-derived readings in `imageEvidenceSources`. If a screenshot conflicts with a structured value, preserve both and add a conflict entry. Never silently replace the structured value.',
    '3. Keep NOOP Strap, watch/device, outdoor GPS and treadmill/machine readings separate. Never average incompatible calorie, distance, duration or heart-rate values.',
    '4. A screenshot value may become the primary app value only after Steve explicitly confirms it in VANTAGE. The Coach analysis must not claim that confirmation has occurred.',
    '5. Map each image using its confirmed media role. If `roleConfirmed` is false, treat the role as uncertain and flag it. If a value is obscured or ambiguous, return `null` and explain the uncertainty rather than guessing.',
    '6. Prefer clearly labelled NOOP Strap data for heart-rate zones while preserving watch and machine figures under their own source.',
    '7. Preserve morning BP and pre-LISS BP as separate readings. Include recorded hydration; coconut water is macro-relevant and plain water is hydration-only.',
    '8. Classify the work as `recovery-liss`, `true-liss`, `recovery-walk`, `moderate-conditioning`, `hard-conditioning` or `unknown` using the hardened thresholds, readiness and Steve’s next planned training. A brief maximum-HR spike without meaningful Z3-Z5 time must not by itself trigger hard conditioning.',
    '9. Reject stale screenshot evidence from another date. Never carry old imported image readings into the current session.',
    '10. Validate every required top-level field, preserve UTC and Europe/London local time, and create exactly one fenced `vantage-liss-analysis` block.',
    '',
    '```vantage-liss-analysis',
    JSON.stringify(coachPayload, null, 2),
    '```',
    '',
    '<details>',
    '<summary>Machine-readable source data</summary>',
    '',
    '```json',
    JSON.stringify(machinePayload, null, 2),
    '```',
    '',
    '</details>',
    ''
  );

  return lines.join('\n');
}

export function lissMarkdownFilename(session) {
  const activity = activityLabel(session?.cardio?.activityType)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `VANTAGE_LISS_${safe(session?.date, 'Undated')}_${activity || 'Cardio'}.md`;
}

function extractPayload(text) {
  const source = String(text || '').trim();
  const fencedMatches = [...source.matchAll(/```vantage-liss-analysis\s*([\s\S]*?)```/gi)];
  if (fencedMatches.length > 1) throw new Error('The LISS analysis file contains more than one vantage-liss-analysis block.');
  if (fencedMatches.length === 1) return JSON.parse(fencedMatches[0][1].trim());
  const generic = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (generic) return JSON.parse(generic[1].trim());
  return JSON.parse(source);
}

function legacyMetricsToSources(metrics = {}) {
  return cleanSources({
    vantageStrap: {
      durationMinutes: finiteNumber(metrics.durationSeconds) != null ? finiteNumber(metrics.durationSeconds) / 60 : null,
      avgHr: metrics.avgHr,
      maxHr: metrics.maxHr,
      minHr: metrics.minHr,
      calories: metrics.strapCalories,
      effort: metrics.effort,
      hrZones: metrics.hrZones || {}
    },
    watchDevice: {
      dateTime: metrics.dateTime || null,
      distanceKm: metrics.distanceUnit === 'km' ? metrics.distance : null,
      calories: metrics.wearableCalories,
      avgSpeedKmh: metrics.speedUnit === 'km/h' ? metrics.avgSpeed : null,
      fastestSpeedKmh: metrics.speedUnit === 'km/h' ? metrics.maxSpeed : null,
      avgPacePerKm: metrics.distanceUnit === 'km' ? metrics.avgPace : null,
      steps: metrics.steps,
      avgCadence: metrics.avgCadence,
      maxCadence: metrics.maxCadence,
      minCadence: metrics.minCadence
    },
    treadmillMachine: {
      distanceKm: metrics.distanceUnit === 'km' ? metrics.distance : null,
      distanceMiles: metrics.distanceUnit === 'mi' ? metrics.distance : null,
      calories: metrics.machineCalories,
      avgSpeedKmh: metrics.speedUnit === 'km/h' ? metrics.avgSpeed : null,
      maxSpeedKmh: metrics.speedUnit === 'km/h' ? metrics.maxSpeed : null,
      avgSpeedMph: metrics.speedUnit === 'mph' ? metrics.avgSpeed : null,
      maxSpeedMph: metrics.speedUnit === 'mph' ? metrics.maxSpeed : null,
      avgPacePerKm: metrics.distanceUnit === 'km' ? metrics.avgPace : null,
      avgPacePerMile: metrics.distanceUnit === 'mi' ? metrics.avgPace : null,
      avgInclinePercent: metrics.avgIncline,
      maxInclinePercent: metrics.maxIncline,
      stairmasterLevel: metrics.level,
      verticalDistanceFeet: metrics.verticalDistanceFt,
      avgWatts: metrics.avgWatts,
      avgMets: metrics.mets
    }
  });
}

export function parseLissAnalysisMarkdown(text) {
  const payload = extractPayload(text);
  if (!['vantage-liss-analysis-v1', 'vantage-liss-analysis-v2', 'vantage-liss-analysis-v3'].includes(payload?.schema)) {
    throw new Error('The file is not a VANTAGE LISS analysis file.');
  }
  if (!payload.sessionId) throw new Error('The LISS analysis file has no sessionId.');
  const validationWarnings = payload.schema === 'vantage-liss-analysis-v3' ? validateLissAnalysisPayload(payload) : [];
  const structuredSources = payload.schema === 'vantage-liss-analysis-v3'
    ? cleanSources(payload.structuredSources || {})
    : cleanSources({});
  const imageEvidenceSources = payload.schema === 'vantage-liss-analysis-v3'
    ? cleanSources(payload.imageEvidenceSources || payload.sources || {})
    : (payload.schema === 'vantage-liss-analysis-v2'
      ? cleanSources(payload.sources || {})
      : legacyMetricsToSources(payload.metrics || {}));
  const metrics = sourcesToLegacyMetrics(imageEvidenceSources, payload.metrics || {});
  return {
    schema: payload.schema,
    sessionId: String(payload.sessionId),
    date: payload.date || null,
    activityType: payload.activityType || null,
    timezone: payload.timezone || null,
    localTimezoneAlias: payload.localTimezoneAlias || null,
    startedAtUtc: payload.startedAtUtc || null,
    completedAtUtc: payload.completedAtUtc || null,
    startedAtLocal: payload.startedAtLocal || null,
    completedAtLocal: payload.completedAtLocal || null,
    structuredSources,
    imageEvidenceSources,
    sources: imageEvidenceSources,
    metrics,
    conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [],
    confirmationPolicy: String(payload.confirmationPolicy || ''),
    classification: ['true-liss', 'moderate-conditioning', 'hard-conditioning', 'recovery-walk', 'recovery-liss', 'unknown'].includes(payload.classification) ? payload.classification : 'unknown',
    summary: String(payload.summary || ''),
    observations: Array.isArray(payload.observations) ? payload.observations.map(String) : [],
    warnings: [...(Array.isArray(payload.warnings) ? payload.warnings.map(String) : []), ...validationWarnings],
    hydration: payload.hydration && typeof payload.hydration === 'object' ? payload.hydration : {},
    preLissBloodPressure: payload.preLissBloodPressure && typeof payload.preLissBloodPressure === 'object' ? payload.preLissBloodPressure : {},
    imageReadings: Array.isArray(payload.imageReadings) ? payload.imageReadings : [],
    validationWarnings
  };
}

export { cleanSources, sourcesToLegacyMetrics, legacyMetricsToSources, validateLissAnalysisPayload };
