function normaliseText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, ' ');
}

export function normaliseHydrationContents(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const output = [];
  const seen = new Set();
  const add = value => {
    const clean = String(value ?? '').trim().replace(/^[,;:+\s]+|[,;:+\s]+$/g, '');
    if (!clean) return;
    const key = normaliseText(clean).replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  };
  for (const raw of source.flatMap(value => String(value ?? '').split(/[,;|]+/))) {
    const text = normaliseText(raw);
    if (!text) continue;
    const hasEaa = /\beaa(?:s)?\b|essential amino/.test(text);
    const hasElectrolytes = /electrolyte/.test(text);
    if (hasEaa) add('EAAs');
    if (hasElectrolytes) add('electrolytes');
    if (!hasEaa && !hasElectrolytes) add(String(raw).trim());
  }
  return output;
}

export function hydrationSemanticStatus(raw = {}) {
  const hasAmount = Number(raw.amountMl ?? raw.otherFluidMl ?? raw.waterMl ?? raw.coconutWaterMl ?? 0) > 0;
  const contents = normaliseHydrationContents([...(Array.isArray(raw.items) ? raw.items : []), raw.aminoAcids, raw.electrolytes]);
  const hasNotes = Boolean(String(raw.notes || '').trim() && !/^no hydration taken\.?$/i.test(String(raw.notes || '').trim()));
  if (raw.declined === true || raw.reminderDecision === 'none-taken') return 'explicitly-none';
  if (raw.recorded === true || hasAmount || contents.length || hasNotes) return 'recorded-intake';
  return 'not-recorded';
}

export function roleContentValidation(role, rawText = '') {
  const text = normaliseText(rawText);
  if (!text) return { level: 'unknown', valid: null, warnings: [] };
  const hasBp = /\b(?:systolic|diastolic|blood pressure|bp)\b/.test(text) || /\b\d{2,3}\s*\/\s*\d{2,3}\b/.test(text);
  const hasNoopSession = /\b(?:walking|weightlifting|treadmill|stairmaster|yoga)\b/.test(text)
    && (/\b(?:avg|average|peak|max|low|min)\b/.test(text) || /\bz\s*[1-5]\b/.test(text) || /\beffort\b/.test(text));
  const hasMachine = /\b(?:incline|vertical distance|watts?|mets?|total time|mph|pace)\b/.test(text);
  const hasSavedStream = /\bsaved\b/.test(text) && /\b(?:avg|average)\b.*\bbpm\b/.test(text);
  const hasHistoricalCard = /last workouts?|workout history|historical workout/.test(text);
  const warnings = [];
  let valid = true;
  if (['preLissBloodPressure', 'postLissBloodPressure'].includes(role) && !hasBp) {
    valid = false; warnings.push('Assigned blood-pressure role does not contain recognisable blood-pressure content.');
  }
  if (['noopStrapSessionSummary', 'noopStrapHrZones', 'workoutHrSummary'].includes(role) && !hasNoopSession) {
    valid = false; warnings.push('Assigned NOOP session-summary role does not contain recognisable activity/HR/zone content.');
  }
  if (role === 'noopHistoricalWorkoutCard' && !hasHistoricalCard) { valid = false; warnings.push('Assigned NOOP historical-card role does not contain recognisable historical workout content.'); }
  if (role === 'noopSessionStreamSaved' && !hasSavedStream) {
    valid = false; warnings.push('Assigned NOOP saved-session role does not contain a recognisable saved/current-stream summary.');
  }
  if (role === 'treadmillMachineConsole' && !hasMachine) {
    valid = false; warnings.push('Assigned machine-console role does not contain recognisable machine metrics.');
  }
  return { level: valid ? 'green' : 'red', valid, warnings, signals: { hasBp, hasNoopSession, hasMachine, hasSavedStream, hasHistoricalCard } };
}

export function mediaHashAudit(media = []) {
  const groups = new Map();
  for (const item of media) {
    const hash = String(item?.sha256 || '').trim().toLowerCase();
    if (!hash) continue;
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(item);
  }
  const duplicates = [];
  const blocking = [];
  for (const [sha256, items] of groups) {
    if (items.length < 2) continue;
    const roles = [...new Set(items.map(item => String(item.sourceRole || 'unknown')))];
    const entry = { sha256, count: items.length, roles, ids: items.map(item => item.id), names: items.map(item => item.name) };
    duplicates.push(entry);
    if (roles.length > 1) blocking.push({ ...entry, reason: 'Identical media is assigned incompatible source roles.' });
  }
  return { duplicates, blocking };
}

export function timeRangeMinutes(range) {
  const match = String(range || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  let minutes = end - start;
  if (minutes < 0) minutes += 1440;
  return minutes > 0 && minutes <= 1440 ? minutes : null;
}

export function assessOcrPromotion(metrics = {}, rawText = '') {
  const clean = structuredClone(metrics || {});
  const warnings = [];
  const blockedFields = [];
  const fieldValidation = {};
  const text = String(rawText || '');
  const setField = (field, status, value, reason = null) => { fieldValidation[field] = { value, status, ...(reason ? { reason } : {}) }; };

  for (const field of ['avgHr','maxHr','minHr','calories','effort','durationMinutes','durationMinutesDisplayed','durationMinutesFromTimeRange']) {
    if (clean[field] != null) setField(field, 'validated', clean[field]);
  }
  for (let zone=1; zone<=5; zone+=1) {
    for (const kind of ['Percent','Minutes']) {
      const key=`z${zone}${kind}`; const value=clean.hrZones?.[key];
      if (value != null) setField(`hrZones.${key}`, 'validated', value);
    }
  }

  const block = (field, message) => {
    blockedFields.push(field); warnings.push(message);
    const value = field.startsWith('hrZones.') ? clean.hrZones?.[field.split('.')[1]] : clean[field];
    setField(field, 'blocked-review-required', value, message);
    if (field.startsWith('hrZones.')) { if (clean.hrZones) clean.hrZones[field.split('.')[1]] = null; }
    else clean[field] = null;
  };

  const explicitLow = /low hr|min hr|minimum hr|\blow\b|\bminimum\b/i.test(text);
  if (clean.minHr != null && clean.avgHr != null && explicitLow && Number(clean.minHr) === Number(clean.avgHr)) {
    block('minHr', 'Minimum HR equals average HR despite a distinct LOW/MIN label; automatic promotion blocked.');
  }
  if (clean.minHr != null && clean.avgHr != null && Number(clean.minHr) > Number(clean.avgHr)) {
    block('minHr', 'Minimum HR is above average HR; automatic promotion blocked.');
  }

  // Detect a stale/reused minutes token. This specifically protects against the
  // observed NOOP failure where Z1 46m was copied into Z5 even though Z5 showed no minutes.
  for (let zone=1; zone<=5; zone+=1) {
    const minutesKey=`z${zone}Minutes`; const minutes=clean.hrZones?.[minutesKey];
    if (minutes == null) continue;
    const zoneMatch = new RegExp(`\\bZ\\s*${zone}\\b`, 'i').exec(text);
    if (!zoneMatch) continue;
    const remainder=text.slice(zoneMatch.index+zoneMatch[0].length);
    const next=zone<5 ? new RegExp(`\\bZ\\s*${zone+1}\\b`,'i').exec(remainder) : null;
    const blockText=remainder.slice(0,next ? next.index : Math.min(remainder.length,120));
    const visibleMinute=new RegExp(`\\b${String(minutes).replace('.', '\\.')}\\s*(?:m|min|mins|minutes)\\b`,'i').test(blockText);
    const columnHeaderMatch=/\bZ\s*1\b.{0,45}?\bZ\s*2\b.{0,45}?\bZ\s*3\b.{0,45}?\bZ\s*4\b.{0,45}?\bZ\s*5\b/i.exec(text);
    // A true column header contains labels only. Inline `Z1 67% 46m Z2 ...`
    // strings also match the broad five-label regex, but must still be checked
    // for stale/reused minute tokens.
    const trueColumnHeader = Boolean(columnHeaderMatch && !/%|\b\d{1,3}\s*(?:m|min|mins|minutes)\b/i.test(columnHeaderMatch[0]));
    if (!trueColumnHeader && !visibleMinute && zone===5 && Number(minutes)===Number(clean.hrZones?.z1Minutes)) {
      block(`hrZones.${minutesKey}`, `Z${zone} minutes appears to reuse the Z1 minutes token without visible Z${zone} minutes; automatic promotion blocked.`);
    }
  }

  // Suspicious-but-visible source values remain promotable evidence, but analytics
  // eligibility is handled separately by sourceQuality/analysisEligibility.
  return {
    level: blockedFields.length ? 'red' : 'green',
    promotionMetrics: clean,
    blockedFields: [...new Set(blockedFields)],
    validatedFields: Object.entries(fieldValidation).filter(([,meta]) => meta.status === 'validated').map(([field]) => field),
    suspiciousButVisibleFields: Object.entries(fieldValidation).filter(([,meta]) => meta.status === 'validated-source-but-suspicious').map(([field]) => field),
    fieldValidation,
    warnings
  };
}

export function laterSourceCorrectionCandidates(imageReadings = []) {
  const readings = Array.isArray(imageReadings) ? imageReadings : [];
  const current = readings.filter(item => ['noopStrapSessionSummary','workoutHrSummary'].includes(String(item?.sourceRole || '')));
  const later = readings.filter(item => String(item?.sourceRole || '') === 'noopHistoricalWorkoutCard');
  const candidates = [];
  for (const original of current) {
    for (const historical of later) {
      for (const field of ['calories','durationMinutes']) {
        const a = original?.metrics?.[field], b = historical?.metrics?.[field];
        if (a == null || b == null || String(a) === String(b)) continue;
        candidates.push({ field, originalSource: original.sourceFile || original.sourceRole, originalValue: a, laterSource: historical.sourceFile || historical.sourceRole, laterValue: b, status: 'correction-candidate' });
      }
    }
  }
  return candidates;
}

export function ocrValidationState(parsed = {}, { userConfirmedMetrics = false, ocrReviewed = true } = {}) {
  const validation = parsed?.validation || {};
  const blocked = Array.isArray(validation.blockedFields) ? validation.blockedFields.filter(Boolean) : [];
  const valid = validation.level !== 'red' && blocked.length === 0;
  const metricsUserConfirmed = Boolean(userConfirmedMetrics && valid);
  return {
    ocrReviewed: Boolean(ocrReviewed),
    metricsValidated: valid,
    metricsUserConfirmed,
    metricsConfirmed: metricsUserConfirmed,
    validationStatus: valid ? (metricsUserConfirmed ? 'valid' : 'validated-awaiting-user-confirmation') : 'review-required',
    extractionStatus: valid ? (metricsUserConfirmed ? 'ocr-confirmed' : 'ocr-validated') : 'review-required',
    blockedFields: blocked,
    validatedFields: [...(validation.validatedFields || [])],
    suspiciousButVisibleFields: [...(validation.suspiciousButVisibleFields || [])],
    fieldValidation: structuredClone(validation.fieldValidation || {}),
    validationWarnings: [...(validation.warnings || [])]
  };
}

export function ocrMediaAuthoritative(item = {}) {
  const blocked = Array.isArray(item.ocrBlockedFields) ? item.ocrBlockedFields.filter(Boolean) : [];
  const warnings = Array.isArray(item.ocrWarnings) ? item.ocrWarnings : [];
  const blockingWarning = warnings.some(message => /automatic promotion blocked|review required|minimum hr matched average hr|minimum hr equals average hr/i.test(String(message)));
  if (blocked.length || blockingWarning) return false;
  if (item.metricsValidated === false || item.validationStatus === 'review-required' || item.extractionStatus === 'review-required') return false;
  return item.metricsConfirmed === true && (item.metricsValidated === true || item.validationStatus === 'valid' || item.extractionStatus === 'ocr-confirmed');
}
