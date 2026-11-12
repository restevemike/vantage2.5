const safe = (value, fallback = 'Not recorded') => value === null || value === undefined || value === '' ? fallback : String(value);
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const fmt = (value, digits = 1) => num(value) == null ? 'Not recorded' : Number(value).toFixed(digits).replace(/\.0+$/, '');
const zoneDisplay = (percent, minutes) => `${percent == null ? 'Not recorded' : `${fmt(percent, 0)}%`} / ${minutes == null ? 'minutes not shown' : `${fmt(minutes, 0)}m`}`;
const slug = value => String(value || 'recovery').replace(/&/g, 'and').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');

export function recoveryMarkdownFilename(session) {
  return `VANTAGE_Recovery_${session?.date || 'undated'}_${slug(session?.recoverySession?.activity || session?.sessionType)}.md`;
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

function hydrationSummary(hydration = {}) {
  const amountMl = num(hydration.amountMl ?? hydration.otherFluidMl ?? hydration.waterMl ?? hydration.coconutWaterMl);
  const items = Array.isArray(hydration.items) ? hydration.items : [
    hydration.coconutWaterMl ? 'Coconut water' : null,
    hydration.waterMl ? 'Water' : null,
    hydration.otherFluidMl ? 'Other fluid' : null,
    hydration.aminoAcids || null,
    hydration.electrolytes || null
  ].filter(Boolean);
  return {
    recorded: hydration.recorded === true || amountMl != null || items.length > 0,
    amountMl,
    items,
    notes: hydration.notes || '',
    declined: hydration.declined === true,
    reminderSkipped: hydration.reminderSkipped === true
  };
}

function timelineContext(session, vitals) {
  const recovery = session?.recoverySession || {};
  const range = session?.workoutHrSummary?.timeRange || recovery.timeRange || null;
  const notes = String(vitals?.notes || '');
  const spike = notes.match(/(?:peak|spike)\s*(?:around|at)?\s*([0-2]?\d(?::[0-5]\d)?)/i)?.[1] || null;
  if (!range || !spike) return null;
  return {
    possibleExplanation: `${recovery.activity || session.sessionType || 'Recovery activity'} overlaps the recorded morning stress/HR spike.`,
    confidence: 'medium-high',
    note: 'Do not treat the overlapping spike as unexplained stress without reviewing the activity window.',
    sessionTimeRange: range,
    notedSpikeTime: spike
  };
}

export function createRecoveryMarkdown({ session, vitals = null, nutritionSummary = null, media = [] } = {}) {
  if (!session) throw new Error('Recovery session is required.');
  const recovery = session.recoverySession || {};
  const hr = session.workoutHrSummary || {};
  const evidence = session.workoutHrEvidence || null;
  const zones = hr.hrZones || {};
  const evidenceZones = evidence?.hrZones || {};
  const resolvedZones = {};
  for (let zone = 1; zone <= 5; zone += 1) {
    for (const kind of ['Percent', 'Minutes']) {
      const key = `z${zone}${kind}`;
      resolvedZones[key] = zones[key] ?? evidenceZones[key] ?? null;
    }
  }
  const hydration = hydrationSummary(session.hydration || recovery.hydration || {});
  const timeline = timelineContext(session, vitals);
  const caloriesWarning = hr.calories != null && Number(hr.durationMinutes || recovery.durationMinutes || 0) >= 45 && Number(hr.calories) < 80
    ? 'Visible calories look low for the recorded duration. Preserve as screenshot evidence only.' : null;
  const zoneMinutes = ['z1Minutes','z2Minutes','z3Minutes','z4Minutes','z5Minutes'].map(key => num(zones[key])).filter(value => value != null).reduce((a,b)=>a+b,0);
  const zoneMismatch = zoneMinutes && num(hr.durationMinutes) && Math.abs(zoneMinutes - Number(hr.durationMinutes)) > 5;
  const payload = {
    schema: 'vantage-recovery-session-v1',
    sessionId: session.id,
    date: session.date,
    sessionType: session.sessionType,
    activity: recovery.activity || 'Yoga',
    actualAction: 'yoga-recovery',
    durationMinutes: num(recovery.durationMinutes),
    manualStartTime: recovery.startTime || null,
    manualEndTime: recovery.endTime || null,
    startedAtUtc: session.startedAt || null,
    completedAtUtc: session.completedAt || null,
    startedAtLocal: localIso(session.startedAt),
    completedAtLocal: localIso(session.completedAt),
    notes: recovery.notes || session.notes || '',
    recoveryTags: recovery.tags || ['mobility','parasympathetic','breathwork','recovery'],
    hrSummary: {
      sourceRole: 'workoutHrSummary', sourceSystem: 'NOOP', sensor: 'noopStrap',
      activityShown: hr.activityShown || evidence?.activityShown || recovery.activity || null,
      timeRange: hr.timeRange || evidence?.timeRange || null,
      durationMinutes: num(hr.durationMinutes ?? evidence?.durationMinutes),
      avgHr: num(hr.avgHr ?? evidence?.avgHr), maxHr: num(hr.maxHr ?? evidence?.maxHr), minHr: num(hr.minHr ?? evidence?.minHr),
      calories: num(hr.calories ?? evidence?.calories), effort: num(hr.effort ?? evidence?.effort), hrSource: hr.hrSource || evidence?.hrSource || 'strap',
      hrZones: resolvedZones,
      confirmationStatus: evidence?.confirmationStatus || 'structured-or-user-confirmed'
    },
    hydration,
    nutritionContext: nutritionSummary || null,
    actualSessionTime: { manualStartTime: recovery.startTime || null, manualEndTime: recovery.endTime || null, noopStrapTimeRange: hr.timeRange || evidence?.timeRange || null, appStartedAtLocal: localIso(session.startedAt), appCompletedAtLocal: localIso(session.completedAt) },
    exportTime: { generatedAtUtc: new Date().toISOString() },
    timelineContext: timeline,
    media: media.map(item => ({ file: item.archivePath || item.file || item.name, sourceRole: item.sourceRole, photoType: item.photoType || 'current-session-evidence', currentSession: true, includeInCoachPack: item.includeInCoachPack !== false })),
    warnings: [
      zoneMismatch ? 'Visible HR-zone minutes do not sum to the full session duration. Preserve visible values and do not infer missing minutes.' : null,
      caloriesWarning
    ].filter(Boolean)
  };
  const lines = [
    '# Vantage Recovery Session', '',
    `- **Date:** ${safe(session.date)}`,
    `- **Activity:** ${safe(payload.activity)}`,
    `- **Duration:** ${payload.durationMinutes != null ? `${fmt(payload.durationMinutes, 0)} min` : 'Not recorded'}`,
    `- **Actual action:** Yoga / recovery`,
    `- **Session time:** ${safe(payload.hrSummary.timeRange)}`,
    '', '## HR summary', '',
    `- **Average / peak / low HR:** ${safe(payload.hrSummary.avgHr)} / ${safe(payload.hrSummary.maxHr)} / ${safe(payload.hrSummary.minHr)} bpm`,
    `- **Calories:** ${payload.hrSummary.calories == null ? 'Not recorded' : `${fmt(payload.hrSummary.calories, 0)} kcal`}`,
    `- **Effort:** ${safe(payload.hrSummary.effort)}`,
    `- **Z1:** ${zoneDisplay(payload.hrSummary.hrZones.z1Percent, payload.hrSummary.hrZones.z1Minutes)}`,
    `- **Z2:** ${zoneDisplay(payload.hrSummary.hrZones.z2Percent, payload.hrSummary.hrZones.z2Minutes)}`,
    `- **Z3:** ${zoneDisplay(payload.hrSummary.hrZones.z3Percent, payload.hrSummary.hrZones.z3Minutes)}`,
    `- **Z4:** ${zoneDisplay(payload.hrSummary.hrZones.z4Percent, payload.hrSummary.hrZones.z4Minutes)}`,
    `- **Z5:** ${zoneDisplay(payload.hrSummary.hrZones.z5Percent, payload.hrSummary.hrZones.z5Minutes)}`,
    '', '## Hydration', '',
    hydration.recorded ? `- ${hydration.amountMl != null ? `${hydration.amountMl} ml` : 'Amount not supplied'}${hydration.items.length ? ` · ${hydration.items.join(' · ')}` : ''}${hydration.notes ? ` · ${hydration.notes}` : ''}` : (hydration.declined ? '- No hydration taken.' : '- Hydration not recorded.'),
    '', '## Nutrition context', '',
    nutritionSummary ? `- Imported Alex/Vantage macro context is linked for ${safe(session.date)}.` : '- Nutrition pending Alex macro file import.',
    nutritionSummary?.notes ? `- **Imported coaching notes:** ${safe(nutritionSummary.notes)}` : '',
    '', '## Notes', '', safe(payload.notes, 'No notes recorded.'),
    ...(timeline ? ['', '## Timeline context', '', `- ${timeline.note}`, `- ${timeline.possibleExplanation}`] : []),
    ...(payload.warnings.length ? ['', '## Warnings', '', ...payload.warnings.map(item => `- ${item}`)] : []),
    '', '```vantage-recovery-session', JSON.stringify(payload, null, 2), '```', ''
  ];
  return lines.join('\n');
}

export function recoveryAnalysisTemplate(session) {
  return `# Vantage Recovery Analysis Template\n\n\`\`\`vantage-recovery-analysis\n${JSON.stringify({
    schema: 'vantage-recovery-analysis-v1', sessionId: session?.id || null, date: session?.date || null,
    activity: session?.recoverySession?.activity || null, hrSummary: {}, timelineContext: {}, observations: [], warnings: [], summary: ''
  }, null, 2)}\n\`\`\`\n`;
}
