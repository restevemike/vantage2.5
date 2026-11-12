const numberOrNull = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;

function normaliseBaselineStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['at-baseline','at baseline','baseline'].includes(text)) return 'at-baseline';
  if (['above-baseline','above baseline'].includes(text)) return 'above-baseline';
  if (['below-baseline','below baseline'].includes(text)) return 'below-baseline';
  if (['known','recorded'].includes(text)) return 'known';
  return 'unknown';
}

function pushRule(target, code, message, severity, field = null) {
  target.push({ code, message, severity, field });
}

/**
 * Transparent decision-support logic for training readiness.
 * Baseline status is source evidence: an explicit "at-baseline" RHR is neutral
 * even when the numeric baseline itself is unknown.
 * BP and symptoms remain hard limiters.
 */
export function calculateReadiness(vitals = {}) {
  const reasons = [];
  const rulesTriggered = [];
  const validationWarnings = [];
  let amber = 0;
  let red = 0;
  const recovery = numberOrNull(vitals.recovery);
  const rest = numberOrNull(vitals.restScore ?? vitals.rest);
  const hrv = numberOrNull(vitals.hrv);
  const hrvBaseline = numberOrNull(vitals.hrvBaseline);
  const hrvDeltaFromBaseline = numberOrNull(vitals.hrvDeltaFromBaseline);
  const hrvBaselineStatus = normaliseBaselineStatus(vitals.hrvBaselineStatus ?? vitals.baselineStatus?.hrv);
  const restingHr = numberOrNull(vitals.restingHr);
  const rhrBaseline = numberOrNull(vitals.rhrBaseline);
  const rawRhrDelta = numberOrNull(vitals.rhrDeltaFromBaseline);
  const rhrBaselineStatus = normaliseBaselineStatus(vitals.rhrBaselineStatus ?? vitals.baselineStatus?.restingHr);
  const rhrDeltaFromBaseline = rhrBaselineStatus === 'at-baseline' ? null : rawRhrDelta;
  const stress = numberOrNull(vitals.stress);
  const stressBand = String(vitals.stressBand || '').trim().toLowerCase();
  const sleepHours = numberOrNull(vitals.sleepHours);
  const systolic = numberOrNull(vitals.systolic);
  const diastolic = numberOrNull(vitals.diastolic);
  const synthesis = String(vitals.synthesis || '').trim().toLowerCase();
  let recoveryOnlyAmber = false;

  if (rhrBaselineStatus === 'at-baseline' && rawRhrDelta != null && rawRhrDelta !== 0) {
    validationWarnings.push('Resting-HR delta conflicts with source status “at baseline”; the numeric RHR delta was excluded from readiness.');
  }

  if (vitals.symptoms) {
    red += 4; reasons.push('Symptoms are present'); pushRule(rulesTriggered, 'symptoms', 'Symptoms are present', 'red', 'symptoms');
  }
  if (recovery != null) {
    if (recovery < 35) { red += 2; reasons.push('Recovery is very low'); pushRule(rulesTriggered, 'recovery-very-low', 'Recovery is very low', 'red', 'recovery'); }
    else if (recovery < 50) { amber += 2; recoveryOnlyAmber = true; reasons.push('Recovery is low'); pushRule(rulesTriggered, 'recovery-low', 'Recovery is low', 'amber', 'recovery'); }
    else if (recovery < 65) { amber += 1; reasons.push('Recovery is moderate'); pushRule(rulesTriggered, 'recovery-moderate', 'Recovery is moderate', 'amber', 'recovery'); }
  }
  if (['low', 'draining', 'depleted'].includes(synthesis)) {
    amber += synthesis === 'depleted' ? 2 : 1;
    recoveryOnlyAmber = true;
    reasons.push(`Synthesis is ${vitals.synthesis}`);
    pushRule(rulesTriggered, `synthesis-${synthesis}`, `Synthesis is ${vitals.synthesis}`, 'amber', 'synthesis');
  }
  if (hrv != null && hrvBaseline != null) {
    const ratio = hrv / hrvBaseline;
    if (ratio < 0.8) { red += 2; reasons.push('HRV is heavily suppressed'); pushRule(rulesTriggered, 'hrv-heavily-suppressed', 'HRV is heavily suppressed', 'red', 'hrv'); }
    else if (ratio < 0.92) { amber += 1; reasons.push('HRV is below baseline'); pushRule(rulesTriggered, 'hrv-below-baseline', 'HRV is below baseline', 'amber', 'hrv'); }
  } else if (hrvDeltaFromBaseline != null) {
    if (hrvDeltaFromBaseline <= -15) { red += 2; reasons.push('HRV is heavily suppressed versus baseline'); pushRule(rulesTriggered, 'hrv-delta-red', 'HRV is heavily suppressed versus baseline', 'red', 'hrvDeltaFromBaseline'); }
    else if (hrvDeltaFromBaseline <= -5) { amber += 1; reasons.push('HRV is below baseline'); pushRule(rulesTriggered, 'hrv-delta-amber', 'HRV is below baseline', 'amber', 'hrvDeltaFromBaseline'); }
  }
  if (restingHr != null && rhrBaseline != null) {
    const delta = restingHr - rhrBaseline;
    if (delta >= 10) { red += 2; reasons.push('Resting HR is well above baseline'); pushRule(rulesTriggered, 'rhr-delta-red', 'Resting HR is well above baseline', 'red', 'restingHr'); }
    else if (delta >= 5) { amber += 1; reasons.push('Resting HR is elevated'); pushRule(rulesTriggered, 'rhr-delta-amber', 'Resting HR is elevated', 'amber', 'restingHr'); }
  } else if (rhrDeltaFromBaseline != null) {
    if (rhrDeltaFromBaseline >= 10) { red += 2; reasons.push('Resting HR is well above baseline'); pushRule(rulesTriggered, 'rhr-delta-red', 'Resting HR is well above baseline', 'red', 'rhrDeltaFromBaseline'); }
    else if (rhrDeltaFromBaseline >= 5) { amber += 1; reasons.push('Resting HR is elevated'); pushRule(rulesTriggered, 'rhr-delta-amber', 'Resting HR is elevated', 'amber', 'rhrDeltaFromBaseline'); }
  }
  if (stress != null) {
    // Preserve the existing engine semantics for 0-100 stress sources; 0-3 NOOP stress
    // is interpreted through its explicit band rather than multiplied into another scale.
    if (stress > 3) {
      if (stress >= 75) { red += 2; reasons.push('Stress is high'); pushRule(rulesTriggered, 'stress-high', 'Stress is high', 'red', 'stress'); }
      else if (stress >= 50) { amber += 1; reasons.push('Stress is elevated'); pushRule(rulesTriggered, 'stress-elevated', 'Stress is elevated', 'amber', 'stress'); }
    } else if (stressBand === 'high' && stress >= 2.7) {
      amber += 1; reasons.push('Autonomic stress is high'); pushRule(rulesTriggered, 'stress-band-high', 'Autonomic stress is high', 'amber', 'stress');
    }
  }
  if (sleepHours != null) {
    if (sleepHours < 5) { red += 2; reasons.push('Sleep was poor'); pushRule(rulesTriggered, 'sleep-poor', 'Sleep was poor', 'red', 'sleepHours'); }
    else if (sleepHours < 6.5) { amber += 1; reasons.push('Sleep was short'); pushRule(rulesTriggered, 'sleep-short', 'Sleep was short', 'amber', 'sleepHours'); }
  }
  if (vitals.feeling === 'poor') { red += 1; reasons.push('You feel poor'); pushRule(rulesTriggered, 'feeling-poor', 'You feel poor', 'red', 'feeling'); }
  else if (vitals.feeling === 'average') { amber += 1; reasons.push('You feel average'); pushRule(rulesTriggered, 'feeling-average', 'You feel average', 'amber', 'feeling'); }

  let bpStatus = 'normal';
  if ((systolic != null && systolic >= 160) || (diastolic != null && diastolic >= 100)) {
    bpStatus = 'high'; red += 4; reasons.push('BP is in the high caution range'); pushRule(rulesTriggered, 'bp-high', 'BP is in the high caution range', 'red', 'bloodPressure');
  } else if ((systolic != null && systolic >= 140) || (diastolic != null && diastolic >= 90)) {
    bpStatus = 'elevated'; amber += 3; reasons.push('BP is elevated'); pushRule(rulesTriggered, 'bp-elevated', 'BP is elevated', 'amber', 'bloodPressure');
  }

  let level = 'green';
  if (red >= 2) level = 'red';
  else if (amber >= 2 || red === 1) level = 'amber';

  const hardRed = rulesTriggered.some(rule => ['symptoms','recovery-very-low','hrv-heavily-suppressed','hrv-delta-red','bp-high','sleep-poor'].includes(rule.code));
  const strongPositiveContext = recovery != null && recovery >= 80 && rest != null && rest >= 80 && !vitals.symptoms && (synthesis === 'peak' || synthesis === 'solid' || synthesis === 'primed' || synthesis === '') && (stressBand === 'low' || stress == null || stress <= 1.5);
  if (level === 'red' && strongPositiveContext && !hardRed) {
    validationWarnings.push('Readiness conflict detected: high recovery/rest and favourable source context conflict with a Red result. Review vitals mapping before applying a training restriction.');
  }
  if (rhrBaselineStatus === 'at-baseline' && reasons.some(reason => /Resting HR is .*above baseline|Resting HR is elevated/.test(reason))) {
    validationWarnings.push('Readiness conflict detected: resting-HR readiness reason conflicts with imported source status “at baseline”.');
  }
  if (synthesis === 'peak' && level === 'red' && !hardRed) validationWarnings.push('Readiness conflict detected: Synthesis is Peak while readiness resolved to Red without an independent hard limiter.');

  const title = ({ green: 'Green — productive session allowed', amber: 'Amber — controlled training permitted', red: 'Red — recovery only' })[level];
  let message = {
    green: 'Recovery supports normal productive work. Respect soreness, technique and blood pressure.',
    amber: 'Use a controlled session, deload or reduced-bracing variation. Keep reps clean and stop before grinding.',
    red: 'Use recovery work only. Skip hard lifting and high-pressure bracing today.'
  }[level];
  if (level === 'amber' && recoveryOnlyAmber) message = 'Recovery is constrained. Controlled resistance training is permitted, but reduce volume, avoid grinders and keep technique clean; deload or recovery work remain valid alternatives.';
  if (bpStatus === 'elevated') message = 'BP is elevated. Use recovery-only or very controlled training and avoid heavy bracing.';
  if (bpStatus === 'high') message = 'BP is high enough to override other readiness signals. Recovery-only is the sensible call.';

  const allowedActions = level === 'green' ? ['productive-strength','controlled-strength','liss','recovery-work','rest'] : level === 'amber' ? ['controlled-strength','deload','recovery-work','rest'] : ['recovery-work','rest'];
  const recommendedIntensity = level === 'green' ? 'normal' : level === 'amber' ? 'controlled' : 'recovery-only';
  const recommendedVolumePercent = level === 'green' ? '90-100' : level === 'amber' ? '70-90' : '0-40';
  const calculationAudit = {
    recovery, rest, hrv, hrvDelta: hrvDeltaFromBaseline, hrvBaseline, hrvBaselineStatus,
    restingHr, rhrDelta: rhrDeltaFromBaseline, rawRhrDelta, rhrBaseline, rhrBaselineStatus,
    stress, stressBand: vitals.stressBand || null, synthesis: vitals.synthesis || null,
    sleepHours, bp: systolic != null || diastolic != null ? `${systolic ?? '–'}/${diastolic ?? '–'}` : null,
    symptoms: Boolean(vitals.symptoms), rulesTriggered, validationWarnings: [...validationWarnings]
  };
  return { level, title, message, reasons, bpStatus, readinessRisk: level, allowedActions, recommendedIntensity, recommendedVolumePercent, validationWarnings, calculationAudit };
}
