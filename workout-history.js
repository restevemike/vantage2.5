import { comparisonConfidence } from './strength-integrity.js';

export function historyKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function exerciseNameKeys(exercise = {}) {
  return new Set([
    exercise.coreExercise,
    exercise.name,
    exercise.nickname,
    exercise.nicknameAlias,
    ...(exercise.aliases || [])
  ].filter(Boolean).map(historyKey));
}

function namesOverlap(left = {}, right = {}) {
  const a = exerciseNameKeys(left);
  const b = exerciseNameKeys(right);
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function equipmentToken(value) {
  const text = historyKey(value);
  if (/dumbbell|db\b/.test(text)) return 'dumbbell';
  if (/barbell|ez bar/.test(text)) return 'barbell';
  if (/cable|pulldown|pushdown/.test(text)) return 'cable';
  if (/plate loaded|plate-loaded|hammer strength|arsenal/.test(text)) return 'plate-loaded';
  if (/machine|nautilus|cybex|prime/.test(text)) return 'machine';
  return '';
}

function noteContradictsIdentity(exercise = {}) {
  const nameEquipment = equipmentToken(`${exercise.coreExercise || exercise.name || ''} ${exercise.variation || ''}`);
  const noteEquipment = equipmentToken(exercise.notes || '');
  return Boolean(nameEquipment && noteEquipment && nameEquipment !== noteEquipment);
}

export function canonicalExerciseIdentity(exercise = {}) {
  const explicit = String(exercise.comparisonStreamId || '').trim();
  if (explicit) return explicit;
  const original = exercise.sessionSubstitution?.temporary ? exercise.sessionSubstitution?.replacementSourceExerciseId || null : null;
  const core = historyKey(exercise.coreExercise || exercise.name || exercise.nickname || exercise.sourceExerciseId || 'exercise');
  const variation = historyKey(exercise.variation || '');
  const brand = historyKey(exercise.machineBrand || '');
  const model = historyKey(exercise.machineModel || '');
  const grip = historyKey(exercise.grip || '');
  const stance = historyKey(exercise.stance || '');
  const load = historyKey(exercise.loadConvention || equipmentToken(`${exercise.name || ''} ${exercise.variation || ''} ${exercise.machineBrand || ''}`));
  const unilateral = exercise.unilateral === true ? 'uni' : exercise.unilateral === false ? 'bi' : '';
  // Source IDs are provenance, not identity. They can help validation but must
  // not fragment a stable exercise stream after workbook migrations/renames.
  // Explicit user-confirmed comparisonStreamId remains the durable override.
  return [core, variation, brand, model, grip, stance, unilateral, load].filter(Boolean).join('|');
}

export function exerciseCompatibility(left = {}, right = {}) {
  if (!left || !right) return { compatible: false, level: 'none', reason: 'Missing exercise identity' };
  const leftStream = String(left.comparisonStreamId || '');
  const rightStream = String(right.comparisonStreamId || '');
  if (leftStream && rightStream && leftStream === rightStream) return { compatible: true, level: 'high', reason: 'Same confirmed comparison stream' };

  if (left.sessionSubstitution?.temporary || right.sessionSubstitution?.temporary) {
    const sameReplacement = canonicalExerciseIdentity(left) === canonicalExerciseIdentity(right);
    if (!sameReplacement) return { compatible: false, level: 'review', reason: 'Temporary substitution uses a separate comparison stream' };
  }

  const sameSourceId = Boolean(left.sourceExerciseId && right.sourceExerciseId && left.sourceExerciseId === right.sourceExerciseId);
  const nameMatch = namesOverlap(left, right);
  const leftVariation = historyKey(left.variation);
  const rightVariation = historyKey(right.variation);
  const variationConflict = Boolean(leftVariation && rightVariation && leftVariation !== rightVariation);
  const leftBrand = historyKey(left.machineBrand);
  const rightBrand = historyKey(right.machineBrand);
  const brandConflict = Boolean(leftBrand && rightBrand && leftBrand !== rightBrand);
  const leftModel = historyKey(left.machineModel);
  const rightModel = historyKey(right.machineModel);
  const modelConflict = Boolean(leftModel && rightModel && leftModel !== rightModel);
  const leftLoad = historyKey(left.loadConvention || equipmentToken(`${left.name || ''} ${left.variation || ''}`));
  const rightLoad = historyKey(right.loadConvention || equipmentToken(`${right.name || ''} ${right.variation || ''}`));
  const loadConflict = Boolean(leftLoad && rightLoad && leftLoad !== rightLoad);

  if (noteContradictsIdentity(left) || noteContradictsIdentity(right)) return { compatible: false, level: 'review', reason: 'Current-session notes contradict stored exercise identity' };
  if (variationConflict || brandConflict || modelConflict || loadConflict) return { compatible: false, level: 'review', reason: 'Exercise variation/machine/load convention differs' };
  if (!sameSourceId && !nameMatch) return { compatible: false, level: 'none', reason: 'Exercise names and source IDs do not match' };

  const confidence = comparisonConfidence(left, { exercise: right });
  if (confidence.level === 'high' || confidence.level === 'medium') return { compatible: true, level: confidence.level, reason: confidence.reason || (sameSourceId ? 'Compatible source ID and identity' : 'Compatible exercise identity') };
  return { compatible: nameMatch, level: nameMatch ? 'medium' : 'review', reason: nameMatch ? 'Name/alias match with incomplete machine metadata' : 'Identity requires review' };
}

function exercisesOverlap(left = {}, right = {}) {
  return exerciseCompatibility(left, right).compatible;
}

export function matchExerciseFromSession(session, exercise) {
  if (!session || !exercise) return null;
  const candidates = (session.exercises || []).map(candidate => ({ candidate, result: exerciseCompatibility(candidate, exercise) }));
  return candidates.find(item => item.result.level === 'high' && item.result.compatible)?.candidate
    || candidates.find(item => item.result.level === 'medium' && item.result.compatible)?.candidate
    || null;
}

function dateRank(session = {}) {
  const value = session.completedAt || session.startedAt || (session.date ? `${session.date}T23:59:59` : '');
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function isStrengthSession(session = {}) {
  const category = historyKey(session.category);
  const mode = historyKey(session.mode);
  if (category === 'cardio' || category === 'recovery' || category === 'rest') return false;
  if (mode === 'liss' || mode === 'rest') return false;
  if (session.cardio || session.recoverySession) return false;
  return Array.isArray(session.exercises) && session.exercises.length > 0;
}

function familyTokens(value = '') {
  return new Set(historyKey(value).split(' ').filter(token => token.length > 2 && !['workout','session','training'].includes(token)));
}

export function strengthSessionFamilyKey(sessionOrTemplate = {}) {
  const explicit = historyKey(sessionOrTemplate.sessionFamily || sessionOrTemplate.bodyGroup || sessionOrTemplate.workoutType || '');
  if (explicit) return explicit;
  const text = historyKey(sessionOrTemplate.sessionType || sessionOrTemplate.name || sessionOrTemplate.templateId || 'strength');
  for (const family of ['back','legs','shoulders triceps','chest biceps','chest','shoulders','arms','full body']) {
    if ([...familyTokens(family)].every(token => text.includes(token))) return family;
  }
  return text;
}

function sameSessionFamily(session = {}, template = {}) {
  if (template.id && session.templateId && String(template.id) === String(session.templateId)) return true;
  const a = strengthSessionFamilyKey(session);
  const b = strengthSessionFamilyKey(template);
  if (a && b && a === b) return true;
  const at = familyTokens(session.sessionType || '');
  const bt = familyTokens(template.name || template.workoutType || template.bodyGroup || '');
  if (!at.size || !bt.size) return false;
  let overlap = 0;
  for (const token of bt) if (at.has(token)) overlap += 1;
  return overlap >= Math.max(1, Math.min(at.size, bt.size) - 1);
}

export function findBestPreviousStrengthSession(sessions = [], template = {}, { beforeDate = null, excludeSessionId = null } = {}) {
  const candidates = sessions
    .filter(session => isStrengthSession(session))
    .filter(session => !excludeSessionId || session.id !== excludeSessionId)
    .filter(session => !beforeDate || String(session.date || '') < String(beforeDate));

  // v1.3.10.5: within a body-group/session family, recency wins. A one-off
  // substitution or renamed exercise must not cause VANTAGE to jump back two weeks
  // to an older "perfect" template match.
  const family = candidates.filter(session => sameSessionFamily(session, template)).sort((a,b) => dateRank(b) - dateRank(a));
  if (family.length) return family[0];

  // Fallback only when no family match exists: use compatible exercise overlap,
  // still breaking ties by recency.
  const wantedExercises = template.exercises || [];
  const ranked = candidates.map(session => {
    let overlap = 0;
    for (const exercise of wantedExercises) if (matchExerciseFromSession(session, exercise)) overlap += 1;
    return { session, overlap, date: dateRank(session) };
  }).filter(item => item.overlap > 0).sort((a,b) => b.overlap - a.overlap || b.date - a.date);
  return ranked[0]?.session || null;
}

export function historyAuditForExercise(sessions = [], exercise = {}, { beforeDate = null, limit = 12 } = {}) {
  const included = [];
  const excluded = [];
  for (const session of [...sessions].sort((a,b) => dateRank(b) - dateRank(a))) {
    if (!isStrengthSession(session) || (beforeDate && String(session.date || '') >= String(beforeDate))) continue;
    for (const candidate of session.exercises || []) {
      const result = exerciseCompatibility(candidate, exercise);
      const row = { sessionId: session.id, date: session.date, sessionType: session.sessionType, exerciseName: candidate.name, level: result.level, reason: result.reason, comparisonStreamId: canonicalExerciseIdentity(candidate) };
      if (result.compatible) included.push(row); else if (namesOverlap(candidate, exercise) || candidate.sourceExerciseId === exercise.sourceExerciseId) excluded.push(row);
    }
  }
  return { comparisonStreamId: canonicalExerciseIdentity(exercise), included: included.slice(0, limit), excluded: excluded.slice(0, limit) };
}
