function key(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function aliasKeys(exercise = {}) {
  return new Set([
    exercise.name,
    exercise.nickname,
    ...(exercise.aliases || [])
  ].filter(Boolean).map(key));
}

function textCompatible(left, right) {
  const a = aliasKeys(left);
  const b = aliasKeys(right);
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function fieldConflict(left, right, field) {
  const a = key(left?.[field]);
  const b = key(right?.[field]);
  return Boolean(a && b && a !== b);
}

function explicitEquivalence(left = {}, right = {}) {
  if (left.userConfirmedEquivalent === true || right.userConfirmedEquivalent === true) return true;
  if (left.photoEvidenceEquivalent === true || right.photoEvidenceEquivalent === true) return true;
  const leftIds = new Set(left.equivalentSourceExerciseIds || []);
  const rightIds = new Set(right.equivalentSourceExerciseIds || []);
  return leftIds.has(right.sourceExerciseId) || rightIds.has(left.sourceExerciseId);
}

export function duplicateSourceExerciseIds(session = {}) {
  const groups = new Map();
  for (const exercise of session.exercises || []) {
    const sourceExerciseId = String(exercise.sourceExerciseId || '').trim();
    if (!sourceExerciseId) continue;
    if (!groups.has(sourceExerciseId)) groups.set(sourceExerciseId, []);
    groups.get(sourceExerciseId).push(exercise);
  }
  return [...groups.entries()]
    .filter(([, exercises]) => exercises.length > 1)
    .map(([sourceExerciseId, exercises]) => ({
      sourceExerciseId,
      exercises,
      distinctIdentityCount: new Set(exercises.map(exercise => [
        key(exercise.name), key(exercise.machineBrand), key(exercise.machineModel), key(exercise.movementPattern), key(exercise.variation)
      ].join('|'))).size,
      distinctSessionExerciseCount: new Set(exercises.map(exercise => String(exercise.id || ''))).size
    }))
    // Two separate rows sharing one source identity are ambiguous even when stale
    // names happen to be identical. Export must pause for merge/separate review.
    .filter(group => group.distinctSessionExerciseCount > 1 || group.distinctIdentityCount > 1);
}


function representativeLoad(exercise = {}) {
  const loads = (exercise.sets || []).filter(set => !['Warm-up','Skipped'].includes(set.setType)).map(set => Number(set.weightKg)).filter(value => Number.isFinite(value) && value > 0);
  return loads.length ? Math.max(...loads) : null;
}

function loadMetadataComplete(exercise = {}) {
  return Boolean(String(exercise.machineBrand || '').trim() && String(exercise.machineModel || exercise.variation || '').trim());
}

export function comparisonConfidence(current, previous) {
  if (!previous) return { level: 'none', reason: 'No previous exercise found', displayAs: 'none' };
  const prior = previous.exercise || previous;
  const equivalent = explicitEquivalence(current, prior);
  const conflicts = [];
  if (current.photoEvidenceConflict === true || prior.photoEvidenceConflict === true) conflicts.push('photo evidence');
  if (fieldConflict(current, prior, 'machineBrand')) conflicts.push('machine brand');
  if (fieldConflict(current, prior, 'machineModel')) conflicts.push('machine model');
  if (fieldConflict(current, prior, 'movementPattern')) conflicts.push('movement pattern');
  if (fieldConflict(current, prior, 'variation')) conflicts.push('exercise variation');
  const sameSourceId = Boolean(current.sourceExerciseId && prior.sourceExerciseId && current.sourceExerciseId === prior.sourceExerciseId);
  const compatibleName = textCompatible(current, prior);

  if ((current.comparisonHistoryInvalidated === true || prior.comparisonHistoryInvalidated === true) && !sameSourceId) {
    return { level: 'blocked', reason: 'Exercise identity was corrected and history from the former source identity was invalidated', displayAs: 'blocked' };
  }
  if (conflicts.length && !equivalent) {
    return { level: 'low', reason: `${conflicts.join(', ')} differ`, displayAs: 'context-only' };
  }
  if (sameSourceId && !compatibleName && !equivalent) {
    return { level: 'blocked', reason: 'Source exercise ID matches but the confirmed exercise identity does not', displayAs: 'blocked' };
  }
  if (sameSourceId && (compatibleName || equivalent)) {
    const currentLoad = representativeLoad(current), previousLoad = representativeLoad(prior);
    if (!equivalent && currentLoad != null && previousLoad != null && previousLoad > 0) {
      const ratio = currentLoad / previousLoad;
      if ((ratio < 0.6 || ratio > 1.67) && (!loadMetadataComplete(current) || !loadMetadataComplete(prior))) {
        return { level: 'review', reason: `Large load change detected (${previousLoad} kg to ${currentLoad} kg) with incomplete machine/load metadata. Confirm same machine/load convention.`, displayAs: 'context-only', loadRatio: ratio };
      }
    }
    return { level: 'high', reason: equivalent ? 'User-confirmed equivalent exercise identity' : 'Same source ID and compatible exercise identity', displayAs: 'comparable' };
  }
  if (compatibleName && !conflicts.length) {
    return { level: 'medium', reason: 'Name or alias matches; source identity differs or is unavailable', displayAs: 'context-only' };
  }
  return { level: 'low', reason: 'Exercise identity is not sufficiently aligned for automatic comparison', displayAs: 'context-only' };
}

export function strengthIdentityBlockingIssues(session = {}, media = []) {
  const issues = [];
  for (const exercise of session.exercises || []) {
    if (exercise.photoEvidenceConflict === true || exercise.identityConflictBlocking === true) {
      issues.push({
        type: 'exercise-photo-identity-conflict', severity: 'blocking', exerciseId: exercise.id,
        message: `${exercise.name || 'Exercise'} has unresolved photo or identity evidence that conflicts with its stored exercise identity.`
      });
    }
  }

  for (const group of duplicateSourceExerciseIds(session)) {
    issues.push({
      type: 'duplicate-source-exercise-id',
      severity: 'blocking',
      sourceExerciseId: group.sourceExerciseId,
      exercises: group.exercises.map(exercise => exercise.name),
      message: `Distinct exercises share sourceExerciseId ${group.sourceExerciseId}: ${group.exercises.map(exercise => exercise.name).join(', ')}.`
    });
  }

  const bySessionId = new Map((session.exercises || []).map(exercise => [String(exercise.id || ''), exercise]));
  const bySourceId = new Map();
  for (const exercise of session.exercises || []) {
    const sourceId = String(exercise.sourceExerciseId || '');
    if (!sourceId) continue;
    if (!bySourceId.has(sourceId)) bySourceId.set(sourceId, []);
    bySourceId.get(sourceId).push(exercise);
  }

  for (const item of media || []) {
    if (!/^exercise(?:Session|Technique)|^(?:bodyPositionReference|machineReference)$/.test(String(item.sourceRole || ''))) continue;
    const linkedId = String(item.linkedExerciseId || '');
    if (!linkedId) {
      issues.push({ type: 'unlinked-current-session-media', severity: 'blocking', mediaId: item.id, message: `${item.name || 'Current-session image'} has no exercise link.` });
      continue;
    }
    if (bySessionId.has(linkedId)) continue;
    const legacyMatches = bySourceId.get(linkedId) || [];
    if (legacyMatches.length !== 1) {
      issues.push({
        type: 'ambiguous-current-session-media-link', severity: 'blocking', mediaId: item.id,
        message: `${item.name || 'Current-session image'} does not resolve to exactly one exercise.`
      });
    }
  }
  return issues;
}

export function inferMachineBrand(name = '') {
  const value = String(name || '');
  const brands = ['Hammer Strength', 'Arsenal Strength', 'Prime', 'Watson', 'Cutler', 'Nautilus'];
  return brands.find(brand => key(value).startsWith(key(brand))) || '';
}

export function inferMachineModel(name = '', brand = inferMachineBrand(name)) {
  const value = String(name || '').trim();
  if (!brand) return '';
  return value.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').trim();
}

export function inferMovementPattern(name = '') {
  const value = key(name);
  if (/incline.*fly|fly.*incline/.test(value)) return 'incline-fly';
  if (/pec fly|chest fly|multifly/.test(value)) return 'chest-fly';
  if (/incline.*press|press.*incline/.test(value)) return 'incline-press';
  if (/wide.*chest.*press/.test(value)) return 'wide-chest-press';
  if (/bench press|chest press|iso lateral.*press/.test(value)) return 'horizontal-press';
  if (/hammer curl/.test(value)) return 'hammer-curl';
  if (/arm curl|biceps curl|bicep curl/.test(value)) return 'arm-curl';
  return '';
}

function orientationTokens(exercise = {}) {
  const text = key([exercise.name, exercise.movementPattern, exercise.variation, exercise.notes, ...(exercise.aliases || [])].join(' '));
  return new Set(['incline','decline','flat','wide','close','neutral','unilateral','bilateral'].filter(token => text.includes(token)));
}

function movementTokens(exercise = {}) {
  const text = key([exercise.name, exercise.movementPattern, exercise.notes, ...(exercise.aliases || [])].join(' '));
  return new Set(['press','fly','raise','curl','extension','pushdown','row','pulldown','squat','deadlift','lunge'].filter(token => text.includes(token)));
}

function setOverlap(left, right) {
  for (const item of left) if (right.has(item)) return true;
  return false;
}

export function exerciseIdentityOverlapReviews(session = {}) {
  const exercises = session.exercises || [];
  const reviews = [];
  for (let i = 0; i < exercises.length; i += 1) {
    for (let j = i + 1; j < exercises.length; j += 1) {
      const left = exercises[i], right = exercises[j];
      if (left.sessionSubstitution?.temporary || right.sessionSubstitution?.temporary) continue;
      const leftBrand = key(left.machineBrand || inferMachineBrand(left.name));
      const rightBrand = key(right.machineBrand || inferMachineBrand(right.name));
      const sameBrand = Boolean(leftBrand && rightBrand && leftBrand === rightBrand);
      const sameMovementPattern = Boolean(key(left.movementPattern) && key(left.movementPattern) === key(right.movementPattern));
      const movementOverlap = setOverlap(movementTokens(left), movementTokens(right));
      const orientationOverlap = setOverlap(orientationTokens(left), orientationTokens(right));
      const aliasOverlap = textCompatible(left, right);
      const combinedText = `${key(left.name)} ${key(left.notes)} ${key(right.name)} ${key(right.notes)}`;
      const isoLateralOverlap = /iso lateral/.test(combinedText) && /(decline|incline|bench|chest).*press|press.*(decline|incline|bench|chest)/.test(combinedText);
      const score = Number(sameBrand) + Number(sameMovementPattern) + Number(movementOverlap) + Number(orientationOverlap) + Number(aliasOverlap) + Number(isoLateralOverlap);
      if (score < 3) continue;
      reviews.push({
        exerciseIds: [left.id, right.id],
        exerciseNames: [left.name, right.name],
        exerciseIdentityReviewRequired: true,
        duplicateRisk: 'possible',
        crossExerciseComparisonConfidence: 'low',
        score,
        reasons: [
          sameBrand ? 'same/overlapping machine brand' : null,
          sameMovementPattern ? 'same movement pattern' : null,
          movementOverlap ? 'same movement family' : null,
          orientationOverlap ? 'same incline/decline/orientation cue' : null,
          aliasOverlap ? 'name/alias overlap' : null,
          isoLateralOverlap ? 'iso-lateral press descriptions overlap' : null
        ].filter(Boolean),
        message: `${left.name} and ${right.name} may overlap. Confirm whether they are distinct exercises; VANTAGE has not merged or removed either.`
      });
    }
  }
  return reviews;
}
