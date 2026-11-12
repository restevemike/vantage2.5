function extractBlocks(text) {
  return [...String(text || '').matchAll(/```vantage-strength-analysis\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
}

export function parseStrengthAnalysisMarkdown(text) {
  const blocks = extractBlocks(text);
  if (blocks.length !== 1) throw new Error('The file must contain exactly one vantage-strength-analysis block.');
  let analysis;
  try { analysis = JSON.parse(blocks[0]); }
  catch (error) { throw new Error(`The strength analysis JSON is invalid: ${error.message}`); }
  if (analysis.schema !== 'vantage-strength-analysis-v1') throw new Error('Unsupported strength analysis schema.');
  if (!Object.prototype.hasOwnProperty.call(analysis, 'sessionId')) throw new Error('The analysis is missing sessionId.');
  if (!Object.prototype.hasOwnProperty.call(analysis, 'date')) throw new Error('The analysis is missing date.');
  if (analysis.workoutHrSummary != null && typeof analysis.workoutHrSummary !== 'object') throw new Error('workoutHrSummary must be an object or null.');
  if (analysis.mediaReview != null && typeof analysis.mediaReview !== 'object') throw new Error('mediaReview must be an object or null.');
  if (analysis.correctionCandidates != null && !Array.isArray(analysis.correctionCandidates)) throw new Error('correctionCandidates must be an array.');
  if (analysis.warnings != null && !Array.isArray(analysis.warnings)) throw new Error('warnings must be an array.');
  return analysis;
}

export function strengthAnalysisTemplate(session = {}) {
  return `\`\`\`vantage-strength-analysis\n${JSON.stringify({
    schema: 'vantage-strength-analysis-v1',
    sessionId: session.id || null,
    date: session.date || null,
    sessionType: session.sessionType || null,
    workoutHrSummary: {
      sourceRole: 'workoutHrSummary', sourceFile: null, source: 'strap', timeRange: null,
      durationMinutes: null, avgHr: null, maxHr: null, minHr: null, calories: null, effort: null,
      hrZones: { z1Percent: null, z1Minutes: null, z2Percent: null, z2Minutes: null, z3Percent: null, z3Minutes: null, z4Percent: null, z4Minutes: null, z5Percent: null, z5Minutes: null },
      confirmationStatus: 'screenshot-evidence-present', suspiciousValues: []
    },
    readinessReview: { structuredReadiness: null, baselineConflicts: [], notes: '' },
    bloodPressureEvidence: [],
    mediaReview: { roleCorrections: [], invalidOrSuspiciousMedia: [], notes: '' },
    correctionCandidates: [],
    intensityTechniqueCorrections: [],
    exerciseIdentityWarnings: [],
    setValidationWarnings: [],
    observations: [], warnings: [], summary: ''
  }, null, 2)}\n\`\`\``;
}
