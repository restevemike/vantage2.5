import * as db from './db.js?v=1.5.4';
import { templates, exerciseLibrary, sampleVitals, sampleSessions, sampleMeals } from './seed.js?v=1.5.4';
import { parseVantageWorkbook, nameKey, stableId } from './xlsx-import.js?v=1.5.4';
import { calculateReadiness } from './readiness.js?v=1.5.4';
import { parseVitalsMarkdown, applyVitalsToForm, VITALS_FILE_PROMPT, createVitalsMarkdownExample } from './vitals-markdown.js?v=1.5.4';
import { createWorkoutMarkdown, workoutMarkdownFilename } from './workout-markdown.js?v=1.5.4';
import { parseNutritionMarkdown, createNutritionMarkdown, nutritionMarkdownFilename, MACRO_FILE_PROMPT } from './nutrition-markdown.js?v=1.5.4';
import { createLissMarkdown, lissMarkdownFilename, parseLissAnalysisMarkdown, cleanSources, sourcesToLegacyMetrics, legacyMetricsToSources, compareLissSources, classifyLissSession, sanitiseLissAnalysisEvidence } from './liss-markdown.js?v=1.5.4';
import { createZip, sha256Hex } from './zip-pack.js?v=1.5.4';
import { parseBloodworkMarkdown, parseBloodworkAnalysisMarkdown, createBloodworkMarkdown, createBloodworkAnalysisMarkdown, createBloodworkAnalysisRequest, bloodworkMarkdownFilename, bloodworkAnalysisFilename, markerHistory, markerNameKey } from './bloodwork-markdown.js?v=1.5.4';
import { metricsOverview, exerciseNames, exerciseProgress as buildExerciseProgress, muscleDistribution, weeklyTrainingLoad, nutritionWeightSummary, bodyMeasurementSeries, wearableSummary, readinessAlignment, relativeStrength, flattenStrengthSets, nutritionPerformanceAnalysis, nutritionSessionPerformanceAnalysis, strengthSessionFamilies, cycleWeekNumber, cyclePerformanceSummary, supplementPerformanceComparison, supplementStateOnDate } from './metrics-engine.js?v=1.5.4';
import { parseStrengthAnalysisMarkdown, strengthAnalysisTemplate } from './strength-analysis.js?v=1.5.4';
import { runExperimentalOcr, parseFitnessSummaryText, ocrResultRows } from './ocr-engine.js?v=1.5.4';
import { createRecoveryMarkdown, recoveryMarkdownFilename, recoveryAnalysisTemplate } from './recovery-markdown.js?v=1.5.4';
import { findBestPreviousStrengthSession, matchExerciseFromSession, canonicalExerciseIdentity, exerciseCompatibility, historyAuditForExercise } from './workout-history.js?v=1.5.4';
import { duplicateSourceExerciseIds, strengthIdentityBlockingIssues, inferMachineBrand, inferMachineModel, inferMovementPattern } from './strength-integrity.js?v=1.5.4';
import { mediaHashAudit, roleContentValidation, ocrValidationState, ocrMediaAuthoritative } from './evidence-integrity.js?v=1.5.4';
import { detectHistoricalMarkdown } from './historical-import.js?v=1.5.4';
import { builtInExerciseLibrary, exerciseCatalogueSummary } from './exercise-catalogue.js?v=1.5.4';
import { DEFAULT_FEATURE_FLAGS, PROGRAM_PRESETS, HDM_EXTENDED_META, HDM_EXTENDED_SCHEDULE, hdmTransitionGate, normaliseFeatureFlags, activeProgram, nextProgramSlot, advanceProgramProgress, programPresetById } from './programs.js?v=1.5.4';

const APP_VERSION = '1.5.4';
// v1.3.10.6 hotfix: removed stale FTMS renderer calls after FTMS UI was removed from normal LISS.
let replaceExerciseTargetId = null;
const DRAFT_KEY = 'vantage-current-session';

const RECOVERY_ACTIVITIES = [
  { id: 'inversion', name: 'Inversion', classification: 'recovery', section: 'Restorative recovery', description: 'Decompression and relaxed positional recovery.' },
  { id: 'acupressure', name: 'Acupressure', classification: 'recovery', section: 'Restorative recovery', description: 'Timed acupressure or mat work.' },
  { id: 'massage', name: 'Massage', classification: 'recovery', section: 'Restorative recovery', description: 'Manual, percussion or professional massage.' },
  { id: 'yoga-mobility', name: 'Yoga / mobility', classification: 'recovery', section: 'Movement recovery', description: 'Yoga, mobility or controlled stretching.' },
  { id: 'breathwork', name: 'Breathwork / meditation', classification: 'recovery', section: 'Restorative recovery', description: 'Down-regulation, breathing or meditation.' },
  { id: 'nap', name: 'Nap', classification: 'recovery', section: 'Restorative recovery', description: 'A deliberate daytime sleep period.' },
  { id: 'casual-walk', name: 'Casual walk', classification: 'recovery', section: 'Movement recovery', description: 'Low-effort walking for circulation and recovery.' },
  { id: 'post-meal-walk', name: 'Post-meal walk', classification: 'recovery', section: 'Movement recovery', description: 'Easy walking after a meal.' },
  { id: 'sauna', name: 'Sauna', classification: 'physiological-stressor', section: 'Thermal stressors', description: 'Heat exposure; useful, but still a physiological load.' },
  { id: 'steam-room', name: 'Steam room', classification: 'physiological-stressor', section: 'Thermal stressors', description: 'Humid heat exposure recorded as physiological load.' },
  { id: 'cold-plunge', name: 'Cold plunge', classification: 'physiological-stressor', section: 'Thermal stressors', description: 'Cold exposure recorded separately from passive recovery.' },
  { id: 'other-recovery', name: 'Other recovery', classification: 'recovery', section: 'Other', description: 'Any other deliberate restorative action.' },
  { id: 'other-stressor', name: 'Other stressor', classification: 'physiological-stressor', section: 'Other', description: 'Any additional timed physiological stressor.' }
];

const DEFAULT_DAILY_RECOVERY_ROUTINE = [
  { key:'inversion-wake', activityId:'inversion', activityName:'Inversion', durationMinutes:5, timing:'wake', label:'5 min on waking' },
  { key:'inversion-pre-training', activityId:'inversion', activityName:'Inversion', durationMinutes:5, timing:'pre-workout', label:'5 min pre-training' },
  { key:'inversion-post-training', activityId:'inversion', activityName:'Inversion', durationMinutes:5, timing:'post-workout', label:'5 min post-training' },
  { key:'acupressure-pre-bed', activityId:'acupressure', activityName:'Acupressure', durationMinutes:30, timing:'before-bed', label:'30 min pre-bed' }
];

function routineOverrideKey(date, key) { return `vantage-recovery-routine-${date}-${key}`; }
function routineOverride(date, key) { return localStorage.getItem(routineOverrideKey(date,key)) || ''; }
function setRoutineOverride(date, key, value) { if (value) localStorage.setItem(routineOverrideKey(date,key), value); else localStorage.removeItem(routineOverrideKey(date,key)); }

const recoverySectionSelections = Object.fromEntries([...new Set(RECOVERY_ACTIVITIES.map(item => item.section))].map(section => [section, RECOVERY_ACTIVITIES.find(item => item.section === section)?.id || '']));

function readStoredJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const COACH_THREAD_PROMPT = `You are Alex, the VANTAGE Training Console coach and data interpreter.

This thread is the operating companion for Steve’s local-first VANTAGE Training Console app. Steve will paste or share Coach Packs and completed-workout Markdown files generated by the app. Treat the latest Coach Pack as the source of truth for current vitals, meals, macros, workouts and recovery data.

Use relevant knowledge from the Fitness and health project. Food weights for meat, fish, chicken, beef, rice, potato and sweet potato are cooked unless explicitly stated otherwise. Blood pressure can override a green NOOP result. Preserve exercise-specific history and do not compare loads across different machines as equivalent. Consider upcoming training when reviewing cardio, food and recovery. Be direct, do not invent missing data, and do not diagnose medical conditions.

For meal questions, estimate calories and macros, compare them with Steve’s current phase and explain any adjustment. For workout questions, review readiness, BP, sleep, recent training, soreness and planned exercises before recommending normal, deload, BP-watch or recovery-only mode. When a VANTAGE LISS Coach Pack ZIP is attached, use its structured user-entered duration, NOOP Strap session summary, watch/device exercise summary, outdoor GPS and treadmill-console source blocks first, then inspect the Markdown, manifest and every mapped image in the media folder to verify or fill missing values. A NOOP Strap session summary is a first-class source and must not be relabelled as a generic watch/device screen. Keep conflicting sources separate and never average calorie estimates. Structured source blocks are authoritative: screenshots are separate evidence and must never overwrite structured values unless Steve explicitly confirms the screenshot as the correction in VANTAGE. Classify the session and return the downloadable vantage-liss-analysis-v3 Markdown file requested inside the Coach Pack. Give readable feedback first and structured JSON only when it would be useful for future app import.`;

const STRENGTH_COACH_PROMPT_TEXT = "# VANTAGE Strength Coach Thread Instruction \u2014 v1.3.10.6\n\nAdd this once to the dedicated VANTAGE strength-workout Coach thread.\n\nWhen Steve uploads a VANTAGE Strength Coach Pack ZIP:\n\n1. Open the workout Markdown, `manifest.json`, every exported file under `media/`, and the included analysis template.\n2. Treat structured set, vitals, nutrition and session fields as authoritative for their own source. Screenshot readings are evidence and must not silently overwrite structured values.\n3. Keep these media roles separate: `workoutHrSummary`, `exerciseSessionPhoto`, `exerciseReferencePhoto`, `exerciseTechniquePhoto`, `bodyPositionReference`, `machineReference`, `nutritionPhoto`, `bpPhoto`, `hydrationPhoto`, `invalidPhoto`, `unknown`.\n4. Old or archived reference images are not current-session evidence. Do not describe them as current unless the manifest explicitly says `currentSession: true` or `userAttachedThisSession: true`.\n5. Inspect the workout HR screenshot and return clearly visible values only. Preserve the app session time and strap screenshot time separately.\n6. Parse complete duration strings before numeric normalisation. For example, `1h 29m` is 89 minutes, not 29 minutes. Preserve the raw display text as well as parsed minutes.\n7. Extract AVG, MAX/PEAK and LOW/MIN independently from their visible labels. Do not copy AVG into LOW when OCR is uncertain.\n8. Preserve decimal effort and every visible Z1\u2013Z5 percentage/minute pair, including explicit zero values. Do not reallocate missing zone minutes when rounded zone totals differ from session duration.\n9. A suspicious visible value, such as an implausibly low calorie count, must be returned exactly as source evidence and flagged rather than corrected or guessed.\n10. Keep cuff pulse separate from NOOP resting HR and workout HR. Preserve same-day cuff pulse even when the BP record has no dedicated time value.\n11. Use nutrition states `linked`, `pending-import` and `not-recorded`. When the daily macro file is still expected, state exactly: `Nutrition pending Alex macro file import.`\n12. Review exercise identity carefully. Core movement, machine brand, machine model, nickname and variation are separate fields.\n13. A matching source ID alone is not proof that two exercises are equivalent. Comparison confidence must also consider confirmed name, machine brand/model, movement pattern, variation, photo evidence and user-confirmed equivalence.\n14. Flag duplicate source exercise IDs used by separate exercise rows. Distinct machines must remain distinct exercises and distinct history streams.\n15. Each current-session exercise image must resolve to exactly one exercise unless Steve explicitly confirms intentional sharing. Return `sourceRole`, `exerciseId`, `sourceExerciseId`, current-session status and capture timestamp.\n16. Validate per-set notes against the confirmed parent exercise and flag stale labels copied from another exercise or template.\n17. Flag non-warm-up sets with zero reps or zero load where the entry looks incomplete.\n18. Create a downloadable Markdown file containing exactly one fenced block labelled `vantage-strength-analysis` using schema `vantage-strength-analysis-v1` and the exact session ID/date from the Coach Pack.\n\nRequired structure:\n\n```vantage-strength-analysis\n{\n  \"schema\": \"vantage-strength-analysis-v1\",\n  \"sessionId\": null,\n  \"date\": null,\n  \"sessionType\": null,\n  \"workoutHrSummary\": {},\n  \"readinessReview\": {},\n  \"bloodPressureEvidence\": [],\n  \"hydrationReview\": {},\n  \"mediaReview\": {},\n  \"exerciseIdentityWarnings\": [],\n  \"setValidationWarnings\": [],\n  \"observations\": [],\n  \"warnings\": [],\n  \"summary\": \"\"\n}\n```\n\nNever claim Steve confirmed a screenshot-derived correction unless the Coach Pack or current conversation explicitly records that confirmation.\n";
const state = {
  templates: [], sessions: [], vitals: [], meals: [], exercises: [], nutritionDays: [], recoveryLogs: [], bloodTests: [], bloodAnalyses: [], bodyMeasurements: [], trainingCycles: [], supplements: [], supplementEvents: [], supplementMedia: [], programs: [], currentSession: null,
  selectedMode: 'normal', installPrompt: null, pendingWorkbookImport: null, coachContext: 'general',
  lissTickerId: null,
  mediaObjectUrls: [],
  exerciseMediaObjectUrls: [],
  currentLissMedia: [],
  pendingLissMedia: [],
  pendingLissAnalysisSessionId: null,
  pendingStrengthAnalysisSessionId: null,
  pendingHistoricalImport: null,
  ocrContext: null, ocrResult: null, ocrObjectUrl: null,
  recoveryTickerId: null,
  activeLocalDate: null,
  metricsRange: localStorage.getItem('vantage-metrics-range') || '28d',
  metricsFormula: localStorage.getItem('vantage-metrics-formula') || 'epley',
  metricsMuscleMode: localStorage.getItem('vantage-metrics-muscle-mode') || 'sets',
  metricsExercise: localStorage.getItem('vantage-metrics-exercise') || '',
  metricsFuelWindow: localStorage.getItem('vantage-metrics-fuel-window') || 'same-day',
  metricsFuelMetric: localStorage.getItem('vantage-metrics-fuel-metric') || 'calories',
  metricsFuelSessionFamily: localStorage.getItem('vantage-metrics-fuel-session-family') || '',
  metricsFuelOutput: ({ performanceIndex: 'sessionPerformanceIndex', e1rm: 'sessionPerformanceIndex', volume: 'totalVolume' })[localStorage.getItem('vantage-metrics-fuel-output')] || localStorage.getItem('vantage-metrics-fuel-output') || 'sessionPerformanceIndex',
  metricsSupplementId: localStorage.getItem('vantage-metrics-supplement-id') || '',
  metricsProfile: readStoredJson('vantage-metrics-profile', { sex: '', birthYear: '', bodyweight: '' }),
  profile: null,
  activeProgramProgress: null,
  programEditorId: null,
  routineBuilderTemplateId: null,
  routineExerciseEditorIndex: null,
  trainingBuilderTab: localStorage.getItem('vantage-training-builder-tab') || 'cycles',
  pendingSupplementPhoto: null,
  pendingVitalsImport: null,
  supplementObjectUrls: []
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const uid = () => crypto.randomUUID();
const ACTIVE_PROFILE_KEY = 'activeProfile';
const profileId = () => state.profile?.id || 'profile-local';
const num = value => value === '' || value == null ? null : Number(value);
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: digits });
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));

function localDateLabel(value) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function timestampFilename(prefix, extension) {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2300);
}

let hydrationReminderResolver = null;

function hydrationRecorded(value = {}) {
  if (!value || typeof value !== 'object') return false;
  const amount = Number(value.amountMl ?? value.otherFluidMl ?? 0);
  return value.recorded === true || amount > 0 || Number(value.waterMl || 0) > 0 || Number(value.coconutWaterMl || 0) > 0
    || (Array.isArray(value.items) && value.items.length > 0) || Boolean(value.aminoAcids || value.electrolytes || value.notes);
}

function requestHydrationReminder(existing = {}) {
  if (hydrationRecorded(existing) || existing.declined === true || existing.reminderSkipped === true) return Promise.resolve(existing);
  const dialog = $('#hydrationReminderDialog');
  if (!dialog) return Promise.resolve({ ...existing, reminderSkipped: true });
  $('#hydrationReminderAmount').value = existing.amountMl ?? existing.otherFluidMl ?? '';
  $('#hydrationReminderItems').value = Array.isArray(existing.items) ? existing.items.join(', ') : [existing.aminoAcids, existing.electrolytes].filter(Boolean).join(', ');
  $('#hydrationReminderNotes').value = existing.notes || '';
  dialog.showModal();
  return new Promise(resolve => { hydrationReminderResolver = resolve; });
}

function finishHydrationReminder(action) {
  const dialog = $('#hydrationReminderDialog');
  if (!hydrationReminderResolver) { dialog?.close(); return; }
  let result = null;
  if (action === 'add') {
    const amountMl = Number($('#hydrationReminderAmount').value || 0) || null;
    const items = String($('#hydrationReminderItems').value || '').split(',').map(item => item.trim()).filter(Boolean);
    const notes = String($('#hydrationReminderNotes').value || '').trim();
    if (!amountMl && !items.length && !notes) return toast('Enter an amount, contents or hydration note');
    result = { recorded: true, amountMl, items, notes, source: 'user-entered', reminderDecision: 'added' };
  } else if (action === 'none') result = { recorded: false, declined: true, amountMl: null, items: [], notes: 'No hydration taken.', source: 'user-confirmed', reminderDecision: 'none-taken' };
  else if (action === 'skip') result = { recorded: false, reminderSkipped: true, amountMl: null, items: [], notes: '', source: 'not-recorded', reminderDecision: 'finish-anyway' };
  else result = null;
  const resolve = hydrationReminderResolver;
  hydrationReminderResolver = null;
  dialog?.close();
  resolve(result);
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareOrDownloadImage(blob, filename, type = 'image/jpeg') {
  const file = new File([blob], filename, { type: type || blob.type || 'image/jpeg' });
  const canShare = navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }));
  if (canShare) {
    try {
      await navigator.share({ title: filename, files: [file] });
      return 'shared';
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('Image share failed; downloading instead.', error);
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename, type);
  return 'downloaded';
}

function requestImmediateCameraBackup(file, prefix, dateValue = today()) {
  if (!file) return;
  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // Keep this synchronous inside the file-input change event. Android Chrome can
  // block downloads started only after image compression / IndexedDB awaits.
  downloadBlob(file, `${prefix}_${dateValue}_${stamp}.${extension}`, file.type || 'image/jpeg');
}

function sessionWithResolvedVitalsSnapshot(session) {
  const copy = structuredClone(session);
  const vitals = copy.vitalsSnapshot || resolveVitalsForSession({ date: copy.date, startedAt: copy.startedAt, vitalsId: copy.decision?.vitalsId });
  if (!vitals) return copy;
  copy.vitalsSnapshot ||= structuredClone(vitals);
  const readiness = copy.readinessSnapshotAtStart || calculateReadiness(vitals);
  copy.readinessSnapshotAtStart ||= structuredClone(readiness);
  copy.decision ||= {};
  if (!copy.decision.vitalsId) {
    copy.decision.vitalsId = vitals.id || `vitals-${copy.date}`;
    copy.decision.vitalsLinkResolution = 'same-local-date-repair';
    copy.decision.vitalsLinkedAtExport = new Date().toISOString();
  }
  if (!copy.decision.readinessLevel || copy.decision.readinessLevel === 'unknown') {
    copy.decision.readinessLevel = readiness?.level || 'unknown';
    copy.decision.readinessTitle = readiness?.title || 'No readiness result';
    copy.decision.recommendedAction = recommendationAction(readiness);
    copy.decision.readinessCalculationAudit = readiness?.calculationAudit ? structuredClone(readiness.calculationAudit) : null;
  }
  return copy;
}

function ensureSessionVitalsSnapshot(session) {
  if (!session) return session;
  const resolved = sessionWithResolvedVitalsSnapshot(session);
  Object.assign(session, resolved);
  return session;
}

function buildWorkoutMarkdown(session, media = [], mediaAudit = null) {
  session = sessionWithResolvedVitalsSnapshot(session);
  const vitals = session.vitalsSnapshot || resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId }) || null;
  const readiness = session.readinessSnapshotAtStart || (vitals ? calculateReadiness(vitals) : null);
  const meals = state.meals.filter(item => item.date === session.date).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const nutritionSummary = state.nutritionDays.find(item => item.date === session.date) || null;
  const mealTotals = meals.length ? meals.reduce((sum, meal) => ({
    protein: sum.protein + Number(meal.protein || 0),
    carbs: sum.carbs + Number(meal.carbs || 0),
    fat: sum.fat + Number(meal.fat || 0),
    calories: sum.calories + Number(meal.calories || 0)
  }), { protein: 0, carbs: 0, fat: 0, calories: 0 }) : (nutritionSummary ? {
    protein: Number(nutritionSummary.protein || 0),
    carbs: Number(nutritionSummary.carbs || 0),
    fat: Number(nutritionSummary.fat || 0),
    calories: Number(nutritionSummary.calories || 0)
  } : null);
  return createWorkoutMarkdown({
    session,
    sessions: state.sessions,
    vitals,
    readiness,
    meals,
    mealTotals,
    nutritionSummary,
    media,
    mediaAudit,
    appVersion: APP_VERSION,
    coachPackRevision: session.coachPackRevision || 1
  });
}

function isExerciseSessionRole(role) {
  return ['exerciseSessionPhoto', 'exerciseTechniquePhoto', 'bodyPositionReference', 'machineReference', 'invalidPhoto'].includes(role);
}

function normaliseReferenceMedia(item) {
  const active = item.primary === true && item.archived !== true;
  return {
    ...item,
    sourceRole: 'exerciseReferencePhoto',
    photoType: item.photoType || ({
      'new-machine': 'machine-reference',
      'seat-setting': 'seat-setting',
      'foot-placement': 'foot-placement',
      'grip-hold': 'grip-hold',
      'body-position': 'body-position',
      other: 'other-reference'
    })[item.category] || 'reference-photo',
    activeReference: active,
    archived: item.archived === true || !active,
    sessionId: null,
    includeInCoachPack: false,
    mappingConfidence: item.mappingConfidence || 'user-confirmed'
  };
}

async function workoutMediaAudit(session) {
  const sessionRows = await sessionMedia(session.id);
  const exerciseIds = new Set((session.exercises || []).map(exerciseReferenceMediaKey));
  const allReferences = [];
  for (const exerciseId of exerciseIds) {
    const rows = await exerciseReferenceMedia(exerciseId);
    allReferences.push(...rows.map(normaliseReferenceMedia));
  }
  const currentSessionPhotos = sessionRows.filter(item => isExerciseSessionRole(item.sourceRole) && item.sourceRole !== 'invalidPhoto');
  const invalidPhotos = sessionRows.filter(item => item.sourceRole === 'invalidPhoto');
  const orphanPhotos = sessionRows.filter(item => isExerciseSessionRole(item.sourceRole) && item.sourceRole !== 'invalidPhoto' && (!item.linkedExerciseId || !item.linkedExerciseName));
  const activeReferencePhotos = allReferences.filter(item => item.activeReference);
  const archivedReferencePhotos = allReferences.filter(item => item.archived);
  const legacyReferencePhotos = allReferences.filter(item => item.createdAt && String(item.createdAt).slice(0, 10) < String(session.date));
  const blockingIssues = strengthIdentityBlockingIssues(session, sessionRows);
  const warnings = [];
  if (archivedReferencePhotos.length) warnings.push(`${archivedReferencePhotos.length} archived reference image(s) are excluded by default.`);
  if (legacyReferencePhotos.length) warnings.push(`${legacyReferencePhotos.length} reference image(s) pre-date this workout and are not current-session evidence.`);
  if (invalidPhotos.length) warnings.push(`${invalidPhotos.length} image(s) are marked invalid/unrelated and excluded.`);
  if (orphanPhotos.length) warnings.push(`${orphanPhotos.length} current-session image(s) need an exercise link.`);
  for (const issue of blockingIssues) warnings.push(issue.message);
  return {
    totalFiles: sessionRows.length + allReferences.length,
    currentSessionPhotos: currentSessionPhotos.length,
    activeReferencePhotos: activeReferencePhotos.length,
    archivedReferencePhotos: archivedReferencePhotos.length,
    legacyReferencePhotos: legacyReferencePhotos.length,
    invalidOrSuspiciousPhotos: invalidPhotos.length,
    orphanPhotos: orphanPhotos.length,
    blockingIssues,
    warnings
  };
}

async function collectWorkoutMedia(session) {
  const collected = [];
  const sessionRows = await workoutSessionMedia(session);
  for (const item of sessionRows) {
    const include = item.includeInCoachPack !== false && item.sourceRole !== 'invalidPhoto';
    if (!include) continue;
    collected.push({
      ...item,
      sourceRole: item.sourceRole || 'unknown',
      linkedExerciseId: item.linkedExerciseId || null,
      sourceExerciseId: item.sourceExerciseId || null,
      linkedExerciseName: item.linkedExerciseName || null,
      photoType: item.photoType || null,
      includeInCoachPack: true,
      userAttachedThisSession: item.userAttachedThisSession === true || item.sourceRole === 'workoutHrSummary' || isExerciseSessionRole(item.sourceRole),
      currentSession: item.currentSession === true || item.sourceRole === 'workoutHrSummary',
      photoType: item.photoType || (item.sourceRole === 'workoutHrSummary' ? 'current-session-evidence' : null),
      mappingConfidence: item.mappingConfidence || 'user-confirmed',
      caption: item.caption || item.note || (item.sourceRole === 'workoutHrSummary' ? 'Workout HR, effort, calories and zone summary' : '')
    });
  }

  const options = session.exportOptions || {};
  if (options.includeActiveReferencePhotos || options.includeArchivedReferencePhotos) {
    for (const exercise of session.exercises || []) {
      const rows = (await exerciseReferenceMedia(exerciseReferenceMediaKey(exercise))).map(normaliseReferenceMedia);
      const selected = rows.filter(item =>
        (options.includeActiveReferencePhotos && item.activeReference) ||
        (options.includeArchivedReferencePhotos && item.archived)
      );
      for (const item of selected) {
        collected.push({
          ...item,
          sourceRole: 'exerciseReferencePhoto',
          linkedExerciseId: exercise.id || exercise.sourceExerciseId,
          sourceExerciseId: exercise.sourceExerciseId || null,
          linkedExerciseName: exercise.name,
          includeInCoachPack: true,
          userAttachedThisSession: false,
          caption: item.note || exerciseReferenceCategoryLabel(item.category),
          mappingConfidence: item.mappingConfidence || 'user-confirmed'
        });
      }
    }
  }
  return collected;
}
function workoutCoachPackFilename(session) {
  return workoutMarkdownFilename(session).replace(/\.md$/i, '_CoachPack.zip');
}

async function buildWorkoutCoachPack(session) {
  session = sessionWithResolvedVitalsSnapshot(session);
  const rawMedia = await collectWorkoutMedia(session);
  const mediaAudit = await workoutMediaAudit(session);
  if (mediaAudit.blockingIssues?.length) {
    throw new Error(`Coach Pack blocked: ${mediaAudit.blockingIssues[0].message}`);
  }
  const used = new Set();
  const preparedMedia = [];
  for (const item of rawMedia) {
    const folder = (isExerciseSessionRole(item.sourceRole) || item.sourceRole === 'exerciseReferencePhoto') ? 'media/exercises' : 'media/session';
    const fileName = uniqueArchiveName(item.name || `workout_media_${preparedMedia.length + 1}.jpg`, used);
    const archivePath = `${folder}/${fileName}`;
    const sourceRole = normaliseLissMediaRole(item.sourceRole);
    const roleDetails = lissRoleDetails(sourceRole);
    preparedMedia.push({
      ...item,
      sourceRole,
      sourceSystem: item.sourceSystem || roleDetails.sourceSystem,
      sensor: item.sensor || roleDetails.sensor,
      mappingConfidence: item.mappingConfidence || (item.sourceRoleConfirmed === true ? 'user-confirmed' : 'unconfirmed'),
      archivePath,
      sha256: await sha256Hex(item.blob),
      size: item.size || item.blob?.size || 0
    });
  }
  // Coach Pack media integrity: identical binaries may only be collapsed when
  // they carry the same role and exercise linkage. The same image cannot silently
  // masquerade as two different pieces of strength evidence.
  const hashGroups = new Map();
  for (const item of preparedMedia) {
    if (!hashGroups.has(item.sha256)) hashGroups.set(item.sha256, []);
    hashGroups.get(item.sha256).push(item);
  }
  const duplicateIds = new Set();
  for (const [sha256, items] of hashGroups) {
    if (items.length < 2) continue;
    const semanticKeys = [...new Set(items.map(item => `${item.sourceRole || 'unknown'}|${item.linkedExerciseId || ''}`))];
    if (semanticKeys.length > 1) throw new Error(`Coach Pack blocked: identical media ${sha256.slice(0, 10)}… is linked to incompatible roles/exercises. Correct the image mapping before export.`);
    items.slice(1).forEach(item => duplicateIds.add(item.id));
  }
  const exportMedia = preparedMedia.filter(item => !duplicateIds.has(item.id));
  mediaAudit.packaging = {
    storedMediaCount: preparedMedia.length,
    manifestMediaCount: exportMedia.length,
    zipMediaFileCount: exportMedia.length,
    uniqueMediaHashCount: new Set(exportMedia.map(item => item.sha256)).size,
    duplicateSameEvidenceRemoved: duplicateIds.size
  };
  const generatedAt = new Date().toISOString();
  const markdown = buildWorkoutMarkdown(session, exportMedia, mediaAudit);
  const manifest = {
    schema: 'vantage-strength-coach-pack-manifest-v3',
    app: 'VANTAGE Training Console',
    appVersion: APP_VERSION,
    generatedAt,
    actualSessionTime: {
      appStartedAtUtc: session.startedAt || null,
      appCompletedAtUtc: session.completedAt || null,
      noopStrapTimeRange: session.workoutHrSummary?.timeRange || session.workoutHrEvidence?.timeRange || null
    },
    exportTime: { generatedAtUtc: generatedAt },
    sessionId: session.id,
    profileId: session.profileId || profileId(),
    date: session.date,
    sessionType: session.sessionType,
    markdown: workoutMarkdownFilename(session),
    mediaCount: exportMedia.length,
    exportOptions: session.exportOptions || {},
    mediaAudit,
    media: exportMedia.map(item => ({
      id: item.id,
      filename: item.archivePath,
      originalName: item.name,
      type: item.type || item.blob?.type || 'image/jpeg',
      size: item.size,
      sha256: item.sha256,
      sourceRole: item.sourceRole,
      linkedExerciseId: item.linkedExerciseId || null,
      sourceExerciseId: item.sourceExerciseId || null,
      linkedExerciseName: item.linkedExerciseName || null,
      photoType: item.photoType || null,
      currentSession: item.currentSession === true || item.userAttachedThisSession === true || item.sourceRole === 'workoutHrSummary' || isExerciseSessionRole(item.sourceRole),
      caption: item.caption || '',
      mappingConfidence: item.mappingConfidence || 'unconfirmed',
      roleConfirmed: item.sourceRoleConfirmed === true,
      dateDetected: item.dateDetected || item.fileDate || null,
      dateMatchesSession: item.dateMatchesSession === true,
      dateUserConfirmed: item.dateUserConfirmed === true || item.dateConfirmed === true,
      ocrReviewed: item.ocrReviewed === true,
      metricsValidated: item.metricsValidated === true && item.validationStatus !== 'review-required',
      metricsUserConfirmed: item.metricsUserConfirmed === true && ocrMediaAuthoritative(item),
      metricsConfirmed: ocrMediaAuthoritative(item),
      validationStatus: item.validationStatus || (item.metricsValidated === false ? 'review-required' : null),
      ocrBlockedFields: item.ocrBlockedFields || [],
      ocrWarnings: item.ocrWarnings || [],
      ocrExtractionConfidence: item.ocrExtractionConfidence || null,
      ocrParsedEvidence: item.ocrParsedEvidence || null,
      createdAt: item.createdAt || null,
      sessionId: item.sessionId || null,
      userAttachedThisSession: item.userAttachedThisSession === true,
      includeInCoachPack: item.includeInCoachPack !== false,
      archived: item.archived === true,
      activeReference: item.activeReference === true
    }))
  };
  const entries = [
    { name: workoutMarkdownFilename(session), data: markdown },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'VANTAGE_Strength_Analysis_Template.md', data: strengthAnalysisTemplate(session) },
    { name: 'VANTAGE_STRENGTH_COACH_PROMPT.md', data: await (await fetch('./VANTAGE_STRENGTH_COACH_PROMPT.md?v=1.5.4')).text() },
    ...exportMedia.map(item => ({ name: item.archivePath, data: item.blob }))
  ];
  return {
    blob: await createZip(entries),
    filename: workoutCoachPackFilename(session),
    markdown,
    manifest,
    media: exportMedia
  };
}

async function downloadWorkoutMarkdown(session) {
  const media = await collectWorkoutMedia(session);
  const mediaAudit = await workoutMediaAudit(session);
  downloadBlob(buildWorkoutMarkdown(session, media, mediaAudit), workoutMarkdownFilename(session), 'text/markdown;charset=utf-8');
}

async function downloadWorkoutCoachPack(session) {
  session.coachPackRevision = Number(session.coachPackRevision || 0) + 1;
  if (session.id && session.completedAt) await db.put('sessions', structuredClone(session));
  const pack = await buildWorkoutCoachPack(session);
  downloadBlob(pack.blob, pack.filename, 'application/zip');
  return pack;
}

function recoveryCoachPackFilename(session) {
  return recoveryMarkdownFilename(session).replace(/\.md$/i, '_CoachPack.zip');
}

async function buildRecoveryCoachPack(session) {
  const rawMedia = await collectWorkoutMedia(session);
  const used = new Set();
  const preparedMedia = [];
  for (const item of rawMedia) {
    const fileName = uniqueArchiveName(item.name || `recovery_media_${preparedMedia.length + 1}.jpg`, used);
    preparedMedia.push({
      ...item,
      sourceRole: item.sourceRole || 'workoutHrSummary',
      sourceSystem: item.sourceSystem || 'NOOP',
      sensor: item.sensor || 'noopStrap',
      photoType: item.photoType || 'current-session-evidence',
      currentSession: true,
      userAttachedThisSession: true,
      includeInCoachPack: item.includeInCoachPack !== false,
      archivePath: `media/session/${fileName}`,
      sha256: await sha256Hex(item.blob),
      size: item.size || item.blob?.size || 0
    });
  }
  const vitals = session.vitalsSnapshot || resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId }) || null;
  const nutritionSummary = state.nutritionDays.find(item => item.date === session.date) || null;
  const generatedAt = new Date().toISOString();
  const markdown = createRecoveryMarkdown({ session, vitals, nutritionSummary, media: preparedMedia });
  const manifest = {
    schema: 'vantage-recovery-session-manifest-v1', app: 'Vantage Training Console', appVersion: APP_VERSION,
    generatedAt,
    actualSessionTime: {
      manualStartTime: session.recoverySession?.startTime || null,
      manualEndTime: session.recoverySession?.endTime || null,
      noopStrapTimeRange: session.recoverySession?.hr?.timeRange || session.workoutHrSummary?.timeRange || session.workoutHrEvidence?.timeRange || null,
      appStartedAtUtc: session.startedAt || null,
      appCompletedAtUtc: session.completedAt || null
    },
    exportTime: { generatedAtUtc: generatedAt },
    sessionId: session.id, date: session.date, sessionType: session.sessionType,
    markdown: recoveryMarkdownFilename(session), mediaCount: preparedMedia.length, hydration: session.hydration || null,
    media: exportMedia.map(item => ({ id:item.id, filename:item.archivePath, originalName:item.name, type:item.type || item.blob?.type || 'image/jpeg', size:item.size, sha256:item.sha256, sourceRole:item.sourceRole, sourceSystem:item.sourceSystem, sensor:item.sensor, photoType:item.photoType, currentSession:true, userAttachedThisSession:true, includeInCoachPack:item.includeInCoachPack !== false }))
  };
  const entries = [
    { name: recoveryMarkdownFilename(session), data: markdown },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'VANTAGE_Recovery_Analysis_Template.md', data: recoveryAnalysisTemplate(session) },
    { name: 'VANTAGE_RECOVERY_COACH_PROMPT.md', data: await (await fetch('./VANTAGE_RECOVERY_COACH_PROMPT.md?v=1.5.4')).text() },
    ...exportMedia.map(item => ({ name: item.archivePath, data: item.blob }))
  ];
  return { blob: await createZip(entries), filename: recoveryCoachPackFilename(session), markdown, manifest, media: preparedMedia };
}

async function downloadRecoveryCoachPack(session) {
  const pack = await buildRecoveryCoachPack(session);
  downloadBlob(pack.blob, pack.filename, 'application/zip');
  return pack;
}

async function downloadRecoveryMarkdown(session) {
  const media = await collectWorkoutMedia(session);
  const vitals = session.vitalsSnapshot || resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId }) || null;
  const nutritionSummary = state.nutritionDays.find(item => item.date === session.date) || null;
  const markdown = createRecoveryMarkdown({ session, vitals, nutritionSummary, media });
  downloadBlob(markdown, recoveryMarkdownFilename(session), 'text/markdown;charset=utf-8');
}

function isLissSession(session) {
  return Boolean(session && (session.category === 'cardio' || session.templateId === 'liss' || session.cardio));
}

function isRecoverySession(session) {
  return Boolean(session && (session.category === 'recovery' || session.templateId === 'recovery' || session.recoverySession));
}


function activityLabel(value) {
  return ({
    'treadmill-walk': 'Treadmill walk',
    stairmaster: 'StairMaster',
    'outdoor-walk': 'Outdoor walk',
    walking: 'Walking'
  })[value] || 'LISS / cardio';
}

const LISS_MEDIA_ROLES = [
  ['unassigned', 'Choose a source'],
  ['noopStrapSessionSummary', 'NOOP Strap session summary'],
  ['noopStrapHrZones', 'NOOP Strap HR zones'],
  ['noopSessionStreamSaved', 'NOOP saved session / route stream'],
  ['noopHistoricalWorkoutCard', 'NOOP historical workout card'],
  ['noopDailyRecoverySnapshot', 'NOOP daily recovery snapshot'],
  ['watchDeviceExerciseSummary', 'Watch/device exercise summary'],
  ['watchDevicePaceSpeedCadence', 'Watch pace/speed/cadence'],
  ['treadmillMachineConsole', 'Treadmill/machine console'],
  ['outdoorWalkGpsSummary', 'Outdoor walk GPS summary'],
  ['preLissBloodPressure', 'Pre-LISS blood pressure'],
  ['postLissBloodPressure', 'Post-LISS blood pressure'],
  ['hydrationEvidence', 'Hydration evidence'],
  ['nutritionEvidence', 'Nutrition evidence'],
  ['sessionNotes', 'Session notes'],
  ['unknown', 'Other / unsure']
];

const LEGACY_LISS_MEDIA_ROLE_MAP = {
  vantageStrap: 'noopStrapSessionSummary',
  watchDevice: 'watchDeviceExerciseSummary',
  treadmillMachine: 'treadmillMachineConsole',
  other: 'unknown'
};

const LISS_ROLE_DETAILS = {
  noopStrapSessionSummary: { sourceSystem: 'NOOP', sensor: 'noopStrap', badge: 'NOOP Strap', metricSource: 'vantageStrap' },
  noopStrapHrZones: { sourceSystem: 'NOOP', sensor: 'noopStrap', badge: 'NOOP Strap · HR zones', metricSource: 'vantageStrap' },
  noopSessionStreamSaved: { sourceSystem: 'NOOP', sensor: 'noopAppSessionStream', badge: 'NOOP · Saved session/route', metricSource: null },
  noopHistoricalWorkoutCard: { sourceSystem: 'NOOP', sensor: 'noopHistoricalCard', badge: 'NOOP · Historical workout card', metricSource: null },
  noopDailyRecoverySnapshot: { sourceSystem: 'NOOP', sensor: 'noopStrap', badge: 'NOOP · Daily recovery', metricSource: null },
  watchDeviceExerciseSummary: { sourceSystem: 'watchDevice', sensor: 'watchOptical', badge: 'Watch Device', metricSource: 'watchDevice' },
  watchDevicePaceSpeedCadence: { sourceSystem: 'watchDevice', sensor: 'watchOptical', badge: 'Watch · Pace/speed/cadence', metricSource: 'watchDevice' },
  treadmillMachineConsole: { sourceSystem: 'treadmillMachine', sensor: 'treadmillConsole', badge: 'Treadmill Console', metricSource: 'treadmillMachine' },
  outdoorWalkGpsSummary: { sourceSystem: 'watchDevice', sensor: 'phoneGps', badge: 'Outdoor GPS', metricSource: 'watchDevice' },
  preLissBloodPressure: { sourceSystem: 'manualEntry', sensor: 'manualBpCuff', badge: 'Pre-LISS BP', metricSource: null },
  postLissBloodPressure: { sourceSystem: 'manualEntry', sensor: 'manualBpCuff', badge: 'Post-LISS BP', metricSource: null },
  hydrationEvidence: { sourceSystem: 'userNote', sensor: 'galleryImage', badge: 'Hydration', metricSource: null },
  nutritionEvidence: { sourceSystem: 'userNote', sensor: 'userEnteredNutrition', badge: 'Nutrition', metricSource: null },
  sessionNotes: { sourceSystem: 'userNote', sensor: 'galleryImage', badge: 'Session notes', metricSource: null },
  unknown: { sourceSystem: 'unknown', sensor: 'unknown', badge: 'Unknown source', metricSource: null },
  unassigned: { sourceSystem: 'unknown', sensor: 'unknown', badge: 'Unassigned', metricSource: null }
};

function normaliseLissMediaRole(role) {
  return LEGACY_LISS_MEDIA_ROLE_MAP[role] || role || 'unassigned';
}

function lissRoleDetails(role) {
  return LISS_ROLE_DETAILS[normaliseLissMediaRole(role)] || LISS_ROLE_DETAILS.unknown;
}

function lissRoleToMetricSource(role) {
  return lissRoleDetails(role).metricSource;
}

function normaliseLissActivity(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (['treadmill-walk', 'treadmill walk', 'treadmill'].includes(text)) return 'treadmill-walk';
  if (['stairmaster', 'stair master', 'stairs'].includes(text)) return 'stairmaster';
  if (['outdoor-walk', 'outdoor walk', 'outdoor walking', 'gps walk'].includes(text)) return 'outdoor-walk';
  if (['walking', 'walk'].includes(text)) return 'walking';
  return text;
}

function defaultLissSources() {
  return cleanSources({
    vantageStrap: { hrSource: 'strap', hrZones: {} },
    watchDevice: { caloriesPerMinute: {} },
    treadmillMachine: {},
    ftmsMachine: {}
  });
}

function pathValue(object, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], object);
}

function setPathValue(object, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  let cursor = object;
  keys.slice(0, -1).forEach(key => { cursor[key] ||= {}; cursor = cursor[key]; });
  if (keys.length) cursor[keys.at(-1)] = value;
}

function refreshLegacyLissMetrics(cardio) {
  cardio.sources = cardio.sources ? cleanSources(cardio.sources) : legacyMetricsToSources(cardio.metrics || {});
  cardio.metrics = sourcesToLegacyMetrics(cardio.sources, cardio.metrics || {});
  if (!cardio.metrics.durationSeconds && cardio.elapsedSeconds) cardio.metrics.durationSeconds = cardio.elapsedSeconds;
  return cardio.metrics;
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


function isRestDaySession(session) {
  return Boolean(session && (session.category === 'rest' || session.templateId === 'rest-day'));
}

function todayRestDay() {
  return state.sessions.find(session => session.date === today() && isRestDaySession(session)) || null;
}

function recommendationAction(readiness) {
  if (!readiness) return 'No recommendation recorded';
  if (readiness.level === 'red') return 'Recovery only';
  if (readiness.level === 'amber') return 'Controlled training, deload or rest';
  return 'Productive training allowed';
}

function actualActionsForDate(date) {
  const sessions = state.sessions.filter(session => session.date === date);
  const logs = state.recoveryLogs.filter(log => log.date === date);
  const actions = [];
  if (sessions.some(isRestDaySession)) actions.push('Rest day');
  if (sessions.some(session => !isRestDaySession(session) && isLissSession(session))) actions.push('LISS / conditioning');
  if (sessions.some(session => isRecoverySession(session))) actions.push('Recovery session');
  if (sessions.some(session => !isRestDaySession(session) && !isLissSession(session) && !isRecoverySession(session))) actions.push('Strength training');
  if (logs.some(log => log.classification === 'recovery')) actions.push('Recovery work');
  if (logs.some(log => log.classification === 'physiological-stressor')) actions.push('Physiological stressor');
  return actions;
}

async function removeTodayRestDay({ silent = false } = {}) {
  const rest = todayRestDay();
  if (!rest) return false;
  await db.remove('sessions', rest.id);
  await refreshState();
  if (!silent) { renderAll(); toast('Rest day record removed'); }
  return true;
}

async function recordRestDay() {
  if (state.currentSession) return toast('Finish or reset the active workout before recording a rest day');
  const date = today();
  const trainingToday = state.sessions.find(session => session.date === date && !isRestDaySession(session));
  if (trainingToday) return toast('Training is already saved for today, so a rest day cannot also be recorded');
  if (todayRestDay()) return toast('Rest day is already recorded');
  const vitals = latestVitals();
  const readiness = vitals ? calculateReadiness(vitals) : null;
  const now = new Date().toISOString();
  const restSession={id:`rest-day-${date}`,profileId:profileId(),date,startedAt:now,completedAt:now,templateId:'rest-day',sessionType:'Rest Day',category:'rest',mode:'rest',exercises:[],notes:'Rest day recorded from the dashboard.',trainingContext:{cycles:cycleContextSnapshot(date),supplements:supplementContextSnapshot(date),capturedAt:now},decision:{recordedAt:now,vitalsId:vitals?.id||null,readinessLevel:readiness?.level||'unknown',readinessTitle:readiness?.title||'No vitals logged',recommendedAction:recommendationAction(readiness),actualAction:'rest-day'}};
  await db.put('sessions',restSession); await advanceActiveProgramAfterSession(restSession); await refreshState();
  renderAll();
  toast('Rest day recorded');
}

async function saveRecoveryAction(activityId) {
  const definition = RECOVERY_ACTIVITIES.find(item => item.id === activityId);
  if (!definition) return;
  const card = document.querySelector(`[data-recovery-card="${activityId}"]`);
  const durationMinutes = Math.round(Number(card?.querySelector('[data-recovery-duration]')?.value || 0));
  if (durationMinutes < 1) return toast('Enter the recovery duration in minutes');
  const timeOfDay = card?.querySelector('[data-recovery-time]')?.value || '';
  const notes = card?.querySelector('[data-recovery-notes]')?.value?.trim() || '';
  if (activityId === 'yoga-mobility') {
    if (state.currentSession) return toast('Finish or reset the active session first');
    const template = state.templates.find(item => item.id === 'recovery') || templates.find(item => item.id === 'recovery');
    const session = createSessionFromTemplate(template, 'normal');
    session.recoverySession.durationMinutes = durationMinutes;
    session.recoverySession.startTime = timeOfDay;
    session.recoverySession.notes = notes;
    session.notes = notes;
    state.currentSession = session;
    persistDraft(); renderAll(); showScreen('workout');
    return toast('Yoga opened as a recovery session');
  }
  const now = new Date();
  await db.put('recoveryLogs', {
    id: uid(), date: today(), activityId, activityName: definition.name,
    classification: definition.classification, section: definition.section,
    durationSeconds: durationMinutes * 60, durationMinutes,
    durationInputMode: 'manual', durationSource: 'user-entered', timerUsed: false,
    timeOfDay,
    intensity: card?.querySelector('[data-recovery-intensity]')?.value || 'easy',
    timing: card?.querySelector('[data-recovery-timing]')?.value || 'separate',
    notes,
    recordedAt: now.toISOString(), completedAt: now.toISOString(), source: 'recovery-screen-manual',
    decision: (() => {
      const vitals = latestVitals(); const readiness = vitals ? calculateReadiness(vitals) : null;
      return { vitalsId: vitals?.id || null, readinessLevel: readiness?.level || 'unknown', recommendedAction: recommendationAction(readiness), actualAction: definition.classification === 'physiological-stressor' ? 'physiological-stressor' : 'recovery' };
    })()
  });
  if (card) { card.querySelector('[data-recovery-duration]').value = ''; card.querySelector('[data-recovery-notes]').value = ''; }
  await refreshState(); renderAll(); showScreen('recovery'); toast(`${definition.name} saved`);
}

function renderRecoveryCard(activity) {
  const badge = activity.classification === 'physiological-stressor' ? 'Stressor' : 'Recovery';
  return `<details class="recovery-card" data-recovery-card="${escapeHtml(activity.id)}" open>
    <summary><span><strong>${escapeHtml(activity.name)}</strong></span><span class="recovery-badge ${activity.classification}">${badge}</span></summary>
    <div class="recovery-card-body"><p>${escapeHtml(activity.description)}</p>
    <div class="recovery-fields">
      <label>Duration (minutes)<input data-recovery-duration type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="12"></label>
      <label>Time of day (optional)<input data-recovery-time type="time"></label>
      <label>Intensity<select data-recovery-intensity><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></label>
      <label>Timing<select data-recovery-timing><option value="separate">Separate session</option><option value="wake">On waking</option><option value="pre-workout">Pre-workout</option><option value="post-workout">Post-workout</option><option value="before-bed">Before bed</option></select></label>
      <label class="full-width">Notes<textarea data-recovery-notes rows="2" placeholder="Temperature, position, nasal breathing, how it felt…"></textarea></label>
    </div>
    <button class="button button-success button-wide" type="button" data-recovery-action="save" data-recovery-activity="${escapeHtml(activity.id)}">Save ${escapeHtml(activity.name)}</button></div>
  </details>`;
}

function recoveryRoutineStatus(date, item) {
  const override = routineOverride(date, item.key);
  if (override === 'skipped') return { status:'Skipped', state:'skipped' };
  const matches = state.recoveryLogs.filter(log => log.date === date && log.activityId === item.activityId && log.timing === item.timing && log.routineStatus !== 'skipped');
  if (!matches.length) return { status:'Planned / pending', state:'pending' };
  const latest = matches[0];
  const modified = Number(latest.durationMinutes || 0) !== Number(item.durationMinutes);
  return { status: modified ? `Completed · modified ${latest.durationMinutes} min` : 'Completed', state: modified ? 'modified' : 'completed' };
}

async function markDefaultRecoveryRoutine(key, action) {
  const item = DEFAULT_DAILY_RECOVERY_ROUTINE.find(entry => entry.key === key);
  if (!item) return;
  const date = today();
  if (action === 'skip') { setRoutineOverride(date,key,'skipped'); renderRecovery(); return toast(`${item.activityName} marked skipped for today`); }
  setRoutineOverride(date,key,'');
  const now = new Date().toISOString();
  await db.put('recoveryLogs', { id:`routine-${date}-${item.key}`, date, activityId:item.activityId, activityName:item.activityName, classification:'recovery', section:'Default routine', durationSeconds:item.durationMinutes*60, durationMinutes:item.durationMinutes, durationInputMode:'default-routine', durationSource:'default-routine-confirmed', timerUsed:false, timeOfDay:'', intensity:'easy', timing:item.timing, notes:`Default routine: ${item.label}`, recordedAt:now, completedAt:now, source:'default-routine', routineKey:item.key, routineStatus:'completed' });
  await refreshState(); renderRecovery(); toast(`${item.activityName} completed`);
}

function renderDefaultRecoveryRoutine(date) {
  const node=$('#defaultRecoveryRoutineList'); if(!node) return;
  node.innerHTML=DEFAULT_DAILY_RECOVERY_ROUTINE.map(item=>{ const stateInfo=recoveryRoutineStatus(date,item); return `<div class="list-item default-routine-item ${stateInfo.state}"><div><h4>${escapeHtml(item.activityName)}</h4><p>${escapeHtml(item.label)} · ${escapeHtml(stateInfo.status)}</p></div><div class="routine-actions"><button class="button button-small button-success" data-routine-complete="${escapeHtml(item.key)}" type="button">Completed</button><button class="button button-small button-ghost" data-routine-skip="${escapeHtml(item.key)}" type="button">Skip</button></div></div>`; }).join('');
}

function renderRecovery() {
  const screen = $('#recoveryScreen');
  if (!screen) return;
  const date = today();
  renderDefaultRecoveryRoutine(date);
  const todaysLogs = state.recoveryLogs.filter(log => log.date === date && log.routineStatus !== 'skipped');
  const recoverySeconds = todaysLogs.filter(log => log.classification === 'recovery').reduce((sum, log) => sum + Number(log.durationSeconds || 0), 0);
  const stressSeconds = todaysLogs.filter(log => log.classification === 'physiological-stressor').reduce((sum, log) => sum + Number(log.durationSeconds || 0), 0);
  $('#recoverySummary').innerHTML = [
    ['Recovery time', `${Math.round(recoverySeconds / 60)} min`],
    ['Stressor time', `${Math.round(stressSeconds / 60)} min`],
    ['Actions saved', todaysLogs.length],
    ['Rest day', todayRestDay() ? 'Recorded' : 'No']
  ].map(([label, value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  const vitals = latestVitals();
  const readiness = vitals ? calculateReadiness(vitals) : null;
  const actions = actualActionsForDate(date);
  $('#recoveryDayDecision').innerHTML = `<div class="decision-row"><span>App recommendation</span><strong>${escapeHtml(recommendationAction(readiness))}</strong></div><div class="decision-row"><span>Actual actions logged</span><strong>${escapeHtml(actions.join(' · ') || 'Nothing recorded yet')}</strong></div>`;

  const sections = [...new Set(RECOVERY_ACTIVITIES.map(item => item.section))];
  $('#recoveryActivitySections').innerHTML = sections.map(section => {
    const activities = RECOVERY_ACTIVITIES.filter(item => item.section === section);
    const selectedId = activities.some(item => item.id === recoverySectionSelections[section]) ? recoverySectionSelections[section] : activities[0]?.id;
    recoverySectionSelections[section] = selectedId;
    const selected = activities.find(item => item.id === selectedId) || activities[0];
    return `<section class="recovery-section" data-recovery-section="${escapeHtml(section)}"><div class="recovery-section-heading"><h3>${escapeHtml(section)}</h3></div><label class="recovery-session-picker"><span>Recovery session</span><select data-recovery-section-select="${escapeHtml(section)}">${activities.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><div class="recovery-card-grid">${selected ? renderRecoveryCard(selected) : ''}</div></section>`;
  }).join('');

  const logItem = log => `<div class="list-item recovery-log-item"><div><h4>${escapeHtml(log.activityName)}</h4><p>${durationLabel(log.durationSeconds)} · ${escapeHtml(log.intensity || 'easy')} · ${escapeHtml((log.timing || 'separate').replace(/-/g, ' '))}${log.notes ? ` · ${escapeHtml(log.notes)}` : ''}</p></div><div class="recovery-log-actions"><strong>${log.classification === 'physiological-stressor' ? 'Stressor' : 'Recovery'}</strong><button class="icon-button" type="button" data-delete-recovery-log="${escapeHtml(log.id)}" aria-label="Delete recovery log">×</button></div></div>`;
  $('#recoveryTodayList').innerHTML = todaysLogs.length ? todaysLogs.slice().sort((a,b) => String(b.completedAt).localeCompare(String(a.completedAt))).map(logItem).join('') : '<div class="empty-state">No recovery actions saved today.</div>';
  $('#recoveryRecentList').innerHTML = state.recoveryLogs.slice(0, 12).map(log => `<div class="list-item"><div><h4>${escapeHtml(log.activityName)}</h4><p>${localDateLabel(log.date)} · ${durationLabel(log.durationSeconds)}${log.notes ? ` · ${escapeHtml(log.notes)}` : ''}</p></div><strong>${log.classification === 'physiological-stressor' ? 'Stressor' : 'Recovery'}</strong></div>`).join('') || '<div class="empty-state">No recovery history yet.</div>';
}

function lissElapsedSeconds(session = state.currentSession) {
  return Math.max(0, Number(session?.cardio?.elapsedSeconds || (Number(session?.cardio?.manualDurationMinutes || 0) * 60) || 0));
}

async function sessionMedia(sessionId) {
  if (!sessionId) return [];
  return db.getAllByIndex('sessionMedia', 'sessionId', sessionId);
}

function lissMarkdownFor(session, media) {
  const vitals = session.vitalsSnapshot || resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId }) || null;
  const readiness = session.readinessSnapshotAtStart || (vitals ? calculateReadiness(vitals) : null);
  const meals = state.meals.filter(item => item.date === session.date).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const nutritionSummary = state.nutritionDays.find(item => item.date === session.date) || null;
  return createLissMarkdown({ session, vitals, readiness, meals, nutritionSummary, media });
}

function archiveSafeName(value, fallback = 'image.jpg') {
  const cleaned = String(value || fallback)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function uniqueArchiveName(name, used) {
  const safe = archiveSafeName(name);
  let candidate = safe;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const dot = safe.lastIndexOf('.');
    candidate = dot > -1 ? `${safe.slice(0, dot)}_${counter}${safe.slice(dot)}` : `${safe}_${counter}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function lissCoachPackFilename(session) {
  return lissMarkdownFilename(session).replace(/\.md$/i, '_CoachPack.zip');
}

async function buildLissCoachPack(session, media) {
  const expectedIds = new Set(session.cardio?.mediaIds || []);
  const storedIds = new Set((media || []).map(item => item.id));
  const missingExpectedIds = [...expectedIds].filter(id => !storedIds.has(id));
  if (missingExpectedIds.length) throw new Error(`Coach Pack blocked: ${missingExpectedIds.length} current-session image${missingExpectedIds.length === 1 ? ' is' : 's are'} missing from local media storage. Reattach or explicitly remove the missing image before exporting.`);
  const invalidRoles = (media || []).filter(item => !item.sourceRole || normaliseLissMediaRole(item.sourceRole) === 'unassigned' || item.sourceRoleConfirmed !== true);
  if (invalidRoles.length) throw new Error(`Review and confirm the source role for ${invalidRoles.length} image${invalidRoles.length === 1 ? '' : 's'} before exporting the Coach Pack.`);
  const missingBlobs = (media || []).filter(item => !(item.blob instanceof Blob) || item.blob.size < 1);
  if (missingBlobs.length) throw new Error(`${missingBlobs.length} attached image${missingBlobs.length === 1 ? ' is' : 's are'} missing from local storage. Reattach the image before exporting.`);
  const attachedNames = new Set((media || []).flatMap(item => [item.name, item.originalName].filter(Boolean).map(name => String(name).toLowerCase())));
  const referencedFiles = Object.values(session.cardio?.sources || {})
    .map(source => source?.sourceFile)
    .filter(Boolean);
  const missingReferencedFiles = referencedFiles.filter(file => !attachedNames.has(String(file).toLowerCase()));
  if (missingReferencedFiles.length) throw new Error(`Coach Pack blocked because referenced session media is missing: ${missingReferencedFiles.join(', ')}. Reattach or remove the stale source reference.`);
  const used = new Set();
  const preparedMedia = [];
  for (const item of media) {
    const fileName = uniqueArchiveName(item.name || `LISS_image_${preparedMedia.length + 1}.jpg`, used);
    const archivePath = `media/${fileName}`;
    preparedMedia.push({
      ...item,
      archivePath,
      sha256: await sha256Hex(item.blob),
      size: item.size || item.blob?.size || 0
    });
  }
  const hashAudit = mediaHashAudit(preparedMedia);
  if (hashAudit.blocking.length) {
    const details = hashAudit.duplicates.filter(group => group.roles.length > 1).map(group => `${group.roles.join(' / ')}`).join(', ');
    throw new Error(`Coach Pack blocked: the same binary image has incompatible source roles${details ? ` (${details})` : ''}. Remove or correct the duplicate before export.`);
  }
  for (const item of preparedMedia) {
    if (!String(item.ocrRawText || '').trim()) continue;
    const roleCheck = roleContentValidation(item.sourceRole, item.ocrRawText);
    item.roleContentValidation = roleCheck;
    if (roleCheck.level === 'red') throw new Error(`Coach Pack blocked: ${item.name} does not match its confirmed role ${lissRoleDetails(item.sourceRole).badge}. ${roleCheck.warnings.join(' ')}`);
  }
  // Exact duplicates assigned to the same role add no evidence. Package only one binary.
  const duplicateSameRoleIds = new Set();
  hashAudit.duplicates.filter(group => group.roles.length === 1).forEach(group => group.ids.slice(1).forEach(id => duplicateSameRoleIds.add(id)));
  const exportMedia = preparedMedia.filter(item => !duplicateSameRoleIds.has(item.id));
  const generatedAt = new Date().toISOString();
  const markdown = lissMarkdownFor(session, exportMedia);
  const mediaAudit = {
    appMediaStateCount: expectedIds.size,
    storedMediaCount: preparedMedia.length,
    manifestMediaCount: exportMedia.length,
    zipMediaFileCount: exportMedia.length,
    uniqueMediaHashCount: new Set(exportMedia.map(item => item.sha256)).size,
    duplicateHashGroups: hashAudit.duplicates,
    totalFiles: exportMedia.length,
    roleCounts: exportMedia.reduce((counts, item) => {
      counts[item.sourceRole] = (counts[item.sourceRole] || 0) + 1;
      return counts;
    }, {}),
    sourceSystems: [...new Set(exportMedia.map(item => item.sourceSystem))],
    unconfirmedRoles: exportMedia.filter(item => item.sourceRoleConfirmed !== true).length,
    unknownRoles: exportMedia.filter(item => item.sourceRole === 'unknown').length
  };
  const manifest = {
    schema: 'vantage-coach-pack-manifest-v4',
    app: 'VANTAGE Training Console',
    appVersion: APP_VERSION,
    generatedAt,
    actualSessionTime: {
      userEnteredDurationMinutes: Number(session.cardio?.manualDurationMinutes || 0) || (Number(session.cardio?.elapsedSeconds || 0) / 60) || null,
      manualStartTime: session.cardio?.manualStartTime || null,
      manualEndTime: session.cardio?.manualEndTime || null,
      noopTimeRange: session.cardio?.sources?.vantageStrap?.timeRange || null,
      noopDurationMinutes: session.cardio?.sources?.vantageStrap?.durationMinutes ?? null,
      machineDuration: session.cardio?.sources?.treadmillMachine?.totalTime || null,
      appStartedAtUtc: session.startedAt || null,
      appCompletedAtUtc: session.completedAt || null
    },
    exportTime: { generatedAtUtc: generatedAt },
    sessionId: session.id,
    date: session.date,
    activityType: session.cardio?.activityType,
    markdown: lissMarkdownFilename(session),
    mediaCount: exportMedia.length,
    exportOptions: session.exportOptions || {},
    mediaAudit,
    media: exportMedia.map(item => ({
      id: item.id,
      filename: item.archivePath,
      originalName: item.name,
      type: item.type || item.blob?.type || 'image/jpeg',
      size: item.size,
      sha256: item.sha256,
      captureSource: item.captureSource || 'unknown',
      sourceRole: item.sourceRole || 'unknown',
      sourceSystem: item.sourceSystem || lissRoleDetails(item.sourceRole).sourceSystem,
      sensor: item.sensor || lissRoleDetails(item.sourceRole).sensor,
      roleConfirmed: item.sourceRoleConfirmed === true,
      sourceRoleConfirmed: item.sourceRoleConfirmed === true,
      metricsConfirmed: item.metricsConfirmed === true,
      ocrReviewed: item.ocrReviewed === true,
      sourceRoleAssignedAt: item.sourceRoleAssignedAt || null,
      mappingConfidence: item.mappingConfidence || (item.sourceRoleConfirmed === true ? 'user-confirmed' : 'unconfirmed'),
      photoType: item.photoType || 'current-session-evidence',
      currentSession: true,
      userAttachedThisSession: true,
      extractionStatus: item.extractionStatus || 'not-extracted',
      ocrMetrics: item.ocrMetrics || null,
      ocrWarnings: item.ocrWarnings || [],
      ocrExtractedAt: item.ocrExtractedAt || null,
      createdAt: item.createdAt || null,
      fileDate: item.fileDate || null,
      sessionDateMatch: !item.fileDate || item.fileDate === session.date,
      dateConfirmed: Boolean(item.dateConfirmed),
      roleContentValidation: item.roleContentValidation || null
    }))
  };
  const entries = [
    { name: lissMarkdownFilename(session), data: markdown },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    ...exportMedia.map(item => ({ name: item.archivePath, data: item.blob }))
  ];
  return {
    blob: await createZip(entries),
    filename: lissCoachPackFilename(session),
    markdown,
    manifest,
    media: exportMedia
  };
}

async function launchLissShare(session, media, { download = true } = {}) {
  const pack = await buildLissCoachPack(session, media);
  if (download) downloadBlob(pack.blob, pack.filename, 'application/zip');
  const file = new File([pack.blob], pack.filename, { type: 'application/zip' });
  try {
    const canShareFiles = navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }));
    if (canShareFiles) {
      await navigator.share({
        title: `${activityLabel(session.cardio?.activityType)} Coach Pack`,
        text: 'Complete VANTAGE LISS Coach Pack. The ZIP contains the Markdown report, every attached image and a manifest.',
        files: [file]
      });
      return 'shared';
    }
  } catch (error) {
    if (error.name === 'AbortError') return 'cancelled';
    console.warn('Coach Pack sharing failed; the ZIP is already downloaded.', error);
  }
  return 'downloaded';
}

async function shareLissCoachPack(session, options = {}) {
  return launchLissShare(session, await sessionMedia(session.id), options);
}

async function downloadLissCoachPack(session) {
  const pack = await buildLissCoachPack(session, await sessionMedia(session.id));
  downloadBlob(pack.blob, pack.filename, 'application/zip');
  return pack;
}

async function seedDatabase(force = false) {
  if (force) await db.clearAll();
  const [existingTemplates, existingExercises, seeded] = await Promise.all([
    db.getAll('templates'), db.getAll('exercises'), db.get('settings', 'seeded')
  ]);
  if (force || existingTemplates.length === 0) await db.putMany('templates', templates);
  else {
    const systemTemplates = templates.filter(item => ['liss', 'recovery'].includes(item.id) && !existingTemplates.some(existing => existing.id === item.id));
    if (systemTemplates.length) await db.putMany('templates', systemTemplates);
  }
  const existingByName = new Set(existingExercises.map(item => nameKey(item.name)));
  const catalogueMissing = builtInExerciseLibrary.filter(item => !existingByName.has(nameKey(item.name)));
  const starterMissing = exerciseLibrary.filter(item => !existingByName.has(nameKey(item.name)) && !catalogueMissing.some(row => nameKey(row.name) === nameKey(item.name)));
  if (force || existingExercises.length === 0) {
    const merged = [...builtInExerciseLibrary, ...exerciseLibrary.filter(item => !builtInExerciseLibrary.some(row => nameKey(row.name) === nameKey(item.name)))];
    await db.putMany('exercises', merged);
  } else if (catalogueMissing.length || starterMissing.length) {
    await db.putMany('exercises', [...catalogueMissing, ...starterMissing]);
  }
  if (force || !seeded) {
    await db.putMany('vitals', sampleVitals);
    await db.putMany('sessions', sampleSessions);
    await db.putMany('meals', sampleMeals);
    await db.put('settings', { key: 'seeded', value: true });
  }
}

async function applyV133ExerciseIdentityMigration() {
  const setting = await db.get('settings', 'v133ExerciseIdentityMigration');
  if (setting?.value) return;
  const templateRows = await db.getAll('templates');
  for (const template of templateRows) {
    let changed = false;
    for (const exercise of template.exercises || []) {
      if (/seated\s+laterial\s+raise\s+machine/i.test(exercise.name || '')) { exercise.name = 'Seated lateral raise machine'; changed = true; }
      if (/^dumbbell lateral raise$/i.test(exercise.name || '')) {
        exercise.aliases = [...new Set([...(exercise.aliases || []), exercise.name])];
        exercise.name = 'Lateral raise'; exercise.variation = exercise.variation || 'Machine'; changed = true;
      }
      for (const set of exercise.sets || []) {
        if (set.restRecorded !== true && Number(set.restSeconds || 0) === 0) { set.restSeconds = null; set.restRecorded = false; changed = true; }
      }
    }
    if (changed) await db.put('templates', template);
  }
  const library = await db.getAll('exercises');
  for (const exercise of library) {
    let changed = false;
    if (/seated\s+laterial\s+raise\s+machine/i.test(exercise.name || '')) { exercise.name = 'Seated lateral raise machine'; exercise.nameKey = nameKey(exercise.name); changed = true; }
    if (/^dumbbell lateral raise$/i.test(exercise.name || '')) { exercise.aliases = [...new Set([...(exercise.aliases || []), exercise.name])]; exercise.name = 'Lateral raise'; exercise.nameKey = nameKey(exercise.name); exercise.variation = exercise.variation || 'Machine'; changed = true; }
    if (changed) await db.put('exercises', exercise);
  }
  await db.put('settings', { key: 'v133ExerciseIdentityMigration', value: true, updatedAt: new Date().toISOString() });
}


async function applyV138ExerciseIdentityRepair() {
  const setting = await db.get('settings', 'v138ExerciseIdentityRepair');
  if (setting?.value) return;
  const repairExercise = exercise => {
    let changed = false;
    const aliases = (exercise.aliases || []).map(value => String(value));
    if (/^lateral raise$/i.test(exercise.name || '') && /machine/i.test(exercise.variation || '') && aliases.some(alias => /^dumbbell lateral raise$/i.test(alias)) && !exercise.machineBrand && !exercise.machineModel) {
      exercise.name = 'Dumbbell Lateral Raise'; exercise.variation = 'Dumbbell';
      exercise.nameKey = nameKey(exercise.name); changed = true;
    }
    return changed;
  };
  for (const template of await db.getAll('templates')) {
    let changed = false;
    for (const exercise of template.exercises || []) changed = repairExercise(exercise) || changed;
    if (changed) await db.put('templates', template);
  }
  for (const exercise of await db.getAll('exercises')) if (repairExercise(exercise)) await db.put('exercises', exercise);
  for (const session of await db.getAll('sessions')) {
    let changed = false;
    for (const exercise of session.exercises || []) changed = repairExercise(exercise) || changed;
    if (changed) await db.put('sessions', session);
  }
  await db.put('settings', { key: 'v138ExerciseIdentityRepair', value: true, updatedAt: new Date().toISOString() });
}

async function applyV13105HistoryRepair() {
  const setting = await db.get('settings', 'v13105HistoryRepair');
  if (setting?.value) return;
  const sessions = await db.getAll('sessions');
  const templates = await db.getAll('templates');
  let repaired = 0;
  for (const session of sessions) {
    if (!Array.isArray(session.exercises) || !session.exercises.length || isLissSession(session) || isRecoverySession(session) || isRestDaySession(session)) continue;
    const template = templates.find(item => item.id === session.templateId) || { id: session.templateId, name: session.sessionType, sessionType: session.sessionType, exercises: session.exercises };
    const previous = findBestPreviousStrengthSession(sessions, template, { beforeDate: session.date, excludeSessionId: session.id });
    const nextId = previous?.id || null;
    if ((session.previousSessionId || null) !== nextId) {
      session.previousSessionId = nextId;
      session.historyLinkRepairedAt = new Date().toISOString();
      session.historyLinkRepairVersion = '1.3.10.6';
      await db.put('sessions', session);
      repaired += 1;
    }
  }
  await db.put('settings', { key: 'v13105HistoryRepair', value: { completed: true, repaired, completedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
}

async function ensureProfileFoundation() {
  const stored = await db.get('settings', ACTIVE_PROFILE_KEY);
  if (stored?.value?.id) state.profile = stored.value;
  else {
    const metrics = await db.get('settings', 'metricsProfile');
    state.profile = {
      id: `profile-${uid()}`,
      name: 'Steve',
      birthYear: metrics?.value?.birthYear || '',
      heightCm: 182.9,
      sex: metrics?.value?.sex || 'male',
      units: 'metric',
      timezone: 'Europe/London',
      goal: 'Cut / recomp while preserving strength and muscle',
      trainingExperience: 'Experienced',
      targetBodyweightKg: null,
      foodPreferences: 'Limit oats and sesame; no alcohol',
      notes: '',
      features: { ...DEFAULT_FEATURE_FLAGS },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schema: 'vantage-profile-v1'
    };
    await db.put('settings', { key: ACTIVE_PROFILE_KEY, value: state.profile, updatedAt: new Date().toISOString() });
  }

  state.profile.features = normaliseFeatureFlags(state.profile.features);
  const stores = ['sessions','vitals','meals','templates','exercises','nutritionDays','recoveryLogs','bloodTests','bloodAnalyses','bodyMeasurements','trainingCycles','supplements','supplementEvents','supplementMedia','programs'];
  for (const store of stores) {
    const rows = await db.getAll(store);
    const missing = rows.filter(row => !row.profileId).map(row => ({ ...row, profileId: state.profile.id }));
    if (missing.length) await db.putMany(store, missing);
  }
}

function renderProfile() {
  const form = $('#profileForm');
  if (!form || !state.profile) return;
  for (const field of ['id','name','birthYear','heightCm','sex','units','timezone','goal','trainingExperience','targetBodyweightKg','foodPreferences','notes']) {
    if (form.elements[field]) form.elements[field].value = state.profile[field] ?? '';
  }
  const features = normaliseFeatureFlags(state.profile.features);
  for (const [key, enabled] of Object.entries(features)) { const input = form.elements[`feature_${key}`]; if (input) input.checked = Boolean(enabled); }
  $('#profileStatus').innerHTML = `Profile ID <strong>${escapeHtml(state.profile.id)}</strong> · local-first · ${state.sessions.filter(row => row.profileId === state.profile.id).length} linked sessions · ${Object.values(features).filter(Boolean).length}/${Object.keys(features).length} optional modules enabled`;
  applyFeatureVisibility();
}

async function saveProfile(form) {
  const data = new FormData(form);
  const current = state.profile || {};
  state.profile = {
    ...current,
    id: current.id || `profile-${uid()}`,
    schema: 'vantage-profile-v1',
    name: String(data.get('name') || '').trim(),
    birthYear: String(data.get('birthYear') || ''),
    heightCm: num(data.get('heightCm')),
    sex: String(data.get('sex') || ''),
    units: String(data.get('units') || 'metric'),
    timezone: String(data.get('timezone') || 'Europe/London').trim() || 'Europe/London',
    goal: String(data.get('goal') || '').trim(),
    trainingExperience: String(data.get('trainingExperience') || '').trim(),
    targetBodyweightKg: num(data.get('targetBodyweightKg')),
    foodPreferences: String(data.get('foodPreferences') || '').trim(),
    notes: String(data.get('notes') || '').trim(),
    features: Object.fromEntries(Object.keys(DEFAULT_FEATURE_FLAGS).map(key => [key, data.get(`feature_${key}`) === 'on'])),
    updatedAt: new Date().toISOString(),
    createdAt: current.createdAt || new Date().toISOString()
  };
  await db.put('settings', { key: ACTIVE_PROFILE_KEY, value: state.profile, updatedAt: state.profile.updatedAt });
  state.metricsProfile = { ...state.metricsProfile, sex: state.profile.sex || '', birthYear: state.profile.birthYear || '' };
  await db.put('settings', { key: 'metricsProfile', value: state.metricsProfile, updatedAt: new Date().toISOString() });
  localStorage.setItem('vantage-metrics-profile', JSON.stringify(state.metricsProfile));
  renderProfile(); renderMetrics(); applyFeatureVisibility(); toast('Profile saved');
}


function featureEnabled(key) {
  return normaliseFeatureFlags(state.profile?.features)[key] !== false;
}

function applyFeatureVisibility() {
  const map = { meals:'macros', vitals:'vitals', recovery:'recovery', supplements:'supplements', metrics:'metrics', biolab:'bloodwork' };
  for (const [screen, feature] of Object.entries(map)) {
    const enabled = featureEnabled(feature);
    document.querySelectorAll(`[data-nav="${screen}"]`).forEach(node => node.hidden = !enabled);
    document.querySelectorAll(`[data-go="${screen}"]`).forEach(node => node.hidden = !enabled);
  }
  document.querySelectorAll('[data-feature-section]').forEach(node => node.hidden = !featureEnabled(node.dataset.featureSection));
  const activeScreen = document.querySelector('.screen.active')?.dataset.screen;
  if (activeScreen && map[activeScreen] && !featureEnabled(map[activeScreen])) showScreen('dashboard');
}

async function refreshState() {
  [state.templates, state.sessions, state.vitals, state.meals, state.exercises, state.nutritionDays, state.recoveryLogs, state.bloodTests, state.bloodAnalyses, state.bodyMeasurements, state.trainingCycles, state.supplements, state.supplementEvents, state.supplementMedia, state.programs] = await Promise.all([
    db.getAll('templates'), db.getAll('sessions'), db.getAll('vitals'), db.getAll('meals'), db.getAll('exercises'), db.getAll('nutritionDays'), db.getAll('recoveryLogs'), db.getAll('bloodTests'), db.getAll('bloodAnalyses'), db.getAll('bodyMeasurements'), db.getAll('trainingCycles'), db.getAll('supplements'), db.getAll('supplementEvents'), db.getAll('supplementMedia'), db.getAll('programs')
  ]);
  state.sessions.sort((a,b) => String(b.completedAt || b.date).localeCompare(String(a.completedAt || a.date)));
  state.vitals.sort((a,b) => b.date.localeCompare(a.date));
  state.meals.sort((a,b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  state.exercises.sort((a,b) => a.name.localeCompare(b.name, 'en-GB'));
  state.nutritionDays.sort((a,b) => b.date.localeCompare(a.date));
  state.recoveryLogs.sort((a,b) => String(b.completedAt || b.date).localeCompare(String(a.completedAt || a.date)));
  state.bloodTests.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  state.bloodAnalyses.sort((a,b) => String(b.importedAt || b.date).localeCompare(String(a.importedAt || a.date)));
  state.bodyMeasurements.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  state.trainingCycles.sort((a,b) => String(b.startDate).localeCompare(String(a.startDate)));
  state.programs.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB'));
  const progressSetting = await db.get('settings', 'activeProgramProgress');
  state.activeProgramProgress = progressSetting?.value || { nextIndex:0 };
  state.supplements.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB'));
  state.supplementEvents.sort((a,b) => `${a.effectiveDate || ''}${a.createdAt || ''}`.localeCompare(`${b.effectiveDate || ''}${b.createdAt || ''}`));
}

function localDateInZone(value, timeZone = 'Europe/London') {
  if (!value) return null;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return null; }
}

function vitalsTimestamp(record) {
  return Date.parse(record?.createdAt || record?.importedAt || record?.updatedAt || `${record?.date || '1970-01-01'}T00:00:00Z`) || 0;
}

function resolveVitalsForSession({ date = null, startedAt = null, vitalsId = null } = {}) {
  if (vitalsId) {
    const exact = state.vitals.find(item => item.id === vitalsId);
    if (exact) return exact;
  }
  const sessionDate = date || localDateInZone(startedAt) || today();
  const candidates = state.vitals.filter(item => item.date === sessionDate);
  if (!candidates.length) return null;
  if (!startedAt) return [...candidates].sort((a,b) => vitalsTimestamp(b) - vitalsTimestamp(a))[0];
  const startMs = Date.parse(startedAt);
  const beforeStart = candidates.filter(item => vitalsTimestamp(item) <= startMs);
  return [...(beforeStart.length ? beforeStart : candidates)].sort((a,b) => vitalsTimestamp(b) - vitalsTimestamp(a))[0];
}

function latestVitals() {
  return resolveVitalsForSession({ date: today() });
}

async function applyV13105VitalsLinkRepair() {
  const setting = await db.get('settings', 'v13105VitalsLinkRepair');
  if (setting?.value) return 0;
  let repaired = 0;
  for (const session of state.sessions) {
    if (!session?.date || isRestDaySession(session)) continue;
    const vitals = resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId });
    if (!vitals || (session.vitalsSnapshot && session.decision?.vitalsId && session.decision?.readinessLevel && session.decision.readinessLevel !== 'unknown')) continue;
    const readiness = calculateReadiness(vitals);
    session.vitalsSnapshot ||= structuredClone(vitals);
    session.readinessSnapshotAtStart ||= structuredClone(readiness);
    session.decision ||= {};
    session.decision.vitalsId ||= vitals.id || `vitals-${session.date}`;
    session.decision.vitalsLinkResolution ||= 'v1.3.10.6-same-local-date-migration';
    if (!session.decision.readinessLevel || session.decision.readinessLevel === 'unknown') {
      session.decision.readinessLevel = readiness.level;
      session.decision.readinessTitle = readiness.title;
      session.decision.recommendedAction = recommendationAction(readiness);
      session.decision.readinessCalculationAudit = readiness.calculationAudit ? structuredClone(readiness.calculationAudit) : null;
    }
    await db.put('sessions', session); repaired += 1;
  }
  await db.put('settings', { key:'v13105VitalsLinkRepair', value:{completed:true,repaired,completedAt:new Date().toISOString()}, updatedAt:new Date().toISOString() });
  return repaired;
}

function addDaysLocal(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function cycleEndDate(cycle) {
  return addDaysLocal(cycle.startDate, Math.max(1, Number(cycle.durationWeeks || 1)) * 7 - 1);
}

function activeCycleRecords(dateValue = today()) {
  return state.trainingCycles.filter(cycle => cycle.active && cycle.startDate <= dateValue && cycleEndDate(cycle) >= dateValue)
    .map(cycle => ({ ...cycle, week: cycleWeekNumber(cycle, dateValue), endDate: cycleEndDate(cycle) }))
    .sort((a, b) => String(a.category).localeCompare(String(b.category)));
}

function cycleContextSnapshot(dateValue = today()) {
  return activeCycleRecords(dateValue).map(cycle => ({
    id: cycle.id, name: cycle.name, type: cycle.type, category: cycle.category,
    week: cycle.week, durationWeeks: Number(cycle.durationWeeks || 1), startDate: cycle.startDate, endDate: cycle.endDate
  }));
}

function activeSupplementRecords(dateValue = today()) {
  return state.supplements.filter(item => supplementStateOnDate(item, state.supplementEvents, dateValue));
}

function supplementContextSnapshot(dateValue = today()) {
  return activeSupplementRecords(dateValue).map(item => ({
    id: item.id, name: item.name, category: item.category, brand: item.brand || '',
    amount: item.amount ?? null, unit: item.unit || '', timesPerDay: item.timesPerDay ?? null,
    timing: item.timing || ''
  }));
}

function administrationEventsForDate(dateValue = today()) {
  return state.supplementEvents.filter(event => event.eventType === 'administration' && event.effectiveDate === dateValue).map(event => {
    const item = state.supplements.find(row => row.id === event.supplementId);
    return { ...event, medication: item?.name || event.medication || 'Unknown item' };
  });
}

function renderAdministrationEvents() {
  const select = $('#administrationSupplementSelect');
  const form = $('#administrationForm');
  const list = $('#administrationHistory');
  if (!select || !form || !list) return;
  const medications = state.supplements.filter(item => item.category === 'trt-medication' || /inject|medication|sustanon|testosterone/i.test(`${item.name} ${item.category}`));
  select.innerHTML = medications.length ? medications.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">No medication items saved</option>';
  if (!form.elements.effectiveDate.value) form.elements.effectiveDate.value = today();
  const selected = state.supplements.find(item => item.id === select.value);
  if (selected && !form.elements.amount.value) form.elements.amount.value = selected.amount ?? '';
  if (selected && !form.elements.unit.value) form.elements.unit.value = selected.unit || '';
  const events = state.supplementEvents.filter(event => event.eventType === 'administration').slice(0, 12);
  list.innerHTML = events.length ? events.map(event => {
    const item = state.supplements.find(row => row.id === event.supplementId);
    return `<div class="analytics-row"><div><strong>${escapeHtml(item?.name || event.medication || 'Medication')}</strong><small>${escapeHtml(event.effectiveDate || '')} · ${escapeHtml(event.route || 'route not recorded')}</small></div><strong>${event.amount != null ? `${escapeHtml(event.amount)} ${escapeHtml(event.unit || '')}` : 'Dose not recorded'}</strong></div>`;
  }).join('') : '<div class="empty-state compact-empty">No administration events recorded.</div>';
}

async function saveAdministrationEvent(form) {
  const data = new FormData(form);
  const supplementId = String(data.get('supplementId') || '');
  const item = state.supplements.find(row => row.id === supplementId);
  if (!item) return toast('Choose a saved medication item');
  const eventDate = String(data.get('effectiveDate') || today());
  const administration = {
    id: uid(), profileId: profileId(), supplementId, medication: item.name,
    effectiveDate: eventDate, administeredAtLocal: eventDate,
    amount: num(data.get('amount')), unit: String(data.get('unit') || item.unit || '').trim(), route: String(data.get('route') || 'other'),
    notes: String(data.get('notes') || '').trim(), eventType: 'administration', source: 'user-confirmed', active: item.active,
    createdAt: new Date().toISOString()
  };
  await db.put('supplementEvents', administration);
  const sessions = await db.getAll('sessions');
  for (const session of sessions.filter(row => row.date === eventDate)) {
    session.trainingContext ||= { cycles: cycleContextSnapshot(eventDate), supplements: supplementContextSnapshot(eventDate), capturedAt: session.startedAt || new Date().toISOString() };
    const existing = new Map((session.trainingContext.medicationAdministrations || []).map(row => [row.id, row]));
    existing.set(administration.id, administration);
    session.trainingContext.medicationAdministrations = [...existing.values()];
    await db.put('sessions', session);
  }
  form.elements.notes.value = '';
  await refreshState(); renderAll(); showScreen('supplements'); toast('Administration recorded and linked to same-day sessions');
}

function renderActiveCycleBanner() {
  const node = $('#activeCycleBanner');
  if (!node) return;
  const active = activeCycleRecords();
  const program = activeProgram(state.programs);
  const next = program ? nextProgramSlot(program, state.activeProgramProgress) : null;
  node.hidden = !active.length && !program;
  const cycleHtml = active.map(cycle => `<div class="cycle-chip"><span>${escapeHtml(cycle.category === 'phase' ? 'Phase' : 'Training block')}: <strong>${escapeHtml(cycle.name)}</strong></span><span>Week ${cycle.week} of ${cycle.durationWeeks}</span></div>`).join('');
  const programHtml = program ? `<div class="cycle-chip"><span>Program: <strong>${escapeHtml(program.name)}</strong></span><span>${program.scheduleMode === 'manual' ? 'Manual selection' : `Next · ${escapeHtml(next?.label || 'not set')}`}</span></div>` : '';
  node.innerHTML = `<div class="cycle-banner-grid">${cycleHtml}${programHtml}</div>`;
}

function resetCycleForm() {
  const form = $('#trainingCycleForm');
  if (!form) return;
  form.reset();
  form.elements.id.value = '';
  form.elements.category.value = 'phase';
  form.elements.type.value = 'cut';
  form.elements.startDate.value = today();
  form.elements.durationWeeks.value = 6;
  form.elements.active.checked = true;
  $('#cancelCycleEditButton').hidden = true;
}

function cycleFromForm(form) {
  const data = new FormData(form);
  const existing = state.trainingCycles.find(item => item.id === String(data.get('id') || ''));
  return {
    id: existing?.id || uid(),
    category: String(data.get('category') || 'phase'),
    type: String(data.get('type') || 'custom'),
    name: String(data.get('name') || '').trim(),
    startDate: String(data.get('startDate') || today()),
    durationWeeks: Math.max(1, Math.min(104, Number(data.get('durationWeeks') || 1))),
    active: data.get('active') === 'on',
    notes: String(data.get('notes') || '').trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function saveTrainingCycle(form) {
  const cycle = cycleFromForm(form);
  if (!cycle.name) return toast('Add a cycle name');
  if (cycle.active) {
    for (const item of state.trainingCycles.filter(item => item.category === cycle.category && item.id !== cycle.id && item.active)) {
      await db.put('trainingCycles', { ...item, active: false, updatedAt: new Date().toISOString() });
    }
  }
  await db.put('trainingCycles', cycle);
  await refreshState();
  resetCycleForm();
  renderAll();
  showScreen('data');
  toast(`${cycle.name} saved`);
}

function editTrainingCycle(id) {
  const cycle = state.trainingCycles.find(item => item.id === id);
  const form = $('#trainingCycleForm');
  if (!cycle || !form) return;
  for (const key of ['id','category','type','name','startDate','durationWeeks','notes']) if (form.elements[key]) form.elements[key].value = cycle[key] ?? '';
  form.elements.active.checked = Boolean(cycle.active);
  $('#cancelCycleEditButton').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleTrainingCycle(id) {
  const cycle = state.trainingCycles.find(item => item.id === id);
  if (!cycle) return;
  const next = !cycle.active;
  if (next) {
    for (const item of state.trainingCycles.filter(item => item.category === cycle.category && item.id !== cycle.id && item.active)) {
      await db.put('trainingCycles', { ...item, active: false, updatedAt: new Date().toISOString() });
    }
  }
  await db.put('trainingCycles', { ...cycle, active: next, updatedAt: new Date().toISOString() });
  await refreshState(); renderAll(); showScreen('data');
  toast(next ? `${cycle.name} activated` : `${cycle.name} deactivated`);
}

async function deleteTrainingCycle(id) {
  await db.remove('trainingCycles', id);
  await refreshState(); renderAll(); showScreen('data'); toast('Training cycle deleted');
}

function renderTrainingCycles() {
  const activeNode = $('#activeCyclesSummary');
  const list = $('#trainingCycleList');
  if (!activeNode || !list) return;
  const active = activeCycleRecords();
  activeNode.innerHTML = active.length ? `<div class="cycle-metrics-card"><h4>Active cycle context</h4>${active.map(cycle => `<div class="cycle-chip"><span><strong>${escapeHtml(cycle.name)}</strong><br><small>${escapeHtml(cycle.type)} · ${escapeHtml(localDateLabel(cycle.startDate))} to ${escapeHtml(localDateLabel(cycle.endDate))}</small></span><span>Week ${cycle.week}/${cycle.durationWeeks}</span></div>`).join('')}</div>` : '<div class="empty-state">No active phase or training block. Add one below.</div>';
  list.innerHTML = state.trainingCycles.length ? state.trainingCycles.map(cycle => {
    const endDate = cycleEndDate(cycle);
    const currentWeek = cycleWeekNumber(cycle, today());
    const status = cycle.active ? (currentWeek ? `Active · week ${currentWeek}/${cycle.durationWeeks}` : today() < cycle.startDate ? 'Active · scheduled' : 'Active · period ended') : 'Inactive';
    return `<div class="analytics-row"><div><strong>${escapeHtml(cycle.name)}</strong><small>${escapeHtml(cycle.category)} · ${escapeHtml(cycle.type)} · ${escapeHtml(cycle.startDate)} → ${escapeHtml(endDate)}</small><small>${escapeHtml(status)}${cycle.notes ? ` · ${escapeHtml(cycle.notes)}` : ''}</small></div><div class="cycle-row-actions"><button class="text-button" data-cycle-action="shorten" data-cycle-id="${escapeHtml(cycle.id)}">−1 wk</button><button class="text-button" data-cycle-action="extend" data-cycle-id="${escapeHtml(cycle.id)}">+1 wk</button><button class="text-button" data-cycle-action="edit" data-cycle-id="${escapeHtml(cycle.id)}">Edit</button><button class="text-button" data-cycle-action="toggle" data-cycle-id="${escapeHtml(cycle.id)}">${cycle.active ? 'Deactivate' : 'Activate'}</button><button class="text-button" data-cycle-action="delete" data-cycle-id="${escapeHtml(cycle.id)}">Delete</button></div></div>`;
  }).join('') : '<div class="empty-state">No training cycles saved.</div>';
}


async function adjustTrainingCycleWeeks(id, delta) {
  const cycle = state.trainingCycles.find(item => item.id === id);
  if (!cycle) return;
  const durationWeeks = Math.max(1, Math.min(104, Number(cycle.durationWeeks || 1) + Number(delta || 0)));
  await db.put('trainingCycles', { ...cycle, durationWeeks, updatedAt:new Date().toISOString() });
  await refreshState(); renderAll(); toast(`${cycle.name} is now ${durationWeeks} week${durationWeeks === 1 ? '' : 's'}`);
}

function libraryExerciseByName(name) {
  const key = nameKey(name);
  return state.exercises.find(item => item.nameKey === key || nameKey(item.name) === key)
    || state.exercises.find(item => nameKey(item.name).includes(key) || key.includes(nameKey(item.name)))
    || builtInExerciseLibrary.find(item => item.nameKey === key) || null;
}

function templateExerciseFromLibrary(exercise, prescription={}) {
  const workingSets=Math.max(1,Math.min(8,Number(prescription.workingSets||1)));
  const lowRep=Number(String(prescription.reps||'8').match(/\d+/)?.[0]||8);
  const restMatch=String(prescription.restSeconds||'').match(/(\d+)/);
  const restSeconds=restMatch?Number(restMatch[1]):null;
  const sets=[{setType:'Warm-up',weightKg:0,reps:Math.max(8,lowRep+4),rpe:4,failure:false,restSeconds:null,restRecorded:false},...Array.from({length:workingSets},()=>({setType:'Work',weightKg:0,reps:lowRep,rpe:8,failure:false,restSeconds,restRecorded:Boolean(restSeconds)}))];
  return { id:uid(), sourceExerciseId:exercise.id, name:exercise.name, aliases:[...new Set(exercise.aliases || [])], machineBrand:exercise.machineBrand||'', machineModel:exercise.machineModel||'', nickname:exercise.nickname||'', variation:exercise.variation||'', movementPattern:exercise.movementPattern||'', coreExercise:exercise.coreExercise||exercise.name||'', nicknameAlias:exercise.nicknameAlias||'', grip:exercise.grip||'', stance:exercise.stance||'', unilateral:exercise.unilateral??null, loadConvention:exercise.loadConvention||'', comparisonStreamId:exercise.comparisonStreamId||canonicalExerciseIdentity(exercise), notes:[prescription.note,exercise.notes].filter(Boolean).join(' · '), targetWorkingSets:workingSets, targetRepRange:String(prescription.reps||''), targetRestSeconds:String(prescription.restSeconds||''), targetRir:String(prescription.rir||''), sets };
}

async function createRoutineFromBlueprint(blueprint) {
  const existing = state.templates.find(item => nameKey(item.name) === nameKey(blueprint.name));
  if (existing) return existing;
  const exercises = (blueprint.exercises || []).map(row=>{ const spec=typeof row==='string'?{name:row}:row; const exercise=libraryExerciseByName(spec.name); return exercise?templateExerciseFromLibrary(exercise,spec):null; }).filter(Boolean);
  const template = { id:`routine-${uid()}`, profileId:profileId(), name:blueprint.name, category:blueprint.category||'strength', exercises, source:'program-preset', sessionId:blueprint.sessionId||null, estimatedMinutes:blueprint.estimatedMinutes||'', notes:blueprint.notes||'', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  await db.put('templates', template); state.templates.push(template); return template;
}

async function createProgramFromPreset(presetId, customName='') {
  const preset = programPresetById(presetId); let days=[]; const createdTemplates=new Map();
  if (Array.isArray(preset.routines)) days = preset.routines.map((row,index)=>({id:uid(),order:index+1,kind:'template',templateId:row.templateId,label:row.name||state.templates.find(t=>t.id===row.templateId)?.name||'Workout'}));
  else if (Array.isArray(preset.routineBlueprints)) {
    for (const blueprint of preset.routineBlueprints) { const template=await createRoutineFromBlueprint(blueprint); createdTemplates.set(blueprint.name,template); }
    if(Array.isArray(preset.scheduleBlueprint)&&preset.scheduleBlueprint.length){
      days=preset.scheduleBlueprint.map((row,index)=>{const template=createdTemplates.get(row.routine)||state.templates.find(t=>nameKey(t.name)===nameKey(row.routine));return {id:uid(),order:index+1,kind:row.kind||'template',templateId:template?.id||null,label:row.label||template?.name||row.routine||'Workout'};});
    } else {
      days=[...createdTemplates.values()].map((template,index)=>({id:uid(),order:index+1,kind:'template',templateId:template.id,label:template.name}));
    }
  }
  const name=String(customName||'').trim()||(preset.id==='custom'?`Custom program ${state.programs.length+1}`:preset.name);
  const program={id:`program-${uid()}`,profileId:profileId(),name,nameKey:nameKey(name),splitType:preset.id,scheduleMode:'rotation',days,active:false,notes:preset.description||'',cycleDefinition:preset.cycle||null,rotationWeeks:preset.scheduleBlueprint?.length===14?2:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),schema:'vantage-program-v1'};
  await db.put('programs',program); await refreshState(); state.programEditorId=program.id; renderAll(); toast(`${program.name} created`); return program;
}

async function createHybridHeavyDutyCycle(){
  const preset=programPresetById('hdm-maintenance');
  const startDate=today();
  const existingCycle=state.trainingCycles.find(c=>nameKey(c.name)===nameKey(preset.cycle?.name||''));
  let cycle=existingCycle;
  if(!cycle){
    for(const item of state.trainingCycles.filter(item=>item.category==='block'&&item.active)) await db.put('trainingCycles',{...item,active:false,updatedAt:new Date().toISOString()});
    cycle={id:uid(),category:'block',type:'maintenance',name:preset.cycle.name,startDate,durationWeeks:8,active:true,notes:preset.cycle.notes,programmeId:'VANTAGE-HDM-AB-LISS-2026-10',programmeVersion:'1.0',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await db.put('trainingCycles',cycle);
  }
  let program=state.programs.find(p=>p.splitType==='hdm-maintenance');
  if(!program) program=await createProgramFromPreset('hdm-maintenance','Hybrid Heavy Duty Maintenance');
  await activateProgramById(program.id);
  await refreshState(); renderAll(); showScreen('data'); toast('Hybrid Heavy Duty 8-week cycle created and activated');
}


const HDM_LEAN_MASS_TARGETS = Object.freeze({
  'HDM-A':['3','3','2','3','3','2–3','3'],
  'HDM-B':['2–3','2–3','1–2','2–3','2–3','3','2'],
  'HDM-C':['3','3','2','3','3','2–3','3 per arm'],
  'HDM-D':['2–3','2–3','1–2','2 max','2–3 per arm','2–3','3','2']
});
const HDM_MAINTENANCE_RIR = Object.freeze({
  'HDM-A':['2','1–2','1–2','1–2','2','1–2','1–2'],
  'HDM-B':['2','2','1–2','1–2','1–2','1–2','1–2'],
  'HDM-C':['2','1–2','1–2','1–2','2','1–2','1–2'],
  'HDM-D':['2','2','1–2','2','1–2','1–2','1–2','1–2']
});

function hdmTemplateBySessionId(sessionId){
  return state.templates.find(t=>t.sessionId===sessionId)
    || state.templates.find(t=>nameKey(t.name).includes(nameKey(sessionId.replace('HDM-','HDM '))));
}
function hdmLissTemplates(){
  const seen=new Set();
  return state.templates.filter(t=>t.category==='cardio' && (/HDM LISS/i.test(t.name||'') || /^HDM-LISS/.test(t.sessionId||''))).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;});
}
function chooseHdmLissTemplate(date,lissTemplates){
  const weekday=new Date(`${date}T12:00:00`).getDay();
  const preferred=weekday===2?'Incline':weekday===4?'Easy':weekday===6?'Outdoor':'';
  return lissTemplates.find(t=>preferred&&String(t.name).includes(preferred)) || lissTemplates[0] || state.templates.find(t=>t.id==='liss') || null;
}
function addDaysIso(date,days){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
function hdmScheduleWithExtensions(extraWeeks=0){
  const rows=HDM_EXTENDED_SCHEDULE.map(row=>({...row}));
  const strengthPatterns=[['HDM-C','HDM-D','HDM-A'],['HDM-B','HDM-C','HDM-D']];
  for(let ext=0;ext<Math.max(0,Math.min(2,Number(extraWeeks)||0));ext++){
    const week=7+ext; const start=addDaysIso('2026-12-06',1+ext*7); const strength=strengthPatterns[ext%strengthPatterns.length];
    const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; const ids=[strength[0],'HDM-LISS',strength[1],'HDM-REST',strength[2],'HDM-LISS','HDM-REST'];
    ids.forEach((sessionId,i)=>rows.push({date:addDaysIso(start,i),sessionId,label:`${labels[i]} · ${sessionId==='HDM-REST'?(i===6?'Full rest':'Rest'):sessionId}`,status:'planned',week,phase:'lean-mass-transition'}));
  }
  return rows;
}
async function enrichHdmTemplatePhaseData(template,sessionId){
  if(!template)return null;
  const lean=HDM_LEAN_MASS_TARGETS[sessionId]||[]; const maintenanceRir=HDM_MAINTENANCE_RIR[sessionId]||[];
  const exercises=(template.exercises||[]).map((exercise,index)=>({
    ...exercise,
    maintenanceWorkingSets:exercise.maintenanceWorkingSets||exercise.targetWorkingSets||1,
    maintenanceTargetRir:maintenanceRir[index]||exercise.targetRir||'1–2',
    leanMassTargetSets:lean[index]||String(exercise.targetWorkingSets||1),
    leanMassTargetRir:'1–2',
    phasePrescriptionNote:`Maintenance: ${exercise.targetWorkingSets||1} set${Number(exercise.targetWorkingSets||1)===1?'':'s'} · Lean mass target: ${lean[index]||exercise.targetWorkingSets||1} · Double progression; add volume only when recovery and comparable progression support it.`
  }));
  const updated={...template,sessionId,exercises,hdmExtended:true,updatedAt:new Date().toISOString()};
  await db.put('templates',updated); return updated;
}
async function applyHdmTemplatePhaseRir(phase){
  for(const sessionId of ['HDM-A','HDM-B','HDM-C','HDM-D']){
    const template=hdmTemplateBySessionId(sessionId); if(!template)continue;
    const maintenanceRir=HDM_MAINTENANCE_RIR[sessionId]||[];
    const exercises=(template.exercises||[]).map((exercise,index)=>({...exercise,targetRir:phase==='maintenance'?(maintenanceRir[index]||exercise.maintenanceTargetRir||exercise.targetRir||'1–2'):'1–2'}));
    await db.put('templates',{...template,exercises,activeHdmPhase:phase,updatedAt:new Date().toISOString()});
  }
}
async function extendHybridHeavyDutyProgramme(){
  const preset=programPresetById('hdm-extended');
  let baseProgram=state.programs.find(p=>p.splitType==='hdm-extended') || state.programs.find(p=>p.splitType==='hdm-maintenance') || activeProgram(state.programs);
  if(!baseProgram || !((baseProgram.days||[]).some(day=>{const t=state.templates.find(x=>x.id===day.templateId);return t?.sessionId==='HDM-A'||t?.sessionId==='HDM-B';}))){
    baseProgram=await createProgramFromPreset('hdm-maintenance','Hybrid Heavy Duty Maintenance');
  }
  for(const blueprint of preset.routineBlueprints||[]) await createRoutineFromBlueprint(blueprint);
  await refreshState();
  for(const sessionId of ['HDM-A','HDM-B','HDM-C','HDM-D']) await enrichHdmTemplatePhaseData(hdmTemplateBySessionId(sessionId),sessionId);
  await refreshState();
  const refs=Object.fromEntries(['HDM-A','HDM-B','HDM-C','HDM-D'].map(id=>[id,hdmTemplateBySessionId(id)]));
  const liss=hdmLissTemplates();
  const extensionState={programmeId:HDM_EXTENDED_META.programmeId,programmeVersion:HDM_EXTENDED_META.programmeVersion,phase:'maintenance',maintenanceWeeks:2,maintenanceExtensionWeeks:0,leanMassApproved:false,exitReview:null,startedAt:'2026-10-25',plannedEndDate:'2026-12-06',nutrition:HDM_EXTENDED_META.nutrition,progression:'double-progression',updatedAt:new Date().toISOString()};
  const schedule=hdmScheduleWithExtensions(0);
  const days=schedule.map((row,index)=>{
    if(row.sessionId==='HDM-REST')return {id:uid(),order:index+1,kind:'rest',templateId:null,label:`${row.date} · ${row.label}`,scheduledDate:row.date,week:row.week,phase:row.week<=2?'maintenance':'lean-mass-transition',programmeStatus:row.status};
    const template=row.sessionId==='HDM-LISS'?chooseHdmLissTemplate(row.date,liss):refs[row.sessionId];
    return {id:uid(),order:index+1,kind:'template',templateId:template?.id||null,label:`${row.date} · ${row.label}`,scheduledDate:row.date,week:row.week,phase:row.week<=2?'maintenance':'lean-mass-transition',sessionId:row.sessionId,programmeStatus:row.status};
  });
  const updatedProgram={...baseProgram,name:'Extended Hybrid Heavy Duty — Maintenance to Lean Mass',nameKey:nameKey('Extended Hybrid Heavy Duty — Maintenance to Lean Mass'),splitType:'hdm-extended',days,active:true,notes:'Six-week maintenance → lean-mass transition. Existing A/B/LISS history preserved; HDM-C and HDM-D added. Lean mass requires explicit Maintenance Exit Review approval.',cycleDefinition:{...preset.cycle},rotationWeeks:6,hdmExtension:extensionState,updatedAt:new Date().toISOString()};
  for(const p of state.programs) if(p.id!==baseProgram.id&&p.active) await db.put('programs',{...p,active:false,updatedAt:new Date().toISOString()});
  await db.put('programs',updatedProgram);
  let cycle=state.trainingCycles.find(c=>c.programmeId==='VANTAGE-HDM-AB-LISS-2026-10'||/Hybrid Heavy Duty/i.test(c.name||''));
  const cycleRecord={...(cycle||{}),id:cycle?.id||uid(),category:'block',type:'maintenance',name:'Extended Hybrid Heavy Duty — Maintenance to Lean Mass',startDate:'2026-10-25',durationWeeks:6,active:true,notes:'Weeks 1–2 maintenance/re-entry. Weeks 3–6 lean-mass transition only after exit review approval.',programmeId:HDM_EXTENDED_META.programmeId,programmeVersion:'1.2',updatedAt:new Date().toISOString(),createdAt:cycle?.createdAt||new Date().toISOString()};
  await db.put('trainingCycles',cycleRecord);
  const firstPending=days.findIndex(day=>day.scheduledDate>=today() && !state.sessions.some(session=>session.date===day.scheduledDate));
  state.activeProgramProgress={programId:updatedProgram.id,nextIndex:firstPending>=0?firstPending:Math.max(0,days.length-1),lastCompletedTemplateId:state.activeProgramProgress?.lastCompletedTemplateId||null,updatedAt:new Date().toISOString()};
  await db.put('settings',{key:'activeProgramProgress',value:state.activeProgramProgress,updatedAt:new Date().toISOString()});
  await applyHdmTemplatePhaseRir('maintenance');
  await refreshState(); renderAll(); showScreen('data'); toast('Active Heavy Duty programme extended to HDM A/B/C/D through 6 December');
}
async function saveHdmMaintenanceExitReview(action){
  const program=state.programs.find(p=>p.splitType==='hdm-extended'&&p.active) || state.programs.find(p=>p.splitType==='hdm-extended'); if(!program)return toast('Extend the Heavy Duty programme first');
  const checks={recovery:Boolean($('#hdmGateRecovery')?.checked),bp:Boolean($('#hdmGateBp')?.checked),weightWaist:Boolean($('#hdmGateWeightWaist')?.checked),performance:Boolean($('#hdmGatePerformance')?.checked),shoulder:Boolean($('#hdmGateShoulder')?.checked)};
  if(action==='lean-mass'&&!hdmTransitionGate(checks))return toast('Complete all Maintenance Exit Review gates before lean-mass transition');
  const now=new Date().toISOString(); let ext={...(program.hdmExtension||{})};
  if(action==='lean-mass'){
    ext={...ext,phase:'lean-mass-transition',leanMassApproved:true,leanMassApprovedAt:now,exitReview:{checks,decision:'begin_lean_mass_transition',reviewedAt:now},updatedAt:now};
    await db.put('programs',{...program,hdmExtension:ext,updatedAt:now}); await applyHdmTemplatePhaseRir('lean-mass-transition');
    const cycle=state.trainingCycles.find(c=>c.programmeId===HDM_EXTENDED_META.programmeId); if(cycle)await db.put('trainingCycles',{...cycle,type:'gain',notes:`${cycle.notes||''} · Lean-mass transition approved ${today()}.`,updatedAt:now});
    await refreshState();renderAll();toast('Lean-mass transition approved — volume remains conservative and progression-led'); return;
  }
  const extra=action==='extend-2'?2:1; const currentExtra=Math.max(Number(ext.maintenanceExtensionWeeks||0),extra); const schedule=hdmScheduleWithExtensions(currentExtra); const liss=hdmLissTemplates(); const refs=Object.fromEntries(['HDM-A','HDM-B','HDM-C','HDM-D'].map(id=>[id,hdmTemplateBySessionId(id)]));
  const days=schedule.map((row,index)=>{const phase=row.week<=2+currentExtra?'maintenance':'lean-mass-transition';if(row.sessionId==='HDM-REST')return {id:uid(),order:index+1,kind:'rest',templateId:null,label:`${row.date} · ${row.label}`,scheduledDate:row.date,week:row.week,phase,programmeStatus:row.status};const template=row.sessionId==='HDM-LISS'?chooseHdmLissTemplate(row.date,liss):refs[row.sessionId];return {id:uid(),order:index+1,kind:'template',templateId:template?.id||null,label:`${row.date} · ${row.label}`,scheduledDate:row.date,week:row.week,phase,sessionId:row.sessionId,programmeStatus:row.status};});
  const endDate=days.at(-1)?.scheduledDate||ext.plannedEndDate; ext={...ext,phase:'maintenance',leanMassApproved:false,maintenanceWeeks:2+currentExtra,maintenanceExtensionWeeks:currentExtra,plannedEndDate:endDate,exitReview:{checks,decision:`extend_maintenance_${currentExtra}_week${currentExtra===1?'':'s'}`,reviewedAt:now},updatedAt:now};
  await db.put('programs',{...program,days,rotationWeeks:6+currentExtra,hdmExtension:ext,updatedAt:now}); await applyHdmTemplatePhaseRir('maintenance'); const cycle=state.trainingCycles.find(c=>c.programmeId===HDM_EXTENDED_META.programmeId); if(cycle)await db.put('trainingCycles',{...cycle,durationWeeks:6+currentExtra,type:'maintenance',updatedAt:now}); await refreshState();renderAll();toast(`Maintenance extended by ${currentExtra} week${currentExtra===1?'':'s'}; lean-mass transition remains gated`);
}
function renderHdmExtensionPanel(){
  const node=$('#hdmExtendedPanel'); if(!node)return; const program=state.programs.find(p=>p.splitType==='hdm-extended'&&p.active)||state.programs.find(p=>p.splitType==='hdm-extended');
  if(!program){node.innerHTML='<div class="empty-state compact-empty">The extended HDM cycle has not been merged yet.</div>';return;}
  const ext=program.hdmExtension||{}; const phase=ext.phase==='lean-mass-transition'?'Lean Mass Transition':'Maintenance / Re-entry'; const nutrition=ext.phase==='lean-mass-transition'?HDM_EXTENDED_META.nutrition.leanMass:HDM_EXTENDED_META.nutrition.maintenance;
  node.innerHTML=`<div class="hdm-extension-card"><div class="panel-heading compact-heading"><div><p class="eyebrow">HDM Extended v1.2</p><h4>${escapeHtml(phase)}</h4></div><span class="source-badge">${escapeHtml(ext.plannedEndDate||'2026-12-06')}</span></div><p>Existing A/B/LISS history is preserved. C and D use separate progression identities. Lean mass never activates from the calendar alone.</p><div class="hdm-phase-metrics"><span><small>Maintenance</small><strong>${escapeHtml(String(ext.maintenanceWeeks||2))} weeks</strong></span><span><small>Protein</small><strong>${escapeHtml(nutrition.protein||'')}</strong></span><span><small>Progression</small><strong>Double progression</strong></span></div><details ${ext.leanMassApproved?'':'open'}><summary>Maintenance Exit Review</summary><div class="feature-toggle-grid hdm-gate-grid"><label class="checkbox-card"><input id="hdmGateRecovery" type="checkbox"> Recovery / sleep / stress acceptable</label><label class="checkbox-card"><input id="hdmGateBp" type="checkbox"> BP acceptable on repeat readings</label><label class="checkbox-card"><input id="hdmGateWeightWaist" type="checkbox"> Weight / waist trend supports transition</label><label class="checkbox-card"><input id="hdmGatePerformance" type="checkbox"> Strength / performance stable or improving</label><label class="checkbox-card"><input id="hdmGateShoulder" type="checkbox"> Shoulder / joints acceptable</label></div><div class="cycle-form-actions"><button class="button button-primary" type="button" data-hdm-review-action="lean-mass">Approve lean-mass transition</button><button class="button button-ghost" type="button" data-hdm-review-action="extend-1">Extend maintenance +1 week</button><button class="button button-ghost" type="button" data-hdm-review-action="extend-2">Extend maintenance +2 weeks</button></div><p class="metric-footnote">Lean-mass activation changes the phase/RIR guidance only. It does not automatically add every extra set. Use the target set ranges and add volume only when comparable progression and recovery justify it.</p></details><details><summary>Phase rules &amp; safety</summary><ul class="plain-list"><li>Green: train as programmed.</li><li>Amber: reduce volume about 20–30%, stay 2–3 RIR, no intensity techniques.</li><li>Red: no hard lifting; walking, mobility or rest.</li><li>Shoulder press: neutral/semi-neutral, controlled ROM, about 2 RIR, pain-free. Sharp/load-related pain = remove the press and flag for Coach review.</li><li>Warm-up sets remain separate from working-set progression.</li></ul></details></div>`;
}

async function activateProgramById(id) {
  const target=state.programs.find(item=>item.id===id); if(!target)return;
  for (const program of state.programs) await db.put('programs',{...program,active:program.id===id,updatedAt:new Date().toISOString()});
  const mostRecent=state.sessions.find(session=>(target.days||[]).some(day=>day.kind==='template'&&day.templateId===session.templateId));
  let nextIndex=0; if(mostRecent){const idx=(target.days||[]).findIndex(day=>day.kind==='template'&&day.templateId===mostRecent.templateId);if(idx>=0)nextIndex=(idx+1)%target.days.length;}
  state.activeProgramProgress={programId:id,nextIndex,lastCompletedTemplateId:mostRecent?.templateId||null,updatedAt:new Date().toISOString()};
  await db.put('settings',{key:'activeProgramProgress',value:state.activeProgramProgress,updatedAt:new Date().toISOString()});
  await refreshState(); renderAll(); toast(`${target.name} activated`);
}

async function deleteProgramById(id) {
  const program=state.programs.find(item=>item.id===id); if(!program)return;
  if(!window.confirm(`Delete program “${program.name}”? Saved routines and workout history will not be deleted.`))return;
  await db.remove('programs',id); if(state.activeProgramProgress?.programId===id){state.activeProgramProgress={nextIndex:0};await db.put('settings',{key:'activeProgramProgress',value:state.activeProgramProgress,updatedAt:new Date().toISOString()});}
  if(state.programEditorId===id)state.programEditorId=null; await refreshState();renderAll();toast('Program deleted');
}

async function saveProgramEditorSettings(){const program=state.programs.find(item=>item.id===state.programEditorId);if(!program)return;const name=String($('#programEditorName')?.value||program.name).trim()||program.name;const scheduleMode=$('#programEditorScheduleMode')?.value||'rotation';const notes=String($('#programEditorNotes')?.value||'').trim();await db.put('programs',{...program,name,nameKey:nameKey(name),scheduleMode,notes,updatedAt:new Date().toISOString()});await refreshState();renderAll();toast('Program updated');}
async function addProgramSlot(kind,templateId=null){const program=state.programs.find(item=>item.id===state.programEditorId);if(!program)return toast('Choose a program to edit');const days=structuredClone(program.days||[]);const template=templateId?state.templates.find(item=>item.id===templateId):null;days.push({id:uid(),order:days.length+1,kind,templateId:template?.id||null,label:kind==='rest'?'Rest day':template?.name||'Workout'});await db.put('programs',{...program,days,updatedAt:new Date().toISOString()});await refreshState();renderAll();}
async function moveProgramSlot(slotId,direction){const program=state.programs.find(item=>item.id===state.programEditorId);if(!program)return;const days=structuredClone(program.days||[]);const index=days.findIndex(day=>day.id===slotId);const next=index+direction;if(index<0||next<0||next>=days.length)return;[days[index],days[next]]=[days[next],days[index]];days.forEach((day,idx)=>day.order=idx+1);await db.put('programs',{...program,days,updatedAt:new Date().toISOString()});await refreshState();renderAll();}
async function removeProgramSlot(slotId){const program=state.programs.find(item=>item.id===state.programEditorId);if(!program)return;const days=(program.days||[]).filter(day=>day.id!==slotId).map((day,idx)=>({...day,order:idx+1}));await db.put('programs',{...program,days,updatedAt:new Date().toISOString()});await refreshState();renderAll();}

async function advanceActiveProgramAfterSession(session){const program=activeProgram(state.programs);if(!program||program.scheduleMode==='manual'||!Array.isArray(program.days)||!program.days.length)return;if(isRestDaySession(session)){const next=nextProgramSlot(program,state.activeProgramProgress);if(next?.kind!=='rest')return;state.activeProgramProgress={...advanceProgramProgress(program,state.activeProgramProgress,null),programId:program.id};}else if((program.days||[]).some(day=>day.kind==='template'&&day.templateId===session.templateId)){state.activeProgramProgress={...advanceProgramProgress(program,state.activeProgramProgress,session.templateId),programId:program.id};}else return;await db.put('settings',{key:'activeProgramProgress',value:state.activeProgramProgress,updatedAt:new Date().toISOString()});}

function applyTrainingBuilderTab(){const tab=state.trainingBuilderTab||'cycles';$$('[data-training-builder-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.trainingBuilderTab===tab));const phase=$('.training-phase-panel'),program=$('.program-manager-panel'),routine=$('.routine-builder-panel'),library=$('.library-picker');if(phase)phase.hidden=tab!=='cycles';if(program)program.hidden=tab!=='cycles';if(routine)routine.hidden=tab==='cycles';if(routine)routine.classList.toggle('exercise-library-only',tab==='exercises');if(library)library.hidden=tab==='routines';const editor=$('.routine-builder-panel .form-grid');if(editor)editor.closest('.routine-builder-panel')?.classList.toggle('exercise-library-only',tab==='exercises');}

function renderProgramManager(){const activeNode=$('#activeProgramSummary'),list=$('#programList'),editor=$('#programScheduleEditor');if(!activeNode||!list||!editor)return;const current=activeProgram(state.programs);const next=current?nextProgramSlot(current,state.activeProgramProgress):null;activeNode.innerHTML=current?`<div class="cycle-metrics-card"><h4>${escapeHtml(current.name)}</h4><p>${escapeHtml(current.scheduleMode==='manual'?'Manual routine folder':'Rotation schedule')} · ${(current.days||[]).length} slot${(current.days||[]).length===1?'':'s'}</p><p><strong>${current.scheduleMode==='manual'?'Selection':'Next'}:</strong> ${escapeHtml(current.scheduleMode==='manual'?'Choose any routine':next?.label||'No slot configured')}</p></div>`:'<div class="empty-state">No active program. Workout templates remain available individually.</div>';list.innerHTML=state.programs.length?state.programs.map(program=>`<div class="analytics-row"><div><strong>${escapeHtml(program.name)}</strong><small>${escapeHtml(program.splitType||'custom')} · ${(program.days||[]).length} slots · ${escapeHtml(program.scheduleMode||'rotation')}</small><small>${program.active?'Active':'Inactive'}${program.notes?` · ${escapeHtml(program.notes)}`:''}</small></div><div class="cycle-row-actions"><button class="text-button" data-program-action="edit" data-program-id="${escapeHtml(program.id)}">Edit</button><button class="text-button" data-program-action="activate" data-program-id="${escapeHtml(program.id)}">${program.active?'Active':'Activate'}</button><button class="text-button" data-program-action="delete" data-program-id="${escapeHtml(program.id)}">Delete</button></div></div>`).join(''):'<div class="empty-state">No programs yet. Create one from a preset or start custom.</div>';if(!state.programEditorId&&state.programs.length)state.programEditorId=current?.id||state.programs[0].id;const program=state.programs.find(item=>item.id===state.programEditorId);if(!program){editor.innerHTML='<div class="empty-state">Choose Edit on a program to manage its schedule.</div>';return;}const templateOptions=state.templates.map(template=>`<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join('');editor.innerHTML=`<div class="program-editor-card"><h4>Edit ${escapeHtml(program.name)}</h4><div class="form-grid"><label>Program name<input id="programEditorName" value="${escapeHtml(program.name)}"></label><label>Schedule<select id="programEditorScheduleMode"><option value="rotation" ${program.scheduleMode!=='manual'?'selected':''}>Rotation — advance after each completed slot</option><option value="manual" ${program.scheduleMode==='manual'?'selected':''}>Manual — use as a routine folder</option></select></label></div><label>Notes<textarea id="programEditorNotes" rows="2">${escapeHtml(program.notes||'')}</textarea></label><button class="button button-ghost button-wide" type="button" data-program-editor-save>Save program settings</button><div class="program-slot-add"><label>Saved routine<select id="programRoutineSelect">${templateOptions}</select></label><button class="button button-primary" type="button" data-program-add-routine>Add routine</button><button class="button button-ghost" type="button" data-program-add-rest>Add rest day</button></div><div class="program-slot-list">${(program.days||[]).map((day,idx)=>`<div class="program-slot"><span><strong>${idx+1}. ${escapeHtml(day.label||(day.kind==='rest'?'Rest day':'Workout'))}</strong><small>${escapeHtml(day.kind==='rest'?'Rest / no workout':state.templates.find(t=>t.id===day.templateId)?.name||'Missing routine')}</small></span><span class="program-slot-actions"><button class="text-button" data-program-slot="${escapeHtml(day.id)}" data-program-slot-action="up">↑</button><button class="text-button" data-program-slot="${escapeHtml(day.id)}" data-program-slot-action="down">↓</button><button class="text-button" data-program-slot="${escapeHtml(day.id)}" data-program-slot-action="remove">×</button></span></div>`).join('')||'<div class="empty-state compact-empty">No schedule slots yet.</div>'}</div></div>`;}

function renderRoutineBuilder(){
  const select=$('#routineBuilderSelect'),list=$('#routineBuilderExerciseList'),results=$('#routineLibraryResults');if(!select||!list||!results)return;
  const bodySelect=$('#routineLibraryBodyGroup'),equipmentSelect=$('#routineLibraryEquipment');
  if(bodySelect){const current=bodySelect.value;const values=[...new Set(state.exercises.map(item=>item.bodyGroup).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-GB'));bodySelect.innerHTML='<option value="">All muscle groups</option>'+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');if(values.includes(current))bodySelect.value=current;}
  if(equipmentSelect){const current=equipmentSelect.value;const values=[...new Set(state.exercises.map(item=>item.equipment).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-GB'));equipmentSelect.innerHTML='<option value="">All equipment</option>'+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');if(values.includes(current))equipmentSelect.value=current;}
  const templates=state.templates.filter(template=>['strength','cardio'].includes(template.category));if(!state.routineBuilderTemplateId||!templates.some(t=>t.id===state.routineBuilderTemplateId))state.routineBuilderTemplateId=templates[0]?.id||null;
  select.innerHTML=templates.map(template=>`<option value="${escapeHtml(template.id)}" ${template.id===state.routineBuilderTemplateId?'selected':''}>${escapeHtml(template.name)}</option>`).join('');
  const template=state.templates.find(item=>item.id===state.routineBuilderTemplateId);
  list.innerHTML=template?(template.exercises||[]).map((exercise,idx)=>{const editing=state.routineExerciseEditorIndex===idx;const workSets=exercise.targetWorkingSets||exercise.sets?.filter(s=>String(s.setType).toLowerCase()==='work').length||1;const prescription=[`${workSets} set${workSets===1?'':'s'}`,exercise.targetRepRange||'',exercise.targetRestSeconds?`${exercise.targetRestSeconds}s rest`:'',exercise.targetRir?`RIR ${exercise.targetRir}`:''].filter(Boolean).join(' · ');return `<div class="routine-exercise-card"><div class="routine-exercise-main"><span><strong>${idx+1}. ${escapeHtml(exercise.name)}</strong><small>${escapeHtml(prescription||[exercise.variation,exercise.machineBrand,exercise.machineModel].filter(Boolean).join(' · ')||'Saved routine exercise')}</small>${exercise.phasePrescriptionNote?`<small class="routine-note phase-prescription-note">${escapeHtml(exercise.phasePrescriptionNote)}</small>`:''}${exercise.notes?`<small class="routine-note">${escapeHtml(exercise.notes)}</small>`:''}</span><span class="program-slot-actions"><button class="text-button" data-routine-exercise-index="${idx}" data-routine-action="up">↑</button><button class="text-button" data-routine-exercise-index="${idx}" data-routine-action="down">↓</button><button class="text-button" data-routine-exercise-index="${idx}" data-routine-action="edit">Edit</button><button class="text-button danger-text" data-routine-exercise-index="${idx}" data-routine-action="remove">×</button></span></div>${editing?`<div class="routine-inline-editor"><div class="form-grid"><label>Working sets<input id="routineEditSets" type="number" min="1" max="8" value="${escapeHtml(workSets)}"></label><label>Target reps<input id="routineEditReps" value="${escapeHtml(exercise.targetRepRange||'8–12')}"></label><label>Rest seconds<input id="routineEditRest" value="${escapeHtml(exercise.targetRestSeconds||'60–120')}"></label><label>Target RIR<input id="routineEditRir" value="${escapeHtml(exercise.targetRir||'1–2')}"></label></div><label>Exercise note<textarea id="routineEditNote" rows="2">${escapeHtml(exercise.notes||'')}</textarea></label><div class="cycle-form-actions"><button class="button button-primary" type="button" data-routine-save-prescription="${idx}">Save exercise</button><button class="button button-ghost" type="button" data-routine-cancel-edit>Cancel</button></div></div>`:''}</div>`;}).join('')||'<div class="empty-state compact-empty">No exercises in this routine yet.</div>':'<div class="empty-state compact-empty">Create a routine first.</div>';
  const search=nameKey($('#routineLibrarySearch')?.value||''),body=$('#routineLibraryBodyGroup')?.value||'',equipment=$('#routineLibraryEquipment')?.value||'';const filtered=state.exercises.filter(ex=>(!search||nameKey(`${ex.name} ${(ex.aliases||[]).join(' ')} ${ex.bodyGroup||''} ${ex.equipment||''}`).includes(search))&&(!body||ex.bodyGroup===body)&&(!equipment||ex.equipment===equipment)).slice(0,100);results.innerHTML=filtered.map(ex=>`<button class="exercise-picker-item" type="button" data-routine-add-exercise="${escapeHtml(ex.id)}"><span><strong>${escapeHtml(ex.name)}</strong><small>${escapeHtml(ex.bodyGroup||'General')} · ${escapeHtml(ex.equipment||'Not set')} · ${escapeHtml(ex.exerciseType||'weight & reps')}</small></span><span>+</span></button>`).join('')||'<div class="empty-state compact-empty">No matching exercise.</div>';const count=$('#exerciseCatalogueSummary');if(count)count.textContent=`${state.exercises.length.toLocaleString('en-GB')} exercises available · ${exerciseCatalogueSummary.count} built in`;
}

async function createBlankRoutine(){const name=String($('#newRoutineName')?.value||'').trim();if(!name)return toast('Enter a routine name');if(state.templates.some(item=>nameKey(item.name)===nameKey(name)))return toast('A routine with that name already exists');const template={id:`routine-${uid()}`,profileId:profileId(),name,category:'strength',exercises:[],source:'user-created',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await db.put('templates',template);state.routineBuilderTemplateId=template.id;await refreshState();renderAll();if($('#newRoutineName'))$('#newRoutineName').value='';toast(`${name} created`);}
async function addExerciseToRoutine(exerciseId){const template=state.templates.find(item=>item.id===state.routineBuilderTemplateId),exercise=state.exercises.find(item=>item.id===exerciseId);if(!template||!exercise)return;if((template.exercises||[]).some(item=>(item.sourceExerciseId||item.id)===exercise.id&&nameKey(item.name)===nameKey(exercise.name)))return toast('Exercise is already in this routine');template.exercises||=[];template.exercises.push(templateExerciseFromLibrary(exercise));template.updatedAt=new Date().toISOString();await db.put('templates',template);await refreshState();renderAll();}
async function editRoutineExercise(index,action){const template=state.templates.find(item=>item.id===state.routineBuilderTemplateId);if(!template||!template.exercises?.[index])return;if(action==='edit'){state.routineExerciseEditorIndex=state.routineExerciseEditorIndex===index?null:index;renderRoutineBuilder();return;}if(action==='remove')template.exercises.splice(index,1);if(action==='up'&&index>0)[template.exercises[index],template.exercises[index-1]]=[template.exercises[index-1],template.exercises[index]];if(action==='down'&&index<template.exercises.length-1)[template.exercises[index],template.exercises[index+1]]=[template.exercises[index+1],template.exercises[index]];template.updatedAt=new Date().toISOString();state.routineExerciseEditorIndex=null;await db.put('templates',template);await refreshState();renderAll();}
async function saveRoutineExercisePrescription(index){const template=state.templates.find(item=>item.id===state.routineBuilderTemplateId);const exercise=template?.exercises?.[index];if(!template||!exercise)return;const workingSets=Math.max(1,Math.min(8,Number($('#routineEditSets')?.value||1)));const repRange=String($('#routineEditReps')?.value||'').trim();const rest=String($('#routineEditRest')?.value||'').trim();const rir=String($('#routineEditRir')?.value||'').trim();const note=String($('#routineEditNote')?.value||'').trim();const lowRep=Number(repRange.match(/\d+/)?.[0]||8);const restValue=Number(rest.match(/\d+/)?.[0]||0)||null;exercise.targetWorkingSets=workingSets;exercise.targetRepRange=repRange;exercise.targetRestSeconds=rest;exercise.targetRir=rir;exercise.notes=note;const warmups=(exercise.sets||[]).filter(s=>String(s.setType).toLowerCase().includes('warm'));exercise.sets=[...warmups,...Array.from({length:workingSets},()=>({setType:'Work',weightKg:0,reps:lowRep,rpe:8,failure:false,restSeconds:restValue,restRecorded:Boolean(restValue)}))];template.updatedAt=new Date().toISOString();state.routineExerciseEditorIndex=null;await db.put('templates',template);await refreshState();renderAll();toast('Exercise prescription updated');}

async function ensureV140ProgramFoundation(){const existing=await db.get('settings','v140ProgramFoundation');if(existing?.value?.completed)return;const programs=await db.getAll('programs');if(!programs.length){const templateRows=await db.getAll('templates');const available=new Set(templateRows.map(item=>item.id));const desired=['chest-biceps','liss','shoulders-triceps','liss','legs','liss','back','liss'].filter(id=>available.has(id));const byId=Object.fromEntries(templateRows.map(item=>[item.id,item]));if(desired.length){const program={id:`program-${uid()}`,profileId:profileId(),name:'Current VANTAGE rotation',nameKey:'current vantage rotation',splitType:'vantage-current',scheduleMode:'rotation',active:true,notes:'Migrated from the pre-1.4 VANTAGE routine. Edit freely.',days:desired.map((templateId,index)=>({id:uid(),order:index+1,kind:'template',templateId,label:byId[templateId]?.name||templateId})),schema:'vantage-program-v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await db.put('programs',program);const sessions=await db.getAll('sessions');const latest=sessions.find(session=>program.days.some(day=>day.templateId===session.templateId));const idx=latest?program.days.findIndex(day=>day.templateId===latest.templateId):-1;const progress={programId:program.id,nextIndex:idx>=0?(idx+1)%program.days.length:0,lastCompletedTemplateId:latest?.templateId||null,updatedAt:new Date().toISOString()};await db.put('settings',{key:'activeProgramProgress',value:progress,updatedAt:new Date().toISOString()});}}await db.put('settings',{key:'v140ProgramFoundation',value:{completed:true,catalogueCount:builtInExerciseLibrary.length,completedAt:new Date().toISOString()},updatedAt:new Date().toISOString()});}

function clearSupplementObjectUrls() {
  state.supplementObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.supplementObjectUrls = [];
}

function resetSupplementForm() {
  const form = $('#supplementForm');
  if (!form) return;
  form.reset();
  form.elements.id.value = '';
  form.elements.category.value = 'supplement';
  form.elements.timesPerDay.value = 1;
  form.elements.effectiveDate.value = today();
  form.elements.active.checked = true;
  state.pendingSupplementPhoto = null;
  $('#cancelSupplementEditButton').hidden = true;
  renderPendingSupplementPhoto();
}

function renderPendingSupplementPhoto() {
  const node = $('#supplementPhotoPreview');
  if (!node) return;
  const item = state.pendingSupplementPhoto;
  if (!item?.blob) {
    node.innerHTML = '<div class="empty-state compact-empty">No product photo selected.</div>';
    return;
  }
  const url = URL.createObjectURL(item.blob);
  state.supplementObjectUrls.push(url);
  node.innerHTML = `<img src="${url}" alt="Selected supplement product"><p>${escapeHtml(item.name || 'Product image')}</p>`;
}

async function selectSupplementPhoto(file, source = 'gallery') {
  if (!file) return;
  if (source === 'camera') requestImmediateCameraBackup(file, 'VANTAGE_Supplement', today());
  const processed = await compressImageFile(file);
  state.pendingSupplementPhoto = { ...processed, captureSource: source };
  renderPendingSupplementPhoto();
  toast('Product photo ready to save');
}

function supplementFromForm(form) {
  const data = new FormData(form);
  const id = String(data.get('id') || '');
  const existing = state.supplements.find(item => item.id === id);
  return {
    id: existing?.id || uid(), profileId: existing?.profileId || profileId(), name: String(data.get('name') || '').trim(), nameKey: nameKey(data.get('name')),
    category: String(data.get('category') || 'supplement'), brand: String(data.get('brand') || '').trim(),
    amount: num(data.get('amount')), unit: String(data.get('unit') || '').trim(), timesPerDay: num(data.get('timesPerDay')),
    timing: String(data.get('timing') || '').trim(), notes: String(data.get('notes') || '').trim(),
    active: data.get('active') === 'on', startDate: String(data.get('effectiveDate') || today()),
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

async function saveSupplement(form) {
  const item = supplementFromForm(form);
  if (!item.name) return toast('Add a supplement or TRT item name');
  const effectiveDate = String(form.elements.effectiveDate.value || today());
  await db.put('supplements', item);
  await db.put('supplementEvents', {
    id: uid(), profileId: profileId(), supplementId: item.id, effectiveDate, active: item.active,
    amount: item.amount, unit: item.unit, timesPerDay: item.timesPerDay, timing: item.timing,
    eventType: state.supplements.some(existing => existing.id === item.id) ? 'updated' : 'created', createdAt: new Date().toISOString()
  });
  if (state.pendingSupplementPhoto?.blob) {
    const existingMedia = state.supplementMedia.filter(media => media.supplementId === item.id);
    for (const media of existingMedia) await db.remove('supplementMedia', media.id);
    await db.put('supplementMedia', {
      id: uid(), profileId: profileId(), supplementId: item.id, name: state.pendingSupplementPhoto.name || `${item.name}.jpg`,
      type: state.pendingSupplementPhoto.type || 'image/jpeg', size: state.pendingSupplementPhoto.size || state.pendingSupplementPhoto.blob.size,
      blob: state.pendingSupplementPhoto.blob, captureSource: state.pendingSupplementPhoto.captureSource || 'gallery', createdAt: new Date().toISOString()
    });
  }
  await refreshState();
  clearSupplementObjectUrls();
  resetSupplementForm();
  renderAll(); showScreen('supplements'); toast(`${item.name} saved`);
}

async function toggleSupplement(id) {
  const item = state.supplements.find(row => row.id === id);
  if (!item) return;
  const active = !item.active;
  await db.put('supplements', { ...item, active, updatedAt: new Date().toISOString() });
  await db.put('supplementEvents', { id: uid(), profileId: profileId(), supplementId: id, effectiveDate: today(), active, amount: item.amount, unit: item.unit, timesPerDay: item.timesPerDay, timing: item.timing, eventType: active ? 'activated' : 'deactivated', createdAt: new Date().toISOString() });
  await refreshState(); renderAll(); showScreen('supplements'); toast(`${item.name} ${active ? 'activated' : 'deactivated'}`);
}

async function deleteSupplement(id) {
  for (const event of state.supplementEvents.filter(item => item.supplementId === id)) await db.remove('supplementEvents', event.id);
  for (const media of state.supplementMedia.filter(item => item.supplementId === id)) await db.remove('supplementMedia', media.id);
  await db.remove('supplements', id);
  await refreshState(); renderAll(); showScreen('supplements'); toast('Supplement record deleted');
}

async function editSupplement(id) {
  const item = state.supplements.find(row => row.id === id);
  const form = $('#supplementForm');
  if (!item || !form) return;
  for (const key of ['id','name','category','brand','amount','unit','timesPerDay','timing','notes']) if (form.elements[key]) form.elements[key].value = item[key] ?? '';
  form.elements.effectiveDate.value = today();
  form.elements.active.checked = Boolean(item.active);
  const media = state.supplementMedia.find(row => row.supplementId === id);
  state.pendingSupplementPhoto = media?.blob ? { blob: media.blob, name: media.name, type: media.type, size: media.size, captureSource: media.captureSource } : null;
  $('#cancelSupplementEditButton').hidden = false;
  renderPendingSupplementPhoto();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderSupplements() {
  const activeNode = $('#activeSupplementSummary');
  const list = $('#supplementList');
  if (!activeNode || !list) return;
  clearSupplementObjectUrls();
  const active = activeSupplementRecords();
  activeNode.innerHTML = active.length ? active.map(item => `<div class="supplement-status-chip"><span><strong>${escapeHtml(item.name)}</strong>${item.brand ? ` · ${escapeHtml(item.brand)}` : ''}</span><span>${item.amount != null ? `${escapeHtml(item.amount)} ${escapeHtml(item.unit || '')}` : ''}${item.timesPerDay != null ? ` × ${escapeHtml(item.timesPerDay)}/day` : ''}</span></div>`).join('') : '<div class="empty-state">No active supplements or TRT items recorded.</div>';
  if (!state.supplements.length) {
    list.innerHTML = '<div class="empty-state">Add your first supplement, prescription or TRT record above.</div>';
    return;
  }
  const mediaMap = new Map(state.supplementMedia.map(item => [item.supplementId, item]));
  list.innerHTML = state.supplements.map(item => {
    const media = mediaMap.get(item.id);
    let photo = '<div class="supplement-thumb-placeholder">＋</div>';
    if (media?.blob) {
      const url = URL.createObjectURL(media.blob); state.supplementObjectUrls.push(url);
      photo = `<img class="supplement-thumb" src="${url}" alt="${escapeHtml(item.name)} product">`;
    }
    const dose = [item.amount != null ? `${item.amount} ${item.unit || ''}`.trim() : '', item.timesPerDay != null ? `${item.timesPerDay}× daily` : '', item.timing].filter(Boolean).join(' · ');
    return `<article class="supplement-card ${item.active ? 'active-item' : 'inactive-item'}"><div class="supplement-card-main">${photo}<div><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.brand || item.category)}</p><p>${escapeHtml(dose || 'Dose not set')}</p><p>${item.active ? 'Active' : 'Inactive'}${item.notes ? ` · ${escapeHtml(item.notes)}` : ''}</p></div></div><div class="supplement-card-footer supplement-row-actions"><button class="text-button" data-supplement-action="edit" data-supplement-id="${escapeHtml(item.id)}">Edit</button><button class="text-button" data-supplement-action="toggle" data-supplement-id="${escapeHtml(item.id)}">${item.active ? 'Make inactive' : 'Make active'}</button><button class="text-button" data-supplement-action="delete" data-supplement-id="${escapeHtml(item.id)}">Delete</button></div></article>`;
  }).join('');
}

function renderReadinessCard(node, result, hasData = true) {
  node.className = `readiness-card readiness-${hasData ? result.level : 'neutral'}${node.classList.contains('compact') ? ' compact' : ''}`;
  const orb = node.querySelector('.readiness-orb');
  const title = node.querySelector('h3');
  const message = node.querySelector('.readiness-copy p:last-child');
  orb.textContent = hasData ? result.level.toUpperCase()[0] : '–';
  title.textContent = hasData ? result.title : 'No data entered';
  message.textContent = hasData ? result.message : 'The decision updates as you type.';
}

function renderDashboard() {
  $('#todayLabel').textContent = localDateLabel(today());
  const vitals = latestVitals();
  const result = calculateReadiness(vitals || {});
  const card = $('#readinessCard');
  renderReadinessCard(card, result, Boolean(vitals));
  $('#readinessOrb').textContent = vitals ? result.level.toUpperCase()[0] : '–';
  $('#readinessTitle').textContent = vitals ? result.title : 'No reading yet';
  $('#readinessMessage').textContent = vitals ? result.message : 'Log today’s vitals to generate a training recommendation.';

  const bpAlert = $('#bpAlert');
  if (vitals && result.bpStatus !== 'normal') {
    bpAlert.hidden = false;
    bpAlert.innerHTML = `<strong>BP limiter:</strong> ${escapeHtml(vitals.systolic || '–')}/${escapeHtml(vitals.diastolic || '–')} mmHg. ${escapeHtml(result.message)}`;
  } else if (vitals && result.validationWarnings?.length) {
    bpAlert.hidden = false;
    bpAlert.innerHTML = `<strong>Readiness integrity check:</strong> ${escapeHtml(result.validationWarnings[0])}`;
  } else bpAlert.hidden = true;

  const metrics = [
    ['NOOP recovery', vitals?.recovery != null ? `${vitals.recovery}%` : '–'],
    ['HRV', vitals?.hrv != null ? `${vitals.hrv} ms` : '–'],
    ['Resting HR', vitals?.restingHr != null ? `${vitals.restingHr} bpm` : '–'],
    ['Blood pressure', vitals?.systolic ? `${vitals.systolic}/${vitals.diastolic || '–'}` : '–']
  ];
  $('#dashboardMetrics').innerHTML = metrics.map(([label,value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  const restDay = todayRestDay();
  const savedTrainingToday = state.sessions.find(session => session.date === today() && !isRestDaySession(session));
  const restButton = $('#recordRestDayButton');
  restButton.disabled = Boolean(state.currentSession || savedTrainingToday || restDay);
  restButton.classList.toggle('active', Boolean(restDay));
  restButton.textContent = restDay ? 'Rest day recorded' : (savedTrainingToday ? 'Training logged' : 'Rest Day');

  if (state.currentSession) {
    $('#todayPlan').innerHTML = isLissSession(state.currentSession)
      ? `<div class="list-item"><div><h4>${escapeHtml(activityLabel(state.currentSession.cardio?.activityType))}</h4><p>LISS · manual duration</p></div><strong>In progress</strong></div>`
      : isRecoverySession(state.currentSession)
        ? `<div class="list-item"><div><h4>${escapeHtml(state.currentSession.recoverySession?.activity || 'Yoga / Recovery')}</h4><p>Recovery session · ${state.currentSession.recoverySession?.durationMinutes || '–'} min</p></div><strong>In progress</strong></div>`
        : `<div class="list-item"><div><h4>${escapeHtml(state.currentSession.sessionType)}</h4><p>${escapeHtml(modeLabel(state.currentSession.mode))} · ${(state.currentSession.exercises || []).length} exercises</p></div><strong>In progress</strong></div>`;
  } else if (restDay) {
    $('#todayPlan').innerHTML = `<div class="list-item rest-day-record"><div><h4>Rest Day</h4><p>${escapeHtml(restDay.decision?.readinessTitle || 'Rest selected')} · ${escapeHtml(restDay.decision?.recommendedAction || 'No recommendation recorded')}</p></div><button class="text-button" type="button" data-undo-rest-day>Undo</button></div>`;
  } else if (savedTrainingToday) {
    $('#todayPlan').innerHTML = sessionListItem(savedTrainingToday);
  } else {
    $('#todayPlan').innerHTML = `<div class="empty-state">No active session. Choose a workout template or record a rest day.</div>`;
  }

  const recent = state.sessions.slice(0, 3);
  $('#recentSessions').innerHTML = recent.length ? recent.map(session => sessionListItem(session)).join('') : '<div class="empty-state">No saved sessions yet.</div>';
}

function sessionListItem(session) {
  if (isRestDaySession(session)) {
    return `<div class="list-item"><div><h4>Rest Day</h4><p>${localDateLabel(session.date)} · ${escapeHtml(session.decision?.readinessTitle || 'Recovery decision')}</p></div><strong>Rest</strong></div>`;
  }
  if (isRecoverySession(session)) {
    const recovery = session.recoverySession || {};
    return `<div class="list-item"><div><h4>${escapeHtml(recovery.activity || session.sessionType)}</h4><p>${localDateLabel(session.date)} · ${recovery.durationMinutes ? `${recovery.durationMinutes} min` : 'Recovery session'}</p></div><strong>Recovery</strong></div>`;
  }
  if (isLissSession(session)) {
    const metrics = session.cardio?.metrics || {};
    const detail = [durationLabel(session.cardio?.elapsedSeconds || metrics.durationSeconds), metrics.avgHr ? `Avg HR ${metrics.avgHr}` : null].filter(Boolean).join(' · ');
    return `<div class="list-item"><div><h4>${escapeHtml(activityLabel(session.cardio?.activityType))}</h4><p>${localDateLabel(session.date)} · ${escapeHtml(detail)}</p></div><strong>LISS</strong></div>`;
  }
  const totals = sessionTotals(session);
  return `<div class="list-item"><div><h4>${escapeHtml(session.sessionType)}</h4><p>${localDateLabel(session.date)} · ${totals.workSets} work sets</p></div><strong>${fmt(totals.volume)} kg</strong></div>`;
}

function updateWorkoutSetupForTemplate() {
  const template = state.templates.find(item => item.id === $('#templateSelect').value);
  const cardio = template?.category === 'cardio' || template?.id === 'liss';
  const recovery = template?.category === 'recovery' || template?.id === 'recovery';
  $('#workoutModeField').hidden = Boolean(cardio || recovery);
  $('#startWorkoutButton').textContent = cardio ? 'Start / load LISS' : recovery ? 'Start / load recovery' : 'Start / load session';
}

function renderTemplateOptions() {
  const select=$('#templateSelect'); if(!select)return;
  const program=activeProgram(state.programs); const activeIds=[...new Set((program?.days||[]).filter(day=>day.kind==='template'&&day.templateId).map(day=>day.templateId))];
  const activeTemplates=activeIds.map(id=>state.templates.find(item=>item.id===id)).filter(Boolean); const otherTemplates=state.templates.filter(item=>!activeIds.includes(item.id));
  const option=item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`;
  select.innerHTML=activeTemplates.length?`<optgroup label="Active program">${activeTemplates.map(option).join('')}</optgroup>${otherTemplates.length?`<optgroup label="Other routines">${otherTemplates.map(option).join('')}</optgroup>`:''}`:state.templates.map(option).join('');
  if(state.currentSession)select.value=state.currentSession.templateId; else if(program){const next=nextProgramSlot(program,state.activeProgramProgress);if(next?.kind==='template'&&state.templates.some(item=>item.id===next.templateId))select.value=next.templateId;}
  updateWorkoutSetupForTemplate();
}

function modeLabel(mode) {
  return ({ normal: 'Normal', deload: 'Deload', 'bp-watch': 'BP watch', 'recovery-watch': 'Recovery watch' })[mode] || mode;
}

function createSessionFromTemplate(template, mode) {
  const startedAt = new Date().toISOString();
  const sessionDate = localDateInZone(startedAt) || today();
  const vitals = resolveVitalsForSession({ date: sessionDate, startedAt });
  const readiness = vitals ? calculateReadiness(vitals) : null;
  const cardioSession = template.category === 'cardio' || template.id === 'liss';
  const recoverySession = template.category === 'recovery' || template.id === 'recovery';
  const base = {
    id: uid(), profileId: profileId(), date: sessionDate, startedAt, completedAt: null,
    templateId: template.id, sessionType: template.name, category: template.category, mode, notes: '',
    vitalsSnapshot: vitals ? structuredClone(vitals) : null,
    readinessSnapshotAtStart: readiness ? structuredClone(readiness) : null,
    trainingContext: { cycles: cycleContextSnapshot(sessionDate), supplements: supplementContextSnapshot(sessionDate), medicationAdministrations: administrationEventsForDate(sessionDate), capturedAt: startedAt },
    decision: {
      recordedAt: startedAt,
      vitalsId: vitals?.id || null,
      readinessLevel: readiness?.level || 'unknown',
      readinessTitle: readiness?.title || 'No vitals logged',
      recommendedAction: recommendationAction(readiness),
      readinessCalculationAudit: readiness?.calculationAudit ? structuredClone(readiness.calculationAudit) : null,
      actualAction: cardioSession ? 'liss' : recoverySession ? 'yoga-recovery' : 'strength-training'
    }
  };
  if (template.category === 'cardio' || template.id === 'liss') {
    return {
      ...base,
      mode: 'normal',
      exercises: [],
      bloodPressureReadings: [],
      cardio: {
        activityType: 'walking',
        nasalBreathing: false,
        comments: '',
        elapsedSeconds: 0,
        manualDurationMinutes: null, manualStartTime: '', manualEndTime: '',
        durationInputMode: 'manual', durationSource: 'user-entered', timerUsed: false,
        fasted: false,
        nextPlannedSession: '',
        sources: defaultLissSources(),
        metrics: { distanceUnit: 'mi', speedUnit: 'mph', hrZones: {} },
        hydration: { coconutWaterMl: null, waterMl: null, otherFluidMl: null, aminoAcids: '', electrolytes: '', notes: '' },
        macroContextCorrection: '',
        mediaIds: [],
        analysis: null
      }
    };
  }
  if (recoverySession) {
    return {
      ...base,
      mode: 'normal',
      exercises: [],
      workoutHrSummary: { hrSource: 'strap', hrZones: {} },
      workoutHrEvidence: null,
      bloodPressureReadings: [],
      mediaIds: [],
      hydration: { recorded: false, amountMl: null, items: [], notes: '' },
      recoverySession: {
        activity: 'Yoga', durationMinutes: null, startTime: '', endTime: '', notes: '',
        tags: ['mobility', 'parasympathetic', 'breathwork', 'recovery']
      }
    };
  }
  const modeRpeAdjustment = mode === 'deload' ? -2 : (mode === 'bp-watch' || mode === 'recovery-watch' ? -1 : 0);
  const previousTemplateSession = findPreviousTemplateSession(template);
  return {
    ...base,
    previousSessionId: previousTemplateSession?.id || null,
    workoutHrSummary: { hrSource: 'strap', hrZones: {} },
    workoutHrEvidence: null,
    strengthAnalysis: null,
    bloodPressureReadings: [],
    exportOptions: { includeCurrentSessionPhotos: true, includeActiveReferencePhotos: false, includePreviousSessionPhotos: false, includeArchivedReferencePhotos: false, includeInvalidPhotos: false },
    mediaIds: [],
    exercises: template.exercises.map((item, exerciseIndex) => {
      const previousExercise = matchExerciseFromSession(previousTemplateSession, item);
      const olderCompatible = previousExercise ? null : latestCompatibleExerciseHistory(item, { excludeSessionId: previousTemplateSession?.id || null });
      const sourceExercise = previousExercise || olderCompatible?.exercise || null;
      const sourceSets = sourceExercise?.sets?.length ? sourceExercise.sets : (item.sets || []);
      return {
        id: uid(), sourceExerciseId: item.sourceExerciseId || item.id, name: item.name || previousExercise?.name, lineNumber: exerciseIndex + 1,
        aliases: [...new Set([...(item.aliases || []), ...(previousExercise?.aliases || []), previousExercise?.name && nameKey(previousExercise.name) !== nameKey(item.name) ? previousExercise.name : null].filter(Boolean))],
        machineBrand: previousExercise?.machineBrand || item.machineBrand || '',
        machineModel: previousExercise?.machineModel || item.machineModel || '',
        nickname: previousExercise?.nickname || item.nickname || '',
        variation: previousExercise?.variation || item.variation || '',
        movementPattern: previousExercise?.movementPattern || item.movementPattern || '',
        coreExercise: previousExercise?.coreExercise || item.coreExercise || item.name || '',
        nicknameAlias: previousExercise?.nicknameAlias || item.nicknameAlias || '',
        grip: previousExercise?.grip || item.grip || '', stance: previousExercise?.stance || item.stance || '',
        unilateral: previousExercise?.unilateral ?? item.unilateral ?? null,
        loadConvention: previousExercise?.loadConvention || item.loadConvention || '',
        comparisonStreamId: previousExercise?.comparisonStreamId || item.comparisonStreamId || '',
        temporarySubstitution: false,
        comparisonHistoryInvalidated: item.comparisonHistoryInvalidated === true,
        identityCorrectedAt: item.identityCorrectedAt || null,
        identityCorrectionSource: item.identityCorrectionSource || null,
        notes: previousExercise?.notes || item.notes || '', persistToTemplate: true,
        repeatedFromSessionId: previousExercise ? previousTemplateSession?.id || null : (olderCompatible?.session?.id || null),
        sets: sourceSets.map((set, setIndex) => {
          const baseRpe = set.rpe ?? (set.setType === 'Warm-up' ? 4 : 8);
          return {
            id: uid(), setType: set.setType || 'Work', setNumber: setIndex + 1,
            weightKg: Number(set.weightKg || 0), reps: Number(set.reps || 0),
            rpe: Math.max(1, Math.min(10, Number(baseRpe) + modeRpeAdjustment)),
            failure: false, holdSeconds: Number(set.holdSeconds || 0),
            restSeconds: set.restRecorded === true ? Number(set.restSeconds ?? 0) : (Number(set.restSeconds || 0) > 0 ? Number(set.restSeconds) : null),
            restRecorded: set.restRecorded === true || Number(set.restSeconds || 0) > 0, notes: set.notes || ''
          };
        })
      };
    })
  };
}

function persistDraft() {
  if (state.currentSession) localStorage.setItem(DRAFT_KEY, JSON.stringify(state.currentSession));
  else localStorage.removeItem(DRAFT_KEY);
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (draft?.id) {
      for (const exercise of draft.exercises || []) {
        if (/^dumbbell lateral raise$/i.test(exercise.name || '')) {
          exercise.aliases = [...new Set([...(exercise.aliases || []), exercise.name])];
          exercise.name = 'Lateral raise';
          exercise.variation ||= 'Machine';
        }
        if (/seated\s+laterial\s+raise\s+machine/i.test(exercise.name || '')) exercise.name = 'Seated lateral raise machine';
        for (const set of exercise.sets || []) {
          if (set.restRecorded !== true && Number(set.restSeconds || 0) === 0) { set.restSeconds = null; set.restRecorded = false; }
        }
      }
      state.currentSession = draft;
      persistDraft();
    }
  } catch { localStorage.removeItem(DRAFT_KEY); }
}

function exerciseMatchInSession(session, exerciseOrName) {
  const current = typeof exerciseOrName === 'object' && exerciseOrName ? exerciseOrName : { name: exerciseOrName };
  return matchExerciseFromSession(session, current);
}

function previousSessionForCurrentWorkout() {
  const id = state.currentSession?.previousSessionId;
  return id ? state.sessions.find(session => session.id === id) || null : null;
}

function findPreviousExercise(exerciseOrName) {
  const preferredSession = previousSessionForCurrentWorkout();
  const preferredExercise = exerciseMatchInSession(preferredSession, exerciseOrName);
  if (preferredExercise) return { session: preferredSession, exercise: preferredExercise };
  for (const session of state.sessions) {
    if (session.id === preferredSession?.id || isLissSession(session) || isRecoverySession(session)) continue;
    const exercise = exerciseMatchInSession(session, exerciseOrName);
    if (exercise) return { session, exercise };
  }
  return null;
}

function findPreviousTemplateSession(template) {
  if (!template) return null;
  return findBestPreviousStrengthSession(state.sessions, template, { beforeDate: today() });
}

function matchingPreviousExercise(previousSession, exerciseOrName) {
  return exerciseMatchInSession(previousSession, exerciseOrName);
}

function matchingPreviousSet(previousExercise, set, setIndex) {
  const sets = previousExercise?.sets || [];
  if (sets[setIndex]) return sets[setIndex];
  const sameType = sets.filter(item => item.setType === set.setType);
  const typeIndex = (sets.slice(0, setIndex + 1).filter(item => item.setType === set.setType).length || 1) - 1;
  return sameType[typeIndex] || null;
}

function latestCompatibleExerciseHistory(exerciseOrName, { excludeSessionId = null } = {}) {
  for (const session of state.sessions || []) {
    if (!session || session.id === excludeSessionId || session.date >= today() || isLissSession(session) || isRecoverySession(session) || isRestDaySession(session)) continue;
    const exercise = exerciseMatchInSession(session, exerciseOrName);
    if (exercise) return { session, exercise };
  }
  return null;
}

function workSetReferenceText(exercise) {
  return (exercise?.sets || [])
    .filter(set => set.setType !== 'Warm-up' && (Number(set.weightKg || 0) > 0 || Number(set.reps || 0) > 0))
    .map(set => `${Number(set.weightKg || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kg × ${Number(set.reps || 0)}`)
    .join(' · ');
}

function previousWeekSubstitution(exercise) {
  const previousSession = previousSessionForCurrentWorkout();
  if (!previousSession) return null;
  const lineNumber = Number(exercise?.lineNumber || 0);
  const candidate = (previousSession.exercises || []).find(item => Number(item.lineNumber || 0) === lineNumber) || (previousSession.exercises || [])[Math.max(0, lineNumber - 1)] || null;
  const substitution = candidate?.sessionSubstitution;
  if (!candidate || !substitution?.temporary) return null;
  const originalSource = substitution.originalSourceExerciseId || substitution.originalExerciseSnapshot?.sourceExerciseId || null;
  const originalName = substitution.originalName || substitution.originalExerciseSnapshot?.name || null;
  const sameRoutineSlot = (originalSource && originalSource === exercise?.sourceExerciseId) || (originalName && nameKey(originalName) === nameKey(exercise?.name));
  if (!sameRoutineSlot) return null;
  return { session: previousSession, exercise: candidate, substitution };
}

function clearMediaObjectUrls() {
  state.mediaObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.mediaObjectUrls = [];
}

function clearExerciseMediaObjectUrls() {
  state.exerciseMediaObjectUrls.forEach(url => URL.revokeObjectURL(url));
  state.exerciseMediaObjectUrls = [];
}

function exerciseReferenceMediaKey(exercise) {
  return exercise?.sourceExerciseId || stableId('exercise', exercise?.name || 'unknown-exercise');
}

function exerciseSessionMediaKey(exercise) {
  return exercise?.id || exerciseReferenceMediaKey(exercise);
}

function exerciseReferenceCategoryLabel(value) {
  return ({
    'new-machine': 'New machine',
    'seat-setting': 'Seat / pad setting',
    'foot-placement': 'Foot placement',
    'grip-hold': 'Grip / hold position',
    'body-position': 'Body position',
    other: 'Other'
  })[value] || 'Reference';
}

async function exerciseReferenceMedia(exerciseId) {
  if (!exerciseId) return [];
  const rows = await db.getAllByIndex('exerciseMedia', 'exerciseId', exerciseId);
  let activeAssigned = rows.some(item => item.primary === true && item.archived !== true);
  const sorted = rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (!activeAssigned && sorted.length) {
    sorted[0].primary = true;
    sorted[0].archived = false;
    activeAssigned = true;
  }
  for (const item of sorted) {
    const primary = item.primary === true && item.archived !== true;
    const patch = {
      sourceRole: 'exerciseReferencePhoto',
      photoType: item.photoType || ({
        'new-machine': 'machine-reference', 'seat-setting': 'seat-setting',
        'foot-placement': 'foot-placement', 'grip-hold': 'grip-hold',
        'body-position': 'body-position', other: 'other-reference'
      })[item.category] || 'reference-photo',
      primary,
      archived: !primary,
      activeReference: primary,
      sessionId: null,
      includeInCoachPack: false,
      mappingConfidence: item.mappingConfidence || 'user-confirmed'
    };
    const changed = Object.entries(patch).some(([key, value]) => item[key] !== value);
    if (changed) {
      Object.assign(item, patch);
      await db.put('exerciseMedia', item);
    }
  }
  return sorted.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function referenceDownloadName(exercise, item) {
  const exerciseName = archiveSafeName(exercise?.name || 'Exercise');
  const extension = item.type === 'image/png' ? 'png' : 'jpg';
  return `VANTAGE_ExerciseRef_${exerciseName}_${String(item.createdAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
}

function openImagePreview(url, title, note = '') {
  const dialog = $('#imagePreviewDialog');
  if (!dialog) return;
  $('#imagePreviewImage').src = url;
  $('#imagePreviewTitle').textContent = title || 'Setup photo';
  $('#imagePreviewNote').textContent = note || 'No setup note recorded.';
  dialog.showModal();
}

async function setPrimaryExerciseReference(exerciseId, mediaId) {
  const media = await exerciseReferenceMedia(exerciseId);
  for (const item of media) {
    const shouldBePrimary = item.id === mediaId;
    item.primary = shouldBePrimary;
    item.activeReference = shouldBePrimary;
    item.archived = !shouldBePrimary;
    item.includeInCoachPack = false;
    await db.put('exerciseMedia', item);
  }
}

async function promoteExerciseReferenceIfNeeded(exerciseId) {
  const media = await exerciseReferenceMedia(exerciseId);
  if (media.length && !media.some(item => item.primary && !item.archived)) {
    media[0].primary = true;
    media[0].activeReference = true;
    media[0].archived = false;
    await db.put('exerciseMedia', media[0]);
  }
}

async function renderExerciseReferenceMedia(exercise, card) {
  const preview = card.querySelector('.exercise-reference-preview');
  const count = card.querySelector('.exercise-reference-count');
  const feature = card.querySelector('.exercise-reference-feature');
  if (!preview || !count || !feature) return;
  const media = await exerciseReferenceMedia(exerciseReferenceMediaKey(exercise));
  count.textContent = media.length ? `${media.filter(item => item.primary && !item.archived).length} active · ${media.filter(item => item.archived).length} archived` : '0';
  if (!media.length) {
    feature.hidden = true;
    preview.innerHTML = '<div class="empty-state compact-empty">No setup photos saved.</div>';
    return;
  }

  const primary = media.find(item => item.primary && !item.archived) || media[0];
  feature.hidden = false;
  const featureImage = feature.querySelector('img');
  const primaryUrl = URL.createObjectURL(primary.blob);
  state.exerciseMediaObjectUrls.push(primaryUrl);
  featureImage.src = primaryUrl;
  featureImage.alt = `${exercise.name} ${exerciseReferenceCategoryLabel(primary.category)}`;
  bindImagePreviewFallback(featureImage, primary.name);
  feature.querySelector('.exercise-reference-feature-label').textContent = exerciseReferenceCategoryLabel(primary.category);
  feature.querySelector('.exercise-reference-feature-note').textContent = primary.note || 'No setup note recorded.';
  feature.querySelector('.exercise-reference-feature-image').onclick = () => openImagePreview(primaryUrl, exerciseReferenceCategoryLabel(primary.category), primary.note);
  feature.querySelector('.exercise-reference-manage-button').onclick = () => {
    const panel = card.querySelector('.exercise-reference-panel');
    panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  preview.innerHTML = '';
  for (const item of media) {
    const url = URL.createObjectURL(item.blob);
    state.exerciseMediaObjectUrls.push(url);
    const node = document.createElement('article');
    node.className = `exercise-reference-card${item.id === primary.id ? ' primary-reference' : ''}${item.archived ? ' archived-reference' : ''}`;
    node.innerHTML = `
      <button class="exercise-reference-thumb-button" type="button" aria-label="Open setup reference"><img src="${url}" alt="${escapeHtml(exercise.name)} setup reference"></button>
      <div class="media-card-actions">
        <button type="button" data-primary-reference aria-label="Make this the main reference">${item.id === primary.id ? '★' : '☆'}</button>
        <button type="button" data-share-reference aria-label="Share or save image">↗</button>
        <button type="button" data-save-reference aria-label="Download image backup">↓</button>
        <button type="button" data-remove-reference aria-label="Delete reference image">×</button>
      </div>
      <div class="exercise-reference-meta">
        <strong>${escapeHtml(exerciseReferenceCategoryLabel(item.category))}${item.id === primary.id ? ' · Active' : ' · Archived'}</strong>
        <small>${escapeHtml(item.note || item.name || 'No note')}</small>
      </div>`;
    bindImagePreviewFallback(node.querySelector('img'), item.name);
    node.querySelector('.exercise-reference-thumb-button').addEventListener('click', () => openImagePreview(url, exerciseReferenceCategoryLabel(item.category), item.note));
    node.querySelector('[data-primary-reference]').addEventListener('click', async () => {
      await setPrimaryExerciseReference(exerciseReferenceMediaKey(exercise), item.id);
      await renderExerciseReferenceMedia(exercise, card);
      toast('Main setup reference updated');
    });
    node.querySelector('[data-share-reference]').addEventListener('click', async () => {
      const result = await shareOrDownloadImage(item.blob, referenceDownloadName(exercise, item), item.type || 'image/jpeg');
      if (result === 'shared') toast('Choose Photos, Gallery or Files to keep a second copy');
      else if (result === 'downloaded') toast('Reference photo downloaded to the phone');
    });
    node.querySelector('[data-save-reference]').addEventListener('click', () => {
      downloadBlob(item.blob, referenceDownloadName(exercise, item), item.type || 'image/jpeg');
      toast('Reference photo downloaded to Downloads');
    });
    node.querySelector('[data-remove-reference]').addEventListener('click', async () => {
      await db.remove('exerciseMedia', item.id);
      await promoteExerciseReferenceIfNeeded(exerciseReferenceMediaKey(exercise));
      await renderExerciseReferenceMedia(exercise, card);
      toast('Reference photo removed');
    });
    preview.appendChild(node);
  }
}

async function addExerciseReferenceImages(exercise, card, fileList, captureSource) {
  const files = [...(fileList || [])];
  const status = card.querySelector('.exercise-reference-status');
  if (!files.length) return;
  const exerciseId = exerciseReferenceMediaKey(exercise);
  const existing = await exerciseReferenceMedia(exerciseId);
  const category = card.querySelector('.exercise-reference-category')?.value || 'other';
  const note = String(card.querySelector('.exercise-reference-note')?.value || '').trim();
  const file = files[0];
  setImageImportStatus(status, 'Replacing the active reference image…', 'working');
  try {
    const detectedFileDate = fileLocalDate(file);
    const currentSessionDate = state.currentSession?.date || today();
    if (detectedFileDate && detectedFileDate !== currentSessionDate) {
      const keep = window.confirm(`${file.name || 'This image'} appears to be dated ${detectedFileDate}. Use it as the active reference anyway?`);
      if (!keep) return setImageImportStatus(status, 'Reference replacement cancelled.', '');
    }
    const processed = await compressImageFile(file);
    const digest = await sha256Hex(processed.blob);
    const duplicate = existing.find(item => item.sha256 === digest);
    if (duplicate) {
      for (const item of existing) {
        const selected = item.id === duplicate.id;
        item.primary = selected;
        item.activeReference = selected;
        item.archived = !selected;
        item.archivedAt = selected ? null : (item.archivedAt || new Date().toISOString());
        item.includeInCoachPack = false;
        if (selected) {
          item.note = note || item.note;
          item.category = category || item.category;
          item.sourceRole = 'exerciseReferencePhoto';
          item.mappingConfidence = 'user-confirmed';
          item.updatedAt = new Date().toISOString();
        }
        await db.put('exerciseMedia', item);
      }
      await renderExerciseReferenceMedia(exercise, card);
      setImageImportStatus(status, 'Existing duplicate set as the active reference.', 'success');
      return toast('Existing reference reused; no duplicate image was created');
    }

    for (const item of existing) {
      if (item.primary || !item.archived) {
        item.primary = false;
        item.activeReference = false;
        item.archived = true;
        item.archivedAt = new Date().toISOString();
        item.includeInCoachPack = false;
        await db.put('exerciseMedia', item);
      }
    }
    const createdAt = new Date().toISOString();
    const item = {
      id: uid(), exerciseId, exerciseName: exercise.name,
      name: processed.name || `Exercise_reference_${Date.now()}.jpg`,
      type: processed.type || 'image/jpeg', size: processed.size || processed.blob.size,
      blob: processed.blob, category, note, captureSource, sha256: digest,
      sourceRole: 'exerciseReferencePhoto',
      photoType: ({ 'new-machine': 'machine-reference', 'seat-setting': 'seat-setting', 'foot-placement': 'foot-placement', 'grip-hold': 'grip-hold', 'body-position': 'body-position', other: 'other-reference' })[category] || 'reference-photo',
      primary: true, activeReference: true, archived: false,
      sessionId: null, includeInCoachPack: false, mappingConfidence: 'user-confirmed',
      createdAt, updatedAt: createdAt
    };
    await db.put('exerciseMedia', item);
    const noteInput = card.querySelector('.exercise-reference-note');
    if (noteInput) noteInput.value = '';
    await renderExerciseReferenceMedia(exercise, card);
    setImageImportStatus(status, 'Active reference replaced. The previous reference was archived.', 'success');
    toast(`Active reference updated${captureSource === 'camera' ? '; backup download requested' : ''}`);
  } catch (error) {
    console.error('Reference photo import failed.', error);
    setImageImportStatus(status, error.message || 'Could not replace the reference image.', 'error');
    throw error;
  }
}
function bindExerciseReference(card, exercise) {
  const camera = card.querySelector('.exercise-reference-camera');
  const gallery = card.querySelector('.exercise-reference-gallery');
  card.querySelector('.exercise-reference-camera-button')?.addEventListener('click', () => camera?.click());
  card.querySelector('.exercise-reference-gallery-button')?.addEventListener('click', () => gallery?.click());
  camera?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    files.forEach(file => requestImmediateCameraBackup(file, `VANTAGE_ExerciseRef_${archiveSafeName(exercise.name)}`, state.currentSession?.date || today()));
    try { await addExerciseReferenceImages(exercise, card, files, 'camera'); }
    catch (error) { console.error(error); toast(error.message); }
    event.target.value = '';
  });
  gallery?.addEventListener('change', async event => {
    try { await addExerciseReferenceImages(exercise, card, event.target.files, 'gallery'); }
    catch (error) { console.error(error); toast(error.message); }
    event.target.value = '';
  });
  renderExerciseReferenceMedia(exercise, card).catch(console.error);
}

function exerciseSessionMediaDownloadName(session, exercise, item) {
  const extension = item.type === 'image/png' ? 'png' : 'jpg';
  return `VANTAGE_SessionPhoto_${archiveSafeName(exercise?.name || 'Exercise')}_${session?.date || today()}_${String(item.createdAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
}

async function exerciseSessionMedia(session, exercise) {
  if (!session?.id || !exercise) return [];
  const rows = (await sessionMedia(session.id)).filter(item => isExerciseSessionRole(item.sourceRole));
  const exerciseId = exerciseSessionMediaKey(exercise);
  const exact = rows.filter(item => item.linkedExerciseId === exerciseId);
  if (exact.length) return exact.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  // Legacy v1.3.6 images used sourceExerciseId as the link. Only recover that
  // mapping when it identifies one exercise; duplicate IDs must stay unresolved.
  const sameSourceExercises = (session.exercises || []).filter(item => item.sourceExerciseId && item.sourceExerciseId === exercise.sourceExerciseId);
  if (sameSourceExercises.length !== 1) return [];
  return rows.filter(item =>
    (item.linkedExerciseId === exercise.sourceExerciseId || item.sourceExerciseId === exercise.sourceExerciseId)
    && nameKey(item.linkedExerciseName) === nameKey(exercise.name)
  ).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

async function renderExerciseSessionMedia(exercise, card) {
  const session = state.currentSession;
  const preview = card.querySelector('.exercise-session-media-preview');
  const count = card.querySelector('.exercise-session-media-count');
  if (!session || isLissSession(session) || !preview || !count) return;
  const media = await exerciseSessionMedia(session, exercise);
  count.textContent = String(media.length);
  preview.innerHTML = '';
  if (!media.length) {
    preview.innerHTML = '<div class="empty-state compact-empty">No current-session images saved.</div>';
    return;
  }
  for (const item of media) {
    const url = URL.createObjectURL(item.blob);
    state.exerciseMediaObjectUrls.push(url);
    const node = document.createElement('article');
    node.className = `exercise-reference-card session-media-card${item.sourceRole === 'invalidPhoto' ? ' invalid-media' : ''}`;
    node.innerHTML = `
      <button class="exercise-reference-thumb-button" type="button"><img src="${url}" alt="${escapeHtml(exercise.name)} current session image"></button>
      <div class="media-card-actions">
        <button type="button" data-share-session-media aria-label="Share or save image">↗</button>
        <button type="button" data-save-session-media aria-label="Download image">↓</button>
        <button type="button" data-remove-session-media aria-label="Delete image">×</button>
      </div>
      <div class="exercise-reference-meta">
        <strong>${escapeHtml(({
          exerciseSessionPhoto: 'Current session',
          exerciseTechniquePhoto: 'Technique / form',
          bodyPositionReference: 'Body position',
          machineReference: 'Machine photo',
          invalidPhoto: 'Invalid / excluded'
        })[item.sourceRole] || item.sourceRole)}</strong>
        <small>${escapeHtml(item.caption || item.note || item.name || 'No note')}</small>
      </div>`;
    bindImagePreviewFallback(node.querySelector('img'), item.name);
    node.querySelector('.exercise-reference-thumb-button').addEventListener('click', () => openImagePreview(url, exercise.name, item.caption || item.note));
    node.querySelector('[data-share-session-media]').addEventListener('click', async () => {
      await shareOrDownloadImage(item.blob, exerciseSessionMediaDownloadName(session, exercise, item), item.type || 'image/jpeg');
    });
    node.querySelector('[data-save-session-media]').addEventListener('click', () => {
      downloadBlob(item.blob, exerciseSessionMediaDownloadName(session, exercise, item), item.type || 'image/jpeg');
    });
    node.querySelector('[data-remove-session-media]').addEventListener('click', async () => {
      await db.remove('sessionMedia', item.id);
      session.mediaIds = (session.mediaIds || []).filter(id => id !== item.id);
      persistDraft();
      await renderExerciseSessionMedia(exercise, card);
      toast('Current-session image removed');
    });
    preview.appendChild(node);
  }
}

async function addExerciseSessionImages(exercise, card, fileList, captureSource) {
  const session = state.currentSession;
  if (!session || isLissSession(session)) return toast('Start a strength workout first');
  const files = [...(fileList || [])];
  if (!files.length) return;
  const status = card.querySelector('.exercise-session-media-status');
  const sourceRole = card.querySelector('.exercise-session-media-role')?.value || 'exerciseSessionPhoto';
  const caption = String(card.querySelector('.exercise-session-media-note')?.value || '').trim();
  if (sourceRole === 'invalidPhoto') {
    const keep = window.confirm('This image will be marked invalid/unrelated and excluded from the Coach Pack. Save it for later review?');
    if (!keep) return;
  } else {
    const confirmed = window.confirm(`Attach ${files.length} image${files.length === 1 ? '' : 's'} to ${exercise.name} as “${sourceRole}”?`);
    if (!confirmed) return;
  }
  const existing = await sessionMedia(session.id);
  let saved = 0;
  const failures = [];
  setImageImportStatus(status, `Adding ${files.length} current-session image${files.length === 1 ? '' : 's'}…`, 'working');
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    try {
      const detectedFileDate = fileLocalDate(file);
      let dateConfirmed = false;
      if (detectedFileDate && detectedFileDate !== session.date) {
        const keep = window.confirm(`${file.name || 'This image'} appears dated ${detectedFileDate}, not ${session.date}. Attach it to the current session anyway?`);
        if (!keep) continue;
        dateConfirmed = true;
      }
      const processed = await compressImageFile(file);
      const digest = await sha256Hex(processed.blob);
      const duplicate = existing.find(item => item.sha256 === digest);
      if (duplicate) {
        failures.push(`${file.name || `Image ${index + 1}`}: duplicate already stored`);
        continue;
      }
      const createdAt = new Date().toISOString();
      const item = {
        id: uid(), sessionId: session.id, date: session.date,
        linkedExerciseId: exerciseSessionMediaKey(exercise), sourceExerciseId: exercise.sourceExerciseId || null, linkedExerciseName: exercise.name,
        name: processed.name || `Exercise_session_${Date.now()}.jpg`,
        type: processed.type || 'image/jpeg', size: processed.size || processed.blob.size,
        blob: processed.blob, sha256: digest, captureSource,
        sourceRole, photoType: sourceRole === 'exerciseSessionPhoto' ? 'current-session' : sourceRole,
        caption, note: caption, userAttachedThisSession: true,
        includeInCoachPack: sourceRole !== 'invalidPhoto',
        mappingConfidence: 'user-confirmed',
        fileDate: detectedFileDate, dateConfirmed, createdAt
      };
      await db.put('sessionMedia', item);
      session.mediaIds ||= [];
      if (!session.mediaIds.includes(item.id)) session.mediaIds.push(item.id);
      existing.push(item);
      saved += 1;
    } catch (error) {
      console.error('Current-session image import failed.', error);
      failures.push(`${file.name || `Image ${index + 1}`}: ${error.message}`);
    }
  }
  const noteInput = card.querySelector('.exercise-session-media-note');
  if (saved && noteInput) noteInput.value = '';
  persistDraft();
  await renderExerciseSessionMedia(exercise, card);
  if (failures.length) setImageImportStatus(status, `${saved} saved. ${failures[0]}`, saved ? 'error' : 'error');
  else setImageImportStatus(status, `${saved} current-session image${saved === 1 ? '' : 's'} saved.`, 'success');
}

function bindExerciseSessionMedia(card, exercise) {
  const camera = card.querySelector('.exercise-session-camera');
  const gallery = card.querySelector('.exercise-session-gallery');
  card.querySelector('.exercise-session-camera-button')?.addEventListener('click', () => camera?.click());
  card.querySelector('.exercise-session-gallery-button')?.addEventListener('click', () => gallery?.click());
  camera?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    files.forEach(file => requestImmediateCameraBackup(file, `VANTAGE_Session_${archiveSafeName(exercise.name)}`, state.currentSession?.date || today()));
    try { await addExerciseSessionImages(exercise, card, files, 'camera'); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach current-session photo'); }
    event.target.value = '';
  });
  gallery?.addEventListener('change', async event => {
    try { await addExerciseSessionImages(exercise, card, event.target.files, 'gallery'); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach current-session image'); }
    event.target.value = '';
  });
  renderExerciseSessionMedia(exercise, card).catch(console.error);
}


async function workoutSessionMedia(session) {
  if (!session?.id) return [];
  const rows = await sessionMedia(session.id);
  return rows.filter(item => item.sourceRole === 'workoutHrSummary'
    || item.sourceRole === 'preWorkoutBp'
    || item.sourceRole === 'nutritionPhoto'
    || item.sourceRole === 'bpPhoto'
    || item.sourceRole === 'hydrationPhoto'
    || item.sourceRole === 'other'
    || isExerciseSessionRole(item.sourceRole));
}

function workoutMediaDownloadName(session, item) {
  const extension = item.type === 'image/png' ? 'png' : 'jpg';
  return `VANTAGE_WorkoutMedia_${archiveSafeName(session?.sessionType || 'Workout')}_${session?.date || today()}_${String(item.createdAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
}

async function renderWorkoutSessionMedia(session) {
  const preview = $('#workoutHrPreview');
  const count = $('#workoutHrImageCount');
  if (!preview || !count || !session || isLissSession(session)) return;
  const media = (await workoutSessionMedia(session)).filter(item => !isExerciseSessionRole(item.sourceRole));
  if (state.currentSession?.id !== session.id) return;
  session.mediaIds = media.map(item => item.id);
  count.textContent = `${media.length} image${media.length === 1 ? '' : 's'}`;
  preview.innerHTML = '';
  if (!media.length) {
    preview.innerHTML = '<div class="empty-state compact-empty">No workout HR screenshot attached.</div>';
    return;
  }
  for (const item of media) {
    const url = URL.createObjectURL(item.blob);
    state.mediaObjectUrls.push(url);
    const card = document.createElement('article');
    card.className = 'liss-media-card';
    card.innerHTML = `<img src="${url}" alt="Workout HR summary screenshot"><button class="liss-media-ocr" type="button" aria-label="Run OCR on this image">OCR</button><button class="liss-media-share" type="button" aria-label="Share or save image">↗</button><button class="liss-media-save" type="button" aria-label="Download image backup">↓</button><button class="liss-media-remove" type="button" aria-label="Remove image">×</button><div class="liss-media-meta"><strong>Workout HR summary</strong><small>${escapeHtml(item.name || 'HR screenshot')} · ${escapeHtml(item.captureSource || 'gallery')}</small></div>`;
    bindImagePreviewFallback(card.querySelector('img'), item.name);
    card.querySelector('img').addEventListener('click', () => openImagePreview(url, 'Workout HR summary', item.name || ''));
    card.querySelector('.liss-media-ocr')?.addEventListener('click', () => openOcrReview(isRecoverySession(session) ? 'recovery' : 'workout', item.id));
    card.querySelector('.liss-media-share').addEventListener('click', async () => {
      const result = await shareOrDownloadImage(item.blob, workoutMediaDownloadName(session, item), item.type || 'image/jpeg');
      if (result === 'downloaded') toast('Workout HR screenshot downloaded');
    });
    card.querySelector('.liss-media-save').addEventListener('click', () => {
      downloadBlob(item.blob, workoutMediaDownloadName(session, item), item.type || 'image/jpeg');
      toast('Workout HR screenshot downloaded');
    });
    card.querySelector('.liss-media-remove').addEventListener('click', async () => {
      await db.remove('sessionMedia', item.id);
      session.mediaIds = (session.mediaIds || []).filter(id => id !== item.id);
      persistDraft();
      await renderWorkoutSessionMedia(session);
      toast('Workout HR screenshot removed');
    });
    preview.appendChild(card);
  }
}

async function addWorkoutHrImages(fileList) {
  const session = state.currentSession;
  const recoveryContext = isRecoverySession(session);
  const status = recoveryContext ? $('#recoveryHrStatus') : $('#workoutHrStatus');
  if (!session || isLissSession(session)) return toast('Start a strength or recovery session first');
  const files = [...(fileList || [])];
  if (!files.length) return;
  const existing = (await workoutSessionMedia(session)).filter(item => item.sourceRole === 'workoutHrSummary');
  const capacity = Math.max(0, 4 - existing.length);
  if (!capacity) return toast('Maximum of 4 workout HR screenshots reached');
  const selected = files.slice(0, capacity);
  let saved = 0;
  const failures = [];
  setImageImportStatus(status, `Adding ${selected.length} HR screenshot${selected.length === 1 ? '' : 's'}…`, 'working');
  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index];
    try {
      const detectedFileDate = fileLocalDate(file);
      let dateConfirmed = false;
      if (detectedFileDate && detectedFileDate !== session.date) {
        const keep = window.confirm(`${file.name || 'This screenshot'} appears to be dated ${detectedFileDate}, but this workout is ${session.date}. Attach it anyway?`);
        if (!keep) continue;
        dateConfirmed = true;
      }
      const processed = await compressImageFile(file);
      const createdAt = new Date().toISOString();
      const item = {
        id: uid(), sessionId: session.id, date: session.date,
        name: processed.name || `Workout_HR_${session.date}_${Date.now()}.jpg`,
        type: processed.type || 'image/jpeg', size: processed.size || processed.blob.size,
        blob: processed.blob, captureSource: 'gallery', sourceRole: 'workoutHrSummary',
        sourceSystem: 'NOOP', sensor: 'noopStrap', photoType: 'current-session-evidence', currentSession: true,
        userAttachedThisSession: true, includeInCoachPack: true, mappingConfidence: 'user-confirmed',
        sourceRoleConfirmed: true, sourceRoleAssignedAt: createdAt,
        fileDate: detectedFileDate, dateConfirmed, createdAt
      };
      await db.put('sessionMedia', item);
      session.cardio.mediaIds ||= [];
      if (!session.cardio.mediaIds.includes(item.id)) session.cardio.mediaIds.push(item.id);
      existing.push(item);
      saved += 1;
    } catch (error) {
      console.error('Workout HR screenshot import failed.', error);
      failures.push(`${file.name || `Image ${index + 1}`}: ${error.message}`);
    }
  }
  if (recoveryContext) await renderRecoverySessionMedia(session);
  else await renderWorkoutSessionMedia(session);
  persistDraft();
  if (failures.length) setImageImportStatus(status, `${saved} saved. ${failures[0]}`, 'error');
  else setImageImportStatus(status, `${saved} HR screenshot${saved === 1 ? '' : 's'} saved and shown below.`, 'success');
}

function syncWorkoutHrFields(session) {
  if (!session || isLissSession(session)) return;
  session.workoutHrSummary ||= { hrSource: 'strap', hrZones: {} };
  $$('[data-workout-hr-key]').forEach(node => {
    if (document.activeElement === node) return;
    node.value = pathValue(session.workoutHrSummary, node.dataset.workoutHrKey) ?? '';
  });
  const pre = (session.bloodPressureReadings || []).find(item => item.context === 'pre-workout') || {};
  if ($('#preWorkoutBpTime')) $('#preWorkoutBpTime').value = pre.time || '';
  if ($('#preWorkoutSystolic')) $('#preWorkoutSystolic').value = pre.systolic ?? '';
  if ($('#preWorkoutDiastolic')) $('#preWorkoutDiastolic').value = pre.diastolic ?? '';
  if ($('#preWorkoutPulse')) $('#preWorkoutPulse').value = pre.pulse ?? '';
}

function updatePreWorkoutBpFromForm() {
  const session = state.currentSession;
  if (!session || isLissSession(session)) return;
  const time = $('#preWorkoutBpTime')?.value || '';
  const systolic = num($('#preWorkoutSystolic')?.value);
  const diastolic = num($('#preWorkoutDiastolic')?.value);
  const pulse = num($('#preWorkoutPulse')?.value);
  session.bloodPressureReadings ||= [];
  session.bloodPressureReadings = session.bloodPressureReadings.filter(item => item.context !== 'pre-workout');
  if (time || systolic != null || diastolic != null || pulse != null) {
    session.bloodPressureReadings.push({ context: 'pre-workout', time, systolic, diastolic, pulse, source: 'manual-cuff', recordedAt: new Date().toISOString() });
  }
  persistDraft();
}

function updatePreLissBpFromForm() {
  const session = state.currentSession;
  if (!isLissSession(session)) return;
  const time = $('#lissPreBpTime')?.value || '';
  const systolic = num($('#lissPreSystolic')?.value);
  const diastolic = num($('#lissPreDiastolic')?.value);
  const pulse = num($('#lissPrePulse')?.value);
  session.bloodPressureReadings ||= [];
  session.bloodPressureReadings = session.bloodPressureReadings.filter(item => item.context !== 'pre-liss');
  if (time || systolic != null || diastolic != null || pulse != null) {
    session.bloodPressureReadings.push({
      context: 'pre-liss', time, systolic, diastolic, pulse,
      source: 'manual-cuff', sourceRole: 'preLissBloodPressure', recordedAt: new Date().toISOString()
    });
  }
  persistDraft();
}

function updateLissHydrationFromForm() {
  const session = state.currentSession;
  if (!isLissSession(session)) return;
  session.cardio.hydration = {
    coconutWaterMl: num($('#lissCoconutWaterMl')?.value),
    waterMl: num($('#lissWaterMl')?.value),
    otherFluidMl: num($('#lissOtherFluidMl')?.value),
    aminoAcids: $('#lissAminoAcids')?.value || '',
    electrolytes: $('#lissElectrolytes')?.value || '',
    notes: $('#lissHydrationNotes')?.value || ''
  };
  session.cardio.macroContextCorrection = $('#lissMacroCorrection')?.value || '';
  persistDraft();
}

function syncLissFieldsFromSession(session) {
  const cardio = session.cardio;
  cardio.sources = cardio.sources ? cleanSources(cardio.sources) : legacyMetricsToSources(cardio.metrics || {});
  $$('#lissActivityPicker button').forEach(button => button.classList.toggle('active', button.dataset.lissActivity === cardio.activityType));
  $('#lissFasted').checked = Boolean(cardio.fasted);
  $('#lissNasalBreathing').checked = Boolean(cardio.nasalBreathing);
  $('#lissNextPlannedSession').value = cardio.nextPlannedSession || '';
  $('#lissComments').value = cardio.comments || '';
  if ($('#lissManualDurationMinutes')) $('#lissManualDurationMinutes').value = cardio.manualDurationMinutes ?? (cardio.elapsedSeconds ? Math.round(cardio.elapsedSeconds / 60) : '');
  if ($('#lissManualStartTime')) $('#lissManualStartTime').value = cardio.manualStartTime || '';
  if ($('#lissManualEndTime')) $('#lissManualEndTime').value = cardio.manualEndTime || '';
  const preLissBp = (session.bloodPressureReadings || []).find(item => item.context === 'pre-liss') || {};
  if ($('#lissPreBpTime')) $('#lissPreBpTime').value = preLissBp.time || '';
  if ($('#lissPreSystolic')) $('#lissPreSystolic').value = preLissBp.systolic ?? '';
  if ($('#lissPreDiastolic')) $('#lissPreDiastolic').value = preLissBp.diastolic ?? '';
  if ($('#lissPrePulse')) $('#lissPrePulse').value = preLissBp.pulse ?? '';
  cardio.hydration ||= { coconutWaterMl: null, waterMl: null, otherFluidMl: null, aminoAcids: '', electrolytes: '', notes: '' };
  if ($('#lissCoconutWaterMl')) $('#lissCoconutWaterMl').value = cardio.hydration.coconutWaterMl ?? '';
  if ($('#lissWaterMl')) $('#lissWaterMl').value = cardio.hydration.waterMl ?? '';
  if ($('#lissOtherFluidMl')) $('#lissOtherFluidMl').value = cardio.hydration.otherFluidMl ?? '';
  if ($('#lissAminoAcids')) $('#lissAminoAcids').value = cardio.hydration.aminoAcids || '';
  if ($('#lissElectrolytes')) $('#lissElectrolytes').value = cardio.hydration.electrolytes || '';
  if ($('#lissHydrationNotes')) $('#lissHydrationNotes').value = cardio.hydration.notes || '';
  if ($('#lissMacroCorrection')) $('#lissMacroCorrection').value = cardio.macroContextCorrection || '';
  $$('[data-liss-source][data-liss-key]').forEach(node => {
    if (document.activeElement === node) return;
    const value = pathValue(cardio.sources[node.dataset.lissSource] || {}, node.dataset.lissKey);
    node.value = value ?? '';
  });
  const analysis = cardio.analysis;
  const inferredClassification = analysis?.classification || classifyLissSession({ session, sources: cardio.sources }).type;
  const badge = $('#lissClassificationBadge');
  badge.hidden = !inferredClassification || inferredClassification === 'unknown';
  if (!badge.hidden) badge.textContent = inferredClassification.replace(/-/g, ' ');
}

function updateLissManualTimingFromForm() {
  const session = state.currentSession;
  if (!isLissSession(session)) return;
  const duration = num($('#lissManualDurationMinutes')?.value);
  session.cardio.manualDurationMinutes = duration;
  session.cardio.elapsedSeconds = duration == null ? 0 : Math.round(duration * 60);
  session.cardio.manualStartTime = $('#lissManualStartTime')?.value || '';
  session.cardio.manualEndTime = $('#lissManualEndTime')?.value || '';
  session.cardio.durationInputMode = 'manual'; session.cardio.durationSource = 'user-entered'; session.cardio.timerUsed = false;
  persistDraft();
}

function fileLocalDate(file) {
  const timestamp = Number(file?.lastModified || 0);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function objectHasEvidence(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(objectHasEvidence);
  if (typeof value === 'object') return Object.values(value).some(objectHasEvidence);
  return true;
}

function lissMediaEvidenceStatus(session, item) {
  const analysis = session?.cardio?.analysis || {};
  const filename = String(item?.name || item?.archivePath || '').split('/').at(-1).toLowerCase();
  const reading = (analysis.imageReadings || []).find(entry => evidenceImageNames(entry?.sourceFile).includes(filename));
  const localOcrExtracted = ['ocr-confirmed', 'ocr-evidence-unconfirmed'].includes(item?.extractionStatus) && objectHasEvidence(item?.ocrMetrics);
  const extracted = Boolean(localOcrExtracted || (reading && objectHasEvidence(reading.metrics)));
  const metricSource = lissRoleToMetricSource(item?.sourceRole);
  const pending = metricSource
    ? (analysis.evidenceReview || []).some(entry => entry.source === metricSource && ['image-only', 'conflict'].includes(entry.status) && !entry.resolution)
    : false;
  return {
    extracted,
    text: extracted
      ? (pending ? 'Values extracted · awaiting Steve confirmation' : 'Values extracted / reviewed')
      : 'Image attached · values not extracted yet'
  };
}

async function renderLissMedia(session) {
  const preview = $('#lissMediaPreview');
  if (!preview || !isLissSession(session)) return;
  clearMediaObjectUrls();
  const media = await sessionMedia(session.id);
  if (state.currentSession?.id !== session.id) return;
  for (const item of media) {
    const normalisedRole = normaliseLissMediaRole(item.sourceRole);
    const details = lissRoleDetails(normalisedRole);
    if (item.sourceRole !== normalisedRole || item.sourceSystem !== details.sourceSystem || item.sensor !== details.sensor) {
      item.sourceRole = normalisedRole;
      item.sourceSystem = details.sourceSystem;
      item.sensor = details.sensor;
      await db.put('sessionMedia', item);
    }
  }
  state.currentLissMedia = media;
  // Preserve the expected media inventory. Missing local records must stay visible to
  // the Coach Pack audit instead of being silently erased during render.
  const expectedMediaIds = new Set(session.cardio.mediaIds || []);
  media.forEach(item => expectedMediaIds.add(item.id));
  session.cardio.mediaIds = [...expectedMediaIds];
  const roleCounts = media.reduce((counts, item) => {
    const role = normaliseLissMediaRole(item.sourceRole);
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const roleSummary = [
    roleCounts.noopStrapSessionSummary ? `${roleCounts.noopStrapSessionSummary} NOOP` : '',
    roleCounts.treadmillMachineConsole ? `${roleCounts.treadmillMachineConsole} machine` : '',
    roleCounts.watchDeviceExerciseSummary ? `${roleCounts.watchDeviceExerciseSummary} watch` : ''
  ].filter(Boolean).join(' · ');
  $('#lissImageCount').textContent = `${media.length} image${media.length === 1 ? '' : 's'}${roleSummary ? ` · ${roleSummary}` : ''}`;
  if (!media.length) {
    preview.innerHTML = '<div class="empty-state compact-empty">No images attached.</div>';
    return;
  }
  preview.innerHTML = '';
  media.forEach(item => {
    const url = URL.createObjectURL(item.blob);
    state.mediaObjectUrls.push(url);
    const card = document.createElement('article');
    card.className = 'liss-media-card';
    const roleConfirmed = item.sourceRoleConfirmed === true;
    const role = normaliseLissMediaRole(item.sourceRole);
    const details = lissRoleDetails(role);
    const evidenceStatus = lissMediaEvidenceStatus(session, item);
    card.innerHTML = `<img src="${url}" alt="LISS workout attachment"><button class="liss-media-share" type="button" aria-label="Share or save image">↗</button><button class="liss-media-save" type="button" aria-label="Download image backup">↓</button><button class="liss-media-remove" type="button" aria-label="Remove image">×</button><div class="liss-media-meta"><strong>${escapeHtml(item.name)}</strong><small>${fmt((item.size || item.blob?.size || 0) / 1024)} KB · ${escapeHtml(item.captureSource || 'attached')}${item.fileDate ? ` · file date ${escapeHtml(item.fileDate)}` : ''}${item.fileDate && item.fileDate !== session.date ? ' · ⚠ different date' : ''}</small><div class="liss-source-badges"><span>${escapeHtml(details.badge)}</span><span>${escapeHtml(details.sourceSystem)}</span><span>${escapeHtml(details.sensor)}</span></div><label class="liss-media-role-label">What is this image?<select class="liss-media-role">${LISS_MEDIA_ROLES.map(([value,label]) => `<option value="${value}"${role === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="button button-small ${roleConfirmed ? 'button-ghost' : 'button-primary'} liss-media-confirm-role" type="button">${roleConfirmed ? 'Role confirmed' : 'Confirm role'}</button><button class="button button-small button-ghost liss-media-ocr" type="button">Run OCR on this image</button><small class="liss-role-status ${roleConfirmed ? 'confirmed' : 'needs-confirmation'}">${roleConfirmed ? 'Role confirmed for Coach Pack export' : 'Review and confirm before export'}</small><small class="liss-extraction-status ${evidenceStatus.extracted ? 'extracted' : 'pending'}">${escapeHtml(evidenceStatus.text)}</small></div>`;
    bindImagePreviewFallback(card.querySelector('img'), item.name);
    card.querySelector('.liss-media-role').addEventListener('change', async event => {
      item.sourceRole = normaliseLissMediaRole(event.target.value);
      const details = lissRoleDetails(item.sourceRole);
      item.sourceSystem = details.sourceSystem;
      item.sensor = details.sensor;
      item.sourceRoleConfirmed = false; item.roleConfirmed = false;
      item.sourceRoleAssignedAt = null; item.metricsConfirmed = false;
      item.mappingConfidence = 'unconfirmed';
      await db.put('sessionMedia', item);
      const current = state.currentLissMedia.find(mediaItem => mediaItem.id === item.id);
      if (current) {
        current.sourceRole = item.sourceRole;
        current.sourceSystem = item.sourceSystem;
        current.sensor = item.sensor;
        current.sourceRoleConfirmed = false; current.roleConfirmed = false;
        current.sourceRoleAssignedAt = null; current.metricsConfirmed = false;
        current.mappingConfidence = 'unconfirmed';
      }
      await renderLissMedia(session);
      toast('Source changed — confirm it before export');
    });
    card.querySelector('.liss-media-confirm-role').addEventListener('click', async () => {
      if (!item.sourceRole || item.sourceRole === 'unassigned') return toast('Choose the image source first');
      item.sourceRole = normaliseLissMediaRole(item.sourceRole);
      if (String(item.ocrRawText || '').trim()) {
        const validation = roleContentValidation(item.sourceRole, item.ocrRawText);
        if (validation.level === 'red') return toast(`Role does not match image content: ${validation.warnings.join(' ')}`);
      }
      const details = lissRoleDetails(item.sourceRole);
      item.sourceSystem = details.sourceSystem;
      item.sensor = details.sensor;
      item.sourceRoleConfirmed = true;
      item.roleConfirmed = true;
      item.sourceRoleAssignedAt = new Date().toISOString();
      item.mappingConfidence = 'user-confirmed';
      // Confirming what an image is does NOT confirm OCR numbers read from it.
      if (item.metricsConfirmed !== true) item.metricsConfirmed = false;
      await db.put('sessionMedia', item);
      const current = state.currentLissMedia.find(mediaItem => mediaItem.id === item.id);
      if (current) {
        current.sourceRole = item.sourceRole;
        current.sourceSystem = item.sourceSystem;
        current.sensor = item.sensor;
        current.sourceRoleConfirmed = true;
        current.sourceRoleAssignedAt = item.sourceRoleAssignedAt;
        current.mappingConfidence = 'user-confirmed';
      }
      await renderLissMedia(session);
      toast('Image source confirmed');
    });
    card.querySelector('.liss-media-ocr')?.addEventListener('click', () => openOcrReview('liss', item.id));
    card.querySelector('.liss-media-share').addEventListener('click', async () => {
      const result = await shareOrDownloadImage(item.blob, item.name || `VANTAGE_LISS_${session.date}.jpg`, item.type || 'image/jpeg');
      if (result === 'shared') toast('Choose Photos, Gallery or Files to keep a second copy');
      else if (result === 'downloaded') toast('Image downloaded to the phone');
    });
    card.querySelector('.liss-media-save').addEventListener('click', () => {
      downloadBlob(item.blob, item.name || `VANTAGE_LISS_${session.date}.jpg`, item.type || 'image/jpeg');
      toast('Image downloaded to Downloads');
    });
    card.querySelector('.liss-media-remove').addEventListener('click', async () => {
      await db.remove('sessionMedia', item.id);
      session.cardio.mediaIds = session.cardio.mediaIds.filter(id => id !== item.id);
      persistDraft();
      await renderLissMedia(session);
      toast('Image removed');
    });
    preview.appendChild(card);
  });
}


// v1.3.10.6: FTMS implementation retained in ftms-bluetooth.js for future diagnostics, but removed from the normal workout flow.

function syncLissArtifactControls(session) {
  if (!isLissSession(session)) return;
  const artifact = (session.cardio?.sensorArtifacts || []).find(item => item.field === 'vantageStrap.maxHr' && item.artifactSuspected);
  if ($('#lissMaxHrArtifact')) $('#lissMaxHrArtifact').checked = Boolean(artifact);
  if ($('#lissMaxHrArtifactReason')) $('#lissMaxHrArtifactReason').value = artifact?.artifactReason || '';
}

function updateLissMaxHrArtifactFromForm() {
  const session = state.currentSession; if (!isLissSession(session)) return;
  session.cardio.sensorArtifacts ||= [];
  session.cardio.sensorArtifacts = session.cardio.sensorArtifacts.filter(item => item.field !== 'vantageStrap.maxHr');
  if ($('#lissMaxHrArtifact')?.checked) {
    const rawValue = Number(session.cardio.sources?.vantageStrap?.maxHr);
    session.cardio.sensorArtifacts.push({
      field: 'vantageStrap.maxHr', rawValue: Number.isFinite(rawValue) ? rawValue : null,
      artifactSuspected: true, artifactConfirmedByUser: true,
      artifactReason: $('#lissMaxHrArtifactReason')?.value || 'User marked the maximum HR as a sensor artefact',
      artifactSource: 'user-confirmed-context', effectiveValue: null, excludedFromClassification: true, recordedAt: new Date().toISOString()
    });
  }
  persistDraft();
}

function renderLissSession(session) {
  $('#lissPanel').hidden = false;
  $('#workoutExerciseToolbar').hidden = true;
  $('#exerciseList').hidden = true;
  $('#exerciseList').innerHTML = '';
  $('#workoutSummary').hidden = true;
  syncLissFieldsFromSession(session);
  syncLissArtifactControls(session);
  renderLissMedia(session).catch(console.error);
}


function syncRecoverySessionFields(session) {
  const recovery = session.recoverySession || {};
  $('#recoverySessionActivity').value = recovery.activity || 'Yoga';
  $('#recoverySessionDuration').value = recovery.durationMinutes ?? '';
  $('#recoverySessionStartTime').value = recovery.startTime || '';
  $('#recoverySessionEndTime').value = recovery.endTime || '';
  $('#recoverySessionNotes').value = recovery.notes || '';
  session.workoutHrSummary ||= { hrSource: 'strap', hrZones: {} };
  $$('[data-recovery-hr-key]').forEach(node => { if (document.activeElement !== node) node.value = pathValue(session.workoutHrSummary, node.dataset.recoveryHrKey) ?? ''; });
}

function updateRecoverySessionFromForm() {
  const session = state.currentSession;
  if (!isRecoverySession(session)) return;
  session.recoverySession ||= {};
  session.recoverySession.activity = $('#recoverySessionActivity').value || 'Yoga';
  session.recoverySession.durationMinutes = Number($('#recoverySessionDuration').value || 0) || null;
  session.recoverySession.startTime = $('#recoverySessionStartTime').value || '';
  session.recoverySession.endTime = $('#recoverySessionEndTime').value || '';
  session.recoverySession.notes = $('#recoverySessionNotes').value || '';
  session.notes = session.recoverySession.notes;
  persistDraft();
}

async function renderRecoverySessionMedia(session) {
  const preview = $('#recoveryHrPreview'), count = $('#recoveryHrImageCount');
  if (!preview || !count || !isRecoverySession(session)) return;
  const media = (await workoutSessionMedia(session)).filter(item => item.sourceRole === 'workoutHrSummary');
  count.textContent = `${media.length} image${media.length === 1 ? '' : 's'}`;
  preview.innerHTML = '';
  if (!media.length) return void (preview.innerHTML = '<div class="empty-state compact-empty">No recovery HR screenshot attached.</div>');
  for (const item of media) {
    const url = URL.createObjectURL(item.blob); state.mediaObjectUrls.push(url);
    const card = document.createElement('article'); card.className = 'liss-media-card';
    card.innerHTML = `<img src="${url}" alt="Recovery HR summary screenshot"><button class="liss-media-ocr" type="button" aria-label="Run OCR on this image">OCR</button><button class="liss-media-share" type="button">↗</button><button class="liss-media-save" type="button">↓</button><button class="liss-media-remove" type="button">×</button><div class="liss-media-meta"><strong>Current-session HR evidence</strong><small>${escapeHtml(item.name || 'HR screenshot')} · NOOP Strap · current session</small></div>`;
    card.querySelector('img').addEventListener('click', () => openImagePreview(url, 'Recovery HR summary', item.name || ''));
    card.querySelector('.liss-media-ocr')?.addEventListener('click', () => openOcrReview('recovery', item.id));
    card.querySelector('.liss-media-share').addEventListener('click', () => shareOrDownloadImage(item.blob, workoutMediaDownloadName(session, item), item.type || 'image/jpeg'));
    card.querySelector('.liss-media-save').addEventListener('click', () => downloadBlob(item.blob, workoutMediaDownloadName(session, item), item.type || 'image/jpeg'));
    card.querySelector('.liss-media-remove').addEventListener('click', async () => { await db.remove('sessionMedia', item.id); await renderRecoverySessionMedia(session); });
    preview.appendChild(card);
  }
}

function renderRecoverySession(session) {
  $('#lissPanel').hidden = true;
  $('#recoverySessionPanel').hidden = false;
  $('#workoutExerciseToolbar').hidden = true;
  $('#exerciseList').hidden = true;
  $('#exerciseList').innerHTML = '';
  $('#workoutSummary').hidden = true;
  syncRecoverySessionFields(session);
  renderRecoverySessionMedia(session).catch(console.error);
}

function renderWorkout() {
  renderActiveCycleBanner();
  clearExerciseMediaObjectUrls();
  clearMediaObjectUrls();
  $$('#modePicker button').forEach(button => button.classList.toggle('active', button.dataset.mode === state.selectedMode));
  const list = $('#exerciseList');
  const summary = $('#workoutSummary');
  const status = $('#workoutStatus');
  const lissPanel = $('#lissPanel');
  const recoveryPanel = $('#recoverySessionPanel');
  if (!state.currentSession) {
    lissPanel.hidden = true;
    recoveryPanel.hidden = true;
    $('#workoutExerciseToolbar').hidden = true;
      list.hidden = false;
    list.innerHTML = '<div class="empty-state">Start a session to load the exercise cards.</div>';
    summary.hidden = true;
    status.hidden = true;
    return;
  }
  state.selectedMode = state.currentSession.mode;
  $('#templateSelect').value = state.currentSession.templateId;
  status.hidden = false;
  if (isLissSession(state.currentSession)) {
    recoveryPanel.hidden = true;
    status.textContent = `${activityLabel(state.currentSession.cardio?.activityType)} · started ${new Date(state.currentSession.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    renderLissSession(state.currentSession);
    return;
  }
  if (isRecoverySession(state.currentSession)) {
    status.textContent = `${state.currentSession.sessionType} · recovery · started ${new Date(state.currentSession.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    renderRecoverySession(state.currentSession);
    return;
  }
  lissPanel.hidden = true;
  recoveryPanel.hidden = true;
  $('#workoutExerciseToolbar').hidden = false;
  list.hidden = false;
  status.textContent = `${state.currentSession.sessionType} · ${modeLabel(state.currentSession.mode)} · started ${new Date(state.currentSession.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  list.innerHTML = '';
  (state.currentSession.exercises || []).forEach((exercise, index) => list.appendChild(createExerciseCard(exercise, index)));
  $('#sessionNotes').value = state.currentSession.notes || '';
  summary.hidden = false;
  syncWorkoutHrFields(state.currentSession);
  state.currentSession.exportOptions ||= { includeCurrentSessionPhotos: true, includeActiveReferencePhotos: false, includePreviousSessionPhotos: false, includeArchivedReferencePhotos: false, includeInvalidPhotos: false };
  if ($('#includeActiveReferencePhotosCheckbox')) $('#includeActiveReferencePhotosCheckbox').checked = Boolean(state.currentSession.exportOptions.includeActiveReferencePhotos);
  if ($('#includeArchivedReferencePhotosCheckbox')) $('#includeArchivedReferencePhotosCheckbox').checked = Boolean(state.currentSession.exportOptions.includeArchivedReferencePhotos);
  renderWorkoutSessionMedia(state.currentSession).catch(console.error);
  updateWorkoutSummary();
}

function bindExerciseIdentity(card, exercise) {
  const fields = {
    '.exercise-identity-name': 'name',
    '.exercise-machine-brand': 'machineBrand',
    '.exercise-machine-model': 'machineModel',
    '.exercise-nickname': 'nickname',
    '.exercise-variation': 'variation',
    '.exercise-movement-pattern': 'movementPattern'
  };
  for (const [selector, key] of Object.entries(fields)) {
    const input = card.querySelector(selector);
    if (!input) continue;
    input.value = exercise[key] || '';
    input.addEventListener('change', event => {
      const value = String(event.target.value || '').trim();
      const previousValue = String(exercise[key] || '').trim();
      if (key === 'name' && !value) {
        event.target.value = exercise.name;
        return toast('Exercise name cannot be blank');
      }
      if (key === 'name') {
        const previousName = String(exercise.name || '').trim();
        exercise.aliases ||= [];
        if (previousName && nameKey(previousName) !== nameKey(value) && !exercise.aliases.some(alias => nameKey(alias) === nameKey(previousName))) {
          exercise.aliases.push(previousName);
        }
      }
      exercise[key] = value;
      if (['name', 'machineBrand', 'machineModel', 'movementPattern', 'variation'].includes(key) && nameKey(previousValue) !== nameKey(value)) {
        const duplicated = duplicateSourceExerciseIds(state.currentSession || {}).some(group => group.sourceExerciseId === exercise.sourceExerciseId && group.exercises.includes(exercise));
        if (duplicated) {
          const previousSourceExerciseId = exercise.sourceExerciseId;
          exercise.sourceExerciseId = stableId('exercise', `${exercise.name}|${exercise.machineBrand || ''}|${exercise.machineModel || ''}|${state.currentSession?.id || today()}|${exercise.id}`);
          exercise.comparisonHistoryInvalidated = true;
          exercise.identityCorrectedAt = new Date().toISOString();
          exercise.identityCorrectionReason = `Separated from duplicate sourceExerciseId ${previousSourceExerciseId}`;
          toast('Distinct exercise detected — a new identity was created and inherited comparisons were stopped');
        }
      }
      if (key === 'name') {
        card.querySelector('.exercise-name').textContent = value;
        const previous = findPreviousExercise(exercise);
        card.querySelector('.previous-performance').textContent = previous
          ? `Previous session · ${localDateLabel(previous.session.date)} · each prior set is shown above its matching entry line`
          : 'No previous session found';
      }
      persistDraft();
    });
  }
}


function addSetToExercise(exerciseId) {
  const exercise = state.currentSession?.exercises?.find(item => item.id === exerciseId);
  if (!exercise) return toast('Exercise could not be found');
  exercise.sets ||= [];
  const last = exercise.sets.at(-1) || {};
  const newSet = {
    id: uid(), setType: last.setType === 'Warm-up' ? 'Work' : (last.setType || 'Work'),
    setNumber: exercise.sets.length + 1,
    weightKg: Number(last.weightKg ?? 0), reps: Number(last.reps ?? 8),
    rpe: last.rpe ?? 8, failure: false, holdSeconds: 0, staticHoldSeconds: 0,
    forcedNegativeReps: 0, partialReps: 0, assistedReps: 0, dropSet: false, restPause: false, failureType: '',
    restSeconds: last.restRecorded === true || Number(last.restSeconds || 0) > 0 ? Number(last.restSeconds ?? 0) : null,
    restRecorded: last.restRecorded === true || Number(last.restSeconds || 0) > 0,
    notes: ''
  };
  exercise.sets.push(newSet);
  exercise.collapsed = false;
  persistDraft();
  renderWorkout();
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-exercise-id="${CSS.escape(exerciseId)}"]`);
    card?.querySelector(`[data-set-id="${CSS.escape(newSet.id)}"] input[aria-label="Weight in kilograms"]`)?.focus();
  });
}

function setExerciseCollapsed(exercise, card, collapsed) {
  exercise.collapsed = Boolean(collapsed);
  card.classList.toggle('collapsed', exercise.collapsed);
  const button = card.querySelector('.exercise-collapse-button');
  if (button) {
    button.textContent = exercise.collapsed ? 'Expand' : 'Collapse';
    button.setAttribute('aria-expanded', String(!exercise.collapsed));
  }
  persistDraft();
}

function setAllExercisesCollapsed(collapsed) {
  for (const exercise of state.currentSession?.exercises || []) exercise.collapsed = Boolean(collapsed);
  persistDraft(); renderWorkout();
}

function createExerciseCard(exercise, index) {
  const fragment = $('#exerciseCardTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.exercise-card');
  card.dataset.exerciseId = exercise.id;
  fragment.querySelector('.exercise-order').textContent = `Exercise ${index + 1}`;
  fragment.querySelector('.exercise-name').textContent = exercise.name;

  const lockedPreviousSession = previousSessionForCurrentWorkout();
  const lockedPreviousExercise = matchingPreviousExercise(lockedPreviousSession, exercise);
  const previous = lockedPreviousExercise
    ? { session: lockedPreviousSession, exercise: lockedPreviousExercise }
    : findPreviousExercise(exercise);
  const substitution = previousWeekSubstitution(exercise);
  if (exercise.sessionSubstitution?.temporary) {
    const originalName = exercise.sessionSubstitution.originalName || exercise.sessionSubstitution.originalExerciseSnapshot?.name || 'normal routine exercise';
    const history = previous ? workSetReferenceText(previous.exercise) : '';
    fragment.querySelector('.previous-performance').textContent = `Today · temporary substitution for ${originalName}${history ? ` · previous ${exercise.name}: ${history}` : ''}. The normal routine will return next week.`;
  } else if (substitution) {
    const sets = workSetReferenceText(substitution.exercise);
    fragment.querySelector('.previous-performance').textContent = `Previous week substitution · ${substitution.exercise.name}${sets ? ` · ${sets}` : ''}. Normal exercise history remains separate.`;
  } else if (previous) {
    fragment.querySelector('.previous-performance').textContent = `Previous session · ${localDateLabel(previous.session.date)} · prior weight and reps are shown in grey above each matching set`;
  } else fragment.querySelector('.previous-performance').textContent = 'No previous session found';

  const identityReview = exerciseCompatibility(exercise, { ...exercise, notes: '' });
  exercise.exerciseIdentityReviewRequired = identityReview.level === 'review' && /notes contradict/i.test(identityReview.reason || '');
  if (exercise.exerciseIdentityReviewRequired) {
    fragment.querySelector('.previous-performance').textContent += ` · ⚠ Identity review: ${identityReview.reason}. Confirm the actual movement/variation before relying on comparisons.`;
  }

  exercise.sets ||= [];
  const rows = fragment.querySelector('.set-rows');
  const previousExercise = previous?.exercise || null;
  exercise.sets.forEach((set, setIndex) => rows.appendChild(createSetRow(exercise.id, set, matchingPreviousSet(previousExercise, set, setIndex))));
  const notes = fragment.querySelector('.exercise-notes');
  notes.value = exercise.notes || '';
  notes.addEventListener('input', event => { exercise.notes = event.target.value; persistDraft(); });
  fragment.querySelector('.add-set-button').addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); addSetToExercise(exercise.id);
  });
  const collapseButton = fragment.querySelector('.exercise-collapse-button');
  card.classList.toggle('collapsed', Boolean(exercise.collapsed));
  collapseButton.textContent = exercise.collapsed ? 'Expand' : 'Collapse';
  collapseButton.setAttribute('aria-expanded', String(!exercise.collapsed));
  collapseButton.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); setExerciseCollapsed(exercise, card, !exercise.collapsed);
  });
  bindExerciseDrag(card);
  bindExerciseIdentity(card, exercise);
  bindExerciseReference(card, exercise);
  bindExerciseSessionMedia(card, exercise);
  const symptom = exercise.symptom ||= { symptomPresent: false, symptomArea: '', symptomType: '', symptomTrigger: '', severity: null, actionTaken: '' };
  const symptomBindings = [
    ['.exercise-symptom-area', 'symptomArea'], ['.exercise-symptom-type', 'symptomType'], ['.exercise-symptom-trigger', 'symptomTrigger'], ['.exercise-symptom-action', 'actionTaken']
  ];
  const symptomPresent = card.querySelector('.exercise-symptom-present');
  if (symptomPresent) {
    symptomPresent.checked = symptom.symptomPresent === true;
    symptomPresent.addEventListener('change', event => { symptom.symptomPresent = event.target.checked; persistDraft(); });
  }
  for (const [selector, key] of symptomBindings) {
    const input = card.querySelector(selector); if (!input) continue;
    input.value = symptom[key] || '';
    input.addEventListener('input', event => { symptom[key] = event.target.value; persistDraft(); });
  }
  const severity = card.querySelector('.exercise-symptom-severity');
  if (severity) {
    severity.value = symptom.severity ?? '';
    severity.addEventListener('input', event => { symptom.severity = event.target.value === '' ? null : Number(event.target.value); persistDraft(); });
  }
  fragment.querySelector('.change-exercise-button')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openReplaceExerciseDialog(exercise.id); });
  fragment.querySelector('.remove-exercise-button')?.addEventListener('click', () => removeExerciseFromCurrentSession(exercise.id, false));
  return card;
}

function moveExercise(index, direction) {
  if (!state.currentSession) return;
  const target = index + direction;
  if (target < 0 || target >= state.currentSession.exercises.length) return;
  const [item] = state.currentSession.exercises.splice(index, 1);
  state.currentSession.exercises.splice(target, 0, item);
  state.currentSession.exercises.forEach((exercise, itemIndex) => { exercise.lineNumber = itemIndex + 1; });
  persistDraft(); renderWorkout();
}


function syncExerciseOrderFromDom() {
  if (!state.currentSession) return;
  const ids = [...$('#exerciseList').querySelectorAll('.exercise-card')].map(card => card.dataset.exerciseId);
  const order = new Map(ids.map((id, index) => [id, index]));
  state.currentSession.exercises.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  state.currentSession.exercises.forEach((exercise, index) => { exercise.lineNumber = index + 1; });
  [...$('#exerciseList').querySelectorAll('.exercise-card')].forEach((card, index) => {
    const label = card.querySelector('.exercise-order');
    if (label) label.textContent = `Exercise ${index + 1}`;
  });
  persistDraft();
}

function bindExerciseDrag(card) {
  const handle = card.querySelector('.exercise-drag-handle');
  const list = $('#exerciseList');
  if (!handle || !list) return;

  let pointerId = null;
  let offsetY = 0;
  let startY = 0;
  let moved = false;
  let placeholder = null;

  const clearFloatingStyles = () => {
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.height = '';
    card.style.margin = '';
  };

  const removeListeners = () => {
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
  };

  const finish = event => {
    if (event?.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
    if (pointerId == null) return;

    try {
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    } catch (error) {
      console.debug('Pointer capture already released.', error);
    }

    if (placeholder?.isConnected) {
      list.insertBefore(card, placeholder);
      placeholder.remove();
    }

    pointerId = null;
    placeholder = null;
    card.classList.remove('dragging');
    document.body.classList.remove('exercise-drag-active');
    document.documentElement.classList.remove('exercise-drag-active');
    clearFloatingStyles();
    removeListeners();

    if (moved) {
      syncExerciseOrderFromDom();
      if (navigator.vibrate) navigator.vibrate(35);
      toast('Exercise order updated');
    }
    moved = false;
  };

  const onPointerMove = event => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    if (Math.abs(event.clientY - startY) > 4) moved = true;
    card.style.top = `${Math.max(8, Math.min(window.innerHeight - 72, event.clientY - offsetY))}px`;

    const candidates = [...list.querySelectorAll('.exercise-card:not(.dragging)')];
    let placed = false;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        list.insertBefore(placeholder, candidate);
        placed = true;
        break;
      }
    }
    if (!placed) list.appendChild(placeholder);

    if (event.clientY < 110) window.scrollBy({ top: -18, behavior: 'auto' });
    else if (event.clientY > window.innerHeight - 120) window.scrollBy({ top: 18, behavior: 'auto' });
  };

  handle.addEventListener('contextmenu', event => event.preventDefault());
  handle.addEventListener('dragstart', event => event.preventDefault());
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = card.getBoundingClientRect();
    pointerId = event.pointerId;
    startY = event.clientY;
    offsetY = Math.max(0, event.clientY - rect.top);
    moved = false;

    placeholder = document.createElement('div');
    placeholder.className = 'exercise-drag-placeholder';
    placeholder.style.height = `${rect.height}px`;
    card.after(placeholder);

    card.classList.add('dragging');
    document.body.classList.add('exercise-drag-active');
    document.documentElement.classList.add('exercise-drag-active');
    Object.assign(card.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0'
    });

    try { handle.setPointerCapture?.(pointerId); } catch (error) { console.debug('Pointer capture unavailable.', error); }
    handle.addEventListener('pointermove', onPointerMove, { passive: false });
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    if (navigator.vibrate) navigator.vibrate(35);
  });

  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const cards = [...list.querySelectorAll('.exercise-card')];
    const index = cards.indexOf(card);
    moveExercise(index, event.key === 'ArrowUp' ? -1 : 1);
  });

  card.querySelector('.move-exercise-up')?.addEventListener('click', () => {
    const cards = [...list.querySelectorAll('.exercise-card')];
    moveExercise(cards.indexOf(card), -1);
  });
  card.querySelector('.move-exercise-down')?.addEventListener('click', () => {
    const cards = [...list.querySelectorAll('.exercise-card')];
    moveExercise(cards.indexOf(card), 1);
  });
}

async function persistTemplateOrderFromSession(session) {
  const template = state.templates.find(item => item.id === session.templateId);
  if (!template) return;
  const original = [...(template.exercises || [])];
  const remaining = new Set(original);
  const ordered = [];

  for (const sessionExercise of session.exercises || []) {
    const match = original.find(item =>
      item.sourceExerciseId === sessionExercise.sourceExerciseId ||
      item.id === sessionExercise.sourceExerciseId ||
      nameKey(item.name) === nameKey(sessionExercise.name)
    );
    if (match) {
      ordered.push({
        ...match,
        name: sessionExercise.name || match.name,
        aliases: [...new Set([...(match.aliases || []), ...(sessionExercise.aliases || [])])],
        machineBrand: sessionExercise.machineBrand || '',
        machineModel: sessionExercise.machineModel || '',
        nickname: sessionExercise.nickname || '',
        variation: sessionExercise.variation || '',
        movementPattern: sessionExercise.movementPattern || '',
        notes: sessionExercise.notes || match.notes || '',
        sets: (sessionExercise.sets || []).map(({ id, setNumber, ...set }, index) => ({ ...set, setNumber: index + 1 }))
      });
      remaining.delete(match);
    } else if (sessionExercise.persistToTemplate) {
      ordered.push({
        id: sessionExercise.sourceExerciseId || stableId('exercise', sessionExercise.name),
        sourceExerciseId: sessionExercise.sourceExerciseId || stableId('exercise', sessionExercise.name),
        name: sessionExercise.name,
        aliases: [...new Set(sessionExercise.aliases || [])],
        machineBrand: sessionExercise.machineBrand || '',
        machineModel: sessionExercise.machineModel || '',
        nickname: sessionExercise.nickname || '',
        variation: sessionExercise.variation || '',
        movementPattern: sessionExercise.movementPattern || '',
        notes: sessionExercise.notes || '',
        sets: defaultSetsForExercise(sessionExercise.name).map(({ id, ...set }) => set)
      });
    }
  }

  for (const item of original) if (remaining.has(item)) ordered.push(item);
  template.exercises = ordered;
  await db.put('templates', template);
}

function createSetRow(exerciseId, set, previousSet = null) {
  const block = document.createElement('div');
  block.className = 'set-row-block';
  block.dataset.setId = set.id;
  const previousLabel = previousSet
    ? `Previous set ${previousSet.setNumber || ''}: ${fmt(previousSet.weightKg, 2)} kg × ${Number(previousSet.reps || 0)}${previousSet.rpe != null ? ` @ RPE ${previousSet.rpe}` : ''} · ${previousSet.setType || 'Set'}`
    : 'No matching set in the previous session';
  block.innerHTML = `<div class="previous-set-reference">${escapeHtml(previousLabel)}</div>`;

  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <select aria-label="Set type"><option ${set.setType === 'Warm-up' ? 'selected' : ''}>Warm-up</option><option ${set.setType === 'Work' ? 'selected' : ''}>Work</option><option ${set.setType === 'Back-off' ? 'selected' : ''}>Back-off</option><option ${set.setType === 'Drop' ? 'selected' : ''}>Drop</option><option ${set.setType === 'Skipped' ? 'selected' : ''}>Skipped</option></select>
    <input aria-label="Weight in kilograms" type="number" min="0" step="0.25" value="${set.weightKg ?? 0}">
    <input aria-label="Repetitions" type="number" min="0" step="1" value="${set.reps ?? 0}">
    <input aria-label="RPE" type="number" min="1" max="10" step="0.5" value="${set.rpe ?? 8}" ${set.setType === 'Skipped' ? 'disabled' : ''}>
    <input aria-label="Rest after set in seconds" type="number" min="0" max="1800" step="5" inputmode="numeric" placeholder="Not recorded" value="${set.restRecorded === true || Number(set.restSeconds || 0) > 0 ? (set.restSeconds ?? 0) : ''}">
    <button class="failure-toggle ${set.failure ? 'active' : ''}" aria-pressed="${set.failure}" ${set.setType === 'Skipped' ? 'disabled' : ''}>${set.failure ? 'Yes' : 'No'}</button>
    <button class="delete-set" aria-label="Delete set">×</button>`;
  block.appendChild(row);

  const [type, weight, reps, rpe, restSeconds] = row.querySelectorAll('select, input');
  type.addEventListener('change', event => {
    const skipped = event.target.value === 'Skipped';
    if (skipped) {
      set.reps = 0; set.rpe = null; set.failure = false;
      reps.value = '0'; rpe.value = ''; rpe.disabled = true;
      failure.disabled = true; failure.classList.remove('active'); failure.textContent = 'No';
    } else {
      rpe.disabled = false; failure.disabled = false;
      if (set.rpe == null) { set.rpe = event.target.value === 'Warm-up' ? 4 : 8; rpe.value = String(set.rpe); }
    }
    updateSet(exerciseId, set.id, { setType: event.target.value, reps: set.reps, rpe: set.rpe, failure: set.failure });
  });
  weight.addEventListener('input', event => updateSet(exerciseId, set.id, { weightKg: Number(event.target.value) }));
  reps.addEventListener('input', event => updateSet(exerciseId, set.id, { reps: Number(event.target.value) }));
  rpe.addEventListener('input', event => updateSet(exerciseId, set.id, { rpe: event.target.value === '' ? null : Number(event.target.value) }));
  restSeconds.addEventListener('input', event => {
    const recorded = event.target.value !== '';
    updateSet(exerciseId, set.id, { restSeconds: recorded ? Math.max(0, Number(event.target.value)) : null, restRecorded: recorded });
  });
  const failure = row.querySelector('.failure-toggle');
  failure.addEventListener('click', () => {
    if (set.setType === 'Skipped') return;
    set.failure = !set.failure; failure.classList.toggle('active', set.failure); failure.textContent = set.failure ? 'Yes' : 'No'; failure.setAttribute('aria-pressed', String(set.failure)); persistDraft();
  });
  row.querySelector('.delete-set').addEventListener('click', () => {
    const exercise = state.currentSession.exercises.find(item => item.id === exerciseId);
    exercise.sets = exercise.sets.filter(item => item.id !== set.id).map((item, i) => ({ ...item, setNumber: i + 1 }));
    persistDraft(); renderWorkout();
  });
  const techniques = document.createElement('details');
  techniques.className = 'set-techniques';
  techniques.innerHTML = `<summary>Intensity techniques${Number(set.forcedNegativeReps||0)+Number(set.partialReps||0)+Number(set.assistedReps||0) || set.dropSet || set.restPause || Number(set.staticHoldSeconds||set.holdSeconds||0) ? ' · recorded' : ''}</summary><div class="set-technique-grid">
    <label>Forced negatives<input data-tech="forcedNegativeReps" type="number" min="0" step="1" value="${Number(set.forcedNegativeReps||0)}"></label>
    <label>Partials<input data-tech="partialReps" type="number" min="0" step="1" value="${Number(set.partialReps||0)}"></label>
    <label>Assisted reps<input data-tech="assistedReps" type="number" min="0" step="1" value="${Number(set.assistedReps||0)}"></label>
    <label>Static hold (s)<input data-tech="staticHoldSeconds" type="number" min="0" step="1" value="${Number(set.staticHoldSeconds ?? set.holdSeconds ?? 0)}"></label>
    <label class="check-label"><input data-tech="dropSet" type="checkbox" ${set.dropSet ? 'checked' : ''}> Drop set</label>
    <label class="check-label"><input data-tech="restPause" type="checkbox" ${set.restPause ? 'checked' : ''}> Rest-pause</label>
    <label>Failure type<select data-tech="failureType"><option value="">Not specified</option><option value="technical"${set.failureType==='technical'?' selected':''}>Technical</option><option value="concentric"${set.failureType==='concentric'?' selected':''}>Concentric</option><option value="assisted"${set.failureType==='assisted'?' selected':''}>Assisted</option><option value="other"${set.failureType==='other'?' selected':''}>Other</option></select></label>
    <label class="set-tech-note">Set note<input data-tech="notes" type="text" value="${escapeHtml(set.notes || '')}" placeholder="e.g. 4 partials on last rep"></label>
  </div>`;
  techniques.querySelectorAll('[data-tech]').forEach(input => input.addEventListener('change', event => {
    const key = event.target.dataset.tech;
    let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if (['forcedNegativeReps','partialReps','assistedReps','staticHoldSeconds'].includes(key)) value = Math.max(0, Number(value || 0));
    const patch = { [key]: value };
    if (key === 'staticHoldSeconds') patch.holdSeconds = value;
    updateSet(exerciseId, set.id, patch);
  }));
  block.appendChild(techniques);
  return block;
}

function updateSet(exerciseId, setId, patch) {
  const exercise = state.currentSession.exercises.find(item => item.id === exerciseId);
  const set = exercise.sets.find(item => item.id === setId);
  Object.assign(set, patch); persistDraft(); updateWorkoutSummary();
}

function estimated1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

function validateZeroRepWorkSets(session) {
  const zeroReps = [];
  const zeroLoads = [];
  (session.exercises || []).forEach(exercise => {
    (exercise.sets || []).forEach((set, index) => {
      if (set.setType === 'Warm-up' || set.setType === 'Skipped') return;
      const setNumber = set.setNumber || index + 1;
      if (Number(set.reps || 0) === 0) zeroReps.push({ exercise, set, setNumber });
      if (Number(set.weightKg || 0) === 0 && Number(set.reps || 0) > 0 && Number(set.rpe || 0) >= 7 && !set.zeroLoadConfirmed) {
        zeroLoads.push({ exercise, set, setNumber });
      }
    });
  });
  for (const item of zeroReps) {
    const markSkipped = window.confirm(`${item.exercise.name} · set ${item.setNumber} has 0 reps${item.set.rpe != null ? ` at RPE ${item.set.rpe}` : ''}.

OK: mark this set as Skipped.
Cancel: return to the workout and enter the reps.`);
    if (!markSkipped) return false;
    item.set.setType = 'Skipped';
    item.set.reps = 0;
    item.set.rpe = null;
    item.set.failure = false;
    item.set.notes = [item.set.notes, 'Marked skipped during completion validation'].filter(Boolean).join(' · ');
  }
  for (const item of zeroLoads) {
    const keep = window.confirm(`${item.exercise.name} · set ${item.setNumber} is 0 kg × ${item.set.reps} @ RPE ${item.set.rpe}.

OK: confirm this was bodyweight, band-only or deliberately loadless.
Cancel: return and enter the missing load.`);
    if (!keep) return false;
    item.set.zeroLoadConfirmed = true;
    item.set.notes = [item.set.notes, 'Zero load explicitly confirmed during completion validation'].filter(Boolean).join(' · ');
  }
  if (zeroReps.length || zeroLoads.length) persistDraft();
  return true;
}
function sessionTotals(session) {
  const sets = session.exercises?.flatMap(exercise => exercise.sets || []) || [];
  const workSets = sets.filter(set => set.setType !== 'Warm-up' && set.setType !== 'Skipped').length;
  const volume = sets.reduce((sum, set) => sum + (Number(set.weightKg) || 0) * (Number(set.reps) || 0), 0);
  const topE1rm = sets.reduce((top, set) => Math.max(top, estimated1RM(Number(set.weightKg), Number(set.reps))), 0);
  return { workSets, volume, topE1rm, exercises: session.exercises?.length || 0 };
}

function updateWorkoutSummary() {
  if (!state.currentSession) return;
  const totals = sessionTotals(state.currentSession);
  $('#summaryExercises').textContent = totals.exercises;
  $('#summarySets').textContent = totals.workSets;
  $('#summaryVolume').textContent = `${fmt(totals.volume)} kg`;
  $('#summaryE1rm').textContent = `${fmt(totals.topE1rm, 1)} kg`;
}

function macroTotalsForDate(date) {
  const meals = state.meals.filter(item => item.date === date);
  if (meals.length) return mealTotalsForDate(date);
  const summary = state.nutritionDays.find(item => item.date === date);
  return {
    protein: Number(summary?.protein || 0),
    carbs: Number(summary?.carbs || 0),
    fat: Number(summary?.fat || 0),
    calories: Number(summary?.calories || 0)
  };
}

function renderMacroStrip(draft = null) {
  const totals = macroTotalsForDate(today());
  if (draft) {
    totals.protein += Number(draft.protein || 0);
    totals.carbs += Number(draft.carbs || 0);
    totals.fat += Number(draft.fat || 0);
    totals.calories += Number(draft.calories || 0);
  }
  $('#macroProtein').textContent = `${fmt(totals.protein, 1)} g`;
  $('#macroCarbs').textContent = `${fmt(totals.carbs, 1)} g`;
  $('#macroFat').textContent = `${fmt(totals.fat, 1)} g`;
  $('#macroCalories').textContent = `${fmt(totals.calories)} kcal`;
  renderMacroGuidance();
}

function macroRange(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return { min: num(value.min), max: num(value.max) };
  const nums = String(value).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return nums.length >= 2 ? { min: nums[0], max: nums[1] } : (nums.length ? { min: nums[0], max: nums[0] } : fallback);
}

function todayNutritionSummary() { return state.nutritionDays.find(item => item.date === today()) || null; }

function renderMacroGuidance() {
  const panel = $('#macroGuidancePanel'); if (!panel) return;
  const summary = todayNutritionSummary();
  const totals = macroTotalsForDate(today());
  const targets = summary?.targets || null;
  $('#macroSourceBadge').textContent = summary?.source === 'alex-generated-markdown' || summary?.source === 'macro-markdown' ? 'Alex Macro File' : (state.meals.some(item => item.date === today()) ? 'User entered' : 'No data');
  if (!summary && !state.meals.some(item => item.date === today())) {
    $('#macroTargetGrid').innerHTML = '<div class="empty-state compact-empty">Macro guidance unavailable. Import today’s Alex macro file or enter meals manually.</div>';
    $('#macroCoachingNotes').innerHTML = ''; $('#nextMealSuggestion').innerHTML = ''; return;
  }
  const keys = [['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g'],['calories','Calories','kcal']];
  $('#macroTargetGrid').innerHTML = keys.map(([key,label,unit]) => {
    const range = macroRange(targets?.[key]); const current = Number(totals[key] || 0);
    const remaining = range ? Math.max(0, Number(range.min || 0) - current) : null;
    return `<div class="macro-target-card"><span>${label}</span><strong>${fmt(current, key === 'calories' ? 0 : 1)} ${unit}</strong><small>${range ? `Target ${fmt(range.min)}–${fmt(range.max)} ${unit}<br>${remaining > 0 ? `${fmt(remaining,1)} ${unit} to minimum` : 'Minimum reached'}` : 'Target not supplied in file'}</small></div>`;
  }).join('');
  const notes = [summary?.notes, ...(summary?.coachingNotes || [])].filter(Boolean);
  $('#macroCoachingNotes').innerHTML = notes.length ? `<h4>Alex notes retained</h4><ul>${notes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
}

function nextMealGuidance() {
  const summary = todayNutritionSummary(); const totals = macroTotalsForDate(today()); const targets = summary?.targets || null;
  if (!summary && !state.meals.some(item => item.date === today())) return 'Macro guidance unavailable. Import today’s Alex macro file or enter meals manually.';
  if (!targets) return 'Today’s file has totals but no target ranges. Ask Alex to include targets in the next VANTAGE macro Markdown file.';
  const p = macroRange(targets.protein), c = macroRange(targets.carbs), f = macroRange(targets.fat), kcal = macroRange(targets.calories);
  const remain = { protein: Math.max(0,(p?.min||0)-totals.protein), carbs: Math.max(0,(c?.min||0)-totals.carbs), fat: Math.max(0,(f?.min||0)-totals.fat), calories: Math.max(0,(kcal?.min||0)-totals.calories) };
  const latest = state.meals.filter(item => item.date === today()).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')))[0];
  const planned = String(latestVitals()?.plannedTraining?.type || latestVitals()?.feeling || '').toLowerCase();
  const postWorkout = Boolean(latest?.postWorkout) || state.sessions.some(item => item.date === today() && item.completedAt);
  const sodiumWatch = /sodium|smoked|salt/i.test([summary.notes, ...(summary.coachingNotes||[])].join(' '));
  if (remain.carbs >= 60 && !postWorkout && /leg/.test(planned)) return 'You are still short on carbohydrate for legs. Best next option: 30–40 g cream of rice, whey, banana and cinnamon. Keep fats low before training.';
  if (postWorkout && (remain.protein >= 25 || remain.carbs >= 45)) return `${sodiumWatch ? 'Keep sodium controlled. ' : ''}Best next meal: 220–250 g white fish or chicken, 200–300 g cooked potato or rice, plus greens. Adjust the starch portion to the remaining carbohydrate target.`;
  if (remain.protein <= 10 && remain.carbs <= 25 && remain.fat <= 10) return 'Targets are essentially covered. Keep the next intake light: 0% Greek yoghurt with blueberries and cinnamon, or stop eating if you are not hungry.';
  if (remain.protein >= 30 && remain.carbs < 30) return 'Protein is the main gap. Use a lean option: white fish, chicken, whey or 0% Greek yoghurt. Avoid adding unnecessary fats.';
  if (remain.carbs >= 40) return 'Carbohydrate is the main gap. Add cooked rice, potato, sweet potato, cream of rice or fruit alongside a moderate lean-protein serving.';
  return 'Use a balanced final meal: lean protein, a measured rice or potato portion and greens. Follow any sodium or hydration note imported from Alex.';
}

function mealDraftFromForm(form) {
  return {
    protein: Number(form.elements.protein.value || 0),
    carbs: Number(form.elements.carbs.value || 0),
    fat: Number(form.elements.fat.value || 0),
    calories: Number(form.elements.calories.value || 0)
  };
}

function calculateMealCalories(form) {
  const protein = Number(form.elements.protein.value || 0);
  const carbs = Number(form.elements.carbs.value || 0);
  const fat = Number(form.elements.fat.value || 0);
  form.elements.calories.value = Math.round(protein * 4 + carbs * 4 + fat * 9);
  renderMacroStrip(mealDraftFromForm(form));
}

function renderMacroMarkdownStatus(result, fileName) {
  const totals = result.dailyTotals || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const warnings = result.warnings.length
    ? `<div class="alert alert-warning"><strong>Check these points:</strong><ul>${result.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
    : '';
  $('#macroMarkdownStatus').innerHTML = `
    <div class="import-success">
      <strong>${escapeHtml(fileName)}</strong>
      <p>${result.meals.length} meals loaded for ${escapeHtml(result.date)}.</p>
      <p class="import-summary">${fmt(totals.protein, 1)}P · ${fmt(totals.carbs, 1)}C · ${fmt(totals.fat, 1)}F · ${fmt(totals.calories)} kcal</p>
    </div>${warnings}`;
}

function sessionHydrationMl(session = {}) {
  if (session.cardio?.hydration) {
    const h = session.cardio.hydration;
    return Math.max(0, Number(h.coconutWaterMl || 0) + Number(h.waterMl || 0) + Number(h.otherFluidMl || 0));
  }
  const h = session.hydration || {};
  return Math.max(0, Number(h.amountMl || 0));
}

async function linkSessionHydrationToDailyLedger(session) {
  const amountMl = sessionHydrationMl(session);
  if (!(amountMl > 0) || !session?.date) return;
  const vitals = resolveVitalsForSession({ date: session.date, startedAt: session.startedAt, vitalsId: session.decision?.vitalsId });
  if (!vitals) return;
  const ids = new Set(vitals.sessionHydrationIds || []);
  if (ids.has(session.id)) return;
  ids.add(session.id);
  const previousContribution = Number(vitals.sessionHydrationContributionLitres || 0);
  const contribution = Math.round((previousContribution + amountMl / 1000) * 1000) / 1000;
  const manualTotal = Number(vitals.dailyHydrationConsumedLitres || 0);
  const update = {
    ...vitals,
    sessionHydrationIds: [...ids],
    sessionHydrationContributionLitres: contribution,
    updatedAt: new Date().toISOString()
  };
  if (!(manualTotal > 0)) update.dailyHydrationConsumedLitres = contribution;
  else update.hydrationAggregationStatus = 'manual-daily-total-preserved-to-avoid-double-count';
  await db.put('vitals', update);
}

async function relinkNutritionForDate(dateValue) {
  const summary = state.nutritionDays.find(item => item.date === dateValue) || await db.get('nutritionDays', `nutrition-${dateValue}`);
  if (!summary) return 0;
  let count = 0;
  const sessions = await db.getAll('sessions');
  for (const session of sessions.filter(item => item.date === dateValue)) {
    session.nutritionLink = { status: 'linked', nutritionDayId: summary.id, linkedAt: new Date().toISOString(), sourceConfidence: summary.sourceConfidence || 'recorded' };
    await db.put('sessions', session); count += 1;
  }
  return count;
}


function historicalDateRelation(dateValue) {
  if (!dateValue) return 'unknown';
  if (dateValue < today()) return 'past';
  if (dateValue === today()) return 'today';
  return 'future';
}

function historicalExistingSummary(item) {
  if (!item) return '';
  if (item.type === 'macros') {
    const meals = state.meals.filter(row => row.date === item.date).length;
    const summary = state.nutritionDays.find(row => row.date === item.date);
    return meals || summary ? `${meals} existing meals${summary ? ' + daily summary' : ''}` : '';
  }
  if (item.type === 'vitals') return state.vitals.some(row => row.date === item.date) ? 'Existing vitals record' : '';
  if (item.type === 'bloodwork') return state.bloodTests.some(row => row.id === item.payload.id || (row.date === item.date && row.fingerprint === item.payload.fingerprint)) ? 'Matching bloodwork panel already exists' : '';
  if (item.type === 'recovery') return state.recoveryLogs.some(row => row.date === item.date && row.sourceSessionId === (item.payload.sessionId || null)) ? 'Matching recovery record already exists' : '';
  return '';
}

function renderHistoricalImportPreview() {
  const node = $('#historicalMarkdownStatus');
  const button = $('#applyHistoricalMarkdownButton');
  const item = state.pendingHistoricalImport;
  if (!node || !button) return;
  if (!item) {
    node.innerHTML = '<div class="empty-state">No historical Markdown selected.</div>';
    button.hidden = true;
    return;
  }
  const relation = historicalDateRelation(item.date);
  const existing = historicalExistingSummary(item);
  const warnings = [...(item.warnings || [])];
  if (relation === 'future') warnings.unshift('This file is dated in the future. Historical import is intended for today or earlier dates.');
  if (existing) warnings.unshift(`${existing}. Tick replace if you intend to overwrite the same-day record.`);
  node.innerHTML = `<div class="import-success"><strong>${escapeHtml(item.fileName)}</strong><p>${escapeHtml(item.label)} detected for <strong>${escapeHtml(localDateLabel(item.date))}</strong>.</p><p class="import-summary">${escapeHtml(item.summary || item.schema)} · File date will be used exactly; today will not be substituted.</p></div>${warnings.length ? `<div class="alert alert-warning"><strong>Review before import:</strong><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : ''}`;
  button.hidden = relation === 'future';
  button.textContent = `Import ${item.label} for ${item.date}`;
}

async function relinkVitalsForHistoricalDate(dateValue, vitals) {
  let linked = 0;
  const readiness = calculateReadiness(vitals);
  for (const session of state.sessions.filter(row => row.date === dateValue)) {
    const hasValidSnapshot = Boolean(session.vitalsSnapshot && session.decision?.vitalsId);
    if (hasValidSnapshot) continue;
    session.vitalsSnapshot = structuredClone(vitals);
    session.readinessSnapshotAtStart = structuredClone(readiness);
    session.decision ||= {};
    session.decision.vitalsId = vitals.id;
    session.decision.vitalsLinkResolution = 'historical-markdown-late-import';
    session.decision.vitalsLinkedAt = new Date().toISOString();
    if (!session.decision.readinessLevel || session.decision.readinessLevel === 'unknown') {
      session.decision.readinessLevel = readiness.level;
      session.decision.readinessTitle = readiness.title;
      session.decision.recommendedAction = recommendationAction(readiness);
      session.decision.readinessCalculationAudit = readiness.calculationAudit ? structuredClone(readiness.calculationAudit) : null;
    }
    await db.put('sessions', session); linked += 1;
  }
  return linked;
}

async function importHistoricalVitals(item, replace) {
  const result = item.payload;
  const existing = state.vitals.find(row => row.date === item.date) || null;
  if (existing && !replace) throw new Error(`Vitals already exist for ${item.date}. Tick replace to overwrite them.`);
  const values = { ...(result.values || {}) };
  const now = new Date().toISOString();
  const record = {
    ...(replace ? {} : existing || {}),
    ...values,
    id: `vitals-${item.date}`,
    profileId: existing?.profileId || profileId(),
    date: item.date,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    importedAt: now,
    importSourceFormat: result.sourceFormat || 'historical-markdown',
    importFileName: item.fileName,
    importWarnings: [...(result.warnings || [])],
    unsupportedImportFields: [...(result.unsupportedFields || [])],
    importFieldSources: { ...(result.fieldSources || {}) },
    historicalImport: { importedAt: now, originalDate: item.date, type: 'vitals', fileName: item.fileName }
  };
  record.baselineStatus = {
    hrv: record.hrvBaselineStatus || (record.hrvBaseline != null ? 'known' : 'unknown'),
    restingHr: record.rhrBaselineStatus || (record.rhrBaseline != null ? 'known' : 'unknown')
  };
  const weightFlag = vitalsWeightChangeFlag(record);
  if (weightFlag) record.weightChangeContext = weightFlag; else delete record.weightChangeContext;
  await db.put('vitals', record);
  await refreshState();
  const linked = await relinkVitalsForHistoricalDate(item.date, record);
  if (linked) await refreshState();
  return `${item.label} imported${linked ? ` · linked to ${linked} same-day session${linked === 1 ? '' : 's'}` : ''}`;
}

async function importHistoricalRecovery(item, replace) {
  const payload = item.payload;
  const sessionId = payload.sessionId || stableId('historical-recovery', `${item.date}|${payload.activity || payload.sessionType}|${payload.durationMinutes || ''}|${item.fileName}`);
  const logId = `historical-recovery-${sessionId}`;
  const existing = state.recoveryLogs.find(row => row.id === logId);
  if (existing && !replace) throw new Error(`This recovery record already exists for ${item.date}. Tick replace to overwrite it.`);
  const now = new Date().toISOString();
  await db.put('recoveryLogs', {
    id: logId, profileId: profileId(), date: item.date,
    activityId: String(payload.activity || payload.sessionType || 'historical-recovery').toLowerCase().replace(/[^a-z0-9]+/g,'-'),
    activityName: payload.activity || payload.sessionType || 'Recovery',
    classification: 'recovery', section: 'Historical import',
    durationSeconds: Number(payload.durationMinutes || 0) * 60,
    durationMinutes: Number(payload.durationMinutes || 0) || null,
    durationInputMode: 'historical-markdown', durationSource: 'historical-markdown', timerUsed: false,
    timeOfDay: payload.manualStartTime || payload.startTime || '', intensity: 'easy', timing: payload.timing || 'separate',
    notes: payload.notes || '', hydration: payload.hydration || null,
    recordedAt: payload.startedAtUtc || payload.startedAt || `${item.date}T00:00:00`,
    completedAt: payload.completedAtUtc || payload.completedAt || `${item.date}T23:59:59`,
    source: 'historical-markdown', sourceSessionId: payload.sessionId || null,
    historicalImport: { importedAt: now, originalDate: item.date, type: 'recovery', fileName: item.fileName }
  });
  await refreshState();
  return 'Recovery history imported';
}

async function applyHistoricalImport() {
  const item = state.pendingHistoricalImport;
  if (!item) return;
  const replace = Boolean($('#replaceHistoricalDayCheckbox')?.checked);
  const relation = historicalDateRelation(item.date);
  if (relation === 'future') throw new Error('Future-dated files cannot be imported through Historical Import.');
  const existing = historicalExistingSummary(item);
  if (existing && !replace) throw new Error(`${existing}. Tick replace to continue.`);
  let message = '';
  if (item.type === 'macros') {
    await importMacroMarkdown(item.payload, replace);
    message = 'Historical macros imported and same-day sessions re-linked';
  } else if (item.type === 'vitals') {
    message = await importHistoricalVitals(item, replace);
  } else if (item.type === 'bloodwork') {
    await db.put('bloodTests', { ...item.payload, profileId: profileId(), historicalImport: { importedAt: new Date().toISOString(), originalDate: item.date, type: 'bloodwork', fileName: item.fileName } });
    await refreshState(); renderAll(); message = 'Historical bloodwork imported';
  } else if (item.type === 'recovery') {
    message = await importHistoricalRecovery(item, replace);
    renderAll();
  } else throw new Error(`Unsupported historical type: ${item.type}`);
  const completedDate = item.date;
  const completedLabel = item.label;
  const completedFile = item.fileName;
  state.pendingHistoricalImport = null;
  renderAll();
  renderHistoricalImportPreview();
  const status = $('#historicalMarkdownStatus');
  if (status) status.innerHTML = `<div class="import-success"><strong>${escapeHtml(completedFile)}</strong><p>${escapeHtml(completedLabel)} stored against ${escapeHtml(localDateLabel(completedDate))}. The source date was preserved.</p></div>`;
  toast(message || 'Historical Markdown imported');
}

async function importMacroMarkdown(result, replace) {
  if (replace) {
    for (const meal of state.meals.filter(item => item.date === result.date)) await db.remove('meals', meal.id);
    for (const summary of state.nutritionDays.filter(item => item.date === result.date)) await db.remove('nutritionDays', summary.id);
  }

  const importedAt = new Date().toISOString();
  const meals = result.meals.map((meal, index) => ({
    id: stableId('macro-markdown', `${result.date}|${meal.mealNumber}|${meal.time}|${meal.foods}|${index}`),
    profileId: profileId(), date: result.date,
    ...meal,
    createdAt: importedAt,
    source: 'macro-markdown',
    weightConvention: 'cooked unless explicitly stated otherwise'
  }));
  await db.putMany('meals', meals);

  if (result.dailyTotals) {
    await db.put('nutritionDays', {
      id: `nutrition-${result.date}`,
      profileId: profileId(), date: result.date,
      source: 'macro-markdown',
      protein: result.dailyTotals.protein,
      carbs: result.dailyTotals.carbs,
      fat: result.dailyTotals.fat,
      calories: result.dailyTotals.calories,
      notes: result.notes || '',
      coachingNotes: result.coachingNotes || [], targets: result.targets || null,
      macroSource: 'alex-generated-markdown', sourceConfidence: 'user-confirmed', manualAppMacroEntry: false,
      importedAt
    });
  }
  await refreshState();
  const relinked = await relinkNutritionForDate(result.date);
  if (relinked) await refreshState();
  renderAll();
  if (relinked) toast(`Macros linked to ${relinked} same-day session${relinked === 1 ? '' : 's'}`);
}

function downloadTodayMacroMarkdown() {
  const date = today();
  const meals = state.meals.filter(item => item.date === date).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const summary = state.nutritionDays.find(item => item.date === date);
  const dailyTotals = meals.length ? mealTotalsForDate(date) : {
    protein: Number(summary?.protein || 0), carbs: Number(summary?.carbs || 0),
    fat: Number(summary?.fat || 0), calories: Number(summary?.calories || 0)
  };
  downloadBlob(
    createNutritionMarkdown({ date, meals, dailyTotals, notes: summary?.notes || '' }),
    nutritionMarkdownFilename(date),
    'text/markdown;charset=utf-8'
  );
}

function renderMeals() {
  const todaysMeals = state.meals.filter(item => item.date === today()).sort((a,b) => String(a.time).localeCompare(String(b.time)));
  renderMacroStrip();
  $('#mealList').innerHTML = todaysMeals.length ? todaysMeals.map(meal => `<div class="list-item"><div><h4>Meal ${meal.mealNumber} · ${escapeHtml(meal.time || 'Time not set')}</h4><p>${escapeHtml(meal.foods)}${meal.preWorkout ? ' · Pre-workout' : ''}${meal.postWorkout ? ' · Post-workout' : ''}${meal.preBed ? ' · Pre-bed' : ''}</p><small>${fmt(meal.protein, 1)}P · ${fmt(meal.carbs, 1)}C · ${fmt(meal.fat, 1)}F</small></div><strong>${fmt(meal.calories)} kcal</strong></div>`).join('') : '<div class="empty-state">No meals logged today.</div>';
}

function renderNutritionHistory() {
  const node = $('#nutritionHistory');
  if (!node) return;
  const rows = state.nutritionDays.slice(0, 8);
  node.innerHTML = rows.length ? rows.map(item => {
    const macros = [item.protein != null ? `${fmt(item.protein)}P` : null, item.carbs != null ? `${fmt(item.carbs)}C` : null, item.fat != null ? `${fmt(item.fat)}F` : null].filter(Boolean).join(' · ');
    const detail = [macros || 'Macros not backfilled', item.calories != null ? `${fmt(item.calories)} kcal` : null, item.steps != null ? `${fmt(item.steps)} steps` : null].filter(Boolean).join(' · ');
    return `<div class="list-item"><div><h4>${localDateLabel(item.date)}</h4><p>${escapeHtml(item.sessionType || item.dayType || 'Daily summary')} · ${escapeHtml(detail)}</p></div><strong>${item.bodyweightKg != null ? `${fmt(item.bodyweightKg, 1)} kg` : '–'}</strong></div>`;
  }).join('') : '<div class="empty-state">Import the workout journal to bring in Macro_Log daily summaries.</div>';
}

function renderVitalsHistory() {
  $('#vitalsHistory').innerHTML = state.vitals.slice(0, 7).map(item => {
    const result = calculateReadiness(item);
    const flags = [result.validationWarnings?.length ? 'Readiness review' : '', item.weightChangeContext ? 'Weight context' : ''].filter(Boolean).join(' · ');
    return `<div class="list-item"><div><h4>${localDateLabel(item.date)}</h4><p>${escapeHtml(result.title)} · HRV ${item.hrv ?? '–'} · RHR ${item.restingHr ?? '–'}${flags ? ` · ${escapeHtml(flags)}` : ''}</p></div><strong>${item.systolic ? `${item.systolic}/${item.diastolic || '–'}` : '–'}</strong></div>`;
  }).join('') || '<div class="empty-state">No vitals saved.</div>';
}


const LISS_METRIC_LABELS = {
  'vantageStrap.activityShown': ['Activity shown', ''],
  'vantageStrap.dateShown': ['Date shown', ''],
  'vantageStrap.timeRange': ['Time range', ''],
  'vantageStrap.durationMinutes': ['Duration', ' min'],
  'vantageStrap.distanceKm': ['Distance', ' km'],
  'vantageStrap.avgHr': ['Average HR', ' bpm'],
  'vantageStrap.maxHr': ['Maximum HR', ' bpm'],
  'vantageStrap.minHr': ['Minimum HR', ' bpm'],
  'vantageStrap.calories': ['Calories', ' kcal'],
  'vantageStrap.effort': ['Effort', ''],
  'vantageStrap.hrSource': ['HR source', ''],
  'watchDevice.dateTime': ['Date/time', ''],
  'watchDevice.duration': ['Duration', ''],
  'watchDevice.distanceKm': ['Distance', ' km'],
  'watchDevice.calories': ['Calories', ' kcal'],
  'watchDevice.avgHr': ['Average HR', ' bpm'],
  'watchDevice.maxHr': ['Maximum HR', ' bpm'],
  'watchDevice.minHr': ['Minimum HR', ' bpm'],
  'watchDevice.avgSpeedKmh': ['Average speed', ' km/h'],
  'watchDevice.fastestSpeedKmh': ['Fastest speed', ' km/h'],
  'watchDevice.avgPacePerKm': ['Average pace', '/km'],
  'watchDevice.fastestPacePerKm': ['Fastest pace', '/km'],
  'watchDevice.slowestPacePerKm': ['Slowest pace', '/km'],
  'watchDevice.steps': ['Steps', ''],
  'watchDevice.avgCadence': ['Average cadence', ' steps/min'],
  'watchDevice.maxCadence': ['Maximum cadence', ' steps/min'],
  'watchDevice.minCadence': ['Minimum cadence', ' steps/min'],
  'watchDevice.pauses': ['Pauses', ''],
  'watchDevice.pauseLength': ['Pause length', ''],
  'treadmillMachine.totalTime': ['Total time', ''],
  'treadmillMachine.distanceKm': ['Distance', ' km'],
  'treadmillMachine.distanceMiles': ['Distance', ' mi'],
  'treadmillMachine.calories': ['Calories', ' kcal'],
  'treadmillMachine.verticalDistanceFeet': ['Vertical distance', ' ft'],
  'treadmillMachine.avgWatts': ['Average watts', ' W'],
  'treadmillMachine.avgMets': ['Average METs', ''],
  'treadmillMachine.maxSpeedKmh': ['Maximum speed', ' km/h'],
  'treadmillMachine.avgSpeedKmh': ['Average speed', ' km/h'],
  'treadmillMachine.maxSpeedMph': ['Maximum speed', ' mph'],
  'treadmillMachine.avgSpeedMph': ['Average speed', ' mph'],
  'treadmillMachine.avgPacePerKm': ['Average pace', ' min/km'],
  'treadmillMachine.maxPacePerMile': ['Maximum pace', ' min/mi'],
  'treadmillMachine.avgPacePerMile': ['Average pace', ' min/mi'],
  'treadmillMachine.maxInclinePercent': ['Maximum incline', '%'],
  'treadmillMachine.avgInclinePercent': ['Average incline', '%'],
  'treadmillMachine.stairmasterLevel': ['StairMaster level', '']
};

const LISS_SOURCE_LABELS = {
  vantageStrap: 'NOOP Strap session summary',
  watchDevice: 'Watch/device exercise summary',
  treadmillMachine: 'Treadmill/machine console'
};

const LISS_ANALYSIS_SOURCE_ROLE = {
  vantageStrap: 'noopStrapSessionSummary',
  noopStrapSessionSummary: 'noopStrapSessionSummary',
  noopStrapHrZones: 'noopStrapHrZones',
  watchDevice: 'watchDeviceExerciseSummary',
  watchDeviceExerciseSummary: 'watchDeviceExerciseSummary',
  watchDevicePaceSpeedCadence: 'watchDevicePaceSpeedCadence',
  treadmillMachine: 'treadmillMachineConsole',
  treadmillMachineConsole: 'treadmillMachineConsole',
  outdoorWalkGpsSummary: 'outdoorWalkGpsSummary'
};

function evidenceImageNames(value) {
  const matches = String(value || '').match(/(?:media\/)?[^\s/]+?\.(?:png|jpe?g|webp|heic|heif)/gi) || [];
  return [...new Set(matches.map(name => name.split('/').at(-1).toLowerCase()))];
}

function buildLissMediaRoleSuggestions(analysis, media = []) {
  const suggestions = [];
  const addSuggestion = (filename, suggestedRole, evidenceSource = 'Coach analysis') => {
    const item = media.find(entry => String(entry.name || entry.archivePath || '').split('/').at(-1).toLowerCase() === filename.toLowerCase());
    if (!item) return;
    if (item.sourceRole === suggestedRole && item.sourceRoleConfirmed === true) return;
    const id = `${item.id}:${suggestedRole}`;
    if (suggestions.some(entry => entry.id === id)) return;
    suggestions.push({
      id,
      mediaId: item.id,
      filename: item.name || filename,
      currentRole: item.sourceRole || 'unassigned',
      suggestedRole,
      evidenceSource,
      resolution: null,
      resolvedAt: null
    });
  };

  Object.entries(analysis.imageEvidenceSources || {}).forEach(([source, block]) => {
    const suggestedRole = LISS_ANALYSIS_SOURCE_ROLE[source] || normaliseLissMediaRole(source);
    if (!LISS_ROLE_DETAILS[suggestedRole]) return;
    evidenceImageNames(block?.sourceFile).forEach(filename => addSuggestion(filename, suggestedRole, block?.sourceFile || 'imageEvidenceSources'));
  });
  (analysis.imageReadings || []).forEach(reading => {
    const role = LISS_ANALYSIS_SOURCE_ROLE[reading?.sourceRole] || normaliseLissMediaRole(reading?.sourceRole);
    if (!LISS_ROLE_DETAILS[role]) return;
    evidenceImageNames(reading.sourceFile).forEach(filename => addSuggestion(filename, role, reading.sourceFile || 'imageReadings'));
  });
  return suggestions;
}

function lissMetricDescriptor(item) {
  if (item.path.startsWith('hrZones.')) {
    const match = item.path.match(/z(\d)(Minutes|Percent)$/);
    if (match) return [`Zone ${match[1]} ${match[2] === 'Minutes' ? 'minutes' : 'percent'}`, match[2] === 'Minutes' ? ' min' : '%'];
  }
  if (item.path.startsWith('caloriesPerMinute.')) {
    return [`Calories/min ${item.path.split('.').at(-1)}`, ''];
  }
  return LISS_METRIC_LABELS[`${item.source}.${item.path}`] || [item.path.replace(/([A-Z])/g, ' $1'), ''];
}

function lissMetricValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return `${value}${suffix}`;
}

function lissConflictReviewHtml(session) {
  const analysis = session.cardio?.analysis;
  const review = Array.isArray(analysis?.evidenceReview) ? analysis.evidenceReview : [];
  const actionable = review.filter(item => ['conflict', 'image-only'].includes(item.status));
  const roleSuggestions = Array.isArray(analysis?.mediaRoleSuggestions) ? analysis.mediaRoleSuggestions : [];
  const pendingRoleSuggestions = roleSuggestions.filter(item => !item.resolution);
  const activitySuggestion = analysis?.activitySuggestion || null;
  if (!actionable.length && !roleSuggestions.length && !activitySuggestion) return '';
  const pending = actionable.filter(item => !item.resolution).length + pendingRoleSuggestions.length + (activitySuggestion && !activitySuggestion.resolution ? 1 : 0);

  const allImageOnly = actionable.filter(item => item.status === 'image-only' && !item.resolution);
  const acceptAllButton = allImageOnly.length
    ? `<button class="button button-primary button-small" data-liss-source-action="accept-image-only" data-session-id="${escapeHtml(session.id)}" data-source="all">Populate all ${allImageOnly.length} clear screenshot value${allImageOnly.length === 1 ? '' : 's'}</button>`
    : '';
  const sourceBulkActions = acceptAllButton + Object.entries(LISS_SOURCE_LABELS).map(([source, label]) => {
    const imageOnly = actionable.filter(item => item.source === source && item.status === 'image-only' && !item.resolution);
    if (!imageOnly.length) return '';
    return `<button class="button button-ghost button-small" data-liss-source-action="accept-image-only" data-session-id="${escapeHtml(session.id)}" data-source="${escapeHtml(source)}">Accept ${imageOnly.length} clear ${escapeHtml(label)} value${imageOnly.length === 1 ? '' : 's'}</button>`;
  }).join('');

  const cards = actionable.map(item => {
    const [label, suffix] = lissMetricDescriptor(item);
    const sourceLabel = LISS_SOURCE_LABELS[item.source] || item.source;
    const recorded = lissMetricValue(item.recordedValue, suffix);
    const evidence = lissMetricValue(item.evidenceValue, suffix);
    const decision = item.resolution === 'image'
      ? '<strong class="conflict-decision accepted">Screenshot accepted by Steve</strong>'
      : item.resolution === 'structured'
        ? '<strong class="conflict-decision kept">Recorded value kept</strong>'
        : '';
    const keepButton = item.status === 'conflict'
      ? `<button class="button button-ghost button-small" data-liss-conflict-action="keep-structured" data-session-id="${escapeHtml(session.id)}" data-conflict-id="${escapeHtml(item.id)}">Keep recorded</button>`
      : '';
    const imageButton = `<button class="button button-primary button-small" data-liss-conflict-action="use-image" data-session-id="${escapeHtml(session.id)}" data-conflict-id="${escapeHtml(item.id)}">Use screenshot value</button>`;
    return `<div class="liss-conflict-card ${item.status}"><div class="liss-conflict-title"><div><span>${escapeHtml(sourceLabel)}</span><strong>${escapeHtml(label)}</strong></div><span class="conflict-badge">${item.status === 'image-only' ? 'Image only' : 'Conflict'}</span></div><div class="liss-conflict-values"><div><span>Recorded in VANTAGE</span><strong>${escapeHtml(recorded)}</strong></div><div><span>Screenshot evidence</span><strong>${escapeHtml(evidence)}</strong><small>${escapeHtml(item.sourceFile || item.evidenceSourceType || 'Image analysis')}</small></div></div>${decision || `<div class="liss-conflict-actions">${keepButton}${imageButton}</div>`}</div>`;
  }).join('');

  const activityCard = activitySuggestion ? (() => {
    const current = activityLabel(activitySuggestion.currentActivityType);
    const suggested = activityLabel(activitySuggestion.suggestedActivityType);
    const decision = activitySuggestion.resolution === 'applied'
      ? '<strong class="conflict-decision accepted">Activity correction applied by Steve</strong>'
      : activitySuggestion.resolution === 'kept'
        ? '<strong class="conflict-decision kept">Recorded activity kept</strong>'
        : `<div class="liss-conflict-actions"><button class="button button-ghost button-small" data-liss-activity-action="keep" data-session-id="${escapeHtml(session.id)}">Keep ${escapeHtml(current)}</button><button class="button button-primary button-small" data-liss-activity-action="apply" data-session-id="${escapeHtml(session.id)}">Use ${escapeHtml(suggested)}</button></div>`;
    return `<div class="liss-conflict-card activity-role-suggestion"><div class="liss-conflict-title"><div><span>Activity type</span><strong>Session activity conflict</strong></div><span class="conflict-badge">Activity review</span></div><div class="liss-conflict-values"><div><span>Recorded in VANTAGE</span><strong>${escapeHtml(current)}</strong></div><div><span>Screenshot / Coach evidence</span><strong>${escapeHtml(suggested)}</strong><small>${escapeHtml(activitySuggestion.evidenceSource || 'Coach analysis')}</small></div></div>${decision}</div>`;
  })() : '';

  const roleCards = roleSuggestions.map(item => {
    const current = LISS_MEDIA_ROLES.find(([value]) => value === item.currentRole)?.[1] || item.currentRole;
    const suggested = LISS_MEDIA_ROLES.find(([value]) => value === item.suggestedRole)?.[1] || item.suggestedRole;
    const decision = item.resolution === 'applied'
      ? '<strong class="conflict-decision accepted">Suggested role applied by Steve</strong>'
      : `<button class="button button-primary button-small" data-liss-role-action="apply-suggested" data-session-id="${escapeHtml(session.id)}" data-role-suggestion-id="${escapeHtml(item.id)}">Apply suggested role</button>`;
    return `<div class="liss-conflict-card media-role-suggestion"><div class="liss-conflict-title"><div><span>Screenshot source</span><strong>${escapeHtml(item.filename)}</strong></div><span class="conflict-badge">Role review</span></div><div class="liss-conflict-values"><div><span>Current role</span><strong>${escapeHtml(current)}</strong></div><div><span>Coach suggestion</span><strong>${escapeHtml(suggested)}</strong><small>${escapeHtml(item.evidenceSource || 'Coach analysis')}</small></div></div><div class="liss-conflict-actions">${decision}</div></div>`;
  }).join('');

  return `<details class="liss-conflict-review" ${pending ? 'open' : ''}><summary>Source review · ${pending} decision${pending === 1 ? '' : 's'} pending</summary><p>Structured app values remain authoritative. Screenshot values, activity corrections and image-role suggestions are preserved separately and only applied after you confirm.</p>${sourceBulkActions ? `<div class="liss-source-bulk-actions">${sourceBulkActions}</div>` : ''}${activityCard}${roleCards}${cards}</details>`;
}

async function resolveLissEvidenceConflict(sessionId, conflictId, action) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  if (!isLissSession(session) || !session.cardio?.analysis) return toast('LISS analysis could not be found');
  const review = session.cardio.analysis.evidenceReview || [];
  const item = review.find(entry => entry.id === conflictId);
  if (!item) return toast('Conflict record could not be found');
  const confirmedAt = new Date().toISOString();
  const previousValue = pathValue(session.cardio.sources?.[item.source], item.path) ?? null;

  if (action === 'use-image') {
    session.cardio.sources ||= defaultLissSources();
    setPathValue(session.cardio.sources[item.source], item.path, item.evidenceValue);
    refreshLegacyLissMetrics(session.cardio);
    item.resolution = 'image';
    item.resolvedAt = confirmedAt;
    session.cardio.analysis.confirmationAudit ||= [];
    session.cardio.analysis.confirmationAudit.push({
      conflictId: item.id,
      metric: item.path,
      source: item.source,
      confirmedAt,
      previousValue,
      correctedValue: item.evidenceValue,
      correctionSource: item.sourceFile || `${LISS_SOURCE_LABELS[item.source] || item.source} screenshot`,
      confirmedBy: 'Steve'
    });
  } else {
    item.resolution = 'structured';
    item.resolvedAt = confirmedAt;
    session.cardio.analysis.confirmationAudit ||= [];
    session.cardio.analysis.confirmationAudit.push({
      conflictId: item.id,
      metric: item.path,
      source: item.source,
      confirmedAt,
      retainedValue: previousValue,
      rejectedEvidenceValue: item.evidenceValue,
      decision: 'keep-structured',
      confirmedBy: 'Steve'
    });
  }

  await db.put('sessions', session);
  await refreshState();
  renderAll();
  showScreen('history');
  toast(action === 'use-image' ? 'Screenshot value accepted and audit recorded' : 'Recorded value kept; screenshot evidence preserved');
}


async function resolveLissSourceImageOnly(sessionId, source) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  if (!isLissSession(session) || !session.cardio?.analysis) return toast('LISS analysis could not be found');
  const review = session.cardio.analysis.evidenceReview || [];
  const items = review.filter(item => (source === 'all' || item.source === source) && item.status === 'image-only' && !item.resolution);
  if (!items.length) return toast('No unconfirmed image-only values remain');
  const confirmedAt = new Date().toISOString();
  session.cardio.sources ||= defaultLissSources();
  session.cardio.analysis.confirmationAudit ||= [];
  items.forEach(item => {
    setPathValue(session.cardio.sources[item.source], item.path, item.evidenceValue);
    item.resolution = 'image';
    item.resolvedAt = confirmedAt;
    session.cardio.analysis.confirmationAudit.push({
      conflictId: item.id,
      metric: item.path,
      source: item.source,
      confirmedAt,
      previousValue: null,
      correctedValue: item.evidenceValue,
      correctionSource: item.sourceFile || `${LISS_SOURCE_LABELS[item.source] || item.source} screenshot`,
      decision: 'accept-image-only-bulk',
      confirmedBy: 'Steve'
    });
  });
  refreshLegacyLissMetrics(session.cardio);
  await db.put('sessions', session);
  await refreshState();
  renderAll();
  showScreen('history');
  toast(source === 'all'
    ? `${items.length} screenshot value${items.length === 1 ? '' : 's'} populated across all sources`
    : `${items.length} screenshot value${items.length === 1 ? '' : 's'} accepted for ${LISS_SOURCE_LABELS[source] || source}`);
}

async function resolveLissActivitySuggestion(sessionId, action) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  const suggestion = session?.cardio?.analysis?.activitySuggestion;
  if (!isLissSession(session) || !suggestion) return toast('Activity suggestion could not be found');
  const confirmedAt = new Date().toISOString();
  if (action === 'apply') {
    session.cardio.activityType = normaliseLissActivity(suggestion.suggestedActivityType) || session.cardio.activityType;
    suggestion.resolution = 'applied';
    suggestion.resolvedAt = confirmedAt;
    suggestion.confirmedBy = 'Steve';
  } else {
    suggestion.resolution = 'kept';
    suggestion.resolvedAt = confirmedAt;
    suggestion.confirmedBy = 'Steve';
  }
  session.cardio.analysis.activityAudit ||= [];
  session.cardio.analysis.activityAudit.push({
    currentActivityType: suggestion.currentActivityType,
    suggestedActivityType: suggestion.suggestedActivityType,
    decision: action === 'apply' ? 'use-evidence-activity' : 'keep-structured-activity',
    confirmedAt,
    confirmedBy: 'Steve'
  });
  await db.put('sessions', session);
  await refreshState();
  renderAll();
  showScreen('history');
  toast(action === 'apply' ? `Activity updated to ${activityLabel(session.cardio.activityType)}` : 'Recorded activity kept');
}

async function resolveLissMediaRoleSuggestion(sessionId, suggestionId) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  if (!isLissSession(session) || !session.cardio?.analysis) return toast('LISS analysis could not be found');
  const suggestion = (session.cardio.analysis.mediaRoleSuggestions || []).find(item => item.id === suggestionId);
  if (!suggestion) return toast('Media-role suggestion could not be found');
  const media = await db.get('sessionMedia', suggestion.mediaId);
  if (!media) return toast('The referenced screenshot is no longer stored in VANTAGE');
  const previousRole = media.sourceRole || 'unassigned';
  const confirmedAt = new Date().toISOString();
  media.sourceRole = normaliseLissMediaRole(suggestion.suggestedRole);
  const details = lissRoleDetails(media.sourceRole);
  media.sourceSystem = details.sourceSystem;
  media.sensor = details.sensor;
  media.sourceRoleConfirmed = true;
  media.sourceRoleAssignedAt = confirmedAt;
  media.mappingConfidence = 'user-confirmed';
  await db.put('sessionMedia', media);
  suggestion.resolution = 'applied';
  suggestion.resolvedAt = confirmedAt;
  session.cardio.analysis.mediaRoleAudit ||= [];
  session.cardio.analysis.mediaRoleAudit.push({
    mediaId: media.id,
    filename: media.name,
    previousRole,
    correctedRole: suggestion.suggestedRole,
    confirmedAt,
    confirmedBy: 'Steve',
    evidenceSource: suggestion.evidenceSource || 'Coach analysis'
  });
  await db.put('sessions', session);
  await refreshState();
  renderAll();
  showScreen('history');
  toast(`Image role updated to ${LISS_SOURCE_LABELS[suggestion.suggestedRole] || suggestion.suggestedRole}`);
}

function renderHistory() {
  $('#historyList').innerHTML = state.sessions.length ? state.sessions.map(session => {
    if (isRestDaySession(session)) {
      return `<article class="history-card rest-history-card"><header><div><h3>Rest Day</h3><p>${localDateLabel(session.date)} · Recorded decision</p></div><strong>Rest</strong></header><details><summary>${escapeHtml(session.decision?.readinessTitle || 'No readiness data')}</summary><div class="decision-summary"><div class="decision-row"><span>Recommendation at decision</span><strong>${escapeHtml(session.decision?.recommendedAction || 'Not recorded')}</strong></div><div class="decision-row"><span>Actual action</span><strong>Rest day</strong></div></div>${session.notes ? `<p style="margin-top:10px">${escapeHtml(session.notes)}</p>` : ''}</details></article>`;
    }
    if (isRecoverySession(session)) {
      const recovery = session.recoverySession || {};
      const hr = session.workoutHrSummary || session.workoutHrEvidence || {};
      const durationMinutes = Number(recovery.durationMinutes || session.durationMinutes || 0);
      const summary = [
        durationMinutes ? `${durationMinutes} min` : null,
        hr.avgHr != null ? `Avg HR ${fmt(hr.avgHr)}` : null,
        hr.maxHr != null ? `Max ${fmt(hr.maxHr)}` : null,
        recovery.notes || session.notes || null
      ].filter(Boolean).join(' · ');
      return `<article class="history-card recovery-history-card"><header><div><h3>${escapeHtml(recovery.activity || session.sessionType || 'Recovery session')}</h3><p>${localDateLabel(session.date)} · Recovery</p></div><strong>${durationMinutes ? `${durationMinutes} min` : '–'}</strong></header><details><summary>${escapeHtml(summary || 'Recovery session')}</summary><div class="liss-history-summary"><div><span>Activity</span><strong>${escapeHtml(recovery.activity || 'Recovery')}</strong></div><div><span>HR image</span><strong>${(session.mediaIds || []).length ? 'Attached' : 'Not attached'}</strong></div><div><span>Hydration</span><strong>${hydrationRecorded(session.hydration) ? 'Recorded' : 'Not recorded'}</strong></div><div><span>Schema</span><strong>Recovery session</strong></div></div>${recovery.notes ? `<p>${escapeHtml(recovery.notes)}</p>` : ''}<div class="history-actions"><button class="button button-primary button-small" data-download-recovery-pack="${escapeHtml(session.id)}">Download Recovery Coach Pack</button><button class="button button-ghost button-small" data-download-recovery-md="${escapeHtml(session.id)}">Download Markdown</button></div></details></article>`;
    }
    if (isLissSession(session)) {
      const cardio = session.cardio || {};
      const metrics = cardio.metrics || {};
      const analysis = cardio.analysis;
      const summary = [
        metrics.distance != null ? `${fmt(metrics.distance, 2)} ${escapeHtml(metrics.distanceUnit || '')}` : null,
        metrics.avgHr != null ? `Avg HR ${fmt(metrics.avgHr)}` : null,
        metrics.maxHr != null ? `Max ${fmt(metrics.maxHr)}` : null
      ].filter(Boolean).join(' · ');
      const analysisBlock = analysis ? `<div class="liss-analysis"><strong>${escapeHtml((analysis.classification || 'unknown').replace(/-/g, ' '))}</strong><p>${escapeHtml(analysis.summary || 'Coach analysis imported.')}</p></div>` : '';
      const conflictReview = lissConflictReviewHtml(session);
      return `<article class="history-card"><header><div><h3>${escapeHtml(activityLabel(cardio.activityType))}</h3><p>${localDateLabel(session.date)} · LISS</p></div><strong>${durationLabel(cardio.elapsedSeconds || metrics.durationSeconds)}</strong></header><details><summary>${escapeHtml(summary || `${(cardio.mediaIds || []).length} images attached`)}</summary><div class="liss-history-summary"><div><span>Nasal breathing</span><strong>${cardio.nasalBreathing ? 'Yes' : 'No'}</strong></div><div><span>Images</span><strong>${(cardio.mediaIds || []).length}</strong></div><div><span>Machine calories</span><strong>${metrics.machineCalories != null ? `${fmt(metrics.machineCalories)} kcal` : '–'}</strong></div><div><span>Effort</span><strong>${metrics.effort ?? '–'}</strong></div></div>${cardio.comments ? `<p>${escapeHtml(cardio.comments)}</p>` : ''}${analysisBlock}${conflictReview}<div class="history-actions"><button class="button button-ghost button-small" data-share-liss-pack="${escapeHtml(session.id)}">Share full ZIP</button><button class="button button-ghost button-small" data-download-liss-pack="${escapeHtml(session.id)}">Download full ZIP</button><button class="button button-ghost button-small" data-download-liss-md="${escapeHtml(session.id)}">Download Markdown</button><button class="button button-primary button-small" data-import-liss-analysis="${escapeHtml(session.id)}">Import Coach analysis</button></div></details></article>`;
    }
    const totals = sessionTotals(session);
    const exercises = (session.exercises || []).map(exercise => `<div class="history-exercise"><strong>${escapeHtml(exercise.name)}</strong><span>${(exercise.sets || []).map(set => `${escapeHtml(set.setType)} ${set.weightKg} kg × ${set.reps} @ ${set.rpe}${set.failure ? ' · failure' : ''}`).join(' | ')}</span></div>`).join('');
    const strengthAnalysisBlock = strengthHrEvidenceHtml(session);
    return `<article class="history-card"><header><div><h3>${escapeHtml(session.sessionType)}</h3><p>${localDateLabel(session.date)} · ${escapeHtml(modeLabel(session.mode))}</p></div><strong>${fmt(totals.volume)} kg</strong></header><details><summary>${totals.exercises} exercises · ${totals.workSets} work sets</summary>${exercises}${session.notes ? `<p style="margin-top:10px">${escapeHtml(session.notes)}</p>` : ''}${strengthAnalysisBlock}<div class="history-actions"><button class="button button-primary button-small" data-download-workout-pack="${escapeHtml(session.id)}">Download full Coach Pack</button><button class="button button-ghost button-small" data-download-workout-md="${escapeHtml(session.id)}">Download Markdown</button><button class="button button-ghost button-small" data-import-strength-analysis="${escapeHtml(session.id)}">Import Coach analysis</button></div></details></article>`;
  }).join('') : '<div class="empty-state">No sessions saved yet.</div>';
  $('#historyList').querySelectorAll('[data-download-recovery-pack]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadRecoveryPack);
    if (!session) return toast('Recovery session could not be found');
    try {
      await downloadRecoveryCoachPack(session);
      toast('Recovery Coach Pack ZIP downloaded');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not create the Recovery Coach Pack');
    }
  }));
  $('#historyList').querySelectorAll('[data-download-recovery-md]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadRecoveryMd);
    if (!session) return toast('Recovery session could not be found');
    await downloadRecoveryMarkdown(session);
    toast('Recovery Markdown downloaded');
  }));
  $('#historyList').querySelectorAll('[data-download-workout-pack]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadWorkoutPack);
    if (!session) return toast('Session could not be found');
    try {
      await downloadWorkoutCoachPack(session);
      toast('Full workout Coach Pack ZIP downloaded');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not create the workout Coach Pack');
    }
  }));
  $('#historyList').querySelectorAll('[data-download-workout-md]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadWorkoutMd);
    if (!session) return toast('Session could not be found');
    await downloadWorkoutMarkdown(session);
    toast('Workout Markdown downloaded');
  }));
  $('#historyList').querySelectorAll('[data-import-strength-analysis]').forEach(button => button.addEventListener('click', () => {
    state.pendingStrengthAnalysisSessionId = button.dataset.importStrengthAnalysis;
    $('#strengthAnalysisInput').click();
  }));
  $('#historyList').querySelectorAll('[data-confirm-strength-hr]').forEach(button => button.addEventListener('click', () => {
    confirmStrengthHrEvidence(button.dataset.confirmStrengthHr).catch(error => {
      console.error(error);
      toast(error.message || 'Could not confirm workout HR evidence');
    });
  }));
  $('#historyList').querySelectorAll('[data-apply-strength-corrections]').forEach(button => button.addEventListener('click', () => {
    applyStrengthAnalysisCorrections(button.dataset.applyStrengthCorrections).catch(error => {
      console.error(error);
      toast(error.message || 'Could not apply the strength corrections');
    });
  }));
  $('#historyList').querySelectorAll('[data-download-liss-md]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadLissMd);
    if (!session) return toast('LISS session could not be found');
    const media = await sessionMedia(session.id);
    downloadBlob(lissMarkdownFor(session, media), lissMarkdownFilename(session), 'text/markdown;charset=utf-8');
    toast('LISS Markdown downloaded');
  }));
  $('#historyList').querySelectorAll('[data-download-liss-pack]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.downloadLissPack);
    if (!session) return toast('LISS session could not be found');
    try {
      await downloadLissCoachPack(session);
      toast('Full LISS Coach Pack ZIP downloaded');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not create the LISS Coach Pack');
    }
  }));
  $('#historyList').querySelectorAll('[data-share-liss-pack]').forEach(button => button.addEventListener('click', async () => {
    const session = state.sessions.find(item => item.id === button.dataset.shareLissPack);
    if (!session) return toast('LISS session could not be found');
    try {
      const result = await shareLissCoachPack(session);
      if (result === 'shared') toast('Full LISS Coach Pack shared');
      if (result === 'downloaded') toast('Full Coach Pack ZIP downloaded');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not share the LISS Coach Pack');
    }
  }));
  $('#historyList').querySelectorAll('[data-import-liss-analysis]').forEach(button => button.addEventListener('click', () => {
    state.pendingLissAnalysisSessionId = button.dataset.importLissAnalysis;
    $('#lissAnalysisInput').click();
  }));
  $('#historyList').querySelectorAll('[data-liss-conflict-action]').forEach(button => button.addEventListener('click', () => {
    resolveLissEvidenceConflict(button.dataset.sessionId, button.dataset.conflictId, button.dataset.lissConflictAction).catch(error => {
      console.error(error);
      toast(error.message || 'Could not save the conflict decision');
    });
  }));
  $('#historyList').querySelectorAll('[data-liss-source-action]').forEach(button => button.addEventListener('click', () => {
    resolveLissSourceImageOnly(button.dataset.sessionId, button.dataset.source).catch(error => {
      console.error(error);
      toast(error.message || 'Could not confirm the source values');
    });
  }));
  $('#historyList').querySelectorAll('[data-liss-role-action]').forEach(button => button.addEventListener('click', () => {
    resolveLissMediaRoleSuggestion(button.dataset.sessionId, button.dataset.roleSuggestionId).catch(error => {
      console.error(error);
      toast(error.message || 'Could not apply the image-role suggestion');
    });
  }));
  $('#historyList').querySelectorAll('[data-liss-activity-action]').forEach(button => button.addEventListener('click', () => {
    resolveLissActivitySuggestion(button.dataset.sessionId, button.dataset.lissActivityAction).catch(error => {
      console.error(error);
      toast(error.message || 'Could not save the activity decision');
    });
  }));
}


function historyAnchorExercise(exerciseName) {
  const key = nameKey(exerciseName);
  for (const session of state.sessions) {
    const match = (session.exercises || []).find(item => nameKey(item.name) === key);
    if (match) return match;
  }
  return null;
}

function historyForExercise(exerciseName) {
  const anchor = historyAnchorExercise(exerciseName);
  if (!anchor) return [];
  return state.sessions.flatMap(session => {
    const exercise = (session.exercises || []).map(item => ({ item, compatibility: exerciseCompatibility(item, anchor) }))
      .find(row => row.compatibility.compatible)?.item;
    return exercise ? [{ session, exercise }] : [];
  }).sort((a, b) => String(b.session.completedAt || b.session.date).localeCompare(String(a.session.completedAt || a.session.date)));
}

function renderHistoryAudit() {
  const node = $('#historyAudit');
  const select = $('#progressExerciseSelect');
  if (!node || !select?.value) return;
  const anchor = historyAnchorExercise(select.value);
  if (!anchor) { node.innerHTML = '<div class="empty-state compact-empty">No exercise identity available.</div>'; return; }
  const audit = historyAuditForExercise(state.sessions, anchor, { limit: 10 });
  const included = audit.included.length ? audit.included.map(row => `<div class="analytics-row"><div><strong>${escapeHtml(row.date || 'Unknown date')}</strong><small>${escapeHtml(row.sessionType || '')} · ${escapeHtml(row.exerciseName || '')}</small></div><small>${escapeHtml(row.level)} · ${escapeHtml(row.reason)}</small></div>`).join('') : '<div class="empty-state compact-empty">No compatible prior sessions found.</div>';
  const excluded = audit.excluded.length ? `<details><summary>Excluded / review variants (${audit.excluded.length})</summary>${audit.excluded.map(row => `<div class="analytics-row"><div><strong>${escapeHtml(row.date || 'Unknown date')}</strong><small>${escapeHtml(row.exerciseName || '')}</small><small>${escapeHtml(row.reason)}</small></div><button class="text-button" type="button" data-link-comparison-session="${escapeHtml(row.sessionId)}" data-link-comparison-name="${escapeHtml(row.exerciseName || '')}">Confirm equivalent</button></div>`).join('')}</details>` : '';
  node.innerHTML = `<div class="identity-audit"><p><strong>Comparison stream</strong><br><code>${escapeHtml(audit.comparisonStreamId)}</code></p><p class="metric-footnote">The same stream now drives previous-session weights, progression charts, PB/e1RM comparisons and Metrics. Only use Confirm equivalent when the machine/load convention really is comparable.</p>${included}${excluded}</div>`;
  node.querySelectorAll('[data-link-comparison-session]').forEach(button => button.addEventListener('click', async () => {
    const ok = window.confirm(`Link ${button.dataset.linkComparisonName} to the selected exercise comparison stream? Only do this when the movement and load convention are genuinely comparable.`);
    if (!ok) return;
    await confirmExerciseComparisonEquivalence(button.dataset.linkComparisonSession, button.dataset.linkComparisonName, audit.comparisonStreamId);
  }));
}

async function confirmExerciseComparisonEquivalence(sessionId, exerciseName, comparisonStreamId) {
  const session = state.sessions.find(row => row.id === sessionId) || await db.get('sessions', sessionId);
  const exercise = (session?.exercises || []).find(row => row.name === exerciseName);
  if (!session || !exercise) return toast('The historical exercise could not be found');
  exercise.comparisonStreamId = comparisonStreamId;
  exercise.comparisonStreamConfirmedAt = new Date().toISOString();
  exercise.comparisonStreamSource = 'user-confirmed';
  await db.put('sessions', session);
  if (exercise.sourceExerciseId) {
    const library = state.exercises.find(row => row.id === exercise.sourceExerciseId);
    if (library) await db.put('exercises', { ...library, comparisonStreamId, comparisonStreamConfirmedAt: exercise.comparisonStreamConfirmedAt, comparisonStreamSource: 'user-confirmed' });
    for (const template of state.templates) {
      let changed = false;
      for (const item of template.exercises || []) if ((item.sourceExerciseId || item.id) === exercise.sourceExerciseId) { item.comparisonStreamId = comparisonStreamId; changed = true; }
      if (changed) await db.put('templates', template);
    }
  }
  await refreshState(); renderAll(); showScreen('history'); toast('Exercise comparison stream linked');
}

function progressSparkline(points) {
  if (points.length < 2) return '<div class="empty-state compact-empty">More sessions are needed for a trend.</div>';
  const values = points.map(point => point.value);
  const min = Math.min(...values); const max = Math.max(...values);
  const scale = max === min ? 1 : max - min;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 46 - ((point.value - min) / scale) * 40;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="progress-sparkline" viewBox="0 0 100 52" preserveAspectRatio="none" role="img" aria-label="Estimated one rep max trend"><polyline points="${coords}"></polyline></svg>`;
}

function renderExerciseProgress() {
  const select = $('#progressExerciseSelect');
  if (!select) return;
  const names = [...new Set(state.sessions.flatMap(session => session.exercises?.map(exercise => exercise.name) || []))]
    .sort((a, b) => a.localeCompare(b, 'en-GB'));
  const current = select.value || names[0] || '';
  select.innerHTML = names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (names.includes(current)) select.value = current;
  const history = historyForExercise(select.value);
  const node = $('#exerciseProgress');
  if (!history.length) {
    node.innerHTML = '<div class="empty-state">Import training history or save a session to see exercise progress.</div>';
    return;
  }
  const workSets = history.flatMap(entry => entry.exercise.sets.filter(set => set.setType !== 'Warm-up').map(set => ({ ...set, date: entry.session.date })));
  const best = workSets.reduce((top, set) => estimated1RM(set.weightKg, set.reps) > estimated1RM(top?.weightKg, top?.reps) ? set : top, null);
  const latest = history[0];
  const trend = history.slice(0, 10).reverse().map(entry => ({
    date: entry.session.date,
    value: Math.max(0, ...entry.exercise.sets.filter(set => set.setType !== 'Warm-up').map(set => estimated1RM(set.weightKg, set.reps)))
  })).filter(point => point.value > 0);
  node.innerHTML = `
    <div class="progress-metrics">
      <div><span>Sessions</span><strong>${history.length}</strong></div>
      <div><span>Latest</span><strong>${localDateLabel(latest.session.date)}</strong></div>
      <div><span>Best e1RM</span><strong>${best ? `${fmt(estimated1RM(best.weightKg, best.reps), 1)} kg` : '–'}</strong></div>
      <div><span>Best set</span><strong>${best ? `${fmt(best.weightKg, 2)} × ${best.reps}` : '–'}</strong></div>
    </div>
    ${progressSparkline(trend)}
    <div class="progress-recent">${history.slice(0, 5).map(entry => {
      const sets = entry.exercise.sets.filter(set => set.setType !== 'Warm-up').map(set => `${fmt(set.weightKg, 2)} kg × ${set.reps}${set.rpe ? ` @ ${set.rpe}` : ''}`).join(' · ');
      return `<div class="list-item"><div><h4>${localDateLabel(entry.session.date)}</h4><p>${escapeHtml(entry.session.sessionType)}</p></div><strong>${sets || 'No work sets'}</strong></div>`;
    }).join('')}</div>`;
}

function defaultSetsForExercise(exerciseOrName) {
  const previous = findPreviousExercise(exerciseOrName);
  const previousWork = previous?.exercise.sets.filter(set => set.setType !== 'Warm-up').at(-1);
  return [
    { id: uid(), setType: 'Warm-up', setNumber: 1, weightKg: previousWork ? Math.max(0, Math.round(previousWork.weightKg * 0.55 * 4) / 4) : 0, reps: 12, rpe: 4, failure: false, holdSeconds: 0, notes: '' },
    { id: uid(), setType: 'Work', setNumber: 2, weightKg: previousWork?.weightKg || 0, reps: previousWork?.reps || 8, rpe: previousWork?.rpe || 8, failure: false, holdSeconds: 0, notes: '' }
  ];
}

async function addExerciseToCurrentSession(exercise, updateTemplate = false) {
  if (!state.currentSession) return toast('Start a workout first');
  state.currentSession.exercises.push({
    id: uid(), sourceExerciseId: exercise.id, name: exercise.name, aliases: [...new Set(exercise.aliases || [])],
    machineBrand: exercise.machineBrand || '', machineModel: exercise.machineModel || '', nickname: exercise.nickname || '', variation: exercise.variation || '', movementPattern: exercise.movementPattern || '',
    coreExercise: exercise.coreExercise || exercise.name || '', nicknameAlias: exercise.nicknameAlias || '', grip: exercise.grip || '', stance: exercise.stance || '', unilateral: exercise.unilateral ?? null, loadConvention: exercise.loadConvention || '', comparisonStreamId: exercise.comparisonStreamId || '', temporarySubstitution: false,
    lineNumber: state.currentSession.exercises.length + 1, notes: exercise.notes || '', persistToTemplate: Boolean(updateTemplate),
    sets: defaultSetsForExercise(exercise)
  });
  if (updateTemplate) {
    const template = state.templates.find(item => item.id === state.currentSession.templateId);
    if (template && !template.exercises.some(item => nameKey(item.name) === exercise.nameKey)) {
      template.exercises.push({ id: exercise.id, sourceExerciseId: exercise.id, name: exercise.name, aliases: [...new Set(exercise.aliases || [])], machineBrand: exercise.machineBrand || '', machineModel: exercise.machineModel || '', nickname: exercise.nickname || '', variation: exercise.variation || '', movementPattern: exercise.movementPattern || '', coreExercise: exercise.coreExercise || exercise.name || '', nicknameAlias: exercise.nicknameAlias || '', grip: exercise.grip || '', stance: exercise.stance || '', unilateral: exercise.unilateral ?? null, loadConvention: exercise.loadConvention || '', comparisonStreamId: exercise.comparisonStreamId || '', notes: exercise.notes || '', sets: defaultSetsForExercise(exercise).map(({ id, ...set }) => set) });
      await db.put('templates', template);
    }
  }
  persistDraft(); renderAll(); $('#exerciseDialog')?.close(); toast(`${exercise.name} added`);
}

async function removeExerciseFromCurrentSession(exerciseId, removeFromTemplate = false) {
  if (!state.currentSession || isLissSession(state.currentSession)) return;
  const exercise = state.currentSession.exercises.find(item => item.id === exerciseId);
  if (!exercise) return;
  const hasLoggedData = (exercise.sets || []).some(set => Number(set.weightKg) > 0 || Number(set.reps) > 0 || Number(set.rpe) > 0 || set.failure || (set.notes || '').trim()) || (exercise.notes || '').trim();
  if (hasLoggedData && !window.confirm(`Remove ${exercise.name} and its logged sets from today's workout?`)) return;

  state.currentSession.exercises = state.currentSession.exercises.filter(item => item.id !== exerciseId);
  state.currentSession.exercises.forEach((item, itemIndex) => { item.lineNumber = itemIndex + 1; });

  if (removeFromTemplate) {
    const template = state.templates.find(item => item.id === state.currentSession.templateId);
    if (template) {
      template.exercises = (template.exercises || []).filter(item =>
        item.id !== exercise.sourceExerciseId &&
        item.sourceExerciseId !== exercise.sourceExerciseId &&
        nameKey(item.name) !== nameKey(exercise.name)
      );
      await db.put('templates', template);
    }
  }

  persistDraft();
  renderWorkout();
  renderRemoveExerciseDialog();
  toast(`${exercise.name} removed${removeFromTemplate ? ' from today and the template' : ' from today'}`);
}

function renderRemoveExerciseDialog() {
  const list = $('#removeExerciseList');
  if (!list) return;
  const exercises = state.currentSession?.exercises || [];
  list.innerHTML = exercises.length ? exercises.map(exercise => `
    <button class="exercise-picker-item remove-picker-item" type="button" data-remove-current-exercise="${escapeHtml(exercise.id)}">
      <span><strong>${escapeHtml(exercise.name)}</strong><small>${(exercise.sets || []).length} sets currently loaded</small></span>
      <span>−</span>
    </button>`).join('') : '<div class="empty-state">No exercises remain in this workout.</div>';
  list.querySelectorAll('[data-remove-current-exercise]').forEach(button => button.addEventListener('click', async () => {
    await removeExerciseFromCurrentSession(button.dataset.removeCurrentExercise, $('#removeFromTemplateCheckbox')?.checked);
    if (!state.currentSession?.exercises?.length) $('#removeExerciseDialog')?.close();
  }));
}

function openRemoveExerciseDialog() {
  if (!state.currentSession || isLissSession(state.currentSession)) return toast('Start a strength workout first');
  $('#removeFromTemplateCheckbox').checked = false;
  renderRemoveExerciseDialog();
  $('#removeExerciseDialog').showModal();
}


function renderReplaceExercisePicker() {
  if (!replaceExerciseTargetId || !state.currentSession) return;
  const target = state.currentSession.exercises.find(item => item.id === replaceExerciseTargetId);
  const list = $('#replaceExercisePickerList');
  if (!target || !list) return;
  const search = nameKey($('#replaceExerciseSearch')?.value || '');
  const workoutFilter = $('#replaceExerciseWorkoutFilter')?.value || '';
  const filtered = state.exercises.filter(exercise =>
    exercise.id !== target.sourceExerciseId &&
    (!search || nameKey(`${exercise.name} ${exercise.bodyGroup || ''} ${exercise.equipment || ''}`).includes(search)) &&
    (!workoutFilter || search || exercise.workoutType === workoutFilter)
  ).slice(0, 120);
  list.innerHTML = filtered.length ? filtered.map(exercise => `
    <button class="exercise-picker-item" type="button" data-replacement-exercise-id="${escapeHtml(exercise.id)}">
      <span><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.bodyGroup || 'Unclassified')} · ${escapeHtml(exercise.equipment || 'Equipment not set')}</small></span>
      <span>↺</span>
    </button>`).join('') : '<div class="empty-state">No matching replacement exercise.</div>';
  list.querySelectorAll('[data-replacement-exercise-id]').forEach(button => button.addEventListener('click', async () => {
    const replacement = state.exercises.find(item => item.id === button.dataset.replacementExerciseId);
    if (replacement) await replaceExerciseForCurrentSession(replaceExerciseTargetId, replacement);
  }));
}

function openReplaceExerciseDialog(exerciseId) {
  if (!state.currentSession || isLissSession(state.currentSession) || isRecoverySession(state.currentSession)) return toast('Start a strength workout first');
  const target = state.currentSession.exercises.find(item => item.id === exerciseId);
  if (!target) return;
  replaceExerciseTargetId = exerciseId;
  $('#replaceExercisePrompt').textContent = `Replace ${target.name} for this session only. The normal routine will return next time.`;
  const filter = $('#replaceExerciseWorkoutFilter');
  const workoutTypes = [...new Set(state.exercises.map(item => item.workoutType).filter(Boolean))].sort();
  filter.innerHTML = '<option value="">All workout types</option>' + workoutTypes.map(item => `<option>${escapeHtml(item)}</option>`).join('');
  const baseType = state.currentSession.sessionType.split(' - ')[0];
  if (workoutTypes.includes(baseType)) filter.value = baseType;
  $('#replaceExerciseSearch').value = '';
  renderReplaceExercisePicker();
  $('#replaceExerciseDialog').showModal();
}

async function replaceExerciseForCurrentSession(targetId, replacement) {
  const session = state.currentSession;
  const index = session?.exercises?.findIndex(item => item.id === targetId) ?? -1;
  if (index < 0 || !replacement) return;
  const target = session.exercises[index];
  const hasMeaningfulLoggedData = (target.sets || []).some(set => Number(set.weightKg || 0) > 0 || Number(set.reps || 0) > 0 || set.failure || (set.notes || '').trim());
  if (hasMeaningfulLoggedData && !window.confirm(`Change ${target.name} to ${replacement.name} for today? The current set entries for ${target.name} will be replaced.`)) return;

  const priorSubstitution = target.sessionSubstitution || null;
  const originalSnapshot = priorSubstitution?.originalExerciseSnapshot || {
    sourceExerciseId: target.sourceExerciseId || null,
    name: target.name || '', aliases: structuredClone(target.aliases || []),
    machineBrand: target.machineBrand || '', machineModel: target.machineModel || '', nickname: target.nickname || '',
    variation: target.variation || '', movementPattern: target.movementPattern || '', coreExercise: target.coreExercise || target.name || '', nicknameAlias: target.nicknameAlias || '', grip: target.grip || '', stance: target.stance || '', unilateral: target.unilateral ?? null, loadConvention: target.loadConvention || '', comparisonStreamId: target.comparisonStreamId || '', notes: target.notes || ''
  };
  const replacementExercise = {
    id: target.id,
    sourceExerciseId: replacement.id,
    name: replacement.name,
    aliases: [...new Set(replacement.aliases || [])],
    machineBrand: replacement.machineBrand || '', machineModel: replacement.machineModel || '', nickname: replacement.nickname || '',
    variation: replacement.variation || '', movementPattern: replacement.movementPattern || '',
    coreExercise: replacement.coreExercise || replacement.name || '', nicknameAlias: replacement.nicknameAlias || '', grip: replacement.grip || '', stance: replacement.stance || '', unilateral: replacement.unilateral ?? null, loadConvention: replacement.loadConvention || '', comparisonStreamId: replacement.comparisonStreamId || canonicalExerciseIdentity(replacement), temporarySubstitution: true,
    lineNumber: target.lineNumber || index + 1,
    notes: replacement.notes || '',
    persistToTemplate: false,
    collapsed: false,
    repeatedFromSessionId: findPreviousExercise(replacement)?.session?.id || null,
    sets: defaultSetsForExercise(replacement),
    symptom: null,
    sessionSubstitution: {
      temporary: true,
      originalExerciseSnapshot: originalSnapshot,
      originalSourceExerciseId: originalSnapshot.sourceExerciseId || null,
      originalName: originalSnapshot.name || '',
      originalMachineBrand: originalSnapshot.machineBrand || '',
      originalMachineModel: originalSnapshot.machineModel || '',
      originalVariation: originalSnapshot.variation || '',
      replacementSourceExerciseId: replacement.id,
      replacementName: replacement.name,
      changedAt: new Date().toISOString()
    }
  };
  session.exercises.splice(index, 1, replacementExercise);
  persistDraft();
  $('#replaceExerciseDialog')?.close();
  replaceExerciseTargetId = null;
  renderWorkout();
  toast(`${replacement.name} substituted for today; the template was not changed`);
}

function renderExercisePicker() {
  const search=nameKey($('#exerciseSearch')?.value||''),workoutFilter=$('#exerciseWorkoutFilter')?.value||'',bodyFilter=$('#exerciseBodyGroupFilter')?.value||'',equipmentFilter=$('#exerciseEquipmentFilter')?.value||'';
  const filtered=state.exercises.filter(exercise=>(!search||nameKey(`${exercise.name} ${(exercise.aliases||[]).join(' ')} ${exercise.bodyGroup||''} ${exercise.equipment||''}`).includes(search))&&(!workoutFilter||search||exercise.workoutType===workoutFilter)&&(!bodyFilter||exercise.bodyGroup===bodyFilter)&&(!equipmentFilter||exercise.equipment===equipmentFilter)).slice(0,160);
  const list = $('#exercisePickerList');
  if (!list) return;
  list.innerHTML = filtered.length ? filtered.map(exercise => `
    <button class="exercise-picker-item" data-exercise-id="${escapeHtml(exercise.id)}">
      <span><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.bodyGroup || 'Unclassified')} · ${escapeHtml(exercise.equipment || 'Equipment not set')}</small></span>
      <span>+</span>
    </button>`).join('') : '<div class="empty-state">No matching exercise. Create it below.</div>';
  list.querySelectorAll('[data-exercise-id]').forEach(button => button.addEventListener('click', () => {
    const exercise = state.exercises.find(item => item.id === button.dataset.exerciseId);
    addExerciseToCurrentSession(exercise, $('#addToTemplateCheckbox')?.checked);
  }));
}

function openExerciseDialog() {
  if (!state.currentSession) return toast('Start a workout first');
  const filter=$('#exerciseWorkoutFilter'); const workoutTypes=[...new Set(state.exercises.map(item=>item.workoutType).filter(Boolean))].sort(); filter.innerHTML='<option value="">All workout types</option>'+workoutTypes.map(item=>`<option>${escapeHtml(item)}</option>`).join(''); const baseType=state.currentSession.sessionType.split(' - ')[0]; if(workoutTypes.includes(baseType))filter.value=baseType;
  const body=$('#exerciseBodyGroupFilter'),equipment=$('#exerciseEquipmentFilter'); if(body)body.innerHTML='<option value="">All muscle groups</option>'+[...new Set(state.exercises.map(item=>item.bodyGroup).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-GB')).map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join(''); if(equipment)equipment.innerHTML='<option value="">All equipment</option>'+[...new Set(state.exercises.map(item=>item.equipment).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-GB')).map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  $('#exerciseSearch').value=''; $('#newExerciseForm').reset(); renderExercisePicker(); $('#exerciseDialog').showModal();
}

function renderWorkbookPreview() {
  const node = $('#workbookImportPreview');
  const data = state.pendingWorkbookImport;
  if (!node) return;
  if (!data) { node.innerHTML = '<div class="empty-state">Choose the VANTAGE workbook to inspect it locally.</div>'; return; }
  const summary = data.summary;
  node.innerHTML = `
    <div class="import-summary">
      <div><span>Sessions</span><strong>${summary.sessions}</strong></div>
      <div><span>Sets</span><strong>${summary.setRows}</strong></div>
      <div><span>Exercises</span><strong>${summary.exercises}</strong></div>
      <div><span>Templates</span><strong>${summary.templates}</strong></div>
      <div><span>Nutrition days</span><strong>${summary.nutritionDays}</strong></div>
    </div>
    <p><strong>${escapeHtml(data.fileName)}</strong> is ready to import.</p>
    ${data.warnings.map(warning => `<p class="import-warning">${escapeHtml(warning)}</p>`).join('')}`;
  $('#applyWorkbookImportButton').hidden = false;
}

async function applyWorkbookImport() {
  const data = state.pendingWorkbookImport;
  if (!data) return;
  const replace = $('#replaceTrainingDataCheckbox').checked;
  if (replace) {
    for (const store of ['sessions', 'templates', 'exercises', 'nutritionDays', 'sessionMedia']) await db.clear(store);
    state.currentSession = null; persistDraft();
  }
  await db.putMany('exercises', data.exercises);
  const systemTemplates = templates.filter(item => ['liss', 'recovery'].includes(item.id) && !data.templates.some(existing => existing.id === item.id));
  await db.putMany('templates', [...data.templates, ...systemTemplates]);
  await db.putMany('sessions', data.sessions);
  await db.putMany('nutritionDays', data.nutritionDays);
  await db.put('settings', { key: 'lastWorkbookImport', value: { importedAt: data.importedAt, fileName: data.fileName, summary: data.summary } });
  state.pendingWorkbookImport = null;
  $('#workbookInput').value = '';
  $('#applyWorkbookImportButton').hidden = true;
  await refreshState(); renderAll(); showScreen('history');
  toast(`Imported ${data.summary.sessions} sessions and ${data.summary.exercises} exercises`);
}

function mealTotalsForDate(date) {
  return state.meals.filter(item => item.date === date).reduce((sum, meal) => ({
    protein: sum.protein + Number(meal.protein || 0), carbs: sum.carbs + Number(meal.carbs || 0),
    fat: sum.fat + Number(meal.fat || 0), calories: sum.calories + Number(meal.calories || 0)
  }), { protein: 0, carbs: 0, fat: 0, calories: 0 });
}

function buildCoachPack(context, question) {
  const date = today();
  const vitals = latestVitals();
  const readiness = vitals ? calculateReadiness(vitals) : null;
  const meals = state.meals.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const nutritionSummary = state.nutritionDays.find(item => item.date === date) || null;
  const recoveryLogs = state.recoveryLogs.filter(item => item.date === date);
  const currentWorkout = state.currentSession ? {
    sessionType: state.currentSession.sessionType, mode: state.currentSession.mode, notes: state.currentSession.notes,
    totals: sessionTotals(state.currentSession),
    cardio: state.currentSession.cardio || null,
    exercises: (state.currentSession.exercises || []).map(exercise => ({
      name: exercise.name, notes: exercise.notes,
      sets: exercise.sets.map(set => ({ setType: set.setType, weightKg: set.weightKg, reps: set.reps, rpe: set.rpe, failure: set.failure, holdSeconds: set.holdSeconds, notes: set.notes }))
    }))
  } : null;
  const metricsSnapshot = (context === 'metrics' || context === 'general') ? {
    range: state.metricsRange,
    overview: metricsOverview(state.sessions, state.exercises, state.metricsRange, metricsEndDate()),
    selectedExercise: state.metricsExercise,
    strength: buildExerciseProgress(state.sessions, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula),
    muscleDistribution: muscleDistribution(state.sessions, state.exercises, state.metricsRange, metricsEndDate()),
    nutrition: nutritionWeightSummary(state.vitals, state.nutritionDays, state.meals, state.bodyMeasurements, state.metricsRange, metricsEndDate()),
    fuelPerformance: nutritionSessionPerformanceAnalysis(state.sessions, state.meals, state.nutritionDays, state.metricsFuelSessionFamily, state.metricsRange, metricsEndDate(), state.metricsFormula, state.metricsFuelWindow, state.metricsFuelOutput),
    cycles: cyclePerformanceSummary(state.sessions, state.exercises, state.trainingCycles, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula),
    supplementComparison: supplementPerformanceComparison(state.sessions, state.supplements, state.supplementEvents, state.metricsSupplementId, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula),
    readinessAlignment: readinessAlignment(state.sessions, state.metricsRange, metricsEndDate())
  } : undefined;
  const payload = {
    packVersion: 1, app: 'VANTAGE Training Console', generatedAt: new Date().toISOString(), context,
    profile: state.profile ? { ...state.profile } : null,
    question: cleanCoachQuestion(question), date,
    standingRules: [
      'Food weights for meat, fish, chicken, beef, rice, potato and sweet potato are cooked unless explicitly stated otherwise.',
      'Blood pressure can override a green NOOP readiness result.',
      'Preserve exercise-specific history; do not compare loads across different machines as equivalent.'
    ],
    vitals, readiness, currentWorkout,
    meals, mealTotals: mealTotalsForDate(date), importedDailyNutrition: nutritionSummary,
    recoveryLogs, actualDayActions: actualActionsForDate(date),
    activeTrainingCycles: cycleContextSnapshot(date),
    activeSupplements: supplementContextSnapshot(date),
    supplementLibrary: context === 'supplements' || context === 'general' ? state.supplements.map(item => ({ ...item, photo: undefined })) : undefined,
    recentSessions: state.sessions.slice(0, 4).map(session => ({ date: session.date, sessionType: session.sessionType, mode: session.mode, totals: sessionTotals(session), cardio: session.cardio || null, notes: session.notes })),
    bloodwork: context === 'biolab' || context === 'general' ? { latestTest: state.bloodTests[0] || null, latestAnalysis: state.bloodAnalyses[0] || null, testCount: state.bloodTests.length } : undefined,
    metrics: metricsSnapshot
  };
  return `VANTAGE COACH PACK\n\nQuestion: ${payload.question || 'Review the attached VANTAGE data and give direct feedback.'}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function cleanCoachQuestion(value) { return String(value || '').trim(); }

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea'); textarea.value = text; document.body.appendChild(textarea); textarea.select();
  document.execCommand('copy'); textarea.remove();
}

function openCoachDialog(context) {
  state.coachContext = context;
  $('#coachContextLabel').textContent = ({ meals: 'Today’s meals and macros', workout: 'Current workout', readiness: 'Readiness and training decision', recovery: 'Recovery actions and physiological stressors', supplements: 'Supplement and TRT context', biolab: 'Bloodwork and BioLab trends', metrics: 'Training analytics and progression', general: 'Full daily review' })[context] || 'Full daily review';
  $('#coachQuestion').value = '';
  $('#coachDialog').showModal();
}

async function shareCoachPack(useShareSheet) {
  const text = buildCoachPack(state.coachContext, $('#coachQuestion').value);
  if (useShareSheet && navigator.share) {
    try { await navigator.share({ title: 'VANTAGE Coach Pack', text }); $('#coachDialog').close(); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  await copyText(text); $('#coachDialog').close(); toast('Coach Pack copied — paste it into the VANTAGE Coach thread');
}

function bloodAnalysisForTest(test) {
  return state.bloodAnalyses.find(item => item.bloodTestId === test?.id)
    || state.bloodAnalyses.find(item => item.date === test?.date)
    || null;
}

function markerStatusCounts(test) {
  return (test?.markers || []).reduce((counts, marker) => {
    const status = marker.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function attentionMarkerCount(test) {
  const counts = markerStatusCounts(test);
  return (counts.high || 0) + (counts.low || 0) + (counts['borderline-high'] || 0) + (counts['borderline-low'] || 0);
}

function bloodStatusLabel(status) {
  return ({
    low: 'Low', normal: 'In range', high: 'High',
    'borderline-low': 'Borderline low', 'borderline-high': 'Borderline high', unknown: 'No range'
  })[status] || 'Unknown';
}

function bloodOverallLabel(status) {
  return ({ green: 'Green', amber: 'Amber', red: 'Red', unknown: 'Not analysed' })[status] || 'Not analysed';
}

function formatMarkerValue(marker) {
  const value = marker?.value == null || marker?.value === '' ? '–' : marker.value;
  return `${escapeHtml(value)}${marker?.unit ? ` ${escapeHtml(marker.unit)}` : ''}`;
}

function formatReferenceRange(marker) {
  const low = marker.referenceLow;
  const high = marker.referenceHigh;
  if (low == null && high == null) return 'Lab range not supplied';
  if (low != null && high != null) return `${low}–${high} ${marker.unit || ''}`.trim();
  if (low != null) return `≥ ${low} ${marker.unit || ''}`.trim();
  return `≤ ${high} ${marker.unit || ''}`.trim();
}

function testContextSummary(test) {
  const context = test?.context || {};
  return [
    test?.fasted == null ? null : (test.fasted ? 'Fasted' : 'Not fasted'),
    context.collectionTime ? `Collected ${context.collectionTime}` : null,
    context.trtProtocolAtTime ? `TRT: ${context.trtProtocolAtTime}` : null,
    context.daysSinceLastTRTInjection != null ? `${context.daysSinceLastTRTInjection} days since TRT dose` : null,
    context.trainingWithin48h == null ? null : (context.trainingWithin48h ? 'Training within 48 h' : 'No training within 48 h'),
    context.saunaWithin48h == null ? null : (context.saunaWithin48h ? 'Sauna within 48 h' : 'No sauna within 48 h')
  ].filter(Boolean);
}

function renderMarkerRows(test) {
  const groups = new Map();
  for (const marker of test.markers || []) {
    const group = marker.group || 'Other / ungrouped';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(marker);
  }
  return [...groups.entries()].map(([group, markers]) => `
    <section class="blood-marker-group">
      <h4>${escapeHtml(group)}</h4>
      <div class="blood-marker-table">
        ${markers.map(marker => `
          <div class="blood-marker-row">
            <div>
              <strong>${escapeHtml(marker.name)}</strong>
              <small>${escapeHtml(formatReferenceRange(marker))}${marker.sourceNote ? ` · ${escapeHtml(marker.sourceNote)}` : ''}</small>
            </div>
            <div class="blood-marker-result">
              <strong>${formatMarkerValue(marker)}</strong>
              <span class="blood-status blood-status-${escapeHtml(marker.status || 'unknown')}">${escapeHtml(bloodStatusLabel(marker.status))}</span>
            </div>
          </div>`).join('')}
      </div>
    </section>`).join('');
}

function renderBloodAnalysis(analysis) {
  if (!analysis) return '<div class="empty-state compact-empty">No imported Alex analysis for this panel yet.</div>';
  const alerts = analysis.alerts || [];
  const supports = analysis.supportSuggestions || [];
  const questions = analysis.questionsForClinician || [];
  return `
    <div class="blood-analysis-card blood-overall-${escapeHtml(analysis.overallStatus)}">
      <div class="blood-analysis-heading"><span class="blood-overall-badge">${escapeHtml(bloodOverallLabel(analysis.overallStatus))}</span><strong>Imported analysis</strong></div>
      <p>${escapeHtml(analysis.summary || 'Analysis imported without a written summary.')}</p>
      ${alerts.length ? `<div class="blood-analysis-section"><h4>Alerts and watch items</h4>${alerts.map(alert => `<div class="blood-alert blood-alert-${escapeHtml(alert.level)}"><strong>${escapeHtml(alert.marker || alert.finding || 'Finding')}</strong><p>${escapeHtml(alert.finding)}</p>${alert.possibleContext ? `<small>Context: ${escapeHtml(alert.possibleContext)}</small>` : ''}${alert.recommendation ? `<small>Action: ${escapeHtml(alert.recommendation)}</small>` : ''}</div>`).join('')}</div>` : ''}
      ${supports.length ? `<div class="blood-analysis-section"><h4>Support suggestions</h4><ul>${supports.map(item => `<li><strong>${escapeHtml(item.target || item.suggestionType)}</strong>: ${escapeHtml(item.suggestion)}${item.safetyNote ? `<br><small>${escapeHtml(item.safetyNote)}</small>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${questions.length ? `<div class="blood-analysis-section"><h4>Questions for clinician</h4><ul>${questions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

function bloodTrendSvg(rows) {
  if (rows.length < 2) return '<div class="empty-state compact-empty">Two same-unit results are needed before a line can be drawn.</div>';
  const values = rows.map(item => item.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) { min -= 1; max += 1; }
  const spread = max - min;
  const coords = rows.map((row, index) => {
    const x = rows.length === 1 ? 50 : 5 + (index / (rows.length - 1)) * 90;
    const y = 48 - ((row.value - min) / spread) * 39;
    return { ...row, x, y };
  });
  return `<svg class="blood-trend-chart" viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label="Blood marker trend">
    <polyline points="${coords.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ')}"></polyline>
    ${coords.map(item => `<circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="1.8"></circle>`).join('')}
  </svg>`;
}

function renderBloodMarkerTrend() {
  const select = $('#bloodMarkerSelect');
  const node = $('#bloodMarkerTrend');
  if (!select || !node) return;
  const names = [...new Map(state.bloodTests.flatMap(test => (test.markers || []).map(marker => [markerNameKey(marker.name), marker.name]))).values()]
    .sort((a, b) => a.localeCompare(b, 'en-GB'));
  const previousSelection = select.value;
  select.innerHTML = names.length ? names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') : '<option value="">No markers imported</option>';
  if (names.includes(previousSelection)) select.value = previousSelection;
  const selected = select.value;
  if (!selected) { node.innerHTML = '<div class="empty-state">Import at least one bloodwork panel.</div>'; return; }
  const allRows = markerHistory(state.bloodTests, selected);
  if (!allRows.length) { node.innerHTML = '<div class="empty-state">No numeric values are available for this marker.</div>'; return; }
  const latestUnit = allRows.at(-1).unit;
  const rows = allRows.filter(item => item.unit === latestUnit);
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  const change = previous ? latest.value - previous.value : null;
  const percent = previous && previous.value !== 0 ? (change / Math.abs(previous.value)) * 100 : null;
  const omitted = allRows.length - rows.length;
  node.innerHTML = `
    <div class="blood-trend-summary">
      <div><span>Latest</span><strong>${fmt(latest.value, 3)} ${escapeHtml(latestUnit)}</strong></div>
      <div><span>Change</span><strong>${change == null ? '–' : `${change > 0 ? '+' : ''}${fmt(change, 3)}`}</strong></div>
      <div><span>Percent</span><strong>${percent == null ? '–' : `${percent > 0 ? '+' : ''}${fmt(percent, 1)}%`}</strong></div>
      <div><span>Same-unit results</span><strong>${rows.length}</strong></div>
    </div>
    ${bloodTrendSvg(rows)}
    <div class="blood-trend-table">${rows.slice().reverse().map(item => `<div class="list-item"><div><h4>${localDateLabel(item.date)}</h4><p>${escapeHtml(item.labName || item.source || 'Source not named')} · ${escapeHtml(bloodStatusLabel(item.status))}</p></div><strong>${fmt(item.value, 3)} ${escapeHtml(item.unit)}</strong></div>`).join('')}</div>
    ${omitted ? `<p class="medical-note">${omitted} result${omitted === 1 ? '' : 's'} in a different unit are preserved but not plotted with this series.</p>` : ''}`;
}

function renderBloodwork() {
  const summary = $('#bloodworkSummary');
  if (!summary) return;
  const latest = state.bloodTests[0] || null;
  const latestAnalysis = latest ? bloodAnalysisForTest(latest) : null;
  const totalMarkers = state.bloodTests.reduce((sum, test) => sum + (test.markers || []).length, 0);
  summary.innerHTML = [
    ['Latest test', latest ? localDateLabel(latest.date) : '–'],
    ['Panels', state.bloodTests.length],
    ['Stored markers', totalMarkers],
    ['Latest watch items', latest ? attentionMarkerCount(latest) : 0]
  ].map(([label, value]) => `<div class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  const latestNode = $('#bloodworkLatest');
  if (!latest) latestNode.innerHTML = '<div class="empty-state">Import a VANTAGE bloodwork Markdown file to begin BioLab tracking.</div>';
  else {
    const contexts = testContextSummary(latest);
    latestNode.innerHTML = `
      <div class="blood-latest-heading">
        <div><h3>${localDateLabel(latest.date)}</h3><p>${escapeHtml(latest.labName || latest.source || 'Source not named')} · ${(latest.markers || []).length} markers</p></div>
        <span class="blood-overall-badge blood-overall-${escapeHtml(latestAnalysis?.overallStatus || 'unknown')}">${escapeHtml(bloodOverallLabel(latestAnalysis?.overallStatus || 'unknown'))}</span>
      </div>
      ${contexts.length ? `<div class="blood-context-chips">${contexts.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
      ${latest.notes ? `<p class="blood-test-notes">${escapeHtml(latest.notes)}</p>` : ''}
      ${renderBloodAnalysis(latestAnalysis)}
      <div class="history-actions">
        <button class="button button-primary button-small" data-create-blood-analysis-pack="${escapeHtml(latest.id)}">Create Alex analysis pack</button>
        <button class="button button-ghost button-small" data-download-bloodwork="${escapeHtml(latest.id)}">Download bloodwork Markdown</button>
        ${latestAnalysis ? `<button class="button button-ghost button-small" data-download-blood-analysis="${escapeHtml(latestAnalysis.id)}">Download analysis</button>` : ''}
      </div>`;
  }

  const historyNode = $('#bloodworkList');
  historyNode.innerHTML = state.bloodTests.length ? state.bloodTests.map(test => {
    const counts = markerStatusCounts(test);
    const analysis = bloodAnalysisForTest(test);
    const flagged = attentionMarkerCount(test);
    return `<article class="history-card blood-test-card">
      <header><div><h3>${localDateLabel(test.date)}</h3><p>${escapeHtml(test.labName || test.source || 'Source not named')} · ${(test.markers || []).length} markers</p></div><strong>${flagged ? `${flagged} watch` : 'No flags'}</strong></header>
      <div class="blood-status-strip">
        <span class="blood-status blood-status-normal">${counts.normal || 0} in range</span>
        <span class="blood-status blood-status-high">${counts.high || 0} high</span>
        <span class="blood-status blood-status-low">${counts.low || 0} low</span>
        <span class="blood-status blood-status-unknown">${counts.unknown || 0} no range</span>
      </div>
      <details><summary>Open panel and marker detail</summary>
        ${renderMarkerRows(test)}
        ${renderBloodAnalysis(analysis)}
        <div class="history-actions">
          <button class="button button-primary button-small" data-create-blood-analysis-pack="${escapeHtml(test.id)}">Create Alex analysis pack</button>
          <button class="button button-ghost button-small" data-download-bloodwork="${escapeHtml(test.id)}">Download test</button>
          ${analysis ? `<button class="button button-ghost button-small" data-download-blood-analysis="${escapeHtml(analysis.id)}">Download analysis</button>` : ''}
          <button class="button button-danger button-small" data-delete-bloodwork="${escapeHtml(test.id)}">Delete panel</button>
        </div>
      </details>
    </article>`;
  }).join('') : '<div class="empty-state">No bloodwork panels stored.</div>';

  $$('[data-download-bloodwork]').forEach(button => button.addEventListener('click', () => {
    const test = state.bloodTests.find(item => item.id === button.dataset.downloadBloodwork);
    if (!test) return toast('Bloodwork panel not found');
    downloadBlob(test.originalMarkdown || createBloodworkMarkdown(test), bloodworkMarkdownFilename(test), 'text/markdown;charset=utf-8');
    toast('Bloodwork Markdown downloaded');
  }));
  $$('[data-download-blood-analysis]').forEach(button => button.addEventListener('click', () => {
    const analysis = state.bloodAnalyses.find(item => item.id === button.dataset.downloadBloodAnalysis);
    if (!analysis) return toast('Bloodwork analysis not found');
    downloadBlob(analysis.originalMarkdown || createBloodworkAnalysisMarkdown(analysis), bloodworkAnalysisFilename(analysis), 'text/markdown;charset=utf-8');
    toast('Bloodwork analysis downloaded');
  }));
  $$('[data-create-blood-analysis-pack]').forEach(button => button.addEventListener('click', () => {
    const test = state.bloodTests.find(item => item.id === button.dataset.createBloodAnalysisPack);
    if (!test) return toast('Bloodwork panel not found');
    downloadBlob(createBloodworkAnalysisRequest(test, state.bloodTests), `VANTAGE_Bloodwork_Analysis_Request_${test.date}.md`, 'text/markdown;charset=utf-8');
    toast('Alex bloodwork analysis pack downloaded');
  }));
  $$('[data-delete-bloodwork]').forEach(button => button.addEventListener('click', async () => {
    const test = state.bloodTests.find(item => item.id === button.dataset.deleteBloodwork);
    if (!test || !confirm(`Delete the ${localDateLabel(test.date)} bloodwork panel and its attached analysis?`)) return;
    const analyses = state.bloodAnalyses.filter(item => item.bloodTestId === test.id);
    for (const analysis of analyses) await db.remove('bloodAnalyses', analysis.id);
    await db.remove('bloodTests', test.id);
    await refreshState(); renderAll(); toast('Bloodwork panel deleted');
  }));
  renderBloodMarkerTrend();
}

async function importBloodworkFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('The bloodwork Markdown file is larger than 2 MB.');
  const test = parseBloodworkMarkdown(await file.text(), file.name);
  await db.put('bloodTests', test);
  await refreshState(); renderAll();
  $('#bloodworkImportStatus').innerHTML = `<div class="import-success"><strong>${escapeHtml(file.name)}</strong><p>${test.markers.length} markers stored for ${escapeHtml(test.date)}. Existing identical imports are safely replaced rather than duplicated.</p></div>`;
  showScreen('biolab');
  toast('Bloodwork panel imported');
}

async function importBloodAnalysisFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('The bloodwork analysis file is larger than 2 MB.');
  const analysis = parseBloodworkAnalysisMarkdown(await file.text(), file.name);
  let test = analysis.bloodTestId ? state.bloodTests.find(item => item.id === analysis.bloodTestId) : null;
  if (!test) test = state.bloodTests.find(item => item.date === analysis.date) || null;
  if (!test) throw new Error(`No stored bloodwork panel matches ${analysis.date}. Import the bloodwork file first.`);
  analysis.bloodTestId = test.id;
  analysis.id = `blood-analysis-${test.id}`;
  await db.put('bloodAnalyses', analysis);
  await refreshState(); renderAll();
  $('#bloodworkImportStatus').innerHTML = `<div class="import-success"><strong>${escapeHtml(file.name)}</strong><p>Analysis attached to the ${escapeHtml(test.date)} panel.</p></div>`;
  showScreen('biolab');
  toast('Bloodwork analysis imported');
}


function metricsEndDate() { return today(); }

function formatHours(totalSeconds) {
  const minutes = Math.round(Number(totalSeconds || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} m` : `${hours} h`;
}

function formatSigned(value, digits = 1, suffix = '') {
  if (value == null || !Number.isFinite(Number(value))) return '–';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}${suffix}`;
}

function chartEmpty(message) {
  return `<div class="chart-empty">${escapeHtml(message)}</div>`;
}

function svgLineChart(points, { valueKey = 'value', suffix = '', digits = 1, empty = 'More dated points are needed for this chart.' } = {}) {
  const usable = (points || []).filter(item => Number.isFinite(Number(item[valueKey])));
  if (usable.length < 2) return chartEmpty(empty);
  const width = 360, height = 180, left = 42, right = 12, top = 18, bottom = 28;
  const values = usable.map(item => Number(item[valueKey]));
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= Math.max(1, Math.abs(min) * .05); max += Math.max(1, Math.abs(max) * .05); }
  const pad = (max - min) * .08;
  min -= pad; max += pad;
  const x = index => left + index * (width - left - right) / Math.max(1, usable.length - 1);
  const y = value => top + (max - value) * (height - top - bottom) / (max - min);
  const path = usable.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(Number(item[valueKey])).toFixed(1)}`).join(' ');
  const grid = [0, .25, .5, .75, 1].map(step => {
    const py = top + step * (height - top - bottom);
    const label = (max - step * (max - min)).toFixed(digits);
    return `<line class="grid" x1="${left}" y1="${py}" x2="${width-right}" y2="${py}"></line><text class="axis-label" x="2" y="${py+3}">${escapeHtml(label)}${escapeHtml(suffix)}</text>`;
  }).join('');
  const labels = [0, Math.floor((usable.length - 1) / 2), usable.length - 1].filter((item, index, all) => all.indexOf(item) === index).map(index => `<text class="axis-label" text-anchor="${index === 0 ? 'start' : index === usable.length - 1 ? 'end' : 'middle'}" x="${x(index)}" y="${height-7}">${escapeHtml(String(usable[index].date || '').slice(5))}</text>`).join('');
  const dots = usable.map((item, index) => `<circle class="point" cx="${x(index)}" cy="${y(Number(item[valueKey]))}" r="3.4"><title>${escapeHtml(item.date)}: ${Number(item[valueKey]).toFixed(digits)}${escapeHtml(suffix)}</title></circle>`).join('');
  return `<svg class="metric-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Metric trend chart">${grid}<path class="series" d="${path}"></path>${dots}${labels}</svg>`;
}

function svgBarChart(points, { valueKey = 'volume', suffix = '', digits = 0, empty = 'More weekly data are needed for this chart.' } = {}) {
  const usable = (points || []).filter(item => Number.isFinite(Number(item[valueKey])));
  if (!usable.length) return chartEmpty(empty);
  const width = 360, height = 180, left = 38, right = 8, top = 18, bottom = 30;
  const values = usable.map(item => Number(item[valueKey]));
  const max = Math.max(1, ...values);
  const slot = (width - left - right) / usable.length;
  const barWidth = Math.max(4, Math.min(30, slot * .62));
  const grid = [0, .5, 1].map(step => {
    const py = top + step * (height - top - bottom);
    const label = (max - step * max).toFixed(digits);
    return `<line class="grid" x1="${left}" y1="${py}" x2="${width-right}" y2="${py}"></line><text class="axis-label" x="2" y="${py+3}">${escapeHtml(label)}${escapeHtml(suffix)}</text>`;
  }).join('');
  const bars = usable.map((item, index) => {
    const value = Number(item[valueKey]);
    const h = value / max * (height - top - bottom);
    const px = left + slot * index + (slot - barWidth) / 2;
    const py = height - bottom - h;
    return `<rect class="bar" x="${px}" y="${py}" width="${barWidth}" height="${h}" rx="3"><title>${escapeHtml(item.week || item.date || '')}: ${value.toFixed(digits)}${escapeHtml(suffix)}</title></rect>${(index === 0 || index === usable.length - 1 || index === Math.floor(usable.length/2)) ? `<text class="axis-label" text-anchor="middle" x="${px+barWidth/2}" y="${height-8}">${escapeHtml(String(item.week || item.date || '').slice(5))}</text>` : ''}`;
  }).join('');
  return `<svg class="metric-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly bar chart">${grid}${bars}</svg>`;
}

function weightCaloriesChart(weights, macros) {
  if ((weights || []).length < 2 && !(macros || []).length) return chartEmpty('Add more bodyweight and macro days to compare nutrition with weight.');
  const dates = [...new Set([...(weights || []).map(item => item.date), ...(macros || []).map(item => item.date)])].sort();
  const weightMap = new Map((weights || []).map(item => [item.date, item.value]));
  const calorieMap = new Map((macros || []).map(item => [item.date, item.calories]));
  const width = 360, height = 200, left = 42, right = 42, top = 25, bottom = 30;
  const weightValues = [...weightMap.values()].filter(Number.isFinite);
  const calorieValues = [...calorieMap.values()].filter(value => Number.isFinite(value) && value > 0);
  const wMin = weightValues.length ? Math.min(...weightValues) : 0;
  const wMax = weightValues.length ? Math.max(...weightValues) : 1;
  const cMax = calorieValues.length ? Math.max(...calorieValues) : 1;
  const x = index => left + index * (width-left-right) / Math.max(1, dates.length-1);
  const wy = value => top + ((wMax === wMin ? .5 : (wMax-value)/(wMax-wMin))) * (height-top-bottom);
  const cy = value => height-bottom - (value/cMax) * (height-top-bottom);
  const weightPoints = dates.map((date,index) => weightMap.has(date) ? { date,index,value: weightMap.get(date) } : null).filter(Boolean);
  const weightPath = weightPoints.map((item,index) => `${index ? 'L' : 'M'} ${x(item.index).toFixed(1)} ${wy(item.value).toFixed(1)}`).join(' ');
  const slot = (width-left-right)/Math.max(1,dates.length);
  const bars = dates.map((date,index) => {
    const value = calorieMap.get(date);
    if (!(value > 0)) return '';
    const h = height-bottom-cy(value);
    return `<rect class="bar secondary" opacity=".32" x="${left+index*slot+slot*.2}" y="${cy(value)}" width="${Math.max(2,slot*.6)}" height="${h}" rx="2"><title>${escapeHtml(date)}: ${Math.round(value)} kcal</title></rect>`;
  }).join('');
  const dots = weightPoints.map(item => `<circle class="point" cx="${x(item.index)}" cy="${wy(item.value)}" r="3.3"><title>${escapeHtml(item.date)}: ${item.value.toFixed(2)} kg</title></circle>`).join('');
  return `<svg class="metric-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight and calorie trend"><text class="axis-label" x="2" y="12">Weight kg</text><text class="axis-label" text-anchor="end" x="${width-2}" y="12">Calories</text>${bars}${weightPath ? `<path class="series" d="${weightPath}"></path>${dots}` : ''}<text class="axis-label" x="2" y="${top+5}">${weightValues.length ? wMax.toFixed(1) : ''}</text><text class="axis-label" x="2" y="${height-bottom}">${weightValues.length ? wMin.toFixed(1) : ''}</text><text class="axis-label" text-anchor="end" x="${width-2}" y="${top+5}">${calorieValues.length ? Math.round(cMax) : ''}</text>${[0, Math.floor((dates.length-1)/2), dates.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(index=>`<text class="axis-label" text-anchor="${index===0?'start':index===dates.length-1?'end':'middle'}" x="${x(index)}" y="${height-8}">${escapeHtml(String(dates[index]||'').slice(5))}</text>`).join('')}</svg>`;
}

function metricCards(items) {
  return items.map(([label, value, note]) => `<div class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`).join('');
}

function correlationMeaning(value) {
  if (value == null || !Number.isFinite(value)) return 'Insufficient data';
  const strength = Math.abs(value) >= .7 ? 'strong' : Math.abs(value) >= .4 ? 'moderate' : Math.abs(value) >= .2 ? 'weak' : 'minimal';
  const direction = value > .08 ? 'positive' : value < -.08 ? 'negative' : 'neutral';
  return `${strength} ${direction}`;
}

function svgScatterChart(rows, xKey, { xLabel = '', xSuffix = '', xDigits = 0, yKey = 'e1rm', yLabel = 'e1RM', ySuffix = ' kg', yDigits = 1 } = {}) {
  const usable = (rows || []).filter(item => Number.isFinite(Number(item[xKey])) && Number.isFinite(Number(item[yKey])));
  if (usable.length < 3) return chartEmpty('At least three matched workout and macro days are needed for this relationship chart.');
  const width = 360, height = 205, left = 46, right = 16, top = 20, bottom = 38;
  const xs = usable.map(item => Number(item[xKey]));
  const ys = usable.map(item => Number(item[yKey]));
  let xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const x = value => left + (value - xMin) * (width-left-right)/(xMax-xMin);
  const y = value => top + (yMax-value) * (height-top-bottom)/(yMax-yMin);
  const meanX = xs.reduce((a,b)=>a+b,0)/xs.length, meanY = ys.reduce((a,b)=>a+b,0)/ys.length;
  const denom = xs.reduce((sum,value)=>sum+(value-meanX)**2,0);
  const slope = denom ? xs.reduce((sum,value,index)=>sum+(value-meanX)*(ys[index]-meanY),0)/denom : 0;
  const intercept = meanY - slope*meanX;
  const dots = usable.map(item => `<circle class="scatter-dot${item.isPb ? ' pb' : ''}" cx="${x(item[xKey]).toFixed(1)}" cy="${y(item[yKey]).toFixed(1)}" r="${item.isPb ? 4.5 : 3.5}"><title>${escapeHtml(item.date)}: ${Number(item[xKey]).toFixed(xDigits)}${escapeHtml(xSuffix)} · ${escapeHtml(yLabel)} ${Number(item[yKey]).toFixed(yDigits)}${escapeHtml(ySuffix)}${item.isPb ? ' · PB' : ''}</title></circle>`).join('');
  const grid = [0,.5,1].map(step => { const py=top+step*(height-top-bottom); const val=(yMax-step*(yMax-yMin)).toFixed(yDigits); return `<line class="grid" x1="${left}" y1="${py}" x2="${width-right}" y2="${py}"></line><text class="axis-label" x="2" y="${py+3}">${val}${escapeHtml(ySuffix)}</text>`; }).join('');
  const xLabels = [xMin,(xMin+xMax)/2,xMax].map((value,index)=>`<text class="axis-label" text-anchor="${index===0?'start':index===2?'end':'middle'}" x="${x(value)}" y="${height-8}">${value.toFixed(xDigits)}${escapeHtml(xSuffix)}</text>`).join('');
  return `<svg class="metric-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Nutrition and performance relationship chart">${grid}<line class="trend-line" x1="${x(xMin)}" y1="${y(intercept+slope*xMin)}" x2="${x(xMax)}" y2="${y(intercept+slope*xMax)}"></line>${dots}${xLabels}<text class="axis-label" text-anchor="middle" x="${(left+width-right)/2}" y="${height-1}">${escapeHtml(xLabel)}</text></svg>`;
}

function renderMetricsSelectors() {
  const range = $('#metricsRangeSelect');
  const formula = $('#metricsFormulaSelect');
  if (range && range.value !== state.metricsRange) range.value = state.metricsRange;
  if (formula && formula.value !== state.metricsFormula) formula.value = state.metricsFormula;
  const names = exerciseNames(state.sessions);
  if (!names.includes(state.metricsExercise)) state.metricsExercise = names[0] || '';
  const select = $('#metricsExerciseSelect');
  if (select) {
    select.innerHTML = names.length ? names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('') : '<option value="">No strength exercises</option>';
    select.value = state.metricsExercise;
  }
  const fuelFamilies = strengthSessionFamilies(state.sessions, state.metricsRange, metricsEndDate());
  if (!fuelFamilies.some(item => item.key === state.metricsFuelSessionFamily)) state.metricsFuelSessionFamily = fuelFamilies[0]?.key || '';
  const fuelFamily = $('#metricsFuelSessionFamilySelect');
  if (fuelFamily) {
    fuelFamily.innerHTML = fuelFamilies.length ? fuelFamilies.map(item => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)} (${item.sessions})</option>`).join('') : '<option value="">No strength session families</option>';
    fuelFamily.value = state.metricsFuelSessionFamily;
  }
  const fuelWindow = $('#metricsFuelWindowSelect');
  if (fuelWindow) fuelWindow.value = state.metricsFuelWindow;
  const fuelMetric = $('#metricsFuelMetricSelect');
  if (fuelMetric) fuelMetric.value = state.metricsFuelMetric;
  const fuelOutput = $('#metricsFuelOutputSelect');
  if (fuelOutput) fuelOutput.value = state.metricsFuelOutput;
  const supplementSelect = $('#metricsSupplementSelect');
  if (supplementSelect) {
    if (!state.supplements.some(item => item.id === state.metricsSupplementId)) state.metricsSupplementId = state.supplements[0]?.id || '';
    supplementSelect.innerHTML = state.supplements.length ? state.supplements.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">No supplements recorded</option>';
    supplementSelect.value = state.metricsSupplementId;
  }
  $$('#metricsMuscleMode button').forEach(button => button.classList.toggle('active', button.dataset.muscleMode === state.metricsMuscleMode));
}

function renderStrengthMetrics() {
  const progress = buildExerciseProgress(state.sessions, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula);
  const first = progress.points[0];
  const change = progress.latest && first ? progress.latest.e1rm - first.e1rm : null;
  $('#metricsStrengthSummary').innerHTML = metricCards([
    ['Latest e1RM', progress.latest ? `${fmt(progress.latest.e1rm, 1)} kg` : '–'],
    ['Best e1RM', progress.best ? `${fmt(progress.best.e1rm, 1)} kg` : '–'],
    ['Period change', change != null ? formatSigned(change, 1, ' kg') : '–'],
    ['28-day projection', progress.projected28d ? `${fmt(progress.projected28d, 1)} kg` : '–']
  ]);
  $('#metricsStrengthChart').innerHTML = svgLineChart(progress.points, { valueKey: 'e1rm', suffix: ' kg', digits: 1, empty: 'Two saved sessions for this exercise are needed for a strength trend.' });
  $('#metricsStrengthHistory').innerHTML = progress.points.length ? [...progress.points].reverse().slice(0, 8).map(item => `<div class="analytics-row"><div><strong>${escapeHtml(localDateLabel(item.date))}</strong><small>${fmt(item.weightKg,1)} kg × ${fmt(item.reps)} · ${item.rpe != null ? `RPE ${fmt(item.rpe,1)}` : 'RPE not logged'}</small></div><div><strong>${fmt(item.e1rm,1)} kg</strong><small>e1RM</small></div></div>`).join('') : '<div class="empty-state">No matching exercise history in this period.</div>';
  return progress;
}

function renderTrainingLoadMetrics() {
  const weeks = weeklyTrainingLoad(state.sessions, state.exercises, state.metricsRange === '7d' ? '28d' : state.metricsRange, metricsEndDate());
  $('#metricsLoadChart').innerHTML = svgBarChart(weeks, { valueKey: 'volume', suffix: '', digits: 0, empty: 'No weekly loaded-set volume is available.' });
  $('#metricsLoadTable').innerHTML = weeks.length ? [...weeks].reverse().slice(0, 10).map(item => `<div class="analytics-row"><div><strong>Week of ${escapeHtml(item.week)}</strong><small>${item.strengthSessions} strength · ${item.cardioSessions} LISS · ${fmt(item.minutes)} min</small></div><div><strong>${fmt(item.volume)} kg</strong><small>${item.workSets} work sets · ${fmt(item.effectiveReps)} effective reps est.</small></div></div>`).join('') : '<div class="empty-state">No workload data in this period.</div>';
}

function renderMuscleMetrics() {
  const distribution = muscleDistribution(state.sessions, state.exercises, state.metricsRange, metricsEndDate());
  const mode = state.metricsMuscleMode;
  const max = Math.max(1, ...distribution.map(item => Number(item[mode] || 0)));
  const label = mode === 'volume' ? 'kg' : mode === 'effectiveReps' ? 'reps est.' : 'sets';
  $('#metricsMuscleChart').innerHTML = distribution.length ? distribution.slice(0, 12).map(item => `<div class="bar-row"><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, 100 * Number(item[mode] || 0) / max).toFixed(1)}%"></div></div><strong>${fmt(item[mode], mode === 'volume' ? 0 : 0)} ${label}</strong></div>`).join('') : '<div class="empty-state">No muscle-group data in this period.</div>';
  $('#metricsMuscleTable').innerHTML = distribution.length ? distribution.map(item => `<div class="analytics-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.hardSets} sets at RPE 8+ · ${fmt(item.effectiveReps)} effective reps est.</small></div><div><strong>${item.sets} sets</strong><small>${fmt(item.volume)} kg volume</small></div></div>`).join('') : '';
}

function renderHypertrophyMetrics() {
  const rows = flattenStrengthSets(state.sessions, state.exercises, state.metricsRange, metricsEndDate()).filter(item => !item.warmup);
  const overview = metricsOverview(state.sessions, state.exercises, state.metricsRange, metricsEndDate());
  const knownRpe = rows.filter(item => item.rpe != null);
  const lowStimulus = rows.filter(item => item.effectiveReps === 0).length;
  $('#metricsHypertrophySummary').innerHTML = metricCards([
    ['Work sets', String(overview.workSets)],
    ['Effective reps est.', fmt(overview.effectiveReps)],
    ['Average RIR', overview.avgRir != null ? fmt(overview.avgRir, 1) : '–'],
    ['Failure rate', `${fmt(overview.failureRate, 1)}%`],
    ['RPE 8+ sets', String(knownRpe.filter(item => item.rpe >= 8).length)],
    ['Low-stimulus est.', String(lowStimulus)]
  ]);
  const buckets = [
    ['Below 7', rows.filter(item => item.rpe != null && item.rpe < 7).length],
    ['7–7.9', rows.filter(item => item.rpe >= 7 && item.rpe < 8).length],
    ['8–8.9', rows.filter(item => item.rpe >= 8 && item.rpe < 9).length],
    ['9–9.4', rows.filter(item => item.rpe >= 9 && item.rpe < 9.5).length],
    ['9.5–10', rows.filter(item => item.rpe >= 9.5).length],
    ['Unknown', rows.filter(item => item.rpe == null).length]
  ];
  const max = Math.max(1, ...buckets.map(item => item[1]));
  $('#metricsRpeChart').innerHTML = rows.length ? buckets.map(([name,value]) => `<div class="bar-row"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1,100*value/max)}%"></div></div><strong>${value}</strong></div>`).join('') : '<div class="empty-state">Log RPE on work sets to analyse proximity to failure.</div>';
}

function latestBodyweight(nutrition) {
  const override = Number(state.metricsProfile.bodyweight || 0);
  return override > 0 ? override : nutrition.latestWeight;
}

function renderNutritionMetrics() {
  const summary = nutritionWeightSummary(state.vitals, state.nutritionDays, state.meals, state.bodyMeasurements, state.metricsRange, metricsEndDate());
  $('#metricsNutritionSummary').innerHTML = metricCards([
    ['Latest weight', summary.latestWeight != null ? `${fmt(summary.latestWeight,2)} kg` : '–'],
    ['Weight change', summary.weightChange != null ? formatSigned(summary.weightChange,2,' kg') : '–'],
    ['Average calories', summary.avgCalories != null ? `${fmt(summary.avgCalories)} kcal` : '–'],
    ['Average protein', summary.avgProtein != null ? `${fmt(summary.avgProtein,1)} g` : '–']
  ]);
  $('#metricsWeightChart').innerHTML = svgLineChart(summary.weights, { suffix: ' kg', digits: 2, empty: 'Two bodyweight records are needed for a weight trend.' });
  return summary;
}

function fuelMetricMeta(key) {
  return ({
    calories: ['Calories', ' kcal', 0], carbs: ['Carbohydrates', ' g', 0], protein: ['Protein', ' g', 0], fat: ['Fat', ' g', 0],
    carbPct: ['Carbohydrate share', '%', 1], proteinPct: ['Protein share', '%', 1], fatPct: ['Fat share', '%', 1]
  })[key] || ['Nutrition', '', 1];
}

function fuelOutputMeta(key) {
  return ({
    sessionPerformanceIndex: ['Normalised session performance', '%', 1],
    volumePerExercise: ['Work-set volume per exercise', ' kg', 0],
    volumePerSet: ['Work-set volume per set', ' kg', 0],
    totalVolume: ['Total work-set volume', ' kg', 0]
  })[key] || ['Session performance', '', 1];
}

function renderFuelPerformanceMetrics() {
  const result = nutritionSessionPerformanceAnalysis(state.sessions, state.meals, state.nutritionDays, state.metricsFuelSessionFamily, state.metricsRange, metricsEndDate(), state.metricsFormula, state.metricsFuelWindow, state.metricsFuelOutput);
  const [label, suffix, digits] = fuelMetricMeta(state.metricsFuelMetric);
  const correlation = result.correlations?.[state.metricsFuelMetric] ?? null;
  const [outputLabel, outputSuffix, outputDigits] = fuelOutputMeta(result.outputKey);
  const familyLabel = result.familyLabel || strengthSessionFamilies(state.sessions, state.metricsRange, metricsEndDate()).find(item => item.key === state.metricsFuelSessionFamily)?.label || 'Selected session family';
  $('#metricsFuelSummary').innerHTML = metricCards([
    ['Matched sessions', String(result.sampleSize), familyLabel],
    ['Output samples', String(result.outputSampleSize), outputLabel],
    ['Session PBs', String(result.pbCount)],
    [`${label} relationship`, correlation != null ? correlationMeaning(correlation) : 'Insufficient data', correlation != null ? `r = ${fmt(correlation, 2)}` : 'Minimum four comparable sessions']
  ]);
  $('#metricsFuelChart').innerHTML = svgScatterChart(result.rows, state.metricsFuelMetric, { xLabel: label, xSuffix: suffix, xDigits: digits, yKey: result.outputKey, yLabel: outputLabel, ySuffix: outputSuffix, yDigits: outputDigits });
  const correlationItems = [
    ['Calories', result.correlations?.calories], ['Carbs', result.correlations?.carbs], ['Protein', result.correlations?.protein], ['Fat', result.correlations?.fat],
    ['Carb %', result.correlations?.carbPct], ['Protein %', result.correlations?.proteinPct], ['Fat %', result.correlations?.fatPct]
  ];
  const best = result.bestDayFuel;
  const others = result.otherDayFuel;
  const methodText = result.outputKey === 'sessionPerformanceIndex'
    ? 'The session score is the median change across exercises that have comparable prior history. Adding or removing one exercise does not exclude the workout.'
    : 'This output includes every workout in the selected family, even when the exercise list varies.';
  $('#metricsFuelInsight').innerHTML = result.sampleSize ? `<div class="fuel-insight-card"><h4>What the current data says</h4><p>${escapeHtml(methodText)}</p><p>${result.outputSampleSize >= 4 ? `${escapeHtml(label)} shows a ${escapeHtml(correlationMeaning(correlation))} association with ${escapeHtml(outputLabel.toLowerCase())} across ${escapeHtml(familyLabel)} sessions.` : 'There is not enough comparable history yet for a dependable correlation. Keep logging macros and complete sessions consistently.'}</p>${best && others ? `<p>Top-quartile sessions averaged ${fmt(best.calories)} kcal, ${fmt(best.carbs,1)} g carbs, ${fmt(best.protein,1)} g protein and ${fmt(best.fat,1)} g fat. Other matched sessions averaged ${fmt(others.calories)} kcal, ${fmt(others.carbs,1)} g carbs, ${fmt(others.protein,1)} g protein and ${fmt(others.fat,1)} g fat.</p>` : ''}<div class="fuel-correlation-grid">${correlationItems.map(([name,value]) => `<span><strong>${escapeHtml(name)}</strong><br>${value == null ? 'not enough data' : `${escapeHtml(correlationMeaning(value))} · r ${fmt(value,2)}`}</span>`).join('')}</div></div>` : '<div class="empty-state">No sessions in this workout family have matching macro data in this period.</div>';
  $('#metricsFuelTable').innerHTML = result.rows.length ? [...result.rows].reverse().slice(0, 12).map(item => {
    const outputValue = result.outputKey === 'sessionPerformanceIndex'
      ? (item.sessionPerformanceIndex != null ? `${fmt(item.sessionPerformanceIndex,1)}%` : 'Baseline')
      : `${fmt(item[result.outputKey])} kg`;
    const outputNote = result.outputKey === 'sessionPerformanceIndex'
      ? `${item.comparableExercises || 0} comparable exercises`
      : `${item.exerciseCount || 0} exercises · ${item.workSets || 0} work sets`;
    return `<div class="analytics-row"><div><strong>${escapeHtml(localDateLabel(item.date))}${item.isPb ? ' · PB' : ''}</strong><small>${escapeHtml(item.sessionType)} · ${fmt(item.calories)} kcal · ${fmt(item.protein,1)}P · ${fmt(item.carbs,1)}C · ${fmt(item.fat,1)}F</small></div><div><strong>${escapeHtml(outputValue)}</strong><small>${escapeHtml(outputNote)}</small></div></div>`;
  }).join('') : '';
}

function renderCycleMetrics() {
  renderTrainingCycles();
  const rows = cyclePerformanceSummary(state.sessions, state.exercises, state.trainingCycles, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula);
  $('#metricsCycleSummary').innerHTML = rows.length ? rows.map(item => `<div class="analytics-row"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type)} · ${escapeHtml(item.startDate)} → ${escapeHtml(item.endDate)} · ${item.sessions} sessions</small></div><div><strong>${item.e1rmChange != null ? formatSigned(item.e1rmChange,1,' kg') : '–'}</strong><small>${fmt(item.volume)} kg volume · ${item.avgRpe != null ? `RPE ${fmt(item.avgRpe,1)}` : 'RPE –'}</small></div></div>`).join('') : '<div class="empty-state">Cycle comparisons appear once a saved cycle contains training sessions.</div>';
}

function renderSupplementMetrics() {
  const result = supplementPerformanceComparison(state.sessions, state.supplements, state.supplementEvents, state.metricsSupplementId, state.metricsExercise, state.metricsRange, metricsEndDate(), state.metricsFormula);
  const node = $('#metricsSupplementComparison');
  if (!result.supplement) {
    node.innerHTML = '<div class="empty-state">Add a supplement or TRT item in the Supplement Suite first.</div>';
    return;
  }
  const summary = item => item ? `${item.sessions} sessions · avg e1RM ${fmt(item.avgE1rm,1)} kg · best ${fmt(item.bestE1rm,1)} kg · avg volume ${fmt(item.avgVolume)} kg` : 'No matched sessions';
  const difference = result.on && result.off ? result.on.avgE1rm - result.off.avgE1rm : null;
  node.innerHTML = `<div class="supplement-comparison-card"><h4>${escapeHtml(result.supplement.name)}</h4><div class="benchmark-score"><span><strong>Recorded active</strong><br>${escapeHtml(summary(result.on))}</span><span><strong>Recorded inactive</strong><br>${escapeHtml(summary(result.off))}</span></div><p>${difference != null ? `Average e1RM difference: ${formatSigned(difference,1,' kg')}.` : 'Both active and inactive matched sessions are needed for a comparison.'} This is context, not proof of effect.</p></div>`;
}

function measurementUnit(field) { return field === 'weight' ? 'kg' : field === 'bodyFat' ? '%' : 'cm'; }
function measurementLabel(field) { return ({ weight:'Weight', bodyFat:'Body fat', neck:'Neck', chest:'Chest', waist:'Waist', hips:'Hips', leftArm:'Left arm', rightArm:'Right arm', leftThigh:'Left thigh', rightThigh:'Right thigh', leftCalf:'Left calf', rightCalf:'Right calf' })[field] || field; }

function renderBodyMeasurements() {
  const field = $('#bodyMeasurementSelect')?.value || 'weight';
  const points = bodyMeasurementSeries(state.bodyMeasurements, field, state.metricsRange, metricsEndDate());
  $('#bodyMeasurementChart').innerHTML = svgLineChart(points, { suffix: ` ${measurementUnit(field)}`, digits: field === 'weight' ? 2 : 1, empty: `Two ${measurementLabel(field).toLowerCase()} measurements are needed for a trend.` });
  $('#bodyMeasurementHistory').innerHTML = state.bodyMeasurements.length ? state.bodyMeasurements.slice(0, 10).map(item => {
    const values = ['weight','bodyFat','waist','chest','neck','hips'].filter(key => item[key] != null).map(key => `${measurementLabel(key)} ${fmt(item[key], key === 'weight' ? 2 : 1)} ${measurementUnit(key)}`).join(' · ');
    return `<div class="analytics-row"><div><strong>${escapeHtml(localDateLabel(item.date))}</strong><small>${escapeHtml(values || 'Measurement record')}</small>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</div><div><button class="text-button" type="button" data-delete-body-measurement="${escapeHtml(item.id)}">Delete</button></div></div>`;
  }).join('') : '<div class="empty-state">No body measurements saved yet.</div>';
}

function renderBenchmarkMetrics(progress, nutrition) {
  const profile = state.metricsProfile || {};
  const bodyweight = latestBodyweight(nutrition);
  const ratio = relativeStrength(progress, bodyweight);
  const birthYear = Number(profile.birthYear || 0);
  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  const profileText = [profile.sex || null, age ? `age ${age}` : null, bodyweight ? `${fmt(bodyweight,1)} kg` : null].filter(Boolean).join(' · ');
  $('#metricsBenchmarkSummary').innerHTML = progress.latest ? `<div class="benchmark-card"><h4>${escapeHtml(state.metricsExercise || 'Selected exercise')}</h4><p>${escapeHtml(profileText || 'Set a profile and bodyweight to calculate relative strength.')}</p><div class="benchmark-score"><span>e1RM ${fmt(progress.latest.e1rm,1)} kg</span><span>${ratio != null ? `${fmt(ratio,2)} × bodyweight` : 'Bodyweight ratio unavailable'}</span><span>${progress.personalPercentile != null ? `${fmt(progress.personalPercentile)}th personal percentile` : 'More history needed'}</span></div><p>Population rank: unavailable. This panel deliberately does not invent a Hevy-user percentile.</p></div>` : '<div class="empty-state">Choose an exercise with saved history to calculate a benchmark.</div>';
}

function renderWearableMetrics() {
  const wearable = wearableSummary(state.sessions, state.metricsRange, metricsEndDate());
  $('#metricsWearableSummary').innerHTML = metricCards([
    ['Tracked duration', formatHours(wearable.totalSeconds)],
    ['LISS sessions', String(wearable.cardioSessions)],
    ['Average LISS HR', wearable.avgHr != null ? `${fmt(wearable.avgHr)} bpm` : '–'],
    ['Highest LISS HR', wearable.maxHr != null ? `${fmt(wearable.maxHr)} bpm` : '–']
  ]);
  $('#metricsWearableChart').innerHTML = svgLineChart(wearable.points.filter(item => item.avgHr != null), { valueKey: 'avgHr', suffix: ' bpm', digits: 0, empty: 'Two LISS sessions with average HR are needed for a biometric trend.' });
  const alignment = readinessAlignment(state.sessions, state.metricsRange, metricsEndDate());
  $('#metricsReadinessSummary').innerHTML = `<div class="readiness-alignment-card"><h4>Readiness advice versus actual action</h4><p>${alignment.total ? `${fmt(alignment.alignmentRate,1)}% aligned across ${alignment.total} recorded decisions.` : 'No sessions in this period contain a saved readiness decision.'}</p>${alignment.total ? `<div class="benchmark-score"><span>${alignment.trainedGreen} trained on green</span><span>${alignment.trainedAmber} trained on amber</span><span>${alignment.trainedRed} trained on red</span><span>${alignment.rested} rest days</span></div>` : ''}</div>`;
}

function renderMetrics() {
  if (!$('#metricsScreen')) return;
  renderMetricsSelectors();
  const overview = metricsOverview(state.sessions, state.exercises, state.metricsRange, metricsEndDate());
  $('#metricsOverview').innerHTML = metricCards([
    ['Strength sessions', String(overview.strengthSessions)],
    ['Work sets', String(overview.workSets)],
    ['Volume load', `${fmt(overview.volume)} kg`],
    ['Effective reps est.', fmt(overview.effectiveReps)],
    ['Average RPE', overview.avgRpe != null ? fmt(overview.avgRpe,1) : '–'],
    ['Training time', formatHours(overview.totalSeconds)]
  ]);
  const progress = renderStrengthMetrics();
  renderTrainingLoadMetrics();
  renderMuscleMetrics();
  renderHypertrophyMetrics();
  renderFuelPerformanceMetrics();
  const nutrition = renderNutritionMetrics();
  renderBodyMeasurements();
  renderCycleMetrics();
  renderSupplementMetrics();
  renderBenchmarkMetrics(progress, nutrition);
  renderWearableMetrics();
}

function bodyMeasurementFromForm(form) {
  const data = new FormData(form);
  const record = { id: `body-measurement-${data.get('date')}`, date: String(data.get('date') || ''), notes: String(data.get('notes') || '').trim(), updatedAt: new Date().toISOString() };
  for (const key of ['weight','bodyFat','neck','chest','waist','hips','leftArm','rightArm','leftThigh','rightThigh','leftCalf','rightCalf']) {
    const value = num(data.get(key));
    if (value != null) record[key] = value;
  }
  return record;
}


function renderStorageStatus() {
  $('#storageStatus').innerHTML = [
    `Templates: <strong>${state.templates.length}</strong>`, `Sessions: <strong>${state.sessions.length}</strong>`,
    `Vitals records: <strong>${state.vitals.length}</strong>`, `Meals: <strong>${state.meals.length}</strong>`,
    `Exercises: <strong>${state.exercises.length}</strong>`, `Imported nutrition days: <strong>${state.nutritionDays.length}</strong>`,
    `Recovery logs: <strong>${state.recoveryLogs.length}</strong>`,
    `Blood tests: <strong>${state.bloodTests.length}</strong>`, `Blood analyses: <strong>${state.bloodAnalyses.length}</strong>`,
    `Body measurements: <strong>${state.bodyMeasurements.length}</strong>`,
    `Training cycles: <strong>${state.trainingCycles.length}</strong>`, `Supplements / TRT items: <strong>${state.supplements.length}</strong>`,
    `Active draft: <strong>${state.currentSession ? 'Yes' : 'No'}</strong>`,
    `App version: <strong>${APP_VERSION}</strong>`
  ].map(item => `<div>${item}</div>`).join('');
}

function renderAll() {
  renderDashboard(); renderTemplateOptions(); renderWorkout(); renderMeals(); renderNutritionHistory(); renderVitalsHistory(); renderRecovery(); renderSupplements(); renderAdministrationEvents(); renderBloodwork(); renderMetrics(); renderHistory(); renderExerciseProgress(); renderHistoryAudit(); renderProfile(); renderTrainingCycles(); renderHdmExtensionPanel(); renderProgramManager(); renderRoutineBuilder(); applyTrainingBuilderTab(); renderStorageStatus(); renderWorkbookPreview(); applyFeatureVisibility();
}

function showScreen(screen) {
  $$('.screen').forEach(node => node.classList.toggle('active', node.dataset.screen === screen));
  let activeNav = null;
  $$('.bottom-nav button').forEach(node => {
    const active = node.dataset.nav === screen;
    node.classList.toggle('active', active);
    if (active) activeNav = node;
  });
  activeNav?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formToVitals(form) {
  const data = new FormData(form);
  return {
    id: `vitals-${data.get('date')}`, date: data.get('date'), recovery: num(data.get('recovery')), charge: num(data.get('charge')),
    restScore: num(data.get('restScore')), status: data.get('status'), guidance: data.get('guidance'), synthesis: data.get('synthesis'), hrv: num(data.get('hrv')), hrvBaseline: num(data.get('hrvBaseline')), hrvDeltaFromBaseline: num(data.get('hrvDeltaFromBaseline')), hrvBaselineStatus: data.get('hrvBaselineStatus') || 'unknown',
    restingHr: num(data.get('restingHr')), rhrBaseline: num(data.get('rhrBaseline')), rhrDeltaFromBaseline: num(data.get('rhrDeltaFromBaseline')), rhrBaselineStatus: data.get('rhrBaselineStatus') || 'unknown', stress: num(data.get('stress')), stressBand: data.get('stressBand'), respiratoryRate: num(data.get('respiratoryRate')),
    sleepHours: num(data.get('sleepHours')), sleepPerformance: num(data.get('sleepPerformance')), sleepEfficiency: num(data.get('sleepEfficiency')), sleepDebt: num(data.get('sleepDebt')),
    systolic: num(data.get('systolic')), diastolic: num(data.get('diastolic')), pulse: num(data.get('pulse')), weight: num(data.get('weight')),
    dailyHydrationConsumedLitres: num(data.get('dailyHydrationConsumedLitres')), dailyHydrationTargetLitres: num(data.get('dailyHydrationTargetLitres')),
    feeling: data.get('feeling'), symptoms: data.get('symptoms') === 'on', notes: data.get('notes'), updatedAt: new Date().toISOString()
  };
}

function vitalsWeightChangeFlag(record) {
  if (record?.weight == null || !record?.date) return null;
  const previous = state.vitals
    .filter(item => item.date < record.date && item.weight != null)
    .sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!previous) return null;
  const changeKg = Math.round((Number(record.weight) - Number(previous.weight)) * 100) / 100;
  if (!Number.isFinite(changeKg) || Math.abs(changeKg) < 2) return null;
  return {
    status: 'context-review', thresholdKg: 2, previousDate: previous.date,
    previousWeightKg: Number(previous.weight), currentWeightKg: Number(record.weight), changeKg,
    message: 'Large day-to-day weight change detected. Treat as probable hydration/glycogen/gut-content or measurement variability until confirmed by trend.'
  };
}

function mergeVitalsForSave(formValues) {
  const existing = state.vitals.find(item => item.date === formValues.date) || {};
  const imported = state.pendingVitalsImport?.values || {};
  const merged = { ...existing, ...imported, ...formValues };
  for (const field of ['status','guidance','synthesis','stressBand']) {
    if ((formValues[field] == null || formValues[field] === '') && imported[field] == null && existing[field]) merged[field] = existing[field];
  }
  merged.id = `vitals-${formValues.date}`;
  merged.profileId = merged.profileId || profileId();
  merged.date = formValues.date;
  merged.createdAt = existing.createdAt || imported.importedAt || merged.createdAt || new Date().toISOString();
  merged.updatedAt = new Date().toISOString();
  if (state.pendingVitalsImport) {
    merged.importWarnings = [...(state.pendingVitalsImport.warnings || [])];
    merged.unsupportedImportFields = [...(state.pendingVitalsImport.unsupportedFields || [])];
    merged.importFieldSources = { ...(state.pendingVitalsImport.fieldSources || {}) };
    merged.importSourceFormat = state.pendingVitalsImport.sourceFormat || null;
    merged.importFileName = state.pendingVitalsImport.fileName || null;
    merged.importedAt = new Date().toISOString();
  }
  merged.baselineStatus = {
    hrv: merged.hrvBaselineStatus || (merged.hrvBaseline != null ? 'known' : 'unknown'),
    restingHr: merged.rhrBaselineStatus || (merged.rhrBaseline != null ? 'known' : 'unknown')
  };
  const weightFlag = vitalsWeightChangeFlag(merged);
  if (weightFlag) merged.weightChangeContext = weightFlag;
  else delete merged.weightChangeContext;
  return merged;
}

function updateVitalsPreview() {
  const vitals = formToVitals($('#vitalsForm'));
  const fields = ['recovery','hrv','restingHr','stress','sleepHours','systolic','diastolic','feeling'];
  const hasData = fields.some(key => vitals[key] !== null && vitals[key] !== '');
  renderReadinessCard($('#readinessPreview'), calculateReadiness(vitals), hasData);
}

function renderVitalsMarkdownStatus(result, fileName) {
  const values = result.values;
  const summary = [
    values.date ? `Date ${escapeHtml(values.date)}` : '',
    values.recovery != null ? `Recovery ${escapeHtml(values.recovery)}%` : '',
    values.hrv != null ? `HRV ${escapeHtml(values.hrv)} ms` : '',
    values.systolic != null ? `BP ${escapeHtml(values.systolic)}/${escapeHtml(values.diastolic ?? '–')}` : '',
    values.sleepHours != null ? `Sleep ${escapeHtml(values.sleepHours)} h` : '',
    values.weight != null ? `Weight ${escapeHtml(values.weight)} kg` : ''
  ].filter(Boolean).join(' · ');
  const warnings = result.warnings.length
    ? `<div class="alert alert-warning"><strong>Check these fields:</strong><ul>${result.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
    : '';
  $('#vitalsMarkdownStatus').innerHTML = `
    <div class="import-success">
      <strong>${escapeHtml(fileName)}</strong>
      <p>${result.importedFields.length} fields loaded from ${escapeHtml(result.sourceFormat)}. Review the form, then press Save vitals.</p>
      ${summary ? `<p class="import-summary">${summary}</p>` : ''}
    </div>${warnings}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  return [columns.map(column => csvEscape(column.label)).join(','), ...rows.map(row => columns.map(column => csvEscape(column.value(row))).join(','))].join('\n');
}

function exportSetLog() {
  const rows = state.sessions.flatMap(session => (session.exercises || []).flatMap(exercise => (exercise.sets || []).map(set => ({ session, exercise, set }))));
  const columns = [
    ['Date', r => r.session.date], ['Session Type', r => r.session.sessionType], ['Exercise', r => r.exercise.name],
    ['Line Number', r => r.exercise.lineNumber], ['Set Type', r => r.set.setType], ['Set Number', r => r.set.setNumber],
    ['Weight kg', r => r.set.weightKg], ['Reps', r => r.set.reps], ['RPE', r => r.set.rpe], ['Failure', r => r.set.failure ? 'Yes' : 'No'],
    ['Hold Seconds', r => r.set.holdSeconds || 0], ['Rest Seconds', r => r.set.restRecorded === true ? (r.set.restSeconds ?? 0) : ''], ['Notes', r => [r.set.notes, r.exercise.notes].filter(Boolean).join(' | ')],
    ['Volume kg', r => Number(r.set.weightKg || 0) * Number(r.set.reps || 0)], ['Estimated 1RM', r => estimated1RM(Number(r.set.weightKg), Number(r.set.reps)).toFixed(1)]
  ].map(([label,value]) => ({label,value}));
  downloadBlob(toCsv(rows, columns), timestampFilename('VANTAGE_Set_Log','csv'), 'text/csv;charset=utf-8');
}

function exportSessionLog() {
  const columns = [
    ['Date', r => r.date], ['Session Type', r => r.sessionType], ['Mode', r => r.mode], ['Started At', r => r.startedAt], ['Completed At', r => r.completedAt],
    ['Exercises', r => sessionTotals(r).exercises], ['Work Sets', r => sessionTotals(r).workSets], ['Volume kg', r => sessionTotals(r).volume],
    ['Top Estimated 1RM', r => sessionTotals(r).topE1rm.toFixed(1)],
    ['Cardio Activity', r => r.cardio ? activityLabel(r.cardio.activityType) : ''], ['Cardio Duration Seconds', r => r.cardio?.elapsedSeconds ?? ''],
    ['Average HR', r => r.cardio?.metrics?.avgHr ?? ''], ['Maximum HR', r => r.cardio?.metrics?.maxHr ?? ''],
    ['Distance', r => r.cardio?.metrics?.distance ?? ''], ['Distance Unit', r => r.cardio?.metrics?.distanceUnit ?? ''],
    ['LISS Classification', r => r.cardio?.analysis?.classification ?? ''], ['Notes', r => r.notes]
  ].map(([label,value]) => ({label,value}));
  downloadBlob(toCsv(state.sessions, columns), timestampFilename('VANTAGE_Session_Log','csv'), 'text/csv;charset=utf-8');
}

function exportMacroLog() {
  const columns = [
    ['Date', r => r.date], ['Meal Number', r => r.mealNumber], ['Time', r => r.time], ['Foods', r => r.foods],
    ['Protein g', r => r.protein], ['Carbs g', r => r.carbs], ['Fat g', r => r.fat], ['Calories', r => r.calories],
    ['Sodium Note', r => r.sodiumNote], ['Pre Workout', r => r.preWorkout ? 'Yes' : 'No'], ['Post Workout', r => r.postWorkout ? 'Yes' : 'No'], ['Pre Bed', r => r.preBed ? 'Yes' : 'No']
  ].map(([label,value]) => ({label,value}));
  downloadBlob(toCsv(state.meals, columns), timestampFilename('VANTAGE_Macro_Log','csv'), 'text/csv;charset=utf-8');
}


function inferredImageType(file) {
  const supplied = String(file?.type || '').toLowerCase();
  if (supplied.startsWith('image/')) return supplied;
  const extension = String(file?.name || '').toLowerCase().split('.').pop();
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', heic: 'image/heic', heif: 'image/heif'
  })[extension] || '';
}

function imageWithType(file, type) {
  if (file?.type === type) return file;
  return new Blob([file], { type });
}

async function decodeImageSource(blob) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch (error) {
      console.warn('createImageBitmap could not decode the selected image.', error);
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The browser could not decode this image format.'));
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function compressImageFile(file) {
  if (!(file instanceof Blob)) throw new Error('No image file was supplied.');
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name || 'Image'} is larger than 20 MB.`);

  const type = inferredImageType(file);
  if (!type) throw new Error(`${file.name || 'Selected file'} has no recognisable image type.`);
  const typedBlob = imageWithType(file, type);
  const browserPreviewTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const safeName = file.name || `VANTAGE_image_${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`;

  // Preserve ordinary phone screenshots and JPEG photographs while correcting
  // Android pickers that return a blank or generic MIME type.
  if (browserPreviewTypes.has(type) && ((type === 'image/png' && file.size < 4 * 1024 * 1024) || file.size < 2 * 1024 * 1024)) {
    return { blob: typedBlob, name: safeName, type, size: typedBlob.size };
  }

  let decoded;
  try {
    decoded = await decodeImageSource(typedBlob);
    const maxEdge = 2400;
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Image conversion failed.');
    const base = safeName.replace(/\.[^.]+$/, '') || 'VANTAGE_image';
    return { blob, name: `${base}.jpg`, type: 'image/jpeg', size: blob.size };
  } catch (error) {
    if (browserPreviewTypes.has(type)) {
      console.warn('Using the original supported image after conversion failed.', error);
      return { blob: typedBlob, name: safeName, type, size: typedBlob.size };
    }
    throw new Error(`${safeName} could not be decoded. HEIC/HEIF support varies by Android browser; select a JPG/PNG copy or a screenshot instead.`);
  } finally {
    decoded?.close?.();
  }
}

function setImageImportStatus(node, message = '', tone = '') {
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = !message;
}

function bindImagePreviewFallback(image, filename) {
  if (!image) return;
  image.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.className = 'media-preview-failed';
    fallback.textContent = `${filename || 'Image'} is saved, but this browser cannot display its thumbnail.`;
    image.replaceWith(fallback);
  }, { once: true });
}

function clearPendingLissMediaReview() {
  (state.pendingLissMedia || []).forEach(item => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  state.pendingLissMedia = [];
  const panel = $('#lissPendingMediaReview');
  if (panel) panel.hidden = true;
  const list = $('#lissPendingMediaList');
  if (list) list.innerHTML = '';
  const count = $('#lissPendingMediaCount');
  if (count) count.textContent = '0 pending';
  const applyAll = $('#lissPendingApplyAllRole');
  if (applyAll) applyAll.value = '';
}

function renderPendingLissMediaReview() {
  const panel = $('#lissPendingMediaReview');
  const list = $('#lissPendingMediaList');
  const count = $('#lissPendingMediaCount');
  if (!panel || !list || !count) return;
  const pending = state.pendingLissMedia || [];
  panel.hidden = !pending.length;
  count.textContent = `${pending.length} pending`;
  if (!pending.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = pending.map((item, index) => `
    <article class="liss-pending-media-card" data-pending-liss-index="${index}">
      <img src="${item.previewUrl}" alt="Pending LISS image ${index + 1}">
      <div>
        <strong>${escapeHtml(item.file.name || `Image ${index + 1}`)}</strong>
        <small>${fmt((item.file.size || 0) / 1024)} KB${item.fileDate ? ` · file date ${escapeHtml(item.fileDate)}` : ''}</small>
        <label>Image source
          <select class="liss-pending-role">
            ${LISS_MEDIA_ROLES.map(([value, label]) => `<option value="${value}"${item.role === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
    </article>`).join('');
  list.querySelectorAll('.liss-pending-role').forEach(select => select.addEventListener('change', event => {
    const card = event.target.closest('[data-pending-liss-index]');
    const item = state.pendingLissMedia[Number(card?.dataset.pendingLissIndex)];
    if (item) item.role = event.target.value;
  }));
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function stageLissGalleryImages(fileList) {
  const session = state.currentSession;
  if (!isLissSession(session)) return toast('Start a LISS session first');
  const files = [...(fileList || [])];
  if (!files.length) return;
  const existing = await sessionMedia(session.id);
  const capacity = Math.max(0, 10 - existing.length);
  if (!capacity) return toast('Maximum of 10 images reached');
  clearPendingLissMediaReview();
  state.pendingLissMedia = files.slice(0, capacity).map(file => ({
    file,
    role: 'unassigned',
    fileDate: fileLocalDate(file),
    previewUrl: URL.createObjectURL(file)
  }));
  renderPendingLissMediaReview();
  setImageImportStatus($('#lissImageStatus'), 'Label each selected image, then attach them.', 'working');
}

async function savePendingLissMedia() {
  const pending = state.pendingLissMedia || [];
  if (!pending.length) return;
  const unassigned = pending.filter(item => !item.role || item.role === 'unassigned');
  if (unassigned.length) return toast(`Choose a source for all ${unassigned.length} pending image${unassigned.length === 1 ? '' : 's'}`);
  const files = pending.map(item => item.file);
  const roles = pending.map(item => normaliseLissMediaRole(item.role));
  await addLissImages(files, 'gallery', 'unassigned', roles);
  clearPendingLissMediaReview();
}

async function addLissImages(fileList, captureSource = 'gallery', requestedRole = 'unassigned', perFileRoles = []) {
  const session = state.currentSession;
  const status = $('#lissImageStatus');
  if (!isLissSession(session)) return toast('Start a LISS session first');
  const files = [...(fileList || [])];
  if (!files.length) return;
  const existing = await sessionMedia(session.id);
  const capacity = Math.max(0, 10 - existing.length);
  if (!capacity) return toast('Maximum of 10 images reached');
  const selected = files.slice(0, capacity);
  let saved = 0;
  const failures = [];

  setImageImportStatus(status, `Adding ${selected.length} image${selected.length === 1 ? '' : 's'}…`, 'working');
  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index];
    try {
      setImageImportStatus(status, `Processing image ${index + 1} of ${selected.length}…`, 'working');
      const detectedFileDate = fileLocalDate(file);
      let dateConfirmed = false;
      const currentSessionDate = state.currentSession?.date || today();
      if (detectedFileDate && detectedFileDate !== currentSessionDate) {
        const keep = window.confirm(`${file.name || 'This image'} appears to be dated ${detectedFileDate}, but this workout is ${currentSessionDate}. Attach it anyway?`);
        if (!keep) continue;
        dateConfirmed = true;
      }
      const processed = await compressImageFile(file);
      const createdAt = new Date().toISOString();
      const extension = processed.type === 'image/png' ? 'png' : 'jpg';
      const sourceRole = normaliseLissMediaRole(perFileRoles[index] || requestedRole || 'unassigned');
      const roleDetails = lissRoleDetails(sourceRole);
      const roleConfirmed = sourceRole !== 'unassigned';
      const hash = await sha256Hex(processed.blob);
      const existingHashes = await Promise.all(existing.map(async mediaItem => ({
        item: mediaItem,
        hash: mediaItem.sha256 || ((mediaItem.blob instanceof Blob) ? await sha256Hex(mediaItem.blob) : null)
      })));
      const duplicate = existingHashes.find(entry => entry.hash && entry.hash === hash);
      if (duplicate) {
        const duplicateRole = normaliseLissMediaRole(duplicate.item.sourceRole);
        if (duplicateRole !== sourceRole) throw new Error(`Duplicate image already attached as ${lissRoleDetails(duplicateRole).badge}; it cannot also be assigned as ${roleDetails.badge}.`);
        failures.push(`${file.name || `Image ${index + 1}`}: duplicate image already attached; extra copy skipped.`);
        continue;
      }
      const item = {
        id: uid(), sessionId: session.id, date: session.date,
        name: processed.name || `LISS_${session.date}_${Date.now()}.${extension}`,
        type: processed.type || 'image/jpeg', size: processed.size || processed.blob.size,
        blob: processed.blob, sha256: hash, captureSource, sourceRole,
        sourceSystem: roleDetails.sourceSystem, sensor: roleDetails.sensor,
        sourceRoleConfirmed: roleConfirmed, roleConfirmed, sourceRoleAssignedAt: roleConfirmed ? createdAt : null,
        mappingConfidence: roleConfirmed ? 'user-confirmed' : 'unconfirmed', metricsConfirmed: false, ocrReviewed: false,
        extractionStatus: 'not-extracted', fileDate: detectedFileDate, dateConfirmed, createdAt
      };
      await db.put('sessionMedia', item);
      session.cardio.mediaIds ||= [];
      if (!session.cardio.mediaIds.includes(item.id)) session.cardio.mediaIds.push(item.id);
      existing.push(item);
      saved += 1;
    } catch (error) {
      console.error('LISS image import failed.', error);
      failures.push(`${file.name || `Image ${index + 1}`}: ${error.message}`);
    }
  }

  await renderLissMedia(session);
  persistDraft();
  if (failures.length) {
    setImageImportStatus(status, `${saved} saved. ${failures[0]}`, 'error');
    toast(`${saved} image${saved === 1 ? '' : 's'} attached; ${failures.length} could not be added`);
  } else {
    setImageImportStatus(status, `${saved} image${saved === 1 ? '' : 's'} saved and shown below.`, 'success');
    toast(`${saved} image${saved === 1 ? '' : 's'} attached${captureSource === 'camera' ? '; backup download requested' : ''}`);
  }
}

function setLissSourceMetric(source, key, value, inputType = 'number') {
  if (!isLissSession(state.currentSession)) return;
  const cardio = state.currentSession.cardio;
  cardio.sources = cardio.sources ? cleanSources(cardio.sources) : legacyMetricsToSources(cardio.metrics || {});
  const parsed = value === '' ? null : (inputType === 'text' ? value : Number(value));
  setPathValue(cardio.sources[source], key, parsed);
  refreshLegacyLissMetrics(cardio);
  persistDraft();
}

async function discardCurrentSessionMedia() {
  if (!state.currentSession?.id) return;
  const media = await sessionMedia(state.currentSession.id);
  await Promise.all(media.map(item => db.remove('sessionMedia', item.id)));
  state.currentLissMedia = [];
  clearPendingLissMediaReview();
  clearMediaObjectUrls();
}

async function completeCurrentRecoverySession() {
  const session = state.currentSession;
  if (!isRecoverySession(session)) return;
  updateRecoverySessionFromForm();
  if (!Number(session.recoverySession?.durationMinutes || 0)) return toast('Enter the recovery duration in minutes before finishing');
  const hydrationDecision = await requestHydrationReminder(session.hydration || {});
  if (!hydrationDecision) return;
  session.hydration = hydrationDecision;
  ensureSessionVitalsSnapshot(session);
  const completedSession = structuredClone(session);
  completedSession.completedAt = new Date().toISOString();
  completedSession.decision ||= {};
  completedSession.decision.actualAction = 'yoga-recovery';
  completedSession.trainingContext ||= { cycles: cycleContextSnapshot(completedSession.date), supplements: supplementContextSnapshot(completedSession.date), medicationAdministrations: administrationEventsForDate(completedSession.date), capturedAt: new Date().toISOString() };
  const packPromise = downloadRecoveryCoachPack(completedSession);
  await db.put('sessions', completedSession);
  await advanceActiveProgramAfterSession(completedSession);
  await linkSessionHydrationToDailyLedger(completedSession);
  await db.put('recoveryLogs', {
    id: `recovery-session-${completedSession.id}`, profileId: profileId(), date: completedSession.date, activityId: 'yoga-mobility',
    activityName: completedSession.recoverySession.activity || 'Yoga', classification: 'recovery', section: 'Movement recovery',
    durationSeconds: Number(completedSession.recoverySession.durationMinutes || 0) * 60,
    durationMinutes: Number(completedSession.recoverySession.durationMinutes || 0), durationInputMode: 'manual', durationSource: 'user-entered', timerUsed: false,
    timeOfDay: completedSession.recoverySession.startTime || '', intensity: 'easy', timing: 'separate', notes: completedSession.recoverySession.notes || '',
    hydration: completedSession.hydration || null, recordedAt: completedSession.startedAt, completedAt: completedSession.completedAt, source: 'recovery-session', decision: completedSession.decision
  });
  state.currentSession = null; persistDraft(); await refreshState(); renderAll(); showScreen('history');
  toast('Recovery session saved; Coach Pack is being prepared');
  packPromise.then(() => toast('Recovery Coach Pack downloaded')).catch(error => { console.error(error); toast(error.message || 'Recovery saved, but Coach Pack could not be created'); });
}

async function finaliseSavedLissSessionAfterClose(completedSession) {
  try {
    completedSession.cardio ||= {};
    completedSession.cardio.sources = completedSession.cardio.sources ? cleanSources(completedSession.cardio.sources) : legacyMetricsToSources(completedSession.cardio.metrics || {});
    // v1.3.10.6: normal LISS uses source screenshots/manual machine fields. FTMS remains experimental-only.
    delete completedSession.cardio.bluetoothMachine;
    if (completedSession.cardio.sources) delete completedSession.cardio.sources.ftmsMachine;
    completedSession.cardio.metrics ||= { distanceUnit: 'mi', speedUnit: 'mph', hrZones: {} };
    refreshLegacyLissMetrics(completedSession.cardio);
    completedSession.cardio.elapsedSeconds = Math.round(Number(completedSession.cardio.manualDurationMinutes || 0) * 60);
    completedSession.cardio.metrics.durationSeconds = completedSession.cardio.elapsedSeconds;

    const storedMedia = await sessionMedia(completedSession.id);
    for (const item of storedMedia) {
      const sourceRole = normaliseLissMediaRole(item.sourceRole);
      const details = lissRoleDetails(sourceRole);
      if (item.sourceRole !== sourceRole || item.sourceSystem !== details.sourceSystem || item.sensor !== details.sensor) {
        item.sourceRole = sourceRole;
        item.sourceSystem = details.sourceSystem;
        item.sensor = details.sensor;
        await db.put('sessionMedia', item);
      }
    }

    const staleMedia = storedMedia.filter(item => item.date && item.date !== completedSession.date);
    const media = storedMedia.filter(item => !item.date || item.date === completedSession.date);
    const unassignedMedia = media.filter(item => !item.sourceRole || item.sourceRole === 'unassigned');
    const unconfirmedMedia = media.filter(item => item.sourceRole && item.sourceRole !== 'unassigned' && item.sourceRoleConfirmed !== true);
    const machineActivity = ['treadmill-walk', 'stairmaster'].includes(completedSession.cardio.activityType);
    const machineConsoleRolePresent = media.some(item => normaliseLissMediaRole(item.sourceRole) === 'treadmillMachineConsole');
    const hydration = completedSession.cardio.hydration || {};
    const hydrationStatus = hydrationRecorded(hydration) ? 'recorded-intake' : hydration.declined === true ? 'explicitly-none' : 'not-recorded';
    completedSession.cardio.hydrationStatus = hydrationStatus;
    completedSession.cardio.sourceCompletenessReview = {
      checkedAt: new Date().toISOString(),
      morningVitals: Boolean(completedSession.vitalsSnapshot || resolveVitalsForSession({ date: completedSession.date, startedAt: completedSession.startedAt, vitalsId: completedSession.decision?.vitalsId })),
      noopActivitySummary: media.some(item => ['noopStrapSessionSummary','noopStrapHrZones'].includes(normaliseLissMediaRole(item.sourceRole))),
      noopSavedStream: media.some(item => normaliseLissMediaRole(item.sourceRole) === 'noopSessionStreamSaved'),
      watchDevice: media.some(item => ['watchDeviceExerciseSummary','watchDevicePaceSpeedCadence','outdoorWalkGpsSummary'].includes(normaliseLissMediaRole(item.sourceRole))),
      machineConsole: machineConsoleRolePresent,
      bluetoothFtms: false,
      preLissBloodPressure: Boolean((completedSession.bloodPressureReadings || []).find(item => item.context === 'pre-liss')),
      hydration: hydrationStatus !== 'not-recorded',
      macros: Boolean(nutritionForDate(completedSession.date)),
      staleMediaCount: staleMedia.length,
      unassignedMediaCount: unassignedMedia.length,
      unconfirmedMediaCount: unconfirmedMedia.length
    };
    if (machineActivity && !machineConsoleRolePresent) completedSession.cardio.sourceCompletenessReview.machineEvidenceMissing = true;

    // Enrichment is best-effort only. The workout has already been committed to IndexedDB.
    await db.put('sessions', completedSession);

    if (staleMedia.length) toast(`${staleMedia.length} attachment${staleMedia.length === 1 ? '' : 's'} from another session date excluded`);
    if (unassignedMedia.length || unconfirmedMedia.length) {
      toast(`Session saved — Coach Pack requires evidence review (${unassignedMedia.length} unassigned, ${unconfirmedMedia.length} unconfirmed)`);
      return;
    }
    if (machineActivity && !machineConsoleRolePresent) {
      toast(`Session saved — no ${completedSession.cardio.activityType === 'stairmaster' ? 'StairMaster' : 'treadmill'} console image attached. Coach Pack export left for History.`);
      return;
    }

    const result = await launchLissShare(completedSession, media, { download: true });
    if (result === 'shared') toast('LISS Coach Pack shared');
    else toast('LISS Coach Pack downloaded');
  } catch (error) {
    console.error('Post-save LISS evidence/export processing failed.', error);
    toast('LISS session is saved. Coach Pack needs review in History.');
  }
}

async function completeCurrentLissSession() {
  const activeSession = state.currentSession;
  if (!isLissSession(activeSession)) return;

  // v1.3.10.6 guarantee: only an absent duration can intentionally stop Finish LISS.
  // Hydration, OCR, media, source completeness and Coach Pack generation are post-save concerns.
  try { updateLissManualTimingFromForm(); }
  catch (error) { console.warn('Could not refresh LISS timing form before save; using stored session values.', error); }

  const session = state.currentSession || activeSession;
  session.cardio ||= {};
  const formDuration = num($('#lissManualDurationMinutes')?.value);
  const storedDuration = Number(session.cardio.manualDurationMinutes || 0);
  const elapsedDuration = Number(session.cardio.elapsedSeconds || 0) > 0 ? Number(session.cardio.elapsedSeconds || 0) / 60 : 0;
  const durationMinutes = Number(formDuration || storedDuration || elapsedDuration || 0);
  if (!(durationMinutes > 0)) return toast('Enter the LISS duration in minutes before finishing');

  ensureSessionVitalsSnapshot(session);
  const completedSession = structuredClone(session);
  completedSession.completedAt = new Date().toISOString();
  completedSession.cardio ||= {};
  completedSession.cardio.manualDurationMinutes = durationMinutes;
  completedSession.cardio.elapsedSeconds = Math.round(durationMinutes * 60);
  completedSession.cardio.metrics ||= { distanceUnit: 'mi', speedUnit: 'mph', hrZones: {} };
  completedSession.cardio.metrics.durationSeconds = completedSession.cardio.elapsedSeconds;
  completedSession.cardio.hydration ||= { coconutWaterMl: null, waterMl: null, otherFluidMl: null, aminoAcids: '', electrolytes: '', notes: '' };
  completedSession.cardio.hydrationStatus = hydrationRecorded(completedSession.cardio.hydration) ? 'recorded-intake' : completedSession.cardio.hydration.declined === true ? 'explicitly-none' : 'not-recorded';
  completedSession.trainingContext ||= { cycles: cycleContextSnapshot(completedSession.date), supplements: supplementContextSnapshot(completedSession.date), medicationAdministrations: administrationEventsForDate(completedSession.date), capturedAt: new Date().toISOString() };

  // This write is deliberately the FIRST asynchronous dependency in Finish LISS.
  // If it succeeds, the active workout is closed even if everything after it fails.
  try {
    await db.put('sessions', completedSession);
    await advanceActiveProgramAfterSession(completedSession);
    void linkSessionHydrationToDailyLedger(completedSession).catch(error => console.warn('Could not link LISS hydration to daily ledger.', error));
  } catch (error) {
    console.error('LISS session save failed.', error);
    toast('Could not save LISS session. The active session has been left open.');
    return;
  }

  state.currentSession = null;
  state.currentLissMedia = [];
  clearPendingLissMediaReview();
  clearMediaObjectUrls();
  try { persistDraft(); } catch (error) { console.warn('Could not clear LISS draft after successful save.', error); }

  try {
    await refreshState();
    renderAll();
    showScreen('history');
  } catch (error) {
    console.error('LISS saved but UI refresh failed.', error);
  }
  toast('LISS saved successfully');

  // Never await post-save evidence/export work from the Finish button.
  void finaliseSavedLissSessionAfterClose(completedSession);
}

async function importLissAnalysisFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('The analysis Markdown file is larger than 2 MB.');
  const analysis = parseLissAnalysisMarkdown(await file.text());
  const targetId = state.pendingLissAnalysisSessionId || analysis.sessionId;
  if (analysis.sessionId !== targetId) throw new Error('The analysis belongs to a different LISS session.');
  const session = state.sessions.find(item => item.id === targetId) || await db.get('sessions', targetId);
  if (!isLissSession(session)) throw new Error('The matching LISS session could not be found.');
  if (analysis.date && session.date && analysis.date !== session.date) throw new Error(`The analysis date ${analysis.date} does not match this session (${session.date}).`);
  const recordedActivityType = normaliseLissActivity(session.cardio?.activityType);
  const suggestedActivityType = normaliseLissActivity(analysis.activityType);
  const previousActivitySuggestion = session.cardio?.analysis?.activitySuggestion;
  const noopLabelActivityType = normaliseLissActivity(session.cardio?.sources?.vantageStrap?.activityShown);
  const labelOnlyActivityConflict = suggestedActivityType && noopLabelActivityType === suggestedActivityType && recordedActivityType !== suggestedActivityType;
  const activitySuggestion = suggestedActivityType && recordedActivityType && suggestedActivityType !== recordedActivityType && !labelOnlyActivityConflict
    ? {
        currentActivityType: recordedActivityType,
        suggestedActivityType,
        evidenceSource: 'Coach analysis / screenshot activity label',
        resolution: previousActivitySuggestion?.currentActivityType === recordedActivityType && previousActivitySuggestion?.suggestedActivityType === suggestedActivityType
          ? previousActivitySuggestion.resolution || null
          : null,
        resolvedAt: previousActivitySuggestion?.resolvedAt || null
      }
    : null;
  session.cardio ||= {};
  session.cardio.sources = session.cardio.sources ? cleanSources(session.cardio.sources) : legacyMetricsToSources(session.cardio.metrics || {});

  // Analysis values derived from screenshots are evidence, not overwrite commands.
  // The structured app values stay untouched until Steve resolves a conflict.
  const sanitisedEvidence = sanitiseLissAnalysisEvidence(analysis, session.date);
  const imageEvidenceSources = sanitisedEvidence.imageEvidenceSources;
  analysis.warnings = [...(analysis.warnings || []), ...sanitisedEvidence.warnings];
  const previousAudit = Array.isArray(session.cardio.analysis?.confirmationAudit) ? session.cardio.analysis.confirmationAudit : [];
  const previousReview = Array.isArray(session.cardio.analysis?.evidenceReview) ? session.cardio.analysis.evidenceReview : [];
  const evidenceReview = compareLissSources(session.cardio.sources, imageEvidenceSources).map(item => {
    const prior = previousReview.find(previous => previous.id === item.id
      && String(previous.recordedValue ?? '') === String(item.recordedValue ?? '')
      && String(previous.evidenceValue ?? '') === String(item.evidenceValue ?? ''));
    return prior?.resolution ? { ...item, resolution: prior.resolution, resolvedAt: prior.resolvedAt || null } : item;
  });
  const storedMedia = await sessionMedia(session.id);
  const previousRoleSuggestions = Array.isArray(session.cardio.analysis?.mediaRoleSuggestions) ? session.cardio.analysis.mediaRoleSuggestions : [];
  const mediaRoleSuggestions = buildLissMediaRoleSuggestions(analysis, storedMedia).map(item => {
    const prior = previousRoleSuggestions.find(previous => previous.id === item.id && previous.suggestedRole === item.suggestedRole);
    return prior?.resolution ? { ...item, resolution: prior.resolution, resolvedAt: prior.resolvedAt || null } : item;
  });

  session.cardio.analysis = {
    importedAt: new Date().toISOString(),
    schema: analysis.schema,
    classification: analysis.classification,
    summary: analysis.summary,
    observations: analysis.observations,
    warnings: analysis.warnings,
    imageReadings: analysis.imageReadings,
    imageEvidenceSources,
    evidenceReview,
    mediaRoleSuggestions,
    activitySuggestion,
    confirmationPolicy: analysis.confirmationPolicy || 'Structured values remain authoritative until Steve confirms a screenshot correction.',
    hydrationEvidence: analysis.hydration || {},
    preLissBloodPressureEvidence: analysis.preLissBloodPressure || {},
    validationWarnings: analysis.validationWarnings || [],
    confirmationAudit: previousAudit,
    mediaRoleAudit: Array.isArray(session.cardio.analysis?.mediaRoleAudit) ? session.cardio.analysis.mediaRoleAudit : []
  };
  refreshLegacyLissMetrics(session.cardio);
  await db.put('sessions', session);
  state.pendingLissAnalysisSessionId = null;
  await refreshState();
  renderAll();
  showScreen('history');
  const decisions = evidenceReview.filter(item => ['conflict', 'image-only'].includes(item.status)).length
    + mediaRoleSuggestions.filter(item => !item.resolution).length
    + (activitySuggestion && !activitySuggestion.resolution ? 1 : 0);
  toast(decisions ? `Coach analysis added · ${decisions} source decision${decisions === 1 ? '' : 's'} to review` : 'Coach analysis added; recorded values preserved');
}

async function importStrengthAnalysisFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error('The strength analysis Markdown file is larger than 2 MB.');
  const analysis = parseStrengthAnalysisMarkdown(await file.text());
  const targetId = state.pendingStrengthAnalysisSessionId || analysis.sessionId;
  if (analysis.sessionId !== targetId) throw new Error('The analysis belongs to a different strength session.');
  const session = state.sessions.find(item => item.id === targetId) || await db.get('sessions', targetId);
  if (!session || isLissSession(session) || isRestDaySession(session) || isRecoverySession(session)) throw new Error('The matching strength session could not be found.');
  if (analysis.date && session.date && analysis.date !== session.date) throw new Error(`The analysis date ${analysis.date} does not match this session (${session.date}).`);
  if (analysis.sessionType && session.sessionType && nameKey(analysis.sessionType) !== nameKey(session.sessionType)) {
    throw new Error('The analysis session type does not match this workout.');
  }
  const importedAt = new Date().toISOString();
  session.strengthAnalysis = { ...analysis, importedAt };
  session.workoutHrEvidence = analysis.workoutHrSummary ? {
    ...analysis.workoutHrSummary,
    confirmationStatus: analysis.workoutHrSummary.confirmationStatus || 'screenshot-evidence-present',
    importedAt
  } : null;
  await db.put('sessions', session);
  state.pendingStrengthAnalysisSessionId = null;
  await refreshState();
  renderAll();
  showScreen('history');
  toast('Strength Coach analysis imported as evidence; structured values were not overwritten');
}

function strengthHrEvidenceHtml(session) {
  const analysis = session.strengthAnalysis;
  const evidence = session.workoutHrEvidence || analysis?.workoutHrSummary;
  if (!analysis && !evidence) return '';
  const summary = analysis?.summary || 'Strength Coach analysis imported.';
  const evidenceLabel = evidence
    ? `HR evidence: ${evidence.avgHr ?? '–'} avg / ${evidence.maxHr ?? '–'} max / ${evidence.minHr ?? '–'} low · effort ${evidence.effort ?? '–'}`
    : 'No workout HR values were returned.';
  const hasCorrections = Boolean((analysis?.exerciseIdentityWarnings || []).length || (analysis?.setValidationWarnings || []).length || (analysis?.mediaReview?.roleCorrections || []).length || (analysis?.bloodPressureEvidence || []).length);
  const correctionsApplied = Boolean(analysis?.correctionAudit?.appliedAt);
  const correctionButton = hasCorrections && !correctionsApplied
    ? `<button class="button button-primary button-small" data-apply-strength-corrections="${escapeHtml(session.id)}">Apply confirmed exercise and media corrections</button>`
    : (correctionsApplied ? `<p><strong>Corrections applied:</strong> ${escapeHtml(new Date(analysis.correctionAudit.appliedAt).toLocaleString('en-GB'))}</p>` : '');
  return `<div class="liss-analysis strength-analysis"><strong>Strength Coach evidence</strong><p>${escapeHtml(summary)}</p><p>${escapeHtml(evidenceLabel)}</p><div class="history-actions">${evidence ? `<button class="button button-ghost button-small" data-confirm-strength-hr="${escapeHtml(session.id)}">Use confirmed HR screenshot values</button>` : ''}${correctionButton}</div></div>`;
}

async function applyStrengthAnalysisCorrections(sessionId) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  if (!session?.strengthAnalysis) throw new Error('No imported Strength Coach correction file is available.');
  const analysis = session.strengthAnalysis;
  const identityWarnings = analysis.exerciseIdentityWarnings || [];
  const setWarnings = analysis.setValidationWarnings || [];
  const mediaCorrections = analysis.mediaReview?.roleCorrections || [];
  const bpEvidence = analysis.bloodPressureEvidence || [];
  if (!identityWarnings.length && !setWarnings.length && !mediaCorrections.length && !bpEvidence.length) throw new Error('The analysis contains no applicable corrections.');
  if (!window.confirm('Apply the confirmed exercise names, separate stale exercise identities, repair set labels, remap the current-session images and import cuff-pulse evidence for this workout? Previous history is preserved but invalid machine comparisons will be stopped.')) return;

  const correctedAt = new Date().toISOString();
  const template = state.templates.find(item => item.id === session.templateId) || (session.templateId ? await db.get('templates', session.templateId) : null);
  const audit = { appliedAt: correctedAt, confirmedBy: 'Steve', exerciseCorrections: [], mediaCorrections: [], bloodPressureCorrections: [] };
  const duplicateIdsBefore = new Set(duplicateSourceExerciseIds(session).map(group => group.sourceExerciseId));

  for (const warning of identityWarnings) {
    const lineIndex = Number(warning.lineNumber || 0) - 1;
    const exercise = (lineIndex >= 0 ? session.exercises?.[lineIndex] : null)
      || (session.exercises || []).find(item => nameKey(item.name) === nameKey(warning.storedName));
    if (!exercise || !warning.confirmedName) continue;
    const before = structuredClone(exercise);
    const previousName = String(exercise.name || '').trim();
    const confirmedName = String(warning.confirmedName || '').trim();
    exercise.aliases ||= [];
    if (previousName && nameKey(previousName) !== nameKey(confirmedName) && !exercise.aliases.some(alias => nameKey(alias) === nameKey(previousName))) exercise.aliases.push(previousName);
    exercise.name = confirmedName;
    const inferredBrand = inferMachineBrand(confirmedName);
    if (inferredBrand) exercise.machineBrand = inferredBrand;
    const inferredModel = inferMachineModel(confirmedName, inferredBrand);
    if (inferredModel) exercise.machineModel = inferredModel;
    const inferredMovement = inferMovementPattern(confirmedName);
    if (inferredMovement) exercise.movementPattern = inferredMovement;
    exercise.photoEvidenceConflict = false;
    exercise.identityConflictBlocking = false;

    const warningText = `${warning.issue || ''} ${warning.comparisonImpact || ''}`.toLowerCase();
    const brandBefore = inferMachineBrand(previousName) || before.machineBrand || '';
    const brandAfter = inferredBrand || exercise.machineBrand || '';
    const brandChanged = Boolean(brandBefore && brandAfter && nameKey(brandBefore) !== nameKey(brandAfter));
    const needsNewIdentity = nameKey(previousName) !== nameKey(confirmedName) && (
      duplicateIdsBefore.has(before.sourceExerciseId)
      || brandChanged
      || /unique source|new unique|invalid|different machine|remove inherited|incorrect source|wrong source|unverified|do not compare|conflict/.test(warningText)
    );
    if (needsNewIdentity) {
      exercise.sourceExerciseId = stableId('exercise', `${confirmedName}|${exercise.machineBrand || ''}|${exercise.machineModel || ''}|${session.id}|${warning.lineNumber || ''}`);
      exercise.comparisonHistoryInvalidated = true;
      exercise.identityCorrectedAt = correctedAt;
      exercise.identityCorrectionSource = analysis.schema || 'vantage-strength-analysis-v1';
    }

    if (template) {
      const templateExercise = (template.exercises || []).find(item =>
        item.sourceExerciseId === before.sourceExerciseId || nameKey(item.name) === nameKey(previousName)
      ) || (lineIndex >= 0 ? template.exercises?.[lineIndex] : null);
      if (templateExercise) {
        templateExercise.aliases ||= [];
        if (previousName && nameKey(previousName) !== nameKey(confirmedName) && !templateExercise.aliases.some(alias => nameKey(alias) === nameKey(previousName))) templateExercise.aliases.push(previousName);
        templateExercise.name = confirmedName;
        templateExercise.machineBrand = exercise.machineBrand || '';
        templateExercise.machineModel = exercise.machineModel || '';
        templateExercise.movementPattern = exercise.movementPattern || '';
        templateExercise.variation = exercise.variation || '';
        templateExercise.sourceExerciseId = exercise.sourceExerciseId;
        templateExercise.id = exercise.sourceExerciseId;
        templateExercise.comparisonHistoryInvalidated = exercise.comparisonHistoryInvalidated === true;
        templateExercise.identityCorrectedAt = correctedAt;
      }
    }
    audit.exerciseCorrections.push({ lineNumber: warning.lineNumber || null, before, after: structuredClone(exercise), reason: warning.issue || '' });
  }

  for (const warning of setWarnings) {
    const exercise = (session.exercises || []).find(item => nameKey(item.name) === nameKey(warning.exercise));
    if (!exercise) continue;
    const required = String(warning.requiredCorrection || '');
    const issue = String(warning.issue || '');
    const replacement = required.match(/set\s+notes\s+with\s+(.+?)(?:\.|$)/i)?.[1]?.trim() || exercise.name;
    const staleLabel = issue.match(/(?:say|label(?:led)?\s+as|identify(?:ing)?\s+)(.+?)(?:\.|,|$)/i)?.[1]?.trim();
    if (/set notes/i.test(issue) || /set notes/i.test(required)) {
      for (const set of exercise.sets || []) {
        const note = String(set.notes || '').trim();
        if (!note) continue;
        const staleMatch = staleLabel && nameKey(note).includes(nameKey(staleLabel));
        const exactWrongParent = nameKey(note) !== nameKey(exercise.name) && /fly|press|curl|row|extension|raise|pulldown|squat|deadlift/i.test(note);
        if (staleMatch || exactWrongParent) set.notes = replacement;
      }
    }
  }

  const storedMedia = await sessionMedia(session.id);
  for (const correction of mediaCorrections) {
    const media = storedMedia.find(item => item.name === correction.file || item.originalName === correction.file);
    const exercise = (session.exercises || []).find(item => nameKey(item.name) === nameKey(correction.correctExercise));
    if (!media || !exercise) continue;
    const before = { linkedExerciseId: media.linkedExerciseId || null, sourceExerciseId: media.sourceExerciseId || null, linkedExerciseName: media.linkedExerciseName || null, sourceRole: media.sourceRole || null };
    media.linkedExerciseId = exerciseSessionMediaKey(exercise);
    media.sourceExerciseId = exercise.sourceExerciseId || null;
    media.linkedExerciseName = exercise.name;
    media.sourceRole = correction.correctRole || media.sourceRole || 'exerciseSessionPhoto';
    media.currentSession = true;
    media.userAttachedThisSession = true;
    media.mappingConfidence = 'user-confirmed';
    media.mappingConfirmedAt = correctedAt;
    exercise.photoIdentityReviewed = true;
    exercise.photoIdentitySourceFile = correction.file;
    exercise.photoIdentityConfirmedAt = correctedAt;
    await db.put('sessionMedia', media);
    audit.mediaCorrections.push({ file: correction.file, before, after: { linkedExerciseId: media.linkedExerciseId, sourceExerciseId: media.sourceExerciseId, linkedExerciseName: media.linkedExerciseName, sourceRole: media.sourceRole } });
  }

  session.bloodPressureReadings ||= [];
  for (const evidence of bpEvidence) {
    const pulse = Number(evidence.cuffPulse ?? evidence.pulse);
    const row = {
      context: evidence.context || 'morning vitals', time: evidence.time || '',
      systolic: evidence.systolic ?? null, diastolic: evidence.diastolic ?? null,
      pulse: Number.isFinite(pulse) ? pulse : null, source: evidence.source || 'manual cuff photograph',
      recordedAt: correctedAt, confirmationStatus: 'user-confirmed-correction'
    };
    const duplicate = session.bloodPressureReadings.some(item => item.context === row.context && item.time === row.time && Number(item.pulse) === Number(row.pulse));
    if (!duplicate) session.bloodPressureReadings.push(row);
    audit.bloodPressureCorrections.push(row);
  }

  analysis.correctionAudit = audit;
  session.strengthAnalysis = analysis;
  await db.put('sessions', session);
  if (template) await db.put('templates', template);
  await refreshState();
  renderAll();
  showScreen('history');
  toast(`Applied ${audit.exerciseCorrections.length} exercise and ${audit.mediaCorrections.length} media corrections`);
}

async function confirmStrengthHrEvidence(sessionId) {
  const session = state.sessions.find(item => item.id === sessionId) || await db.get('sessions', sessionId);
  if (!session) throw new Error('Strength session not found.');
  const evidence = session.workoutHrEvidence || session.strengthAnalysis?.workoutHrSummary;
  if (!evidence) throw new Error('No HR screenshot evidence is available.');
  const structured = session.workoutHrSummary || { hrSource: 'strap', hrZones: {} };
  const scalarKeys = ['timeRange', 'durationMinutes', 'avgHr', 'maxHr', 'minHr', 'calories', 'effort', 'hrSource'];
  const conflicts = scalarKeys.filter(key => evidence[key] != null && structured[key] != null && String(evidence[key]) !== String(structured[key]));
  const message = conflicts.length
    ? `This will replace ${conflicts.join(', ')} with the screenshot-derived values. The previous values and confirmation time remain in the audit. Continue?`
    : 'Use the clear screenshot-derived HR values as the confirmed structured workout HR summary?';
  if (!window.confirm(message)) return;
  const previous = structuredClone(structured);
  for (const key of scalarKeys) if (evidence[key] != null) structured[key] = evidence[key];
  structured.hrZones ||= {};
  for (const key of ['z1Percent','z1Minutes','z2Percent','z2Minutes','z3Percent','z3Minutes','z4Percent','z4Minutes','z5Percent','z5Minutes']) {
    if (evidence.hrZones?.[key] != null) structured.hrZones[key] = evidence.hrZones[key];
  }
  const confirmedAt = new Date().toISOString();
  structured.confirmationStatus = 'user-confirmed-screenshot-correction';
  structured.confirmedAt = confirmedAt;
  structured.confirmedBy = 'Steve';
  structured.sourceFile = evidence.sourceFile || null;
  session.workoutHrSummary = structured;
  session.strengthAnalysis ||= {};
  session.strengthAnalysis.confirmationAudit ||= [];
  session.strengthAnalysis.confirmationAudit.push({ type: 'workoutHrSummary', previous, corrected: structuredClone(structured), confirmedAt, confirmedBy: 'Steve', sourceFile: evidence.sourceFile || null });
  await db.put('sessions', session);
  await refreshState();
  renderAll();
  showScreen('history');
  toast('Workout HR screenshot values confirmed and stored');
}


function closeOcrReview() {
  $('#ocrReviewDialog')?.close();
  if (state.ocrObjectUrl) URL.revokeObjectURL(state.ocrObjectUrl);
  state.ocrObjectUrl = null; state.ocrResult = null; state.ocrContext = null;
}

async function latestLissMediaBlob(mediaId = null) {
  if (!isLissSession(state.currentSession)) return null;
  const media = await sessionMedia(state.currentSession.id);
  if (mediaId) return media.find(item => item.id === mediaId) || null;
  return media.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0] || null;
}
async function latestWorkoutHrMediaBlob(mediaId = null) {
  if (!state.currentSession || isLissSession(state.currentSession)) return null;
  const media = (await sessionMedia(state.currentSession.id)).filter(item => item.sourceRole === 'workoutHrSummary');
  if (mediaId) return media.find(item => item.id === mediaId) || null;
  return media.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0] || null;
}

async function openOcrReview(context, mediaId = null) {
  const item = context === 'liss' ? await latestLissMediaBlob(mediaId) : await latestWorkoutHrMediaBlob(mediaId);
  if (!item?.blob) return toast(`Attach a ${context === 'liss' ? 'LISS' : context === 'recovery' ? 'recovery HR' : 'workout HR'} screenshot first`);
  state.ocrContext = { type: context, media: item }; state.ocrResult = null;
  if (state.ocrObjectUrl) URL.revokeObjectURL(state.ocrObjectUrl);
  state.ocrObjectUrl = URL.createObjectURL(item.blob); $('#ocrPreviewImage').src = state.ocrObjectUrl;
  $('#ocrProgress').innerHTML = '<div class="import-success"><strong>Preparing OCR…</strong><p>The first scan may download the OCR engine and English model.</p></div>';
  $('#ocrParsedResults').innerHTML = ''; $('#ocrRawText').value = ''; $('#applyOcrSuggestionsButton').disabled = true; $('#keepOcrEvidenceButton').disabled = true;
  $('#ocrReviewDialog').showModal();
  try {
    const result = await runExperimentalOcr(item.blob, { onProgress: progress => { $('#ocrProgress').innerHTML = `<div class="import-success"><strong>${escapeHtml(progress.status)}</strong><p>${Math.round((progress.progress || 0) * 100)}%</p></div>`; } });
    const parsed = parseFitnessSummaryText(result.text, {
      expectedContext: context,
      roleHint: context === 'liss' && item.sourceRoleConfirmed === true ? normaliseLissMediaRole(item.sourceRole) : null
    });
    state.ocrResult = { ...result, parsed };
    $('#ocrRawText').value = result.text || '';
    $('#ocrParsedResults').innerHTML = ocrResultRows(parsed);
    $('#ocrProgress').innerHTML = `<div class="${parsed.confidence === 'low' ? 'alert alert-warning' : 'import-success'}"><strong>${parsed.confidence === 'low' ? 'Needs review' : 'OCR complete'}</strong><p>Confidence: ${escapeHtml(parsed.confidence)}. Review every value before using it.</p></div>`;
    $('#applyOcrSuggestionsButton').disabled = false; $('#keepOcrEvidenceButton').disabled = false;
  } catch (error) {
    $('#ocrProgress').innerHTML = `<div class="alert alert-warning"><strong>OCR could not run:</strong> ${escapeHtml(error.message)}<p>Use the manual source fields or send the Coach Pack to Alex.</p></div>`;
  }
}

function mergeOcrInto(target, parsed) {
  const conflicts = [];
  const promotable = parsed.promotionMetrics || parsed.metrics || {};
  for (const [key,value] of Object.entries(promotable)) {
    if (value == null || value === '') continue;
    if (key === 'hrZones') continue;
    if (target[key] == null || target[key] === '') target[key] = value;
    else if (String(target[key]) !== String(value)) conflicts.push({ field:key, structured:target[key], ocr:value, resolution:'Existing structured value preserved.' });
  }
  target.hrZones ||= {};
  for (const [key,value] of Object.entries(promotable.hrZones || {})) {
    if (value == null) continue;
    if (target.hrZones[key] == null) target.hrZones[key] = value;
    else if (String(target.hrZones[key]) !== String(value)) conflicts.push({ field:`hrZones.${key}`, structured:target.hrZones[key], ocr:value, resolution:'Existing structured value preserved.' });
  }
  return conflicts;
}

async function applyOcrSuggestions() {
  const result = state.ocrResult?.parsed; const context = state.ocrContext;
  if (!result || !context) return;
  const validation = ocrValidationState(result, { userConfirmedMetrics: true, ocrReviewed: true });
  const detectedDate = result.metrics?.dateShown || context.media.dateDetected || context.media.fileDate || null;
  Object.assign(context.media, {
    ocrReviewed: true,
    metricsValidated: validation.metricsValidated,
    metricsUserConfirmed: validation.metricsUserConfirmed,
    metricsConfirmed: validation.metricsConfirmed,
    validationStatus: validation.validationStatus,
    extractionStatus: validation.extractionStatus,
    ocrMetrics: structuredClone(result.metrics || {}),
    ocrPromotionMetrics: structuredClone(result.promotionMetrics || {}),
    ocrParsedEvidence: structuredClone(result.parsedEvidence || {}),
    ocrRawText: state.ocrResult?.text || '',
    ocrExtractionConfidence: result.extractionConfidence || result.confidence || 'unknown',
    ocrWarnings: [...new Set([...(result.warnings || []), ...(validation.validationWarnings || [])])],
    ocrBlockedFields: [...(validation.blockedFields || [])],
    ocrValidatedFields: [...(validation.validatedFields || [])],
    ocrFieldValidation: structuredClone(validation.fieldValidation || {}),
    ocrSourceQuality: structuredClone(result.sourceQuality || {}),
    ocrMetricQuality: structuredClone(result.metricQuality || {}),
    ocrZoneMinutesIncomplete: result.zoneMinutesIncomplete === true,
    ocrAnalysisEligibility: structuredClone(result.analysisEligibility || {}),
    ocrExtractedAt: new Date().toISOString(),
    dateDetected: detectedDate,
    dateMatchesSession: Boolean(detectedDate && detectedDate === state.currentSession?.date),
    dateUserConfirmed: context.media.dateUserConfirmed === true || context.media.dateConfirmed === true
  });

  // A role assignment or a click on Apply must never override failed validation.
  // Red/blocked OCR stays as candidate evidence until Steve corrects/validates it.
  if (!validation.metricsValidated) {
    // v1.3.10.6 field-level promotion: valid fields are still promoted while only
    // blocked fields remain candidate evidence/review-required.
    if (context.type === 'liss' && isLissSession(state.currentSession)) {
      const source = lissRoleToMetricSource(result.sourceRole);
      if (source) {
        state.currentSession.cardio.sources ||= defaultLissSources();
        const target = state.currentSession.cardio.sources[source] ||= {};
        mergeOcrInto(target, { ...result, promotionMetrics: result.promotionMetrics || {} });
        target.sourceType = 'ocr-partially-validated'; target.sourceFile = context.media.name; target.sourceSystem = result.sourceSystem; target.sensor = result.sensor; target.sourceRole = result.sourceRole;
        target.validationStatus = 'review-required'; target.blockedFields = [...(validation.blockedFields || [])]; target.fieldValidation = structuredClone(validation.fieldValidation || {});
        target.sourceQuality = structuredClone(result.sourceQuality || {}); target.metricQuality = structuredClone(result.metricQuality || {}); target.zoneMinutesIncomplete = result.zoneMinutesIncomplete === true; target.analysisEligibility = structuredClone(result.analysisEligibility || {});
      }
      state.currentSession.cardio.ocrEvidence ||= [];
      state.currentSession.cardio.ocrEvidence.push({
        sourceFile: context.media.name, sourceRole: result.sourceRole, sourceSystem: result.sourceSystem, sensor: result.sensor,
        rawMetrics: structuredClone(result.metrics || {}), candidateMetrics: structuredClone(result.promotionMetrics || {}), parsedEvidence: structuredClone(result.parsedEvidence || {}),
        sourceQuality: structuredClone(result.sourceQuality || {}), metricQuality: structuredClone(result.metricQuality || {}), zoneMinutesIncomplete: result.zoneMinutesIncomplete === true, analysisEligibility: structuredClone(result.analysisEligibility || {}),
        validationStatus: validation.validationStatus, blockedFields: [...(validation.blockedFields || [])], warnings: [...(context.media.ocrWarnings || [])],
        rawText: state.ocrResult?.text || '', confirmationStatus: 'review-required', createdAt: new Date().toISOString()
      });
      context.media.photoType = 'current-session-evidence'; context.media.currentSession = true; context.media.userAttachedThisSession = true;
    } else if (['workout','recovery'].includes(context.type) && state.currentSession) {
      state.currentSession.workoutHrSummary ||= { hrSource:'strap', hrZones:{} };
      mergeOcrInto(state.currentSession.workoutHrSummary, { ...result, promotionMetrics: result.promotionMetrics || {} });
      state.currentSession.workoutHrEvidence = {
        ...(result.metrics || {}), rawCandidateMetrics: structuredClone(result.metrics || {}), promotionMetrics: structuredClone(result.promotionMetrics || {}),
        parsedEvidence: structuredClone(result.parsedEvidence || {}), rawOcrText: state.ocrResult?.text || '', extractionConfidence: result.extractionConfidence || result.confidence || 'unknown',
        sourceRole: 'workoutHrSummary', sourceSystem: 'NOOP', sensor: 'noopStrap', sourceFile: context.media.name,
        confirmationStatus: 'review-required', metricsValidated: false, blockedFields: [...(validation.blockedFields || [])], validatedFields: [...(validation.validatedFields || [])], fieldValidation: structuredClone(validation.fieldValidation || {}), validationWarnings: [...(validation.validationWarnings || [])], suspiciousValues: [...(context.media.ocrWarnings || [])]
      };
      context.media.sourceRole = 'workoutHrSummary'; context.media.sourceSystem = 'NOOP'; context.media.sensor = 'noopStrap';
      context.media.photoType = 'current-session-evidence'; context.media.currentSession = true; context.media.userAttachedThisSession = true; context.media.includeInCoachPack = true;
    }
    await db.put('sessionMedia', context.media);
    persistDraft(); closeOcrReview(); renderAll();
    return toast(`OCR needs review${validation.blockedFields.length ? `: ${validation.blockedFields.join(', ')} not promoted` : ''}`);
  }

  if (context.type === 'liss' && isLissSession(state.currentSession)) {
    const source = lissRoleToMetricSource(result.sourceRole);
    state.currentSession.cardio.sources ||= defaultLissSources();
    if (!source) {
      state.currentSession.cardio.ocrEvidence ||= [];
      state.currentSession.cardio.ocrEvidence.push({
        sourceFile: context.media.name, sourceRole: result.sourceRole, sourceSystem: result.sourceSystem, sensor: result.sensor,
        metrics: structuredClone(result.metrics || {}), parsedEvidence: structuredClone(result.parsedEvidence || {}), extractionConfidence: result.extractionConfidence || result.confidence || 'unknown',
        sourceQuality: structuredClone(result.sourceQuality || {}), metricQuality: structuredClone(result.metricQuality || {}), zoneMinutesIncomplete: result.zoneMinutesIncomplete === true, analysisEligibility: structuredClone(result.analysisEligibility || {}), warnings: [...(result.warnings || [])], rawText: state.ocrResult?.text || '',
        confirmed: true, confirmationStatus: 'user-confirmed-image-evidence', metricsValidated: true, metricsUserConfirmed: true, createdAt: new Date().toISOString()
      });
      context.media.photoType = 'current-session-evidence'; context.media.currentSession = true; context.media.userAttachedThisSession = true;
      await db.put('sessionMedia', context.media); persistDraft();
      toast('Validated OCR saved as separate current-session evidence; structured values were not changed');
      closeOcrReview(); renderAll(); return;
    }
    const target = state.currentSession.cardio.sources[source] ||= {};
    const conflicts = mergeOcrInto(target, result);
    target.sourceType = 'ocr-confirmed'; target.sourceFile = context.media.name; target.sourceSystem = result.sourceSystem; target.sensor = result.sensor; target.sourceRole = result.sourceRole;
    target.extractionConfidence = result.extractionConfidence; target.confirmationStatus = 'user-confirmed-ocr'; target.ocrConfirmationStatus = 'user-confirmed'; target.ocrConfirmedAt = new Date().toISOString(); target.ocrSourceFile = context.media.name;
    target.sourceQuality = structuredClone(result.sourceQuality || {}); target.metricQuality = structuredClone(result.metricQuality || {}); target.zoneMinutesIncomplete = result.zoneMinutesIncomplete === true; target.analysisEligibility = structuredClone(result.analysisEligibility || {});
    await db.put('sessionMedia', context.media);
    state.currentSession.cardio.ocrConflicts = [...(state.currentSession.cardio.ocrConflicts || []), ...conflicts];
    if (result.activityType && result.activityType !== state.currentSession.cardio.activityType) state.currentSession.cardio.clarityQuestions = [...(state.currentSession.cardio.clarityQuestions || []), { question:`Screenshot says ${result.activityShown}; app says ${activityLabel(state.currentSession.cardio.activityType)}. Confirm the activity type.`, requiredBeforeFinalAnalysis:true }];
    persistDraft(); syncLissFieldsFromSession(state.currentSession); toast(conflicts.length ? 'Validated OCR added; conflicts preserved' : 'Validated OCR values added');
  } else if (['workout','recovery'].includes(context.type) && state.currentSession && !isLissSession(state.currentSession)) {
    const evidence = structuredClone(result.metrics || {});
    evidence.parsedEvidence = structuredClone(result.parsedEvidence || {}); evidence.rawOcrText = state.ocrResult?.text || ''; evidence.extractionConfidence = result.extractionConfidence || result.confidence || 'unknown';
    evidence.sourceRole = 'workoutHrSummary'; evidence.sourceSystem = 'NOOP'; evidence.sensor = 'noopStrap'; evidence.sourceFile = context.media.name; evidence.confirmationStatus = 'user-confirmed-ocr';
    evidence.metricsValidated = true; evidence.metricsUserConfirmed = true; evidence.sourceQuality = structuredClone(result.sourceQuality || {}); evidence.metricQuality = structuredClone(result.metricQuality || {}); evidence.zoneMinutesIncomplete = result.zoneMinutesIncomplete === true; evidence.analysisEligibility = structuredClone(result.analysisEligibility || {}); evidence.suspiciousValues = result.warnings || [];
    state.currentSession.workoutHrEvidence = evidence;
    state.currentSession.workoutHrSummary ||= { hrSource:'strap', hrZones:{} };
    const conflicts = mergeOcrInto(state.currentSession.workoutHrSummary, result);
    state.currentSession.workoutHrConflicts = [...(state.currentSession.workoutHrConflicts || []), ...conflicts];
    context.media.sourceRole = 'workoutHrSummary'; context.media.sourceSystem = 'NOOP'; context.media.sensor = 'noopStrap'; context.media.photoType = 'current-session-evidence'; context.media.currentSession = true; context.media.userAttachedThisSession = true; context.media.includeInCoachPack = true; context.media.mappingConfidence = 'user-confirmed';
    await db.put('sessionMedia', context.media);
    if (context.type === 'recovery' && result.activityShown) state.currentSession.recoverySession.activity = result.activityShown;
    persistDraft(); if (isRecoverySession(state.currentSession)) syncRecoverySessionFields(state.currentSession); else syncWorkoutHrFields(state.currentSession);
    toast(conflicts.length ? 'Validated OCR evidence saved; existing values preserved' : 'Validated OCR HR values added');
  }
  closeOcrReview(); renderAll();
}

function keepOcrEvidenceOnly() {
  const result=state.ocrResult?.parsed, context=state.ocrContext; if(!result||!context) return;
  if(context.type==='liss'&&isLissSession(state.currentSession)){
    state.currentSession.cardio.ocrEvidence ||= [];
    state.currentSession.cardio.ocrEvidence.push({sourceFile:context.media.name,sourceRole:result.sourceRole,metrics:result.metrics,parsedEvidence:result.parsedEvidence,extractionConfidence:result.extractionConfidence||result.confidence||'unknown',warnings:result.warnings,rawText:state.ocrResult.text,confirmed:false,createdAt:new Date().toISOString()});
    context.media.extractionStatus = 'ocr-evidence-unconfirmed';
    context.media.metricsConfirmed = false; context.media.ocrReviewed = true;
    context.media.ocrMetrics = structuredClone(result.metrics || {});
    context.media.ocrWarnings = [...(result.warnings || [])];
    context.media.ocrExtractedAt = new Date().toISOString();
    db.put('sessionMedia', context.media).catch(console.error);
    persistDraft();
  }
  else if (['workout','recovery'].includes(context.type) && state.currentSession) {
    state.currentSession.workoutHrEvidence = { ...(result.metrics || {}), parsedEvidence:structuredClone(result.parsedEvidence || {}), rawOcrText:state.ocrResult?.text || '', extractionConfidence:result.extractionConfidence||result.confidence||'unknown', sourceRole:'workoutHrSummary', sourceSystem:'NOOP', sensor:'noopStrap', sourceFile:context.media.name, confirmationStatus:'screenshot-evidence-present', suspiciousValues:result.warnings || [] };
    context.media.photoType = 'current-session-evidence'; context.media.currentSession = true; context.media.userAttachedThisSession = true; context.media.includeInCoachPack = true;
    context.media.extractionStatus = 'ocr-evidence-unconfirmed'; context.media.metricsConfirmed = false; context.media.ocrReviewed = true; context.media.ocrMetrics = structuredClone(result.metrics || {}); context.media.ocrParsedEvidence = structuredClone(result.parsedEvidence || {}); context.media.ocrRawText = state.ocrResult?.text || ''; context.media.ocrExtractionConfidence = result.extractionConfidence||result.confidence||'unknown'; context.media.ocrWarnings = [...(result.warnings || [])]; context.media.ocrExtractedAt = new Date().toISOString();
    db.put('sessionMedia', context.media).catch(console.error); persistDraft();
  }
  closeOcrReview(); renderAll(); toast('OCR kept as unconfirmed evidence');
}

function bindEvents() {
  $('#runLissOcrButton')?.addEventListener('click', () => openOcrReview('liss'));
  $('#runWorkoutHrOcrButton')?.addEventListener('click', () => openOcrReview('workout'));
  $('#runRecoveryHrOcrButton')?.addEventListener('click', () => openOcrReview('recovery'));
  $('#closeOcrReviewDialogButton')?.addEventListener('click', closeOcrReview);
  $('#applyOcrSuggestionsButton')?.addEventListener('click', applyOcrSuggestions);
  $('#keepOcrEvidenceButton')?.addEventListener('click', keepOcrEvidenceOnly);
  $('#saveHydrationAndContinueButton')?.addEventListener('click', () => finishHydrationReminder('add'));
  $('#noHydrationAndContinueButton')?.addEventListener('click', () => finishHydrationReminder('none'));
  $('#skipHydrationAndContinueButton')?.addEventListener('click', () => finishHydrationReminder('skip'));
  $('#closeHydrationReminderButton')?.addEventListener('click', () => finishHydrationReminder('cancel'));
  $('#hydrationReminderDialog')?.addEventListener('cancel', event => { event.preventDefault(); finishHydrationReminder('cancel'); });
  $('.bottom-nav button').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.nav)));
  $('[data-go]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.go)));
  window.addEventListener('vantage-cloud-data-applied', async event => {
    await refreshState();
    renderAll();
    const detail = event.detail || {};
    const count = Number(detail.downloaded || 0) + Number(detail.deleted || 0);
    if (count > 0) toast(`Cloud update applied · ${count} local change${count === 1 ? '' : 's'}`);
  });
  $('#recordRestDayButton').addEventListener('click', recordRestDay);
  $('#todayPlan').addEventListener('click', event => {
    if (event.target.closest('[data-undo-rest-day]')) removeTodayRestDay();
  });
  $('#defaultRecoveryRoutineList')?.addEventListener('click', async event => {
    const complete = event.target.closest('[data-routine-complete]');
    const skip = event.target.closest('[data-routine-skip]');
    if (complete) await markDefaultRecoveryRoutine(complete.dataset.routineComplete, 'complete');
    if (skip) await markDefaultRecoveryRoutine(skip.dataset.routineSkip, 'skip');
  });

  $('#recoveryActivitySections').addEventListener('change', event => {
    const select = event.target.closest('[data-recovery-section-select]');
    if (!select) return;
    recoverySectionSelections[select.dataset.recoverySectionSelect] = select.value;
    renderRecovery();
  });
  $('#recoveryActivitySections').addEventListener('click', async event => {
    const button = event.target.closest('[data-recovery-action]');
    if (!button) return;
    const activityId = button.dataset.recoveryActivity;
    const action = button.dataset.recoveryAction;
    if (action === 'save') await saveRecoveryAction(activityId);
  });
  $('#recoveryTodayList').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-recovery-log]');
    if (!button) return;
    await db.remove('recoveryLogs', button.dataset.deleteRecoveryLog);
    await refreshState(); renderAll(); showScreen('recovery'); toast('Recovery entry deleted');
  });
  $$('#modePicker button').forEach(button => button.addEventListener('click', () => {
    state.selectedMode = button.dataset.mode;
    $$('#modePicker button').forEach(item => item.classList.toggle('active', item === button));
  }));

  $('#templateSelect').addEventListener('change', updateWorkoutSetupForTemplate);

  $('#startWorkoutButton').addEventListener('click', async () => {
    const template = state.templates.find(item => item.id === $('#templateSelect').value);
    if (!template) return;
    if (state.currentSession && state.currentSession.templateId === template.id && state.currentSession.date === today()) {
      toast('Current session loaded'); return;
    }
    if (state.currentSession && state.currentSession.date !== today()) {
      const startFresh = window.confirm(`A workout draft from ${state.currentSession.date} is still open. Start a fresh session for ${today()}? The old draft and its unsaved attachments will be removed.`);
      if (!startFresh) return;
      await discardCurrentSessionMedia();
      state.currentSession = null;
      persistDraft();
    }
    if (todayRestDay()) await removeTodayRestDay({ silent: true });
    state.currentSession = createSessionFromTemplate(template, state.selectedMode);
    state.currentLissMedia = [];
    clearPendingLissMediaReview();
    clearMediaObjectUrls();
    persistDraft(); renderAll(); toast(`${template.name} loaded`);
  });

  $('#discardWorkoutButton').addEventListener('click', async () => {
    await discardCurrentSessionMedia();
    state.currentSession = null; persistDraft(); renderAll(); toast('Workout draft reset');
  });

  $('#sessionNotes').addEventListener('input', event => {
    if (state.currentSession && !isLissSession(state.currentSession)) { state.currentSession.notes = event.target.value; persistDraft(); }
  });

  $$('#lissActivityPicker button').forEach(button => button.addEventListener('click', () => {
    if (!isLissSession(state.currentSession)) return;
    state.currentSession.cardio.activityType = button.dataset.lissActivity;
    persistDraft();
    syncLissFieldsFromSession(state.currentSession);
  }));
  $('#lissMaxHrArtifact')?.addEventListener('change', updateLissMaxHrArtifactFromForm);
  $('#lissMaxHrArtifactReason')?.addEventListener('input', updateLissMaxHrArtifactFromForm);
  $('#lissFasted').addEventListener('change', event => {
    if (!isLissSession(state.currentSession)) return;
    state.currentSession.cardio.fasted = event.target.checked;
    persistDraft();
  });
  $('#lissNasalBreathing').addEventListener('change', event => {
    if (!isLissSession(state.currentSession)) return;
    state.currentSession.cardio.nasalBreathing = event.target.checked;
    persistDraft();
  });
  $('#lissNextPlannedSession').addEventListener('input', event => {
    if (!isLissSession(state.currentSession)) return;
    state.currentSession.cardio.nextPlannedSession = event.target.value;
    persistDraft();
  });
  for (const selector of ['#lissManualDurationMinutes', '#lissManualStartTime', '#lissManualEndTime']) $(selector)?.addEventListener('input', updateLissManualTimingFromForm);
  $('#lissComments').addEventListener('input', event => {
    if (!isLissSession(state.currentSession)) return;
    state.currentSession.cardio.comments = event.target.value;
    state.currentSession.notes = event.target.value;
    persistDraft();
  });
  for (const selector of ['#lissPreBpTime', '#lissPreSystolic', '#lissPreDiastolic', '#lissPrePulse']) {
    $(selector)?.addEventListener('input', updatePreLissBpFromForm);
  }
  for (const selector of ['#lissCoconutWaterMl', '#lissWaterMl', '#lissOtherFluidMl', '#lissAminoAcids', '#lissElectrolytes', '#lissHydrationNotes', '#lissMacroCorrection']) {
    $(selector)?.addEventListener('input', updateLissHydrationFromForm);
  }
  $$('[data-liss-source][data-liss-key]').forEach(node => {
    const handler = event => setLissSourceMetric(event.target.dataset.lissSource, event.target.dataset.lissKey, event.target.value, event.target.dataset.lissType || (event.target.type === 'text' ? 'text' : 'number'));
    node.addEventListener('input', handler);
    node.addEventListener('change', handler);
  });
  $('#openLissCameraButton').addEventListener('click', () => $('#lissCameraInput').click());
  $('#openLissGalleryButton').addEventListener('click', () => $('#lissGalleryInput').click());
  $('#openLissHrButton').addEventListener('click', () => $('#lissHrInput').click());
  $('#openLissBpButton')?.addEventListener('click', () => $('#lissBpInput').click());
  $('#lissCameraInput').addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    files.forEach(file => requestImmediateCameraBackup(file, 'VANTAGE_LISS_Camera', state.currentSession?.date || today()));
    try { await addLissImages(files, 'camera', 'treadmillMachineConsole'); } catch (error) { toast(error.message); }
    event.target.value = '';
  });
  $('#lissGalleryInput').addEventListener('change', async event => {
    try { await stageLissGalleryImages(event.target.files); } catch (error) { toast(error.message); }
    event.target.value = '';
  });
  $('#lissHrInput').addEventListener('change', async event => {
    try { await addLissImages(event.target.files, 'gallery', 'noopStrapSessionSummary'); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach HR summary'); }
    event.target.value = '';
  });
  $('#lissBpInput')?.addEventListener('change', async event => {
    try { await addLissImages(event.target.files, 'gallery', 'preLissBloodPressure'); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach pre-LISS BP screenshot'); }
    event.target.value = '';
  });
  $('#lissPendingApplyAllRole').addEventListener('change', event => {
    const role = event.target.value;
    if (!role) return;
    (state.pendingLissMedia || []).forEach(item => { item.role = normaliseLissMediaRole(role); });
    renderPendingLissMediaReview();
    $('#lissPendingApplyAllRole').value = role;
  });
  $('#savePendingLissMediaButton').addEventListener('click', () => savePendingLissMedia().catch(error => {
    console.error(error);
    toast(error.message || 'Could not attach labelled images');
  }));
  $('#cancelPendingLissMediaButton').addEventListener('click', () => {
    clearPendingLissMediaReview();
    setImageImportStatus($('#lissImageStatus'), 'Image selection cancelled.', '');
  });
  $('#completeLissButton').addEventListener('click', completeCurrentLissSession);
  $('#lissAnalysisInput').addEventListener('change', async event => {
    try { await importLissAnalysisFile(event.target.files[0]); }
    catch (error) { console.error(error); toast(`Analysis import failed: ${error.message}`); }
    event.target.value = '';
  });
  $('#strengthAnalysisInput').addEventListener('change', async event => {
    try { await importStrengthAnalysisFile(event.target.files[0]); }
    catch (error) { console.error(error); toast(`Strength analysis import failed: ${error.message}`); }
    event.target.value = '';
  });

  for (const selector of ['#recoverySessionActivity','#recoverySessionDuration','#recoverySessionStartTime','#recoverySessionEndTime','#recoverySessionNotes']) {
    $(selector)?.addEventListener('input', updateRecoverySessionFromForm);
    $(selector)?.addEventListener('change', updateRecoverySessionFromForm);
  }
  $('#chooseRecoveryHrButton')?.addEventListener('click', () => $('#recoveryHrInput').click());
  $('#recoveryHrInput')?.addEventListener('change', async event => {
    try { await addWorkoutHrImages(event.target.files); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach recovery HR screenshot'); }
    event.target.value = '';
  });
  $$('[data-recovery-hr-key]').forEach(node => {
    const handler = event => {
      const session = state.currentSession;
      if (!isRecoverySession(session)) return;
      session.workoutHrSummary ||= { hrSource:'strap', hrZones:{} };
      const value = event.target.value === '' ? null : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
      setPathValue(session.workoutHrSummary, event.target.dataset.recoveryHrKey, value); persistDraft();
    };
    node.addEventListener('input', handler); node.addEventListener('change', handler);
  });
  $('#completeRecoverySessionButton')?.addEventListener('click', completeCurrentRecoverySession);

  $('#chooseWorkoutHrButton').addEventListener('click', () => $('#workoutHrInput').click());
  $('#workoutHrInput').addEventListener('change', async event => {
    try { await addWorkoutHrImages(event.target.files); }
    catch (error) { console.error(error); toast(error.message || 'Could not attach workout HR screenshot'); }
    event.target.value = '';
  });
  $$('[data-workout-hr-key]').forEach(node => {
    const handler = event => {
      const session = state.currentSession;
      if (!session || isLissSession(session)) return;
      session.workoutHrSummary ||= { hrSource: 'strap', hrZones: {} };
      const value = event.target.value === '' ? null : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
      setPathValue(session.workoutHrSummary, event.target.dataset.workoutHrKey, value);
      persistDraft();
    };
    node.addEventListener('input', handler);
    node.addEventListener('change', handler);
  });
  for (const selector of ['#preWorkoutBpTime', '#preWorkoutSystolic', '#preWorkoutDiastolic', '#preWorkoutPulse']) {
    $(selector).addEventListener('input', updatePreWorkoutBpFromForm);
    $(selector).addEventListener('change', updatePreWorkoutBpFromForm);
  }

  $('#includeActiveReferencePhotosCheckbox')?.addEventListener('change', event => {
    const session = state.currentSession;
    if (!session || isLissSession(session)) return;
    session.exportOptions ||= {};
    session.exportOptions.includeActiveReferencePhotos = event.target.checked;
    persistDraft();
  });
  $('#includeArchivedReferencePhotosCheckbox')?.addEventListener('change', event => {
    const session = state.currentSession;
    if (!session || isLissSession(session)) return;
    if (event.target.checked && !window.confirm('Archived references may include old or unrelated images. Include them in this Coach Pack?')) {
      event.target.checked = false;
      return;
    }
    session.exportOptions ||= {};
    session.exportOptions.includeArchivedReferencePhotos = event.target.checked;
    persistDraft();
  });

  async function validateStrengthIdentityForCompletion(session) {
    const media = await sessionMedia(session.id);
    const issues = strengthIdentityBlockingIssues(session, media);
    if (!issues.length) return true;
    const first = issues[0];
    window.alert(`VANTAGE cannot export this workout yet. ${first.message} Open Exercise identity and machine details, separate the exercises or correct the image link, then finish again.`);
    return false;
  }

  async function completeCurrentSession() {
    if (!state.currentSession) return;
    if (isLissSession(state.currentSession)) return completeCurrentLissSession();
    if (isRecoverySession(state.currentSession)) return completeCurrentRecoverySession();
    if (!validateZeroRepWorkSets(state.currentSession)) return;
    if (!(await validateStrengthIdentityForCompletion(state.currentSession))) return;
    const hydrationDecision = await requestHydrationReminder(state.currentSession.hydration || {});
    if (!hydrationDecision) return;
    state.currentSession.hydration = hydrationDecision;
    ensureSessionVitalsSnapshot(state.currentSession);
    const completedSession = structuredClone(state.currentSession);
    completedSession.completedAt = new Date().toISOString();
    completedSession.trainingContext ||= { cycles: cycleContextSnapshot(completedSession.date), supplements: supplementContextSnapshot(completedSession.date), medicationAdministrations: administrationEventsForDate(completedSession.date), capturedAt: new Date().toISOString() };
    completedSession.postSessionOutcome = { sessionCompleted:true, sessionAborted:false, symptomsDuringSession:(completedSession.exercises || []).some(exercise => exercise.symptom?.symptomPresent) ? 'user-entered' : 'none-recorded', performanceVsPrevious:'unknown', cardiovascularResponse:'unknown', postSessionCoachFlag:'unknown' };

    await persistTemplateOrderFromSession(completedSession);
    await db.put('sessions', completedSession);
    await advanceActiveProgramAfterSession(completedSession);
    await linkSessionHydrationToDailyLedger(completedSession);
    // Export starts only after the completed session is safely stored.
    const packPromise = downloadWorkoutCoachPack(completedSession);
    state.currentSession = null;
    persistDraft();
    await refreshState();
    renderAll();
    showScreen('history');
    toast('Session saved; full Coach Pack is being prepared');
    packPromise.then(() => toast('Workout Coach Pack ZIP downloaded')).catch(error => {
      console.error(error);
      toast(error.message || 'Session saved, but the Coach Pack could not be created');
    });
  }

  $('#completeWorkoutButton').addEventListener('click', completeCurrentSession);

  const mealForm = $('#mealForm');
  mealForm.elements.time.value = new Date().toTimeString().slice(0,5);
  for (const field of ['protein', 'carbs', 'fat']) {
    mealForm.elements[field].addEventListener('input', () => calculateMealCalories(mealForm));
  }
  mealForm.elements.calories.addEventListener('input', () => renderMacroStrip(mealDraftFromForm(mealForm)));
  mealForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(mealForm);
    const meal = {
      id: uid(), profileId: profileId(), date: today(), mealNumber: num(data.get('mealNumber')) || 1, time: data.get('time'), foods: data.get('foods'),
      protein: num(data.get('protein')) || 0, carbs: num(data.get('carbs')) || 0, fat: num(data.get('fat')) || 0, calories: num(data.get('calories')) || 0,
      sodiumNote: data.get('sodiumNote'), preWorkout: data.get('preWorkout') === 'on', postWorkout: data.get('postWorkout') === 'on', preBed: data.get('preBed') === 'on',
      createdAt: new Date().toISOString(), weightConvention: 'cooked unless explicitly stated otherwise'
    };
    await db.put('meals', meal); mealForm.reset(); mealForm.elements.mealNumber.value = state.meals.filter(item => item.date === today()).length + 2;
    mealForm.elements.time.value = new Date().toTimeString().slice(0,5); await refreshState(); renderAll(); toast('Meal saved');
  });

  $('#repeatLastMealButton').addEventListener('click', () => {
    const last = state.meals[0]; if (!last) return toast('No previous meal to repeat');
    for (const key of ['foods','protein','carbs','fat','calories','sodiumNote']) mealForm.elements[key].value = last[key] ?? '';
    mealForm.elements.preWorkout.checked = Boolean(last.preWorkout); mealForm.elements.postWorkout.checked = Boolean(last.postWorkout); mealForm.elements.preBed.checked = Boolean(last.preBed);
    renderMacroStrip(mealDraftFromForm(mealForm));
    toast('Last meal copied');
  });

  $('#whatCanIHaveNextButton')?.addEventListener('click', () => { $('#nextMealSuggestion').innerHTML = `<div class="alert alert-guidance"><strong>Next meal guidance</strong><p>${escapeHtml(nextMealGuidance())}</p></div>`; });
  $('#macroMarkdownInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('The Markdown file is larger than 2 MB.');
      const result = parseNutritionMarkdown(await file.text());
      await importMacroMarkdown(result, $('#replaceMacroDayCheckbox').checked);
      renderMacroMarkdownStatus(result, file.name);
      toast('Macro Markdown imported');
    } catch (error) {
      console.error(error);
      $('#macroMarkdownStatus').innerHTML = `<div class="alert alert-warning"><strong>Macro import failed:</strong> ${escapeHtml(error.message)}</div>`;
      toast('Macro Markdown could not be read');
    }
    event.target.value = '';
  });
  $('#downloadMacroMarkdownButton').addEventListener('click', () => {
    downloadTodayMacroMarkdown();
    toast('Today’s Macro Markdown downloaded');
  });
  $('#copyMacroFilePromptButton').addEventListener('click', async () => {
    await copyText(MACRO_FILE_PROMPT);
    toast('Macro file prompt copied');
  });

  const vitalsForm = $('#vitalsForm');
  vitalsForm.elements.date.value = today();
  vitalsForm.addEventListener('input', updateVitalsPreview);
  vitalsForm.addEventListener('submit', async event => {
    event.preventDefault();
    const vitals = mergeVitalsForSave(formToVitals(vitalsForm));
    await db.put('vitals', vitals);
    state.pendingVitalsImport = null;
    await refreshState(); renderAll(); showScreen('dashboard'); toast('Vitals saved');
  });

  $('#vitalsMarkdownInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('The Markdown file is larger than 1 MB.');
      const result = parseVitalsMarkdown(await file.text());
      state.pendingVitalsImport = {
        values: { ...result.values }, warnings: [...(result.warnings || [])],
        unsupportedFields: [...(result.unsupportedFields || [])], fieldSources: { ...(result.fieldSources || {}) },
        sourceFormat: result.sourceFormat, importedFields: [...(result.importedFields || [])], fileName: file.name
      };
      applyVitalsToForm(vitalsForm, result.values, today());
      updateVitalsPreview();
      renderVitalsMarkdownStatus(result, file.name);
      vitalsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Vitals loaded — review before saving');
    } catch (error) {
      console.error(error);
      $('#vitalsMarkdownStatus').innerHTML = `<div class="alert alert-warning"><strong>Markdown import failed:</strong> ${escapeHtml(error.message)}</div>`;
      toast('Vitals Markdown could not be read');
    }
    event.target.value = '';
  });
  $('#copyVitalsFilePromptButton').addEventListener('click', async () => {
    await copyText(VITALS_FILE_PROMPT);
    toast('Vitals file prompt copied');
  });
  $('#downloadVitalsExampleButton').addEventListener('click', () => {
    downloadBlob(createVitalsMarkdownExample(today()), `VANTAGE_Vitals_Example_${today()}.md`, 'text/markdown;charset=utf-8');
    toast('Example Markdown downloaded');
  });


  $('#metricsRangeSelect').addEventListener('change', event => {
    state.metricsRange = event.target.value;
    localStorage.setItem('vantage-metrics-range', state.metricsRange);
    renderMetrics();
  });
  $('#metricsFormulaSelect').addEventListener('change', event => {
    state.metricsFormula = event.target.value;
    localStorage.setItem('vantage-metrics-formula', state.metricsFormula);
    renderMetrics();
  });
  $('#metricsExerciseSelect').addEventListener('change', event => {
    state.metricsExercise = event.target.value;
    localStorage.setItem('vantage-metrics-exercise', state.metricsExercise);
    renderMetrics();
  });
  $('#metricsFuelSessionFamilySelect').addEventListener('change', event => {
    state.metricsFuelSessionFamily = event.target.value;
    localStorage.setItem('vantage-metrics-fuel-session-family', state.metricsFuelSessionFamily);
    renderMetrics();
  });
  $('#metricsFuelWindowSelect').addEventListener('change', event => {
    state.metricsFuelWindow = event.target.value;
    localStorage.setItem('vantage-metrics-fuel-window', state.metricsFuelWindow);
    renderMetrics();
  });
  $('#metricsFuelMetricSelect').addEventListener('change', event => {
    state.metricsFuelMetric = event.target.value;
    localStorage.setItem('vantage-metrics-fuel-metric', state.metricsFuelMetric);
    renderMetrics();
  });
  $('#metricsFuelOutputSelect').addEventListener('change', event => {
    state.metricsFuelOutput = event.target.value;
    localStorage.setItem('vantage-metrics-fuel-output', state.metricsFuelOutput);
    renderMetrics();
  });
  $('#metricsSupplementSelect').addEventListener('change', event => {
    state.metricsSupplementId = event.target.value;
    localStorage.setItem('vantage-metrics-supplement-id', state.metricsSupplementId);
    renderMetrics();
  });
  $('#metricsMuscleMode').addEventListener('click', event => {
    const button = event.target.closest('[data-muscle-mode]');
    if (!button) return;
    state.metricsMuscleMode = button.dataset.muscleMode;
    localStorage.setItem('vantage-metrics-muscle-mode', state.metricsMuscleMode);
    renderMetrics();
  });
  const trainingCycleForm = $('#trainingCycleForm');
  trainingCycleForm.elements.startDate.value = today();
  trainingCycleForm.addEventListener('submit', async event => { event.preventDefault(); await saveTrainingCycle(event.currentTarget); });
  $('#cancelCycleEditButton').addEventListener('click', resetCycleForm);
  $('#trainingCycleList').addEventListener('click', async event => {
    const button = event.target.closest('[data-cycle-action]');
    if (!button) return;
    const { cycleAction, cycleId } = button.dataset;
    if (cycleAction === 'shorten') await adjustTrainingCycleWeeks(cycleId,-1);
    if (cycleAction === 'extend') await adjustTrainingCycleWeeks(cycleId,1);
    if (cycleAction === 'edit') editTrainingCycle(cycleId);
    if (cycleAction === 'toggle') await toggleTrainingCycle(cycleId);
    if (cycleAction === 'delete') await deleteTrainingCycle(cycleId);
  });

  const supplementForm = $('#supplementForm');
  supplementForm.elements.effectiveDate.value = today();
  $('#administrationForm')?.addEventListener('submit', async event => { event.preventDefault(); await saveAdministrationEvent(event.currentTarget); });
  $('#administrationSupplementSelect')?.addEventListener('change', event => { const item = state.supplements.find(row => row.id === event.target.value); const form = $('#administrationForm'); if (item && form) { form.elements.amount.value = item.amount ?? ''; form.elements.unit.value = item.unit || ''; } });
  supplementForm.addEventListener('submit', async event => { event.preventDefault(); await saveSupplement(event.currentTarget); });
  $('#cancelSupplementEditButton').addEventListener('click', resetSupplementForm);
  $('#takeSupplementPhotoButton').addEventListener('click', () => $('#supplementCameraInput').click());
  $('#chooseSupplementPhotoButton').addEventListener('click', () => $('#supplementGalleryInput').click());
  $('#supplementCameraInput').addEventListener('change', async event => {
    try { await selectSupplementPhoto(event.target.files?.[0], 'camera'); } catch (error) { console.error(error); toast(error.message); }
    event.target.value = '';
  });
  $('#supplementGalleryInput').addEventListener('change', async event => {
    try { await selectSupplementPhoto(event.target.files?.[0], 'gallery'); } catch (error) { console.error(error); toast(error.message); }
    event.target.value = '';
  });
  $('#supplementList').addEventListener('click', async event => {
    const button = event.target.closest('[data-supplement-action]');
    if (!button) return;
    const { supplementAction, supplementId } = button.dataset;
    if (supplementAction === 'edit') await editSupplement(supplementId);
    if (supplementAction === 'toggle') await toggleSupplement(supplementId);
    if (supplementAction === 'delete') await deleteSupplement(supplementId);
  });

  const bodyMeasurementForm = $('#bodyMeasurementForm');
  bodyMeasurementForm.elements.date.value = today();
  bodyMeasurementForm.addEventListener('submit', async event => {
    event.preventDefault();
    const record = bodyMeasurementFromForm(event.currentTarget);
    if (!record.date) return toast('Choose a measurement date');
    if (!Object.keys(record).some(key => ['weight','bodyFat','neck','chest','waist','hips','leftArm','rightArm','leftThigh','rightThigh','leftCalf','rightCalf'].includes(key))) return toast('Add at least one measurement');
    await db.put('bodyMeasurements', record);
    await refreshState();
    event.currentTarget.reset();
    event.currentTarget.elements.date.value = today();
    renderAll(); showScreen('metrics'); toast('Body measurements saved');
  });
  $('#bodyMeasurementSelect').addEventListener('change', renderBodyMeasurements);
  $('#bodyMeasurementHistory').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-body-measurement]');
    if (!button) return;
    await db.remove('bodyMeasurements', button.dataset.deleteBodyMeasurement);
    await refreshState(); renderAll(); showScreen('metrics'); toast('Body measurement deleted');
  });
  const metricsProfileForm = $('#metricsProfileForm');
  metricsProfileForm.elements.sex.value = state.metricsProfile.sex || '';
  metricsProfileForm.elements.birthYear.value = state.metricsProfile.birthYear || '';
  metricsProfileForm.elements.bodyweight.value = state.metricsProfile.bodyweight || '';
  metricsProfileForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.metricsProfile = { sex: String(data.get('sex') || ''), birthYear: String(data.get('birthYear') || ''), bodyweight: String(data.get('bodyweight') || '') };
    localStorage.setItem('vantage-metrics-profile', JSON.stringify(state.metricsProfile));
    await db.put('settings', { key: 'metricsProfile', value: state.metricsProfile });
    renderMetrics(); toast('Benchmark profile saved');
  });

  $('#chooseBloodworkButton').addEventListener('click', () => $('#bloodworkMarkdownInput').click());
  $('#chooseBloodAnalysisButton').addEventListener('click', () => $('#bloodAnalysisMarkdownInput').click());
  $('#bloodworkMarkdownInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { await importBloodworkFile(file); }
    catch (error) {
      console.error(error);
      $('#bloodworkImportStatus').innerHTML = `<div class="alert alert-warning"><strong>Bloodwork import failed:</strong> ${escapeHtml(error.message)}</div>`;
      toast('Bloodwork Markdown could not be imported');
    }
    event.target.value = '';
  });
  $('#bloodAnalysisMarkdownInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { await importBloodAnalysisFile(file); }
    catch (error) {
      console.error(error);
      $('#bloodworkImportStatus').innerHTML = `<div class="alert alert-warning"><strong>Analysis import failed:</strong> ${escapeHtml(error.message)}</div>`;
      toast('Bloodwork analysis could not be imported');
    }
    event.target.value = '';
  });
  $('#copyBloodworkPromptButton').addEventListener('click', async () => {
    try {
      const response = await fetch('./VANTAGE_BLOODWORK_THREAD_PROMPT.md?v=1.5.4');
      if (!response.ok) throw new Error('Prompt file unavailable');
      await copyText(await response.text());
      toast('Bloodwork Analyzer prompt copied');
    } catch (error) {
      console.error(error);
      toast('Bloodwork prompt could not be copied');
    }
  });
  $('#bloodMarkerSelect').addEventListener('change', renderBloodMarkerTrend);

  $('#exportJsonButton').addEventListener('click', async () => {
    const payload = await db.exportDatabase();
    downloadBlob(JSON.stringify(payload, null, 2), timestampFilename('VANTAGE_backup','json'), 'application/json'); toast('JSON backup exported');
  });
  $('#importJsonInput').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { const payload = JSON.parse(await file.text()); await db.importDatabase(payload, { replace: true }); state.currentSession = null; persistDraft(); await refreshState(); renderAll(); toast('Backup imported'); }
    catch (error) { toast(`Import failed: ${error.message}`); }
    event.target.value = '';
  });
  $('#exportSetLogButton').addEventListener('click', exportSetLog);
  $('#exportSessionLogButton').addEventListener('click', exportSessionLog);
  $('#exportMacroLogButton').addEventListener('click', exportMacroLog);
  $('#restoreDemoButton').addEventListener('click', async () => {
    await seedDatabase(true); state.currentSession = null; persistDraft(); await refreshState(); renderAll(); toast('Demo data restored');
  });

  $('#addExerciseButton').addEventListener('click', openExerciseDialog);
  $('#removeExerciseButton').addEventListener('click', openRemoveExerciseDialog);
  $('#collapseAllExercisesButton')?.addEventListener('click', () => setAllExercisesCollapsed(true));
  $('#expandAllExercisesButton')?.addEventListener('click', () => setAllExercisesCollapsed(false));
  $('#closeExerciseDialogButton').addEventListener('click', () => $('#exerciseDialog').close());
  $('#closeReplaceExerciseDialogButton')?.addEventListener('click', () => { replaceExerciseTargetId = null; $('#replaceExerciseDialog').close(); });
  $('#replaceExerciseSearch')?.addEventListener('input', renderReplaceExercisePicker);
  $('#replaceExerciseWorkoutFilter')?.addEventListener('change', renderReplaceExercisePicker);
  $('#closeRemoveExerciseDialogButton').addEventListener('click', () => $('#removeExerciseDialog').close());
  $('#closeImagePreviewDialogButton').addEventListener('click', () => $('#imagePreviewDialog').close());
  $('#exerciseSearch').addEventListener('input', renderExercisePicker);
  $('#exerciseWorkoutFilter').addEventListener('change', renderExercisePicker);
  $('#exerciseBodyGroupFilter')?.addEventListener('change', renderExercisePicker);
  $('#exerciseEquipmentFilter')?.addEventListener('change', renderExercisePicker);
  $('#newExerciseForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const exerciseName = String(data.get('name') || '').trim();
    if (!exerciseName) return;
    const existing = state.exercises.find(item => item.nameKey === nameKey(exerciseName));
    if (existing) return addExerciseToCurrentSession(existing, data.get('addToTemplate') === 'on');
    const exercise = {
      id: stableId('exercise', exerciseName), name: exerciseName, nameKey: nameKey(exerciseName),
      workoutType: String(data.get('workoutType') || state.currentSession?.sessionType || '').split(' - ')[0],
      bodyGroup: String(data.get('bodyGroup') || '').trim(), equipment: String(data.get('equipment') || '').trim(),
      notes: String(data.get('notes') || '').trim(), aliases: [], usageCount: 0, source: 'user-created'
    };
    await db.put('exercises', exercise); state.exercises.push(exercise); state.exercises.sort((a,b) => a.name.localeCompare(b.name, 'en-GB'));
    await addExerciseToCurrentSession(exercise, data.get('addToTemplate') === 'on');
  });

  $('#progressExerciseSelect').addEventListener('change', () => { renderExerciseProgress(); renderHistoryAudit(); });

  $('#createProgramPresetButton')?.addEventListener('click', async () => { await createProgramFromPreset($('#programPresetSelect')?.value||'custom',$('#programPresetName')?.value||''); if($('#programPresetName'))$('#programPresetName').value=''; });
  $('#createHybridHeavyDutyCycleButton')?.addEventListener('click', createHybridHeavyDutyCycle);
  $('#extendHybridHeavyDutyButton')?.addEventListener('click', extendHybridHeavyDutyProgramme);
  $('#hdmExtendedPanel')?.addEventListener('click', async event=>{const button=event.target.closest('[data-hdm-review-action]');if(!button)return;await saveHdmMaintenanceExitReview(button.dataset.hdmReviewAction);});
  $('#trainingBuilderTabs')?.addEventListener('click', event=>{const button=event.target.closest('[data-training-builder-tab]');if(!button)return;state.trainingBuilderTab=button.dataset.trainingBuilderTab;localStorage.setItem('vantage-training-builder-tab',state.trainingBuilderTab);applyTrainingBuilderTab();});
  $('#programList')?.addEventListener('click', async event => { const button=event.target.closest('[data-program-action]'); if(!button)return; if(button.dataset.programAction==='edit'){state.programEditorId=button.dataset.programId;renderProgramManager();document.querySelector('#programScheduleEditor')?.scrollIntoView({behavior:'smooth',block:'start'});} if(button.dataset.programAction==='activate')await activateProgramById(button.dataset.programId); if(button.dataset.programAction==='delete')await deleteProgramById(button.dataset.programId); });
  $('#programScheduleEditor')?.addEventListener('click', async event => { if(event.target.closest('[data-program-editor-save]'))return saveProgramEditorSettings(); if(event.target.closest('[data-program-add-routine]'))return addProgramSlot('template',$('#programRoutineSelect')?.value||null); if(event.target.closest('[data-program-add-rest]'))return addProgramSlot('rest'); const button=event.target.closest('[data-program-slot-action]'); if(!button)return; if(button.dataset.programSlotAction==='up')await moveProgramSlot(button.dataset.programSlot,-1); if(button.dataset.programSlotAction==='down')await moveProgramSlot(button.dataset.programSlot,1); if(button.dataset.programSlotAction==='remove')await removeProgramSlot(button.dataset.programSlot); });
  $('#routineBuilderSelect')?.addEventListener('change',event=>{state.routineBuilderTemplateId=event.target.value;renderRoutineBuilder();});
  $('#createRoutineButton')?.addEventListener('click',createBlankRoutine);
  $('#routineBuilderExerciseList')?.addEventListener('click',async event=>{const save=event.target.closest('[data-routine-save-prescription]');if(save)return saveRoutineExercisePrescription(Number(save.dataset.routineSavePrescription));if(event.target.closest('[data-routine-cancel-edit]')){state.routineExerciseEditorIndex=null;renderRoutineBuilder();return;}const button=event.target.closest('[data-routine-action]');if(button)await editRoutineExercise(Number(button.dataset.routineExerciseIndex),button.dataset.routineAction);});
  $('#routineLibraryResults')?.addEventListener('click',async event=>{const button=event.target.closest('[data-routine-add-exercise]');if(button)await addExerciseToRoutine(button.dataset.routineAddExercise);});
  $('#routineLibrarySearch')?.addEventListener('input',renderRoutineBuilder); $('#routineLibraryBodyGroup')?.addEventListener('change',renderRoutineBuilder); $('#routineLibraryEquipment')?.addEventListener('change',renderRoutineBuilder);

  $('#profileForm')?.addEventListener('submit', async event => { event.preventDefault(); await saveProfile(event.currentTarget); });

  $('#historicalMarkdownInput')?.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('The historical Markdown file is larger than 2 MB.');
      const detected = detectHistoricalMarkdown(await file.text(), file.name);
      state.pendingHistoricalImport = { ...detected, fileName: file.name };
      renderHistoricalImportPreview();
      toast(`${detected.label} detected for ${detected.date}`);
    } catch (error) {
      console.error(error);
      state.pendingHistoricalImport = null;
      renderHistoricalImportPreview();
      $('#historicalMarkdownStatus').innerHTML = `<div class="alert alert-warning"><strong>Historical import could not be prepared:</strong> ${escapeHtml(error.message)}</div>`;
      toast('Historical Markdown could not be read');
    }
    event.target.value = '';
  });
  $('#applyHistoricalMarkdownButton')?.addEventListener('click', async () => {
    try { await applyHistoricalImport(); }
    catch (error) { console.error(error); toast(error.message || 'Historical import failed'); }
  });
  $('#replaceHistoricalDayCheckbox')?.addEventListener('change', renderHistoricalImportPreview);

  $('#workbookInput').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    $('#workbookImportPreview').innerHTML = '<div class="empty-state"><span class="spinner"></span> Reading workbook locally…</div>';
    $('#applyWorkbookImportButton').hidden = true;
    try {
      state.pendingWorkbookImport = await parseVantageWorkbook(file);
      renderWorkbookPreview();
    } catch (error) {
      console.error(error); state.pendingWorkbookImport = null;
      $('#workbookImportPreview').innerHTML = `<div class="alert alert-warning"><strong>Import preview failed:</strong> ${escapeHtml(error.message)}</div>`;
    }
  });
  $('#applyWorkbookImportButton').addEventListener('click', applyWorkbookImport);

  $$('[data-coach-context]').forEach(button => button.addEventListener('click', () => openCoachDialog(button.dataset.coachContext)));
  $('#closeCoachDialogButton').addEventListener('click', () => $('#coachDialog').close());
  $('#copyCoachPackButton').addEventListener('click', () => shareCoachPack(false));
  $('#shareCoachPackButton').addEventListener('click', () => shareCoachPack(true));
  $('#copyCoachThreadPromptButton').addEventListener('click', async () => { await copyText(COACH_THREAD_PROMPT); toast('Coach thread setup prompt copied'); });

  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('#installButton').hidden = false; });
  $('#installButton').addEventListener('click', async () => {
    if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $('#installButton').hidden = true;
  });
}

function checkForLocalDayChange() {
  const currentDate = today();
  if (!state.activeLocalDate) {
    state.activeLocalDate = currentDate;
    return;
  }
  if (currentDate === state.activeLocalDate) return;
  state.activeLocalDate = currentDate;
  const vitalsDate = $('#vitalsForm')?.elements?.date;
  if (vitalsDate && document.activeElement !== vitalsDate) vitalsDate.value = currentDate;
  renderAll();
  updateVitalsPreview();
  toast(`New local day detected: ${localDateLabel(currentDate)}`);
}

async function init() {
  await db.openDatabase(); await seedDatabase(); await applyV133ExerciseIdentityMigration(); await applyV138ExerciseIdentityRepair(); await applyV13105HistoryRepair(); await ensureProfileFoundation(); await refreshState();
  await ensureV140ProgramFoundation(); await refreshState();
  const vitalsLinksRepaired = await applyV13105VitalsLinkRepair();
  if (vitalsLinksRepaired) await refreshState();
  const storedMetricsProfile = await db.get('settings', 'metricsProfile');
  if (storedMetricsProfile?.value) { state.metricsProfile = storedMetricsProfile.value; localStorage.setItem('vantage-metrics-profile', JSON.stringify(state.metricsProfile)); }
  loadDraft(); bindEvents();
  state.activeLocalDate = today();
  renderAll(); updateVitalsPreview();
  setInterval(checkForLocalDayChange, 60000);
  window.addEventListener('focus', checkForLocalDayChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForLocalDayChange(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=1.5.5').catch(console.error);
}

init().catch(error => {
  console.error(error);
  document.body.innerHTML = `<main class="app-main"><section class="panel"><h2>VANTAGE could not start</h2><p>${escapeHtml(error.message)}</p></section></main>`;
});
