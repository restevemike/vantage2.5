const BLOODWORK_SCHEMA = 'vantage-bloodwork-v1';
const BLOODWORK_ANALYSIS_SCHEMA = 'vantage-bloodwork-analysis-v1';

const ALLOWED_STATUSES = new Set(['low', 'normal', 'high', 'borderline-low', 'borderline-high', 'unknown']);
const ALLOWED_CONFIDENCE = new Set(['clear', 'partly-obscured', 'inferred-date', 'manual-entry', 'uncertain']);
const ALLOWED_OVERALL = new Set(['green', 'amber', 'red', 'unknown']);

function extractBlock(markdown, language) {
  const expression = new RegExp('```' + language.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\s*\\n([\\s\\S]*?)\\n```', 'i');
  const match = String(markdown || '').match(expression);
  if (!match) throw new Error(`No ${language} code block was found.`);
  try { return JSON.parse(match[1]); }
  catch (error) { throw new Error(`The ${language} JSON is invalid: ${error.message}`); }
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function finiteOrNull(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function markerNameKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/haemoglobin/g, 'hemoglobin')
    .replace(/oestradiol/g, 'estradiol')
    .replace(/non[\s-]?hdl/g, 'nonhdl')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deriveStatus(value, low, high, supplied) {
  if (ALLOWED_STATUSES.has(supplied)) return supplied;
  if (!Number.isFinite(value)) return 'unknown';
  if (Number.isFinite(low) && value < low) return 'low';
  if (Number.isFinite(high) && value > high) return 'high';
  if (Number.isFinite(low) || Number.isFinite(high)) return 'normal';
  return 'unknown';
}

function normaliseMarker(marker, index) {
  if (!marker || typeof marker !== 'object') throw new Error(`Marker ${index + 1} is invalid.`);
  const name = String(marker.name || '').trim();
  if (!name) throw new Error(`Marker ${index + 1} has no name.`);
  const rawValue = marker.value;
  const numericValue = finiteOrNull(rawValue);
  const referenceLow = finiteOrNull(marker.referenceLow);
  const referenceHigh = finiteOrNull(marker.referenceHigh);
  return {
    group: String(marker.group || 'Other / ungrouped').trim(),
    name,
    nameKey: markerNameKey(name),
    value: numericValue ?? (rawValue == null ? null : String(rawValue).trim()),
    numericValue,
    unit: String(marker.unit || '').trim(),
    referenceLow,
    referenceHigh,
    status: deriveStatus(numericValue, referenceLow, referenceHigh, String(marker.status || '').toLowerCase()),
    confidence: ALLOWED_CONFIDENCE.has(marker.confidence) ? marker.confidence : 'uncertain',
    sourceNote: String(marker.sourceNote || '').trim(),
    labFlag: marker.labFlag == null ? null : String(marker.labFlag)
  };
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseBloodworkMarkdown(markdown, fileName = '') {
  const payload = extractBlock(markdown, 'vantage-bloodwork');
  if (payload.schema !== BLOODWORK_SCHEMA) throw new Error(`Unsupported bloodwork schema: ${payload.schema || 'missing'}.`);
  if (!validDate(payload.date)) throw new Error('Bloodwork date must use YYYY-MM-DD.');
  if (!Array.isArray(payload.markers) || payload.markers.length === 0) throw new Error('The bloodwork file contains no markers.');
  const markers = payload.markers.map(normaliseMarker);
  const fingerprintSource = JSON.stringify({
    date: payload.date,
    source: payload.source || '',
    markers: markers.map(item => [item.nameKey, item.value, item.unit, item.referenceLow, item.referenceHigh])
  });
  const fingerprint = fnv1a(fingerprintSource);
  return {
    id: `bloodwork-${payload.date}-${fingerprint}`,
    fingerprint,
    schema: BLOODWORK_SCHEMA,
    date: payload.date,
    source: String(payload.source || 'mixed'),
    labName: String(payload.labName || '').trim(),
    fasted: payload.fasted == null ? null : Boolean(payload.fasted),
    notes: String(payload.notes || '').trim(),
    markers,
    context: {
      collectionTime: payload.collectionTime || null,
      daysSinceLastTRTInjection: finiteOrNull(payload.daysSinceLastTRTInjection),
      trtProtocolAtTime: payload.trtProtocolAtTime || null,
      trainingWithin48h: payload.trainingWithin48h == null ? null : Boolean(payload.trainingWithin48h),
      saunaWithin48h: payload.saunaWithin48h == null ? null : Boolean(payload.saunaWithin48h),
      hydrationNote: payload.hydrationNote || '',
      supplementStackAtTime: Array.isArray(payload.supplementStackAtTime) ? payload.supplementStackAtTime : [],
      medicationsAtTime: Array.isArray(payload.medicationsAtTime) ? payload.medicationsAtTime : [],
      symptomsAtTime: Array.isArray(payload.symptomsAtTime) ? payload.symptomsAtTime : []
    },
    fileName: String(fileName || ''),
    originalMarkdown: String(markdown || ''),
    importedAt: new Date().toISOString()
  };
}

export function parseBloodworkAnalysisMarkdown(markdown, fileName = '') {
  const payload = extractBlock(markdown, 'vantage-bloodwork-analysis');
  if (payload.schema !== BLOODWORK_ANALYSIS_SCHEMA) throw new Error(`Unsupported analysis schema: ${payload.schema || 'missing'}.`);
  if (!validDate(payload.date)) throw new Error('Analysis date must use YYYY-MM-DD.');
  return {
    id: payload.id || `blood-analysis-${payload.date}-${fnv1a(String(markdown || ''))}`,
    schema: BLOODWORK_ANALYSIS_SCHEMA,
    date: payload.date,
    bloodTestId: payload.bloodTestId || null,
    overallStatus: ALLOWED_OVERALL.has(payload.overallStatus) ? payload.overallStatus : 'unknown',
    summary: String(payload.summary || '').trim(),
    alerts: Array.isArray(payload.alerts) ? payload.alerts.map(item => ({
      level: ALLOWED_OVERALL.has(item?.level) ? item.level : 'unknown',
      marker: String(item?.marker || '').trim(),
      finding: String(item?.finding || '').trim(),
      possibleContext: String(item?.possibleContext || '').trim(),
      recommendation: String(item?.recommendation || '').trim()
    })) : [],
    trends: Array.isArray(payload.trends) ? payload.trends.map(item => ({
      marker: String(item?.marker || '').trim(),
      direction: ['up', 'down', 'stable', 'unknown'].includes(item?.direction) ? item.direction : 'unknown',
      comment: String(item?.comment || '').trim()
    })) : [],
    supportSuggestions: Array.isArray(payload.supportSuggestions) ? payload.supportSuggestions.map(item => ({
      target: String(item?.target || '').trim(),
      suggestionType: String(item?.suggestionType || '').trim(),
      suggestion: String(item?.suggestion || '').trim(),
      safetyNote: String(item?.safetyNote || '').trim()
    })) : [],
    questionsForClinician: Array.isArray(payload.questionsForClinician) ? payload.questionsForClinician.map(String) : [],
    notes: String(payload.notes || '').trim(),
    fileName: String(fileName || ''),
    originalMarkdown: String(markdown || ''),
    importedAt: new Date().toISOString()
  };
}

export function bloodworkMarkdownFilename(test) {
  return `VANTAGE_Bloodwork_${test.date}.md`;
}

export function bloodworkAnalysisFilename(analysis) {
  return `VANTAGE_Bloodwork_Analysis_${analysis.date}.md`;
}

export function createBloodworkMarkdown(test) {
  const payload = {
    schema: BLOODWORK_SCHEMA,
    date: test.date,
    source: test.source,
    labName: test.labName || undefined,
    fasted: test.fasted,
    notes: test.notes || '',
    ...(test.context || {}),
    markers: (test.markers || []).map(marker => ({
      group: marker.group,
      name: marker.name,
      value: marker.value,
      unit: marker.unit,
      referenceLow: marker.referenceLow,
      referenceHigh: marker.referenceHigh,
      status: marker.status,
      confidence: marker.confidence,
      sourceNote: marker.sourceNote
    }))
  };
  return `# VANTAGE Bloodwork — ${test.date}\n\n\`\`\`vantage-bloodwork\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

export function createBloodworkAnalysisMarkdown(analysis) {
  const payload = {
    schema: BLOODWORK_ANALYSIS_SCHEMA,
    date: analysis.date,
    bloodTestId: analysis.bloodTestId || undefined,
    overallStatus: analysis.overallStatus,
    summary: analysis.summary,
    alerts: analysis.alerts || [],
    trends: analysis.trends || [],
    supportSuggestions: analysis.supportSuggestions || [],
    questionsForClinician: analysis.questionsForClinician || [],
    notes: analysis.notes || ''
  };
  return `# VANTAGE Bloodwork Analysis — ${analysis.date}\n\n\`\`\`vantage-bloodwork-analysis\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

export function markerHistory(tests, markerName) {
  const key = markerNameKey(markerName);
  const rows = [];
  for (const test of [...tests].sort((a, b) => a.date.localeCompare(b.date))) {
    const marker = (test.markers || []).find(item => (item.nameKey || markerNameKey(item.name)) === key);
    if (!marker || !Number.isFinite(marker.numericValue ?? marker.value)) continue;
    rows.push({
      testId: test.id,
      date: test.date,
      value: Number(marker.numericValue ?? marker.value),
      unit: marker.unit || '',
      status: marker.status || 'unknown',
      referenceLow: marker.referenceLow,
      referenceHigh: marker.referenceHigh,
      source: test.source,
      labName: test.labName || ''
    });
  }
  return rows;
}

export function createBloodworkAnalysisRequest(test, allTests) {
  const history = {};
  for (const marker of test.markers || []) {
    const rows = markerHistory(allTests, marker.name).filter(item => item.testId !== test.id);
    if (rows.length) history[marker.name] = rows.slice(-8);
  }
  // Rebuild from the canonical export so the analysis handoff mirrors the app import schema.
  const canonical = createBloodworkMarkdown(test).match(/```vantage-bloodwork\s*\n([\s\S]*?)\n```/i)?.[1] || '{}';
  return `# VANTAGE Bloodwork Analysis Request\n\nAnalyse this dated bloodwork using the VANTAGE Bloodwork Analyzer rules already established in the thread. Preserve the issuing lab units and ranges, compare only like-for-like units, keep recorded data separate from inference, and do not diagnose. Consider fasting status, TRT timing, training, creatine, protein intake, hydration and heat exposure only where the supplied context supports it.\n\nReturn readable feedback and an actual downloadable Markdown file containing exactly one \`vantage-bloodwork-analysis\` JSON block. Include \`bloodTestId\` as \`${test.id}\`.\n\n## Current test\n\n\`\`\`vantage-bloodwork\n${canonical}\n\`\`\`\n\n## Earlier same-marker history\n\n\`\`\`json\n${JSON.stringify(history, null, 2)}\n\`\`\`\n`;
}

export { markerNameKey, BLOODWORK_SCHEMA, BLOODWORK_ANALYSIS_SCHEMA };
