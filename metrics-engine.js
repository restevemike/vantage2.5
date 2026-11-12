import { canonicalExerciseIdentity, exerciseCompatibility, strengthSessionFamilyKey } from './workout-history.js?v=1.4.3';
const DAY_MS = 86400000;

export function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function utcDay(value) {
  const key = dateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function rangeStartDate(range, endDate) {
  const end = utcDay(endDate);
  if (end == null || range === 'all') return null;
  const days = ({ '7d': 7, '28d': 28, '90d': 90, '365d': 365 })[range] || 28;
  return new Date(end - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function inDateRange(value, range, endDate) {
  const key = dateKey(value);
  if (!key) return false;
  const start = rangeStartDate(range, endDate);
  return start == null ? key <= endDate : key >= start && key <= endDate;
}

export function isRestSession(session) {
  return Boolean(session && (session.category === 'rest' || session.templateId === 'rest-day'));
}

export function isCardioSession(session) {
  return Boolean(session && (session.category === 'cardio' || session.templateId === 'liss' || session.cardio));
}

export function isStrengthSession(session) {
  return Boolean(session && !isRestSession(session) && !isCardioSession(session) && Array.isArray(session.exercises));
}

export function sessionDurationSeconds(session) {
  if (isCardioSession(session)) {
    return Number(session.cardio?.elapsedSeconds || session.cardio?.metrics?.durationSeconds || 0);
  }
  const start = Date.parse(session?.startedAt || '');
  const end = Date.parse(session?.completedAt || '');
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 1000) : 0;
}

export function estimate1RM(weight, reps, formula = 'epley') {
  const load = Number(weight || 0);
  const count = Number(reps || 0);
  if (!(load > 0) || !(count > 0)) return 0;
  if (count === 1) return load;
  if (formula === 'brzycki') return count < 37 ? load * 36 / (37 - count) : 0;
  if (formula === 'lander') return load * 100 / (101.3 - 2.67123 * count);
  return load * (1 + count / 30);
}

export function rirFromRpe(rpe) {
  const value = Number(rpe);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, 10 - value));
}

export function estimatedEffectiveReps(reps, rpe) {
  const count = Math.max(0, Number(reps || 0));
  const rir = rirFromRpe(rpe);
  if (!count || rir == null) return 0;
  // Heuristic only: the final ~5 reps near failure are treated as the likely
  // high-stimulus portion. This is deliberately labelled an estimate in the UI.
  return Math.max(0, Math.min(count, Math.round(5 - rir)));
}

function normaliseName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function exerciseLookup(exercises = []) {
  const byId = new Map();
  const byName = new Map();
  for (const item of exercises) {
    if (item?.id) byId.set(item.id, item);
    if (item?.name) byName.set(normaliseName(item.name), item);
  }
  return { byId, byName };
}

export function exerciseMeta(exercise, lookup) {
  return lookup.byId.get(exercise?.sourceExerciseId)
    || lookup.byId.get(exercise?.id)
    || lookup.byName.get(normaliseName(exercise?.name))
    || null;
}

export function flattenStrengthSets(sessions = [], exercises = [], range = '28d', endDate = new Date().toISOString().slice(0, 10)) {
  const lookup = exerciseLookup(exercises);
  const rows = [];
  for (const session of sessions) {
    if (!isStrengthSession(session) || !inDateRange(session.date, range, endDate)) continue;
    const durationSeconds = sessionDurationSeconds(session);
    for (const exercise of session.exercises || []) {
      const meta = exerciseMeta(exercise, lookup);
      for (const set of exercise.sets || []) {
        const weightKg = Number(set.weightKg || 0);
        const reps = Number(set.reps || 0);
        const rpe = Number(set.rpe);
        const warmup = String(set.setType || '').toLowerCase().includes('warm');
        rows.push({
          date: session.date,
          sessionId: session.id,
          sessionType: session.sessionType,
          durationSeconds,
          exerciseId: meta?.id || exercise.sourceExerciseId || exercise.id,
          comparisonStreamId: canonicalExerciseIdentity({ ...exercise, ...(meta || {}) }),
          exerciseName: exercise.name,
          bodyGroup: meta?.bodyGroup || session.sessionType || 'Unclassified',
          equipment: meta?.equipment || '',
          setType: set.setType || 'Work',
          warmup,
          weightKg,
          reps,
          rpe: Number.isFinite(rpe) ? rpe : null,
          rir: rirFromRpe(rpe),
          failure: Boolean(set.failure),
          volume: weightKg * reps,
          effectiveReps: warmup ? 0 : estimatedEffectiveReps(reps, rpe)
        });
      }
    }
  }
  return rows;
}

export function metricsOverview(sessions = [], exercises = [], range = '28d', endDate) {
  const strengthSessions = sessions.filter(item => isStrengthSession(item) && inDateRange(item.date, range, endDate));
  const cardioSessions = sessions.filter(item => isCardioSession(item) && inDateRange(item.date, range, endDate));
  const rows = flattenStrengthSets(sessions, exercises, range, endDate);
  const workRows = rows.filter(item => !item.warmup);
  const loadedRows = rows.filter(item => item.volume > 0);
  const rpeRows = workRows.filter(item => item.rpe != null);
  const totalSeconds = [...strengthSessions, ...cardioSessions].reduce((sum, item) => sum + sessionDurationSeconds(item), 0);
  const volume = loadedRows.reduce((sum, item) => sum + item.volume, 0);
  const workVolume = workRows.reduce((sum, item) => sum + item.volume, 0);
  const effectiveReps = workRows.reduce((sum, item) => sum + item.effectiveReps, 0);
  return {
    strengthSessions: strengthSessions.length,
    cardioSessions: cardioSessions.length,
    trainingDays: new Set([...strengthSessions, ...cardioSessions].map(item => item.date)).size,
    workSets: workRows.length,
    loadedSets: loadedRows.length,
    volume,
    workVolume,
    effectiveReps,
    avgRpe: rpeRows.length ? rpeRows.reduce((sum, item) => sum + item.rpe, 0) / rpeRows.length : null,
    avgRir: rpeRows.length ? rpeRows.reduce((sum, item) => sum + item.rir, 0) / rpeRows.length : null,
    failureRate: workRows.length ? 100 * workRows.filter(item => item.failure).length / workRows.length : 0,
    totalSeconds,
    density: totalSeconds > 0 ? volume / (totalSeconds / 60) : null
  };
}

export function exerciseNames(sessions = []) {
  const names = new Map();
  for (const session of sessions) {
    if (!isStrengthSession(session)) continue;
    for (const exercise of session.exercises || []) {
      const stream = canonicalExerciseIdentity(exercise);
      if (stream && !names.has(stream)) names.set(stream, exercise.name || exercise.coreExercise || 'Exercise');
    }
  }
  return [...new Set(names.values())].sort((a, b) => a.localeCompare(b, 'en-GB'));
}

export function exerciseProgress(sessions = [], exerciseName, range = 'all', endDate, formula = 'epley') {
  const wantedName = normaliseName(exerciseName);
  let anchor = null;
  for (const session of [...sessions].sort((a,b) => String(b.date).localeCompare(String(a.date)))) {
    if (!isStrengthSession(session) || !inDateRange(session.date, range, endDate)) continue;
    anchor = (session.exercises || []).find(item => normaliseName(item.name) === wantedName || normaliseName(item.coreExercise) === wantedName);
    if (anchor) break;
  }
  const points = [];
  if (!anchor) return { points, best:null, latest:null, personalPercentile:null, projected28d:null, comparisonStreamId:null };
  const comparisonStreamId = canonicalExerciseIdentity(anchor);
  for (const session of [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    if (!isStrengthSession(session) || !inDateRange(session.date, range, endDate)) continue;
    const exercise = (session.exercises || []).find(item => canonicalExerciseIdentity(item) === comparisonStreamId || exerciseCompatibility(item, anchor).compatible);
    if (!exercise) continue;
    const workSets = (exercise.sets || []).filter(set => !String(set.setType || '').toLowerCase().includes('warm'));
    const best = workSets.reduce((winner, set) => {
      const e1rm = estimate1RM(set.weightKg, set.reps, formula);
      return e1rm > (winner?.e1rm || 0) ? { set, e1rm } : winner;
    }, null);
    if (!best) continue;
    points.push({
      date: session.date, sessionId: session.id, sessionType: session.sessionType,
      exerciseName: exercise.name, comparisonStreamId,
      e1rm: best.e1rm, weightKg: Number(best.set.weightKg || 0), reps: Number(best.set.reps || 0),
      rpe: Number.isFinite(Number(best.set.rpe)) ? Number(best.set.rpe) : null,
      volume: workSets.reduce((sum, set) => sum + Number(set.weightKg || 0) * Number(set.reps || 0), 0)
    });
  }
  const best = points.reduce((winner, point) => point.e1rm > (winner?.e1rm || 0) ? point : winner, null);
  const latest = points.at(-1) || null;
  let personalPercentile = null;
  if (latest && points.length > 1) personalPercentile = 100 * points.filter(point => point.e1rm <= latest.e1rm).length / points.length;
  return { points, best, latest, personalPercentile, projected28d: projectSeries(points, 28), comparisonStreamId };
}

export function projectSeries(points = [], forwardDays = 28) {
  if (points.length < 3) return null;
  const base = utcDay(points[0].date);
  const usable = points.map(point => ({ x: (utcDay(point.date) - base) / DAY_MS, y: Number(point.e1rm) })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (usable.length < 3) return null;
  const meanX = usable.reduce((sum, point) => sum + point.x, 0) / usable.length;
  const meanY = usable.reduce((sum, point) => sum + point.y, 0) / usable.length;
  const denominator = usable.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (!denominator) return null;
  const slope = usable.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const lastX = usable.at(-1).x;
  const projected = meanY + slope * (lastX + forwardDays - meanX);
  return Number.isFinite(projected) && projected > 0 ? projected : null;
}

export function muscleDistribution(sessions = [], exercises = [], range = '28d', endDate) {
  const rows = flattenStrengthSets(sessions, exercises, range, endDate).filter(item => !item.warmup);
  const groups = new Map();
  for (const row of rows) {
    const key = row.bodyGroup || 'Unclassified';
    const item = groups.get(key) || { name: key, sets: 0, volume: 0, effectiveReps: 0, hardSets: 0 };
    item.sets += 1;
    item.volume += row.volume;
    item.effectiveReps += row.effectiveReps;
    if (row.rpe != null && row.rpe >= 8) item.hardSets += 1;
    groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => b.sets - a.sets || b.volume - a.volume);
}

function mondayKey(value) {
  const timestamp = utcDay(value);
  if (timestamp == null) return '';
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function weeklyTrainingLoad(sessions = [], exercises = [], range = '90d', endDate) {
  const rows = flattenStrengthSets(sessions, exercises, range, endDate);
  const sessionMap = new Map();
  for (const session of sessions) {
    if ((!isStrengthSession(session) && !isCardioSession(session)) || !inDateRange(session.date, range, endDate)) continue;
    sessionMap.set(session.id, session);
  }
  const weeks = new Map();
  for (const session of sessionMap.values()) {
    const key = mondayKey(session.date);
    const bucket = weeks.get(key) || { week: key, sessions: 0, strengthSessions: 0, cardioSessions: 0, workSets: 0, volume: 0, effectiveReps: 0, minutes: 0 };
    bucket.sessions += 1;
    bucket.strengthSessions += isStrengthSession(session) ? 1 : 0;
    bucket.cardioSessions += isCardioSession(session) ? 1 : 0;
    bucket.minutes += sessionDurationSeconds(session) / 60;
    weeks.set(key, bucket);
  }
  for (const row of rows) {
    const bucket = weeks.get(mondayKey(row.date));
    if (!bucket) continue;
    if (!row.warmup) {
      bucket.workSets += 1;
      bucket.effectiveReps += row.effectiveReps;
    }
    bucket.volume += row.volume;
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function weightSeries(vitals = [], nutritionDays = [], bodyMeasurements = [], range = '90d', endDate) {
  const map = new Map();
  for (const item of nutritionDays) if (item.weight != null) map.set(item.date, { date: item.date, value: Number(item.weight), source: 'nutrition' });
  for (const item of vitals) if (item.weight != null) map.set(item.date, { date: item.date, value: Number(item.weight), source: 'vitals' });
  for (const item of bodyMeasurements) if (item.weight != null) map.set(item.date, { date: item.date, value: Number(item.weight), source: 'measurements' });
  return [...map.values()].filter(item => Number.isFinite(item.value) && inDateRange(item.date, range, endDate)).sort((a, b) => a.date.localeCompare(b.date));
}

export function macroSeries(meals = [], nutritionDays = [], range = '90d', endDate) {
  const map = new Map();
  for (const item of nutritionDays) {
    if (!inDateRange(item.date, range, endDate)) continue;
    map.set(item.date, {
      date: item.date,
      protein: Number(item.protein || 0), carbs: Number(item.carbs || 0), fat: Number(item.fat || 0), calories: Number(item.calories || 0), source: 'summary'
    });
  }
  for (const meal of meals) {
    if (!inDateRange(meal.date, range, endDate)) continue;
    const item = map.get(meal.date) || { date: meal.date, protein: 0, carbs: 0, fat: 0, calories: 0, source: 'meals' };
    if (item.source !== 'meals') Object.assign(item, { protein: 0, carbs: 0, fat: 0, calories: 0, source: 'meals' });
    item.protein += Number(meal.protein || 0);
    item.carbs += Number(meal.carbs || 0);
    item.fat += Number(meal.fat || 0);
    item.calories += Number(meal.calories || 0);
    map.set(meal.date, item);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function nutritionWeightSummary(vitals = [], nutritionDays = [], meals = [], bodyMeasurements = [], range = '90d', endDate) {
  const weights = weightSeries(vitals, nutritionDays, bodyMeasurements, range, endDate);
  const macros = macroSeries(meals, nutritionDays, range, endDate);
  const avg = key => macros.length ? macros.reduce((sum, item) => sum + Number(item[key] || 0), 0) / macros.length : null;
  return {
    weights,
    macros,
    startWeight: weights[0]?.value ?? null,
    latestWeight: weights.at(-1)?.value ?? null,
    weightChange: weights.length > 1 ? weights.at(-1).value - weights[0].value : null,
    avgCalories: avg('calories'),
    avgProtein: avg('protein'),
    avgCarbs: avg('carbs'),
    avgFat: avg('fat')
  };
}

export function bodyMeasurementSeries(rows = [], field = 'waist', range = 'all', endDate) {
  return rows
    .filter(item => item[field] != null && Number.isFinite(Number(item[field])) && inDateRange(item.date, range, endDate))
    .map(item => ({ date: item.date, value: Number(item[field]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function wearableSummary(sessions = [], range = '90d', endDate) {
  const cardio = sessions.filter(item => isCardioSession(item) && inDateRange(item.date, range, endDate));
  const strength = sessions.filter(item => isStrengthSession(item) && inDateRange(item.date, range, endDate));
  const hrRows = cardio.filter(item => Number(item.cardio?.metrics?.avgHr) > 0);
  const totalSeconds = [...cardio, ...strength].reduce((sum, item) => sum + sessionDurationSeconds(item), 0);
  return {
    cardioSessions: cardio.length,
    strengthSessions: strength.length,
    totalSeconds,
    cardioMinutes: cardio.reduce((sum, item) => sum + sessionDurationSeconds(item), 0) / 60,
    avgHr: hrRows.length ? hrRows.reduce((sum, item) => sum + Number(item.cardio.metrics.avgHr), 0) / hrRows.length : null,
    maxHr: cardio.reduce((max, item) => Math.max(max, Number(item.cardio?.metrics?.maxHr || 0)), 0) || null,
    points: cardio.map(item => ({
      date: item.date,
      durationMinutes: sessionDurationSeconds(item) / 60,
      avgHr: Number(item.cardio?.metrics?.avgHr || 0) || null,
      maxHr: Number(item.cardio?.metrics?.maxHr || 0) || null,
      activity: item.cardio?.activityType || 'liss'
    })).sort((a, b) => a.date.localeCompare(b.date))
  };
}

export function readinessAlignment(sessions = [], range = '90d', endDate) {
  const relevant = sessions.filter(item => inDateRange(item.date, range, endDate));
  const counts = { total: 0, aligned: 0, trainedGreen: 0, trainedAmber: 0, trainedRed: 0, rested: 0, unknown: 0 };
  for (const session of relevant) {
    const level = String(session.decision?.readinessLevel || 'unknown').toLowerCase();
    const actual = isRestSession(session) ? 'rest' : isCardioSession(session) ? 'liss' : 'strength';
    counts.total += 1;
    if (actual === 'rest') counts.rested += 1;
    if (actual !== 'rest' && level === 'green') counts.trainedGreen += 1;
    if (actual !== 'rest' && level === 'amber') counts.trainedAmber += 1;
    if (actual !== 'rest' && level === 'red') counts.trainedRed += 1;
    if (!['green', 'amber', 'red'].includes(level)) counts.unknown += 1;
    const aligned = level === 'green'
      ? actual !== 'rest'
      : level === 'red'
        ? actual === 'rest' || actual === 'liss'
        : level === 'amber'
          ? actual === 'rest' || actual === 'liss' || ['deload', 'bp-watch', 'recovery-watch'].includes(session.mode)
          : false;
    if (aligned) counts.aligned += 1;
  }
  return { ...counts, alignmentRate: counts.total ? 100 * counts.aligned / counts.total : null };
}

export function relativeStrength(progress, bodyweight) {
  const latest = progress?.latest?.e1rm;
  const bw = Number(bodyweight || 0);
  return latest && bw > 0 ? latest / bw : null;
}

function shiftDateKey(value, days) {
  const stamp = utcDay(value);
  if (stamp == null) return '';
  return new Date(stamp + Number(days || 0) * DAY_MS).toISOString().slice(0, 10);
}

function averageRows(rows = []) {
  if (!rows.length) return null;
  const keys = ['protein', 'carbs', 'fat', 'calories'];
  return Object.fromEntries(keys.map(key => [key, rows.reduce((sum, item) => sum + Number(item[key] || 0), 0) / rows.length]));
}

function pearson(rows, xKey, yKey) {
  const usable = rows.filter(item => Number.isFinite(Number(item[xKey])) && Number.isFinite(Number(item[yKey])));
  if (usable.length < 4) return null;
  const xs = usable.map(item => Number(item[xKey]));
  const ys = usable.map(item => Number(item[yKey]));
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = usable.reduce((sum, _, index) => sum + (xs[index] - meanX) * (ys[index] - meanY), 0);
  const denominatorX = Math.sqrt(xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0));
  const denominatorY = Math.sqrt(ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0));
  if (!denominatorX || !denominatorY) return null;
  return numerator / (denominatorX * denominatorY);
}

function macroPercentages(item) {
  const pKcal = Number(item.protein || 0) * 4;
  const cKcal = Number(item.carbs || 0) * 4;
  const fKcal = Number(item.fat || 0) * 9;
  const macroCalories = pKcal + cKcal + fKcal;
  return {
    proteinPct: macroCalories ? 100 * pKcal / macroCalories : null,
    carbPct: macroCalories ? 100 * cKcal / macroCalories : null,
    fatPct: macroCalories ? 100 * fKcal / macroCalories : null
  };
}

export function nutritionPerformanceAnalysis(sessions = [], meals = [], nutritionDays = [], exerciseName = '', range = '90d', endDate, formula = 'epley', fuelWindow = 'same-day', performanceOutput = 'performanceIndex') {
  const progress = exerciseProgress(sessions, exerciseName, range, endDate, formula);
  const macros = macroSeries(meals, nutritionDays, range === '7d' ? '28d' : 'all', endDate);
  const macroMap = new Map(macros.map(item => [item.date, item]));
  let previousBest = null;
  const rows = [];

  for (const point of progress.points) {
    let fuelRows = [];
    if (fuelWindow === 'previous-day') {
      const item = macroMap.get(shiftDateKey(point.date, -1));
      if (item) fuelRows = [item];
    } else if (fuelWindow === 'rolling-3d') {
      fuelRows = [0, -1, -2].map(offset => macroMap.get(shiftDateKey(point.date, offset))).filter(Boolean);
    } else {
      const item = macroMap.get(point.date);
      if (item) fuelRows = [item];
    }
    const fuel = averageRows(fuelRows);
    const prior = previousBest;
    const isPb = prior != null && point.e1rm > prior + 0.05;
    const performanceIndex = prior ? 100 * point.e1rm / prior : null;
    previousBest = Math.max(previousBest || 0, point.e1rm);
    if (!fuel) continue;
    rows.push({
      ...point,
      ...fuel,
      ...macroPercentages(fuel),
      performanceIndex,
      isPb,
      fuelDays: fuelRows.length
    });
  }

  const outputKey = ['performanceIndex', 'e1rm', 'volume'].includes(performanceOutput) ? performanceOutput : 'performanceIndex';
  const outputRows = rows.filter(item => item[outputKey] != null && Number.isFinite(Number(item[outputKey])));
  const comparable = rows.filter(item => item.performanceIndex != null);
  const correlationsByOutput = {};
  for (const candidate of ['performanceIndex', 'e1rm', 'volume']) {
    const candidateRows = rows.filter(item => item[candidate] != null && Number.isFinite(Number(item[candidate])));
    correlationsByOutput[candidate] = {};
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'proteinPct', 'carbPct', 'fatPct']) {
      correlationsByOutput[candidate][key] = pearson(candidateRows, key, candidate);
    }
  }
  const correlations = correlationsByOutput[outputKey];

  const ranked = [...outputRows].sort((a, b) => Number(b[outputKey]) - Number(a[outputKey]));
  const topCount = ranked.length >= 4 ? Math.max(1, Math.ceil(ranked.length * 0.25)) : 0;
  const topRows = topCount ? ranked.slice(0, topCount) : [];
  const otherRows = topCount ? ranked.slice(topCount) : [];
  const average = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : null;
  const bestDayFuel = topCount ? Object.fromEntries(['calories','protein','carbs','fat','proteinPct','carbPct','fatPct'].map(key => [key, average(topRows, key)])) : null;
  const otherDayFuel = topCount ? Object.fromEntries(['calories','protein','carbs','fat','proteinPct','carbPct','fatPct'].map(key => [key, average(otherRows, key)])) : null;

  return {
    rows,
    correlations,
    sampleSize: rows.length,
    comparableSize: comparable.length,
    outputSampleSize: outputRows.length,
    outputKey,
    correlationsByOutput,
    pbCount: rows.filter(item => item.isPb).length,
    bestDayFuel,
    otherDayFuel,
    fuelWindow
  };
}


const SESSION_FAMILY_RULES = [
  { key: 'chest-biceps', label: 'Chest & Biceps', test: value => /chest/.test(value) && /bicep|curl/.test(value) },
  { key: 'shoulders-triceps', label: 'Shoulders & Triceps', test: value => /shoulder|delt/.test(value) && /tricep|pressdown|extension|dip/.test(value) },
  { key: 'back', label: 'Back', test: value => /back|pull/.test(value) },
  { key: 'legs', label: 'Legs', test: value => /leg|lower body|quad|hamstring|calf/.test(value) },
  { key: 'chest', label: 'Chest', test: value => /chest|pec/.test(value) },
  { key: 'shoulders', label: 'Shoulders', test: value => /shoulder|delt/.test(value) },
  { key: 'arms', label: 'Arms', test: value => /arm|bicep|tricep|curl|pressdown/.test(value) }
];

function titleCaseFamily(value) {
  return String(value || 'Strength').split(/\s+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function inferredExerciseFamilyText(session = {}) {
  return (session.exercises || []).map(exercise => `${exercise.name || ''} ${exercise.movementPattern || ''}`).join(' ').toLowerCase();
}

export function sessionFamilyForSession(session = {}) {
  if (!isStrengthSession(session) || session.category === 'recovery' || session.templateId === 'recovery' || session.recoverySession) return null;
  const explicit = normaliseName(session.sessionFamily || session.workoutFamily || '');
  const source = normaliseName(`${session.sessionType || ''} ${session.templateId || ''}`);
  const searchable = `${explicit} ${source}`.trim();
  for (const rule of SESSION_FAMILY_RULES) if (rule.test(searchable)) return { key: rule.key, label: rule.label };
  const exerciseText = inferredExerciseFamilyText(session);
  for (const rule of SESSION_FAMILY_RULES) if (rule.test(exerciseText)) return { key: rule.key, label: rule.label };
  const fallback = explicit || source || 'strength';
  return { key: `custom:${fallback}`, label: session.sessionFamily || session.sessionType || titleCaseFamily(fallback) };
}

export function strengthSessionFamilies(sessions = [], range = 'all', endDate = '9999-12-31') {
  const families = new Map();
  for (const session of sessions) {
    if (!isStrengthSession(session) || !inDateRange(session.date, range, endDate)) continue;
    const family = sessionFamilyForSession(session);
    if (!family) continue;
    const current = families.get(family.key) || { ...family, sessions: 0, latestDate: '' };
    current.sessions += 1;
    if (String(session.date || '') > current.latestDate) current.latestDate = String(session.date || '');
    families.set(family.key, current);
  }
  return [...families.values()].sort((a, b) => b.sessions - a.sessions || String(b.latestDate).localeCompare(String(a.latestDate)) || a.label.localeCompare(b.label, 'en-GB'));
}

function workSetsForExercise(exercise = {}) {
  return (exercise.sets || []).filter(set => {
    const type = String(set.setType || 'Work').toLowerCase();
    return !type.includes('warm') && !type.includes('skip') && Number(set.reps || 0) > 0;
  });
}

function exercisePerformanceIdentity(exercise = {}) {
  return canonicalExerciseIdentity(exercise);
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function strengthSessionOutput(session, formula = 'epley') {
  const exerciseRows = [];
  let totalVolume = 0;
  let workSets = 0;
  const rpes = [];
  for (const exercise of session.exercises || []) {
    const sets = workSetsForExercise(exercise);
    if (!sets.length) continue;
    const volume = sets.reduce((sum, set) => sum + Number(set.weightKg || 0) * Number(set.reps || 0), 0);
    const bestE1rm = sets.reduce((best, set) => Math.max(best, estimate1RM(set.weightKg, set.reps, formula)), 0);
    for (const set of sets) if (Number.isFinite(Number(set.rpe))) rpes.push(Number(set.rpe));
    totalVolume += volume;
    workSets += sets.length;
    exerciseRows.push({ identity: exercisePerformanceIdentity(exercise), name: exercise.name || 'Exercise', volume, bestE1rm, workSets: sets.length });
  }
  const exerciseCount = exerciseRows.length;
  return {
    exerciseRows, exerciseCount, workSets, totalVolume,
    volumePerExercise: exerciseCount ? totalVolume / exerciseCount : null,
    volumePerSet: workSets ? totalVolume / workSets : null,
    avgRpe: rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : null
  };
}

export function nutritionSessionPerformanceAnalysis(sessions = [], meals = [], nutritionDays = [], familyKey = '', range = '90d', endDate, formula = 'epley', fuelWindow = 'same-day', performanceOutput = 'sessionPerformanceIndex') {
  const macros = macroSeries(meals, nutritionDays, range === '7d' ? '28d' : 'all', endDate);
  const macroMap = new Map(macros.map(item => [item.date, item]));
  const familySessions = sessions
    .filter(session => isStrengthSession(session) && inDateRange(session.date, range, endDate) && sessionFamilyForSession(session)?.key === familyKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.completedAt || '').localeCompare(String(b.completedAt || '')));
  const previousBestByExercise = new Map();
  const rows = [];

  for (const session of familySessions) {
    const output = strengthSessionOutput(session, formula);
    const ratios = [];
    let exercisePbs = 0;
    for (const exercise of output.exerciseRows) {
      const previousBest = previousBestByExercise.get(exercise.identity);
      if (previousBest > 0 && exercise.bestE1rm > 0) {
        ratios.push(100 * exercise.bestE1rm / previousBest);
        if (exercise.bestE1rm > previousBest + 0.05) exercisePbs += 1;
      }
    }
    const sessionPerformanceIndex = median(ratios);
    for (const exercise of output.exerciseRows) {
      if (exercise.bestE1rm > 0) previousBestByExercise.set(exercise.identity, Math.max(previousBestByExercise.get(exercise.identity) || 0, exercise.bestE1rm));
    }

    let fuelRows = [];
    if (fuelWindow === 'previous-day') {
      const item = macroMap.get(shiftDateKey(session.date, -1));
      if (item) fuelRows = [item];
    } else if (fuelWindow === 'rolling-3d') {
      fuelRows = [0, -1, -2].map(offset => macroMap.get(shiftDateKey(session.date, offset))).filter(Boolean);
    } else {
      const item = macroMap.get(session.date);
      if (item) fuelRows = [item];
    }
    const fuel = averageRows(fuelRows);
    if (!fuel) continue;
    rows.push({
      date: session.date, sessionId: session.id, sessionType: session.sessionType || sessionFamilyForSession(session)?.label || 'Strength',
      ...output, ...fuel, ...macroPercentages(fuel), sessionPerformanceIndex, comparableExercises: ratios.length,
      exercisePbs, isPb: exercisePbs > 0, fuelDays: fuelRows.length
    });
  }

  const allowedOutputs = ['sessionPerformanceIndex', 'volumePerExercise', 'volumePerSet', 'totalVolume'];
  const outputKey = allowedOutputs.includes(performanceOutput) ? performanceOutput : 'sessionPerformanceIndex';
  const outputRows = rows.filter(item => item[outputKey] != null && Number.isFinite(Number(item[outputKey])));
  const comparable = rows.filter(item => item.sessionPerformanceIndex != null && Number.isFinite(Number(item.sessionPerformanceIndex)));
  const correlationsByOutput = {};
  for (const candidate of allowedOutputs) {
    const candidateRows = rows.filter(item => item[candidate] != null && Number.isFinite(Number(item[candidate])));
    correlationsByOutput[candidate] = {};
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'proteinPct', 'carbPct', 'fatPct']) correlationsByOutput[candidate][key] = pearson(candidateRows, key, candidate);
  }
  const correlations = correlationsByOutput[outputKey];
  const ranked = [...outputRows].sort((a, b) => Number(b[outputKey]) - Number(a[outputKey]));
  const topCount = ranked.length >= 4 ? Math.max(1, Math.ceil(ranked.length * 0.25)) : 0;
  const topRows = topCount ? ranked.slice(0, topCount) : [];
  const otherRows = topCount ? ranked.slice(topCount) : [];
  const average = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : null;
  const bestDayFuel = topCount ? Object.fromEntries(['calories','protein','carbs','fat','proteinPct','carbPct','fatPct'].map(key => [key, average(topRows, key)])) : null;
  const otherDayFuel = topCount ? Object.fromEntries(['calories','protein','carbs','fat','proteinPct','carbPct','fatPct'].map(key => [key, average(otherRows, key)])) : null;
  return {
    rows, correlations, sampleSize: rows.length, comparableSize: comparable.length, outputSampleSize: outputRows.length, outputKey, correlationsByOutput,
    pbCount: rows.filter(item => item.isPb).length, bestDayFuel, otherDayFuel, fuelWindow, familyKey, familyLabel: familySessions[0] ? sessionFamilyForSession(familySessions[0])?.label : ''
  };
}

function cycleEndKey(cycle) {
  const weeks = Math.max(1, Number(cycle?.durationWeeks || 1));
  return shiftDateKey(cycle?.startDate, weeks * 7 - 1);
}

export function cycleWeekNumber(cycle, date) {
  const start = utcDay(cycle?.startDate);
  const current = utcDay(date);
  if (start == null || current == null || current < start) return null;
  const week = Math.floor((current - start) / (7 * DAY_MS)) + 1;
  return week <= Math.max(1, Number(cycle.durationWeeks || 1)) ? week : null;
}

export function activeCyclesForDate(cycles = [], date) {
  return cycles.filter(cycle => {
    if (!cycle?.startDate) return false;
    const week = cycleWeekNumber(cycle, date);
    return week != null && cycle.active !== false;
  }).map(cycle => ({ ...cycle, week: cycleWeekNumber(cycle, date), endDate: cycleEndKey(cycle) }));
}

export function cyclePerformanceSummary(sessions = [], exercises = [], cycles = [], exerciseName = '', range = 'all', endDate, formula = 'epley') {
  return cycles.map(cycle => {
    const end = cycleEndKey(cycle);
    const cycleSessions = sessions.filter(session => dateKey(session.date) >= cycle.startDate && dateKey(session.date) <= end && inDateRange(session.date, range, endDate));
    const overview = metricsOverview(cycleSessions, exercises, 'all', end);
    const progress = exerciseName ? exerciseProgress(cycleSessions, exerciseName, 'all', end, formula) : { points: [] };
    const change = progress.points.length > 1 ? progress.points.at(-1).e1rm - progress.points[0].e1rm : null;
    return {
      id: cycle.id,
      name: cycle.name,
      type: cycle.type,
      category: cycle.category,
      startDate: cycle.startDate,
      endDate: end,
      durationWeeks: Number(cycle.durationWeeks || 1),
      active: Boolean(cycle.active),
      sessions: overview.strengthSessions + overview.cardioSessions,
      strengthSessions: overview.strengthSessions,
      workSets: overview.workSets,
      volume: overview.volume,
      avgRpe: overview.avgRpe,
      exercisePoints: progress.points.length,
      e1rmChange: change
    };
  }).filter(item => item.sessions || item.active).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
}

export function supplementStateOnDate(supplement, events = [], date) {
  const relevant = events
    .filter(event => event.supplementId === supplement?.id && dateKey(event.effectiveDate || event.date) <= date)
    .sort((a, b) => `${a.effectiveDate || a.date}${a.createdAt || ''}`.localeCompare(`${b.effectiveDate || b.date}${b.createdAt || ''}`));
  if (relevant.length) return Boolean(relevant.at(-1).active);
  const created = dateKey(supplement?.createdAt || supplement?.startDate);
  return Boolean(supplement?.active && (!created || created <= date));
}

export function supplementPerformanceComparison(sessions = [], supplements = [], events = [], supplementId = '', exerciseName = '', range = 'all', endDate, formula = 'epley') {
  const supplement = supplements.find(item => item.id === supplementId);
  if (!supplement || !exerciseName) return { supplement, on: null, off: null, rows: [] };
  const progress = exerciseProgress(sessions, exerciseName, range, endDate, formula);
  const rows = progress.points.map(point => ({ ...point, active: supplementStateOnDate(supplement, events, point.date) }));
  const summarise = items => items.length ? {
    sessions: items.length,
    avgE1rm: items.reduce((sum, item) => sum + item.e1rm, 0) / items.length,
    bestE1rm: Math.max(...items.map(item => item.e1rm)),
    avgVolume: items.reduce((sum, item) => sum + item.volume, 0) / items.length
  } : null;
  return { supplement, on: summarise(rows.filter(item => item.active)), off: summarise(rows.filter(item => !item.active)), rows };
}
