import { comparisonConfidence, duplicateSourceExerciseIds, exerciseIdentityOverlapReviews } from './strength-integrity.js';
import { ocrMediaAuthoritative } from './evidence-integrity.js';
import { exerciseCompatibility } from './workout-history.js?v=1.4.3';

function safe(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function number(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '–';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '–';
  return numeric.toLocaleString('en-GB', { maximumFractionDigits: digits });
}

function signedValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const match = String(value).match(/([+-]?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function baselineStatusLabel(status, numericBaseline, unit) {
  if (numericBaseline != null && numericBaseline !== '') return `${safe(numericBaseline)} ${unit}`;
  const normalised = String(status || '').trim().toLowerCase();
  const labels = { 'at-baseline':'At baseline', 'above-baseline':'Above baseline', 'below-baseline':'Below baseline', known:'Known', unknown:'Unknown' };
  return labels[normalised] || 'Unknown';
}

function sleepDebtDisplay(vitals = {}) {
  if (vitals.sleepDebtToday != null && vitals.sleepDebtToday !== '') return String(vitals.sleepDebtToday);
  if (vitals.sleepDebtDisplay != null && vitals.sleepDebtDisplay !== '') return String(vitals.sleepDebtDisplay);
  if (vitals.sleepDebt != null && vitals.sleepDebt !== '') return `${vitals.sleepDebt} h`;
  return 'Not recorded';
}

function escapeTable(value) {
  return safe(value, '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function nameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function estimated1RM(weight, reps) {
  const w = Number(weight || 0);
  const r = Number(reps || 0);
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

function sessionTotals(session) {
  const sets = (session.exercises || []).flatMap(exercise => exercise.sets || []);
  const workSets = sets.filter(set => set.setType !== 'Warm-up' && set.setType !== 'Skipped');
  const volume = sets.reduce((sum, set) => sum + Number(set.weightKg || 0) * Number(set.reps || 0), 0);
  const topE1rm = Math.max(0, ...workSets.map(set => estimated1RM(set.weightKg, set.reps)));
  return { exercises: (session.exercises || []).length, workSets: workSets.length, volume, topE1rm };
}

function findPreviousExercise(session, exercise, sessions) {
  const candidates = (sessions || [])
    .filter(item => item.id !== session.id && String(item.date) < String(session.date) && Array.isArray(item.exercises))
    .sort((a, b) => String(b.completedAt || b.date).localeCompare(String(a.completedAt || a.date)));
  const preferred = session.previousSessionId ? candidates.find(item => item.id === session.previousSessionId) : null;
  const ordered = preferred ? [preferred, ...candidates.filter(item => item.id !== preferred.id)] : candidates;
  for (const previousSession of ordered) {
    for (const previousExercise of previousSession.exercises || []) {
      const compatibility = exerciseCompatibility(exercise, previousExercise);
      if (compatibility.compatible && ['high','medium'].includes(compatibility.level)) return { session: previousSession, exercise: previousExercise, compatibility };
    }
  }
  return null;
}

function pulseFromVitals(vitals) {
  if (!vitals) return null;
  const direct = Number(vitals.pulse ?? vitals.cuffPulse ?? vitals.bloodPressurePulse);
  if (Number.isFinite(direct) && direct >= 20 && direct <= 220) return direct;
  const notes = String(vitals.notes || '');
  const match = notes.match(/(?:cuff\s*pulse|blood\s*pressure\s*pulse|bp\s*pulse|pulse)\s*[:\-]?\s*(\d{2,3})\b/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed >= 20 && parsed <= 220 ? parsed : null;
}

function readinessLines(vitals, readiness, session) {
  if (!vitals) return ['No vitals record was available for this date.'];
  const hrvBaseline = baselineStatusLabel(vitals.hrvBaselineStatus ?? vitals.baselineStatus?.hrv, vitals.hrvBaseline, 'ms');
  const rhrBaseline = baselineStatusLabel(vitals.rhrBaselineStatus ?? vitals.baselineStatus?.restingHr, vitals.rhrBaseline, 'bpm');
  const hrvDelta = signedValue(vitals.hrvDeltaFromBaseline ?? vitals.hrvBaselineDelta);
  const rhrAtBaseline = String((vitals.rhrBaselineStatus ?? vitals.baselineStatus?.restingHr) || '').toLowerCase() === 'at-baseline';
  const rhrDelta = rhrAtBaseline ? null : signedValue(vitals.rhrDeltaFromBaseline ?? vitals.restingHrBaselineDelta ?? vitals.rhrBaselineDelta);
  return [
    `- **Current calculated readiness:** ${safe(readiness?.title)}`,
    `- **Recommendation stored when session started:** ${safe(session?.decision?.readinessTitle)}`,
    `- **NOOP recovery:** ${safe(vitals.recovery)}%`,
    `- **Charge:** ${safe(vitals.charge)}%`,
    `- **Rest score:** ${safe(vitals.restScore ?? vitals.rest)}`,
    `- **Status / synthesis / guidance:** ${safe(vitals.status)} / ${safe(vitals.synthesis)} / ${safe(vitals.guidance)}`,
    `- **HRV:** ${safe(vitals.hrv)} ms (baseline ${hrvBaseline}; delta ${hrvDelta != null ? `${hrvDelta >= 0 ? '+' : ''}${hrvDelta} ms` : 'Not recorded'})`,
    `- **Resting HR:** ${safe(vitals.restingHr)} bpm (baseline ${rhrBaseline}; delta ${rhrDelta != null ? `${rhrDelta >= 0 ? '+' : ''}${rhrDelta} bpm` : 'Not recorded'})`,
    `- **Respiratory rate:** ${vitals.respiratoryRate != null ? `${safe(vitals.respiratoryRate)} rpm` : 'Not recorded'}`,
    `- **Stress:** ${safe(vitals.stress)}${vitals.stressBand ? ` · ${safe(vitals.stressBand)}` : ''}${vitals.highStressTime || vitals.stressTimeInBand?.high ? ` · high ${safe(vitals.highStressTime || vitals.stressTimeInBand?.high)}` : ''}`,
    `- **Sleep:** ${vitals.sleepDisplay || vitals.sleep || (vitals.sleepHours != null ? `${safe(vitals.sleepHours)} h` : 'Not recorded')}; performance ${safe(vitals.sleepPerformance)}%; efficiency ${safe(vitals.sleepEfficiency)}%; debt ${sleepDebtDisplay(vitals)}`,
    `- **Blood pressure:** ${safe(vitals.systolic)}/${safe(vitals.diastolic)} mmHg`,
    `- **Cuff pulse:** ${pulseFromVitals(vitals) == null ? 'Not recorded' : `${safe(pulseFromVitals(vitals))} bpm`}`,
    `- **Weight:** ${safe(vitals.weight)} kg`,
    `- **Feeling:** ${safe(vitals.feeling)}`,
    `- **Symptoms flagged:** ${vitals.symptoms ? 'Yes' : 'No'}`,
    `- **Vitals notes:** ${safe(vitals.notes)}`,
  ];
}

function exerciseIdentityWarnings(session) {
  const warnings = [];
  const brands = ['hammer strength', 'arsenal strength', 'nautilus', 'watson', 'cutler'];
  for (const exercise of session.exercises || []) {
    const name = nameKey(exercise.name);
    const notes = nameKey(exercise.notes);
    const brand = nameKey(exercise.machineBrand);
    const brandsInText = brands.filter(item => name.includes(item) || notes.includes(item));
    const distinct = [...new Set([brand, ...brandsInText].filter(Boolean))];
    if (distinct.length > 1) warnings.push({ exercise: exercise.name, type: 'machine-brand-conflict', severity: 'high', message: `Conflicting machine brands detected: ${distinct.join(', ')}.` });
    if (name.includes('fly') && notes.includes('press')) warnings.push({ exercise: exercise.name, type: 'movement-conflict', severity: 'high', message: 'Exercise name says fly while notes describe a press.' });
    if (name.includes('press') && notes.includes('fly')) warnings.push({ exercise: exercise.name, type: 'movement-conflict', severity: 'high', message: 'Exercise name says press while notes describe a fly.' });
    if (name.includes('dumbbell') && /(machine|cable|hammer strength|arsenal strength)/.test(notes)) warnings.push({ exercise: exercise.name, type: 'equipment-conflict', severity: 'high', message: 'Exercise name says dumbbell while notes describe a machine or cable movement.' });
    if (name.includes('mutlifly')) warnings.push({ exercise: exercise.name, type: 'possible-name-typo', severity: 'medium', message: 'Possible spelling correction: “mutlifly” may be “multifly”.' });
    if (name.includes('laterial')) warnings.push({ exercise: exercise.name, type: 'name-typo', severity: 'medium', message: 'Correct spelling is lateral.' });
    if (name.includes('tricep cable push down') && /arsenal strength.*(?:plate|press)|seated plate/.test(notes)) warnings.push({ exercise: exercise.name, type: 'exercise-identity-conflict', severity: 'high', message: 'Exercise name conflicts with note. Confirm whether this is Arsenal Strength seated plate-loaded tricep press.' });
    if (name.includes('skull crusher') && /hammer strength.*tricep extension/.test(notes)) warnings.push({ exercise: exercise.name, type: 'exercise-identity-review', severity: 'medium', message: 'Confirm whether to keep Skull crusher as an alias or rename the variation to Hammer Strength tricep extension.' });
  }
  return warnings;
}

function workoutValidationWarnings(session) {
  const warnings = [];
  (session.exercises || []).forEach(exercise => {
    (exercise.sets || []).forEach((set, index) => {
      if (set.setType === 'Warm-up' || set.setType === 'Skipped') return;
      const setNumber = set.setNumber || index + 1;
      if (Number(set.reps || 0) === 0) {
        warnings.push({ type: 'workSetZeroReps', severity: 'high', exercise: exercise.name, setNumber, weightKg: Number(set.weightKg || 0), reps: 0, rpe: set.rpe, message: 'Work set has 0 reps. Confirm skipped set or enter the missing reps.' });
      }
      if (Number(set.weightKg || 0) === 0 && Number(set.reps || 0) > 0 && Number(set.rpe || 0) >= 7) {
        warnings.push({ type: 'workSetZeroLoad', severity: set.zeroLoadConfirmed ? 'confirmed' : 'high', exercise: exercise.name, setNumber, weightKg: 0, reps: Number(set.reps), rpe: set.rpe, requiresUserConfirmation: !set.zeroLoadConfirmed, message: set.zeroLoadConfirmed ? 'Zero load was explicitly confirmed as deliberate/bodyweight/band-only.' : 'Work set load is 0 kg. Confirm bodyweight/band-only or enter the missing load.' });
      }
      if (set.failure === true && Number(set.rpe) > 0 && Number(set.rpe) <= 6) {
        warnings.push({ type: 'failureLowRpeConflict', severity: 'review', exercise: exercise.name, setNumber, rpe: Number(set.rpe), failure: true, setValidationStatus: 'review-required', message: `Failure = Yes conflicts with RPE ${Number(set.rpe)}. Confirm which value is correct; neither was changed.` });
      }
      if (Number(set.rir) === 0 && Number(set.rpe) > 0 && Number(set.rpe) <= 6) {
        warnings.push({ type: 'zeroRirLowRpeConflict', severity: 'review', exercise: exercise.name, setNumber, setValidationStatus: 'review-required', message: `RIR = 0 conflicts with RPE ${Number(set.rpe)}. Confirm the set effort.` });
      }
      if (Number(set.rpe) >= 10 && Number(set.rir) >= 3) {
        warnings.push({ type: 'rpe10HighRirConflict', severity: 'review', exercise: exercise.name, setNumber, setValidationStatus: 'review-required', message: `RPE ${Number(set.rpe)} conflicts with RIR ${Number(set.rir)}. Confirm the set effort.` });
      }
    });
  });
  return warnings;
}

function techniqueSummary(set = {}) {
  const parts = [];
  if (Number(set.forcedNegativeReps || 0)) parts.push(`${Number(set.forcedNegativeReps)} forced negative${Number(set.forcedNegativeReps) === 1 ? '' : 's'}`);
  if (Number(set.partialReps || 0)) parts.push(`${Number(set.partialReps)} partial${Number(set.partialReps) === 1 ? '' : 's'}`);
  if (Number(set.assistedReps || 0)) parts.push(`${Number(set.assistedReps)} assisted rep${Number(set.assistedReps) === 1 ? '' : 's'}`);
  if (Number(set.staticHoldSeconds ?? set.holdSeconds ?? 0)) parts.push(`${Number(set.staticHoldSeconds ?? set.holdSeconds)}s static hold`);
  if (set.dropSet) parts.push('drop set');
  if (set.restPause) parts.push('rest-pause');
  if (set.failureType) parts.push(`failure: ${set.failureType}`);
  return parts.join('; ');
}

function hrSummaryLines(summary, media, evidence = null) {
  const hrFiles = (media || []).filter(item => item.sourceRole === 'workoutHrSummary');
  const zones = summary?.hrZones || {};
  const lines = [];
  if (!summary && !hrFiles.length && !evidence) return ['No workout HR summary was attached, entered or imported.'];
  lines.push(
    `- **Structured source:** ${safe(summary?.hrSource, hrFiles.length ? 'Attached HR screenshot awaiting Coach analysis' : 'Not recorded')}`,
    `- **Source file(s):** ${hrFiles.length ? hrFiles.map(item => item.archivePath || item.file).join(', ') : 'None attached'}`,
    `- **Time:** ${safe(summary?.timeRange)}`,
    `- **Duration:** ${summary?.durationMinutes != null ? `${number(summary.durationMinutes, 1)} min` : 'Not recorded'}`,
    `- **Avg HR:** ${summary?.avgHr != null ? `${number(summary.avgHr)} bpm` : 'Not recorded'}`,
    `- **Max HR:** ${summary?.maxHr != null ? `${number(summary.maxHr)} bpm` : 'Not recorded'}`,
    `- **Min HR:** ${summary?.minHr != null ? `${number(summary.minHr)} bpm` : 'Not recorded'}`,
    `- **Calories:** ${summary?.calories != null ? `${number(summary.calories)} kcal` : 'Not recorded'}`,
    `- **Effort:** ${safe(summary?.effort)}`,
    `- **Z1:** ${safe(zones.z1Percent)}% / ${safe(zones.z1Minutes)} min`,
    `- **Z2:** ${safe(zones.z2Percent)}% / ${safe(zones.z2Minutes)} min`,
    `- **Z3:** ${safe(zones.z3Percent)}% / ${safe(zones.z3Minutes)} min`,
    `- **Z4:** ${safe(zones.z4Percent)}% / ${safe(zones.z4Minutes)} min`,
    `- **Z5:** ${safe(zones.z5Percent)}% / ${safe(zones.z5Minutes)} min`
  );
  if (evidence) {
    const ez = evidence.hrZones || {};
    lines.push('', '### Screenshot evidence — not automatically authoritative', '',
      `- **Evidence file:** ${safe(evidence.sourceFile)}`,
      `- **Confirmation status:** ${safe(evidence.confirmationStatus, 'screenshot evidence present but not confirmed')}`,
      `- **Time:** ${safe(evidence.timeRange)}`,
      `- **Duration:** ${evidence.durationMinutes != null ? `${number(evidence.durationMinutes, 1)} min` : safe(evidence.duration)}`,
      `- **Avg / max / min HR:** ${safe(evidence.avgHr)} / ${safe(evidence.maxHr)} / ${safe(evidence.minHr)} bpm`,
      `- **Calories:** ${evidence.calories != null ? `${number(evidence.calories)} kcal` : 'Not recorded'}`,
      `- **Effort:** ${safe(evidence.effort)}`,
      `- **Z1:** ${safe(ez.z1Percent)}% / ${safe(ez.z1Minutes)} min`,
      `- **Z2:** ${safe(ez.z2Percent)}% / ${safe(ez.z2Minutes)} min`,
      `- **Z3:** ${safe(ez.z3Percent)}% / ${safe(ez.z3Minutes)} min`,
      `- **Z4:** ${safe(ez.z4Percent)}% / ${safe(ez.z4Minutes)} min`,
      `- **Z5:** ${safe(ez.z5Percent)}% / ${safe(ez.z5Minutes)} min`
    );
    for (const warning of evidence.suspiciousValues || []) lines.push(`- **Suspicious visible value:** ${safe(warning)}`);
  }
  return lines;
}

function localIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return `${local}${offset}`;
}

function timezoneAlias(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(new Date(iso)).find(part => part.type === 'timeZoneName')?.value || null;
  } catch { return null; }
}

function nutritionSnapshot(meals, nutritionSummary) {
  const sourceMeals = meals || [];
  const classify = meal => {
    const text = nameKey(meal.foods);
    if (meal.preWorkout) return 'preWorkout';
    if (meal.postWorkout) return 'postWorkout';
    if (/intra|coconut water|electrolyte|eaa|bcaa/.test(text)) return 'intraWorkout';
    return 'dayMeals';
  };
  const explicitlyNotRecorded = nutritionSummary?.status === 'not-recorded' || nutritionSummary?.notRecorded === true;
  const linked = sourceMeals.length > 0 || Boolean(nutritionSummary && !explicitlyNotRecorded);
  const status = linked ? 'linked' : (explicitlyNotRecorded ? 'not-recorded' : 'pending-import');
  const output = { linked, status, source: sourceMeals.length ? 'vantage-meals' : (linked ? 'vantage-macro-import' : status), preWorkout: [], intraWorkout: [], postWorkout: [], dayMeals: [], dailyTotals: linked ? nutritionSummary || null : null };
  for (const meal of sourceMeals) {
    output[classify(meal)].push({ time: meal.time || null, items: meal.foods || '', protein: meal.protein ?? null, carbs: meal.carbs ?? null, fat: meal.fat ?? null, calories: meal.calories ?? null, coconutWaterMacroRelevant: /coconut water/i.test(meal.foods || ''), plainWaterHydrationOnly: /(?:^|\b)water(?:\b|$)/i.test(meal.foods || '') && !/coconut water/i.test(meal.foods || '') });
  }
  return output;
}

function exerciseSection(session, exercise, previous, media = []) {
  const lines = [`## ${exercise.lineNumber || ''}. ${exercise.name}`.replace('## . ', '## ')];
  lines.push('', `- **Machine brand:** ${safe(exercise.machineBrand)}`, `- **Machine model:** ${safe(exercise.machineModel)}`, `- **Nickname / alias:** ${safe(exercise.nickname)}`, `- **Variation:** ${safe(exercise.variation)}`, `- **Movement pattern:** ${safe(exercise.movementPattern)}`);
  if (exercise.notes) lines.push(`\n**Exercise notes:** ${exercise.notes}`);
  const comparison = previous?.compatibility || (previous ? exerciseCompatibility(exercise, previous.exercise) : { level: 'none', reason: 'No compatible previous exercise', compatible: false });
  if (previous) {
    const priorSets = (previous.exercise.sets || []).map(set => `${safe(set.setType)}: ${number(set.weightKg, 2)} kg × ${safe(set.reps)}${set.rpe != null ? ` @ RPE ${safe(set.rpe)}` : ''}`).join('; ');
    lines.push(`\n**Previous session:** ${previous.session.date} — ${priorSets || 'No sets recorded'}`);
    lines.push(`\n**Comparison confidence:** ${comparison.level} — ${comparison.reason}`);
  } else lines.push('\n**Previous comparable session:** None found');
  const exerciseMedia = (media || []).filter(item =>
    (item.linkedExerciseId && exercise.id && item.linkedExerciseId === exercise.id)
    || (item.sourceExerciseId && exercise.sourceExerciseId && item.sourceExerciseId === exercise.sourceExerciseId && nameKey(item.linkedExerciseName) === nameKey(exercise.name))
    || (!item.linkedExerciseId && nameKey(item.linkedExerciseName) === nameKey(exercise.name))
  );
  if (exerciseMedia.length) {
    lines.push('\n**Exercise media included in this Coach Pack:**');
    exerciseMedia.forEach(item => lines.push(`- ${safe(item.archivePath || item.file)} — ${safe(item.sourceRole)} / ${safe(item.photoType)} — ${item.userAttachedThisSession ? 'current session' : 'reference'}${item.caption ? ` — ${item.caption}` : ''}`));
  }
  lines.push('\n| Set | Type | Weight | Reps | RPE | Rest | Failure | Techniques | Volume | e1RM | Notes |');
  lines.push('|---:|---|---:|---:|---:|---:|---|---|---:|---:|---|');
  (exercise.sets || []).forEach((set, index) => {
    const skipped = set.setType === 'Skipped';
    const volume = skipped ? 0 : Number(set.weightKg || 0) * Number(set.reps || 0);
    lines.push(`| ${set.setNumber || index + 1} | ${escapeTable(set.setType)} | ${number(set.weightKg, 2)} kg | ${safe(set.reps, '0')} | ${skipped ? '–' : safe(set.rpe)} | ${set.restRecorded === true || Number(set.restSeconds || 0) > 0 ? `${number(set.restSeconds ?? 0)} sec` : 'Not recorded'} | ${skipped ? '–' : (set.failure ? 'Yes' : 'No')} | ${escapeTable(techniqueSummary(set) || '—')} | ${number(volume, 1)} kg | ${skipped ? '–' : `${number(estimated1RM(set.weightKg, set.reps), 1)} kg`} | ${escapeTable(set.notes)} |`);
  });
  return { markdown: lines.join('\n'), comparison };
}

export function createWorkoutMarkdown({ session, sessions = [], vitals = null, readiness = null, meals = [], mealTotals = null, nutritionSummary = null, media = [], mediaAudit = null, generatedAt = new Date().toISOString(), appVersion = '1.4.3', coachPackRevision = null }) {
  if (!session) throw new Error('A completed session is required.');
  const totals = sessionTotals(session);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local device timezone';
  const alias = timezoneAlias(session.startedAt);
  const validationWarnings = workoutValidationWarnings(session);
  const identityWarnings = exerciseIdentityWarnings(session);
  const duplicateIdentityWarnings = duplicateSourceExerciseIds(session).map(group => ({ exercise: group.exercises.map(item => item.name).join(' / '), type: 'duplicate-source-exercise-id', severity: 'blocking', message: `Distinct exercises share sourceExerciseId ${group.sourceExerciseId}. Merge them or assign separate identities before export.` }));
  const overlapIdentityReviews = exerciseIdentityOverlapReviews(session).map(item => ({ exercise: item.exerciseNames.join(' / '), type: 'exercise-identity-overlap-review', severity: 'review', ...item }));
  const nutrition = nutritionSnapshot(meals, nutritionSummary);
  const comparisonWarnings = [];
  const lines = [
    '# VANTAGE Completed Workout Report', '',
    '> Upload the complete Coach Pack ZIP to the dedicated VANTAGE Strength Coach thread. Current-session media is included by default; reference media is included only when explicitly selected.', '',
    '## Session overview', '',
    `- **VANTAGE App Version:** ${safe(appVersion)}`,
    `- **Coach Pack Schema:** vantage-strength-coach-pack-v3`,
    `- **Coach Pack Revision:** ${safe(coachPackRevision ?? session.coachPackRevision ?? 1)}`,
    `- **Date:** ${safe(session.date)}`,
    `- **Session:** ${safe(session.sessionType)}`,
    `- **Mode:** ${safe(session.mode)}`,
    `- **Timezone:** ${timezone}${alias ? ` (${alias})` : ''}`,
    `- **Started UTC:** ${safe(session.startedAt)}`,
    `- **Started local:** ${safe(localIso(session.startedAt))}`,
    `- **Completed UTC:** ${safe(session.completedAt)}`,
    `- **Completed local:** ${safe(localIso(session.completedAt))}`,
    `- **Exercises:** ${totals.exercises}`,
    `- **Work sets:** ${totals.workSets}`,
    `- **Total volume:** ${number(totals.volume, 1)} kg`,
    `- **Top estimated 1RM:** ${number(totals.topE1rm, 1)} kg`,
    `- **Session notes:** ${safe(session.notes)}`, '',
    '## Readiness and vitals snapshot', '',
    ...readinessLines(vitals, readiness, session),
    `- **Recommended intensity:** ${safe(readiness?.recommendedIntensity)}`,
    `- **Recommended volume:** ${readiness?.recommendedVolumePercent ? `${readiness.recommendedVolumePercent}%` : 'Not recorded'}`,
    `- **Allowed actions:** ${(readiness?.allowedActions || []).join(', ') || 'Not recorded'}`,
    `- **Actual action:** ${safe(session?.decision?.actualAction, 'strength-training')}`,
    `- **Readiness rules triggered:** ${(readiness?.calculationAudit?.rulesTriggered || []).map(item => item.code || item.message).join(', ') || 'None'}`,
    `- **Readiness validation warnings:** ${(readiness?.validationWarnings || []).join(' | ') || 'None'}`, ''
  ];

  lines.push('## Medication / administration context', '');
  const administrations = session.trainingContext?.medicationAdministrations || [];
  if (administrations.length) administrations.forEach(item => lines.push(`- **${safe(item.medication || item.name, 'Medication')}** — ${safe(item.amount, 'Dose not recorded')} ${safe(item.unit, '')} · ${safe(item.route, 'route not recorded')} · ${safe(item.administeredAtLocal || item.effectiveDate)} · ${safe(item.source, 'recorded')}`));
  else lines.push('- No dated medication/injection administration event was linked to this session. Active stack entries alone are not treated as proof that a dose occurred.');
  lines.push('');

  const bpRows = [];
  if (vitals?.systolic != null || vitals?.diastolic != null) bpRows.push({ context: 'Morning vitals', time: vitals.time || '', systolic: vitals.systolic, diastolic: vitals.diastolic, pulse: pulseFromVitals(vitals), source: 'VANTAGE vitals / cuff' });
  bpRows.push(...(session.bloodPressureReadings || []));
  lines.push('## Blood pressure readings', '');
  if (bpRows.length) {
    lines.push('| Context | Time | BP | Cuff pulse | Source |', '|---|---:|---:|---:|---|');
    bpRows.forEach(item => lines.push(`| ${escapeTable(item.context)} | ${escapeTable(item.time)} | ${safe(item.systolic, '–')}/${safe(item.diastolic, '–')} | ${safe(item.pulse, '–')} | ${escapeTable(item.source)} |`));
  } else lines.push('No blood-pressure readings were linked to this workout.');

  lines.push('', '## Workout HR summary', '', ...hrSummaryLines(session.workoutHrSummary, media, session.workoutHrEvidence || session.strengthAnalysis?.workoutHrSummary || null));
  const hrDurationEvidence = session.workoutHrEvidence || session.strengthAnalysis?.workoutHrSummary || {};
  lines.push('', '## Duration sources', '', `- **App session:** ${safe(localIso(session.startedAt))} to ${safe(localIso(session.completedAt))}`, `- **Strap screenshot time range:** ${safe(hrDurationEvidence.timeRange)}`, `- **NOOP displayed duration:** ${hrDurationEvidence.durationMinutesDisplayed ?? hrDurationEvidence.durationMinutes ?? 'Not recorded'} min`, `- **Duration derived from NOOP time range:** ${hrDurationEvidence.durationMinutesFromTimeRange ?? 'Not recorded'} min`, '- **Resolution:** Preserve every duration source separately; do not overwrite the displayed duration with time-range arithmetic or app boundaries.');

  lines.push('', '## Media audit', '');
  if (mediaAudit) {
    lines.push(`- **Total stored files reviewed:** ${safe(mediaAudit.totalFiles, '0')}`, `- **Current-session exercise photos:** ${safe(mediaAudit.currentSessionPhotos, '0')}`, `- **Active reference photos:** ${safe(mediaAudit.activeReferencePhotos, '0')}`, `- **Archived reference photos:** ${safe(mediaAudit.archivedReferencePhotos, '0')}`, `- **Legacy references predating this workout:** ${safe(mediaAudit.legacyReferencePhotos, '0')}`, `- **Invalid / suspicious photos:** ${safe(mediaAudit.invalidOrSuspiciousPhotos, '0')}`, `- **Orphan photos:** ${safe(mediaAudit.orphanPhotos, '0')}`);
    for (const warning of mediaAudit.warnings || []) lines.push(`- **Warning:** ${warning}`);
  } else lines.push('Media audit was not available.');

  lines.push('', '## Attached media included in this Coach Pack', '');
  if (media.length) {
    lines.push('| File | Source role | Photo type | Linked exercise | Current session? | Notes |', '|---|---|---|---|---|---|');
    media.forEach(item => lines.push(`| ${escapeTable(item.archivePath || item.file)} | ${escapeTable(item.sourceRole)} | ${escapeTable(item.photoType)} | ${escapeTable(item.linkedExerciseName || '—')} | ${item.userAttachedThisSession ? 'Yes' : 'No — reference'} | ${escapeTable(item.caption || item.note || '')} |`));
  } else lines.push('No media was included in this export.');

  lines.push('', '## Completed exercises', '');
  const comparisons = [];
  (session.exercises || []).forEach(exercise => {
    const previous = findPreviousExercise(session, exercise, sessions);
    const section = exerciseSection(session, exercise, previous, media);
    comparisons.push({ exercise: exercise.name, previousDate: previous?.session?.date || null, ...section.comparison });
    if (['low','blocked','review'].includes(section.comparison.level)) comparisonWarnings.push({ exercise: exercise.name, ...section.comparison });
    lines.push(section.markdown, '');
  });

  const hydration = session.hydration || {};
  const sessionHydrationMl = Number(hydration.amountMl ?? hydration.otherFluidMl ?? hydration.waterMl ?? hydration.coconutWaterMl);
  lines.push('', '## Session hydration', '');
  if (hydration.recorded === true) lines.push(`- **Amount:** ${hydration.amountMl != null ? `${number(hydration.amountMl, 0)} ml` : 'Not supplied'}`, `- **Contents:** ${(hydration.items || []).length ? hydration.items.join(', ') : 'Not supplied'}`, `- **Notes:** ${safe(hydration.notes)}`);
  else if (hydration.declined === true) lines.push('- **Status:** Steve confirmed that no hydration was taken.');
  else lines.push('- **Status:** Hydration was not recorded.');
  lines.push(`- **Session hydration total:** ${Number.isFinite(sessionHydrationMl) ? `${number(sessionHydrationMl,0)} ml` : 'Not recorded'}`);
  lines.push(`- **Daily hydration consumed:** ${vitals?.dailyHydrationConsumedLitres != null ? `${number(Number(vitals.dailyHydrationConsumedLitres)*1000,0)} ml` : 'Not recorded'}`);
  lines.push(`- **Daily hydration target:** ${vitals?.dailyHydrationTargetLitres != null ? `${number(Number(vitals.dailyHydrationTargetLitres)*1000,0)} ml` : 'Not recorded'}`);

  const linked = nutrition.linked;
  const totalsForMeals = mealTotals || (meals || []).reduce((sum, meal) => ({ protein: sum.protein + Number(meal.protein || 0), carbs: sum.carbs + Number(meal.carbs || 0), fat: sum.fat + Number(meal.fat || 0), calories: sum.calories + Number(meal.calories || 0) }), { protein: 0, carbs: 0, fat: 0, calories: 0 });
  lines.push('## Nutrition snapshot', '');
  if (nutrition.status === 'pending-import') lines.push('- **Status:** pending-import', '- **Nutrition:** Nutrition pending Alex macro file import.', '- **Values:** Awaiting the daily VANTAGE macro file; do not interpret this as no nutrition recorded.');
  else if (nutrition.status === 'not-recorded') lines.push('- **Status:** not-recorded', '- **Nutrition:** Steve explicitly confirmed that nutrition was not recorded for this date.');
  else {
    lines.push(`- **Source:** ${nutrition.source}`, `- **Logged meals:** ${(meals || []).length}`, `- **Protein:** ${number(totalsForMeals.protein, 1)} g`, `- **Carbohydrate:** ${number(totalsForMeals.carbs, 1)} g`, `- **Fat:** ${number(totalsForMeals.fat, 1)} g`, `- **Calories:** ${number(totalsForMeals.calories, 0)} kcal`);
    for (const [label, key] of [['Pre-workout', 'preWorkout'], ['Intra-workout', 'intraWorkout'], ['Post-workout', 'postWorkout'], ['Other day meals', 'dayMeals']]) {
      if (!nutrition[key].length) continue;
      lines.push('', `### ${label}`, '');
      nutrition[key].forEach(item => lines.push(`- ${safe(item.time, 'Time not set')} — ${safe(item.items)}${item.coconutWaterMacroRelevant ? ' — coconut water marked macro-relevant' : ''}${item.plainWaterHydrationOnly ? ' — plain water marked hydration-only' : ''}`));
    }
  }

  lines.push('', '## Validation and identity warnings', '');
  const evidenceWarnings = [
    ...(session.workoutHrEvidence?.suspiciousValues || []),
    ...(session.workoutHrEvidence?.validationWarnings || []),
    ...((session.workoutHrEvidence?.blockedFields || session.workoutHrEvidence?.ocrBlockedFields || []).map(field => `${field} requires review before it can be authoritative.`))
  ];
  lines.push('### Session evidence warnings', '');
  if (evidenceWarnings.length) evidenceWarnings.forEach(item => lines.push(`- ${safe(item)}`)); else lines.push('- None.');
  lines.push('', '### Set validation warnings', '');
  if (validationWarnings.length) validationWarnings.forEach(item => lines.push(`- **${item.exercise}${item.setNumber ? `, set ${item.setNumber}` : ''}:** ${item.message}`)); else lines.push('- None.');
  lines.push('', '### Exercise identity warnings', '');
  const exerciseWarnings = [...identityWarnings, ...duplicateIdentityWarnings, ...overlapIdentityReviews];
  if (exerciseWarnings.length) exerciseWarnings.forEach(item => lines.push(`- **${item.exercise}:** ${item.message}`)); else lines.push('- None.');
  lines.push('', '### Comparison-confidence warnings', '');
  if (comparisonWarnings.length) comparisonWarnings.forEach(item => lines.push(`- **${item.exercise}:** ${item.reason}`)); else lines.push('- None.');
  lines.push('', '### Media warnings', '');
  if (mediaAudit?.warnings?.length) mediaAudit.warnings.forEach(item => lines.push(`- ${item}`)); else lines.push('- None.');
  lines.push('', '### Vitals-linkage warnings', '');
  const vitalsWarnings = !vitals ? ['No same-day vitals record linked.'] : [
    ...(vitals.importWarnings || []), ...(vitals.importIntegrityWarnings || []), ...(readiness?.validationWarnings || []),
    ...(vitals.weightChangeContext?.message ? [`${vitals.weightChangeContext.message} (${vitals.weightChangeContext.changeKg >= 0 ? '+' : ''}${vitals.weightChangeContext.changeKg} kg vs ${vitals.weightChangeContext.previousDate}).`] : [])
  ];
  if (vitalsWarnings.length) [...new Set(vitalsWarnings)].forEach(item => lines.push(`- ${safe(item)}`)); else lines.push('- None.');

  const machinePayload = {
    reportVersion: 3,
    schema: 'vantage-strength-coach-pack-v3',
    app: 'VANTAGE Training Console', appVersion, coachPackRevision: coachPackRevision ?? session.coachPackRevision ?? 1, generatedAt, timezone, localTimezoneAlias: alias,
    startedAtUtc: session.startedAt, completedAtUtc: session.completedAt,
    startedAtLocal: localIso(session.startedAt), completedAtLocal: localIso(session.completedAt),
    session, vitals, readiness,
    readinessSnapshot: {
      calculated: readiness, recordedAtSessionStart: session.decision || null,
      baselineStatus: {
        hrv: vitals?.hrvBaselineStatus || vitals?.baselineStatus?.hrv || (vitals?.hrvBaseline == null ? 'unknown' : 'known'),
        restingHr: vitals?.rhrBaselineStatus || vitals?.baselineStatus?.restingHr || (vitals?.rhrBaseline == null ? 'unknown' : 'known')
      },
      readinessCalculationAudit: readiness?.calculationAudit || null,
      validationWarnings: readiness?.validationWarnings || [], importedReview: session.strengthAnalysis?.readinessReview || null
    },
    workoutHrSummary: session.workoutHrSummary || null,
    workoutHrEvidence: session.workoutHrEvidence || session.strengthAnalysis?.workoutHrSummary || null,
    durationSources: { appSession: { startedAtUtc: session.startedAt, completedAtUtc: session.completedAt, startedAtLocal: localIso(session.startedAt), completedAtLocal: localIso(session.completedAt) }, strapHrScreenshot: session.workoutHrEvidence || session.strengthAnalysis?.workoutHrSummary || null, resolution: 'Preserve both. Do not overwrite app timestamps with screenshot time.' },
    bloodPressureReadings: bpRows,
    nutritionSnapshot: nutrition,
    hydration: session.hydration || { recorded: false },
    hydrationSummary: { sessionHydrationMl: Number.isFinite(sessionHydrationMl) ? sessionHydrationMl : null, dailyHydrationConsumedMl: vitals?.dailyHydrationConsumedLitres != null ? Number(vitals.dailyHydrationConsumedLitres) * 1000 : null, dailyHydrationTargetMl: vitals?.dailyHydrationTargetLitres != null ? Number(vitals.dailyHydrationTargetLitres) * 1000 : null },
    postSessionOutcome: session.postSessionOutcome || { sessionCompleted: true, sessionAborted: false, symptomsDuringSession: (session.exercises || []).some(exercise => exercise.symptom?.symptomPresent) ? 'user-entered' : 'none-recorded', performanceVsPrevious: 'unknown', cardiovascularResponse: 'unknown', postSessionCoachFlag: 'unknown' },
    mediaAudit: mediaAudit || null,
    exportOptions: session.exportOptions || {},
    media: media.map(item => ({
      id: item.id, file: item.archivePath || item.file, mimeType: item.type || item.mimeType || null, sourceRole: item.sourceRole || 'unknown', photoType: item.photoType || null, createdAt: item.createdAt || null,
      sessionId: item.sessionId || null, linkedExerciseId: item.linkedExerciseId || null, sourceExerciseId: item.sourceExerciseId || null, linkedExerciseName: item.linkedExerciseName || null,
      attachedThisSession: item.userAttachedThisSession === true, capturedThisSession: item.currentSession === true && item.userAttachedThisSession === true && !/reference/i.test(String(item.photoType || item.sourceRole || '')),
      referencePhoto: /reference/i.test(String(item.photoType || item.sourceRole || '')), historicalSourceDate: item.historicalSourceDate || item.referenceSourceDate || null,
      activeReference: item.activeReference === true || item.isActiveReference === true, legacyReference: item.legacyReference === true || item.isLegacyReference === true,
      userAttachedThisSession: item.userAttachedThisSession === true, includeInCoachPack: item.includeInCoachPack !== false, mappingConfidence: item.mappingConfidence || 'unconfirmed',
      roleConfirmed: item.sourceRoleConfirmed === true || item.roleConfirmed === true, dateDetected: item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate || null,
      dateMatchesSession: Boolean((item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate) && (item.ocrMetrics?.dateShown || item.dateDetected || item.fileDate) === session.date), dateUserConfirmed: item.dateUserConfirmed === true || item.dateConfirmed === true,
      metricsValidated: item.metricsValidated === true && item.validationStatus !== 'review-required', metricsUserConfirmed: item.metricsUserConfirmed === true && ocrMediaAuthoritative(item), metricsConfirmed: ocrMediaAuthoritative(item),
      validationStatus: item.validationStatus || null, ocrReviewed: item.ocrReviewed === true, ocrExtractionConfidence: item.ocrExtractionConfidence || null, ocrParsedEvidence: item.ocrParsedEvidence || null,
      ocrRawMetrics: item.ocrMetrics || null, ocrPromotionMetrics: item.ocrPromotionMetrics || null, ocrBlockedFields: item.ocrBlockedFields || [], ocrSourceQuality: item.ocrSourceQuality || null,
      caption: item.caption || item.note || ''
    })),
    exerciseIdentityWarnings: [...identityWarnings, ...duplicateIdentityWarnings, ...overlapIdentityReviews],
    structuredSymptoms: (session.exercises || []).filter(exercise => exercise.symptom?.symptomPresent).map(exercise => ({ exerciseId: exercise.id, sourceExerciseId: exercise.sourceExerciseId || null, exerciseName: exercise.name, ...exercise.symptom })),
    temporarySubstitutions: (session.exercises || []).filter(exercise => exercise.sessionSubstitution?.temporary).map(exercise => ({ exerciseId: exercise.id, lineNumber: exercise.lineNumber, currentExercise: exercise.name, ...exercise.sessionSubstitution })),
    setValidationWarnings: validationWarnings,
    previousComparisonWarnings: comparisonWarnings,
    previousComparisons: comparisons,
    correctionCandidates: session.correctionCandidates || session.strengthAnalysis?.correctionCandidates || [],
    strengthAnalysis: session.strengthAnalysis || null
  };

  lines.push('', '## Coach review request', '', 'Use the dedicated Strength Coach rules included in this ZIP. Inspect every exported file, keep screenshot evidence separate from structured values, flag suspicious visible readings without guessing, and do not compare different machines as equivalent unless Steve confirmed equivalence.', '', '<details>', '<summary>Machine-readable VANTAGE data</summary>', '', '```json', JSON.stringify(machinePayload, null, 2), '```', '', '</details>', '');
  return lines.join('\n');
}

export function workoutMarkdownFilename(session) {
  const sessionName = String(session?.sessionType || 'Workout').replace(/&/g, 'and').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return `VANTAGE_Workout_${safe(session?.date, 'Undated')}_${sessionName || 'Session'}.md`;
}
