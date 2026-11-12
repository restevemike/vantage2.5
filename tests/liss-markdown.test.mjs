import test from 'node:test';
import assert from 'node:assert/strict';
import { createLissMarkdown, lissMarkdownFilename, parseLissAnalysisMarkdown, compareLissSources, buildLissSourceConflicts, sanitiseLissAnalysisEvidence, classifyLissSession } from '../liss-markdown.js';

const session = {
  id: 'liss-1', date: '2026-07-14', startedAt: '2026-07-14T18:00:00Z', completedAt: '2026-07-14T18:47:00Z',
  templateId: 'liss', sessionType: 'LISS / Cardio', category: 'cardio', mode: 'normal', notes: '', exercises: [],
  cardio: { activityType: 'treadmill-walk', elapsedSeconds: 2820, nasalBreathing: true, comments: 'Nasal breathing throughout', metrics: { avgHr: 106, maxHr: 118 } }
};

test('creates a LISS coach pack with session and image data', () => {
  const text = createLissMarkdown({ session, media: [{ id: 'img1', name: 'treadmill.jpg', type: 'image/jpeg', size: 200000 }] });
  assert.match(text, /VANTAGE LISS Coach Pack/);
  assert.match(text, /Treadmill walk/);
  assert.match(text, /treadmill\.jpg/);
  assert.match(text, /vantage-liss-analysis/);
  assert.equal(lissMarkdownFilename(session), 'VANTAGE_LISS_2026-07-14_Treadmill_walk.md');
});

test('parses a structured LISS analysis file', () => {
  const source = `\`\`\`vantage-liss-analysis\n${JSON.stringify({
    schema: 'vantage-liss-analysis-v1', sessionId: 'liss-1', date: '2026-07-14', activityType: 'treadmill-walk',
    metrics: { avgHr: 106, maxHr: 118, distance: 2.72, distanceUnit: 'mi', hrZones: { z1Percent: 20, z2Percent: 80 } },
    classification: 'true-liss', summary: 'Controlled aerobic work', observations: ['Nasal breathing'], warnings: []
  })}\n\`\`\``;
  const result = parseLissAnalysisMarkdown(source);
  assert.equal(result.sessionId, 'liss-1');
  assert.equal(result.metrics.distance, 2.72);
  assert.equal(result.metrics.hrZones.z2Percent, 80);
  assert.equal(result.classification, 'true-liss');
});

test('exports source-separated LISS metrics and media roles without averaging calories', () => {
  const detailed = structuredClone(session);
  detailed.cardio.fasted = true;
  detailed.cardio.sources = {
    vantageStrap: { avgHr: 108, maxHr: 135, minHr: 68, calories: 457, effort: 18.1, hrZones: { z2Minutes: 36, z2Percent: 80 } },
    watchDevice: { distanceKm: 4.06, calories: 313, avgHr: 110, maxHr: 125, avgSpeedKmh: 5.08, steps: 4675 },
    treadmillMachine: { distanceMiles: 2.72, calories: 444, avgSpeedMph: 3.5, avgInclinePercent: 4.6 }
  };
  const text = createLissMarkdown({
    session: detailed,
    media: [{ id: 'img1', name: 'strap.png', type: 'image/png', size: 1000, sourceRole: 'vantageStrap', archivePath: 'media/strap.png', fileDate: '2026-07-14' }]
  });
  assert.match(text, /vantage-liss-coach-pack-v4/);
  assert.match(text, /NOOP Strap session summary/);
  assert.match(text, /Watch\/device exercise summary/);
  assert.match(text, /Treadmill\/machine console/);
  assert.match(text, /457 kcal/);
  assert.match(text, /313 kcal/);
  assert.match(text, /444 kcal/);
  assert.match(text, /role \*\*noopStrapSessionSummary\*\*/);
  assert.match(text, /doNotAverageCalories/);
  assert.match(text, /file date 2026-07-14/);
});

test('parses v2 source-separated analysis and keeps source values separate', () => {
  const source = `\`\`\`vantage-liss-analysis\n${JSON.stringify({
    schema: 'vantage-liss-analysis-v2', sessionId: 'liss-1', date: '2026-07-14', activityType: 'treadmill-walk',
    sources: {
      vantageStrap: { avgHr: 108, calories: 457, hrZones: { z2Percent: 80 } },
      watchDevice: { avgHr: 110, calories: 313, distanceKm: 4.06 },
      treadmillMachine: { calories: 444, distanceMiles: 2.72 }
    },
    classification: 'moderate-conditioning', summary: 'Source separated', observations: [], warnings: []
  })}\n\`\`\``;
  const result = parseLissAnalysisMarkdown(source);
  assert.equal(result.sources.vantageStrap.calories, 457);
  assert.equal(result.sources.watchDevice.calories, 313);
  assert.equal(result.sources.treadmillMachine.calories, 444);
  assert.equal(result.metrics.avgHr, 108);
  assert.equal(result.classification, 'moderate-conditioning');
});


test('v3 analysis keeps structured sources and image evidence separate', () => {
  const source = `\`\`\`vantage-liss-analysis\n${JSON.stringify({
    schema: 'vantage-liss-analysis-v3', sessionId: 'liss-1', date: '2026-07-14', activityType: 'treadmill-walk',
    structuredSources: { vantageStrap: { avgHr: 108, calories: 457 } },
    imageEvidenceSources: { vantageStrap: { avgHr: 110, calories: 457, sourceType: 'image-extracted', sourceFile: 'media/strap.png' } },
    classification: 'moderate-conditioning', summary: 'Conflict preserved', observations: [], warnings: []
  })}\n\`\`\``;
  const result = parseLissAnalysisMarkdown(source);
  assert.equal(result.structuredSources.vantageStrap.avgHr, 108);
  assert.equal(result.imageEvidenceSources.vantageStrap.avgHr, 110);
  assert.equal(result.imageEvidenceSources.vantageStrap.sourceFile, 'media/strap.png');
});

test('source comparison flags conflicts without mutating recorded values', () => {
  const recorded = { vantageStrap: { avgHr: 108, calories: 457 }, watchDevice: { distanceKm: 4.06 } };
  const evidence = { vantageStrap: { avgHr: 110, calories: 457, sourceType: 'image-extracted' }, watchDevice: { distanceKm: 4.08 } };
  const review = compareLissSources(recorded, evidence);
  const avgHr = review.find(item => item.id === 'vantageStrap:avgHr');
  const calories = review.find(item => item.id === 'vantageStrap:calories');
  const distance = review.find(item => item.id === 'watchDevice:distanceKm');
  assert.equal(avgHr.status, 'conflict');
  assert.equal(avgHr.recordedValue, 108);
  assert.equal(avgHr.evidenceValue, 110);
  assert.equal(calories.status, 'match');
  assert.equal(distance.status, 'conflict');
  assert.equal(recorded.vantageStrap.avgHr, 108);
});

test('groups confirmed media by source and exports role integrity metadata', () => {
  const detailed = structuredClone(session);
  detailed.cardio.sources = {
    vantageStrap: { avgHr: 100 }, watchDevice: { distanceKm: 4.0 }, treadmillMachine: { distanceMiles: 2.8 }
  };
  const text = createLissMarkdown({
    session: detailed,
    media: [
      { id: 'strap', name: 'strap.png', archivePath: 'media/strap.png', type: 'image/png', size: 100, sourceRole: 'vantageStrap', sourceRoleConfirmed: true },
      { id: 'watch', name: 'watch.png', archivePath: 'media/watch.png', type: 'image/png', size: 100, sourceRole: 'watchDevice', sourceRoleConfirmed: true },
      { id: 'machine', name: 'machine.jpg', archivePath: 'media/machine.jpg', type: 'image/jpeg', size: 100, sourceRole: 'treadmillMachine', sourceRoleConfirmed: true }
    ]
  });
  assert.match(text, /NOOP Strap evidence/);
  assert.match(text, /Watch\/device evidence/);
  assert.match(text, /Treadmill\/machine console evidence/);
  assert.match(text, /role confirmed by Steve/);
  assert.match(text, /"mediaBySource"/);
  assert.match(text, /"imageRolesConfirmedBySteve": true/);
});

test('exports BP, hydration, UK local timestamps and expanded source metrics', () => {
  const detailed = structuredClone(session);
  detailed.startedAt = '2026-07-24T17:44:14.240Z';
  detailed.completedAt = '2026-07-24T18:34:32.245Z';
  detailed.date = '2026-07-24';
  detailed.bloodPressureReadings = [{ context: 'pre-liss', time: '17:02', systolic: 127, diastolic: 71, pulse: 55, source: 'manual-cuff' }];
  detailed.cardio.hydration = { coconutWaterMl: 500, waterMl: 1000, electrolytes: 'Electrolytes', notes: 'Drank throughout' };
  detailed.cardio.sources = {
    vantageStrap: { timeRange: '18:44-19:32', durationMinutes: 47, avgHr: 105, maxHr: 119, minHr: 73, calories: 435, effort: 0.9, hrSource: 'strap', hrZones: { z1Minutes: 11, z1Percent: 25, z2Minutes: 34, z2Percent: 75, z3Minutes: 0, z3Percent: 0 } },
    watchDevice: { dateTime: '2026-07-24T18:44:38+01:00', duration: '00:47:50', distanceKm: 4.33, calories: 334, avgHr: 91, maxHr: 131, minHr: 50, avgSpeedKmh: 5.43, fastestSpeedKmh: 6.3, avgPacePerKm: '11:02', minCadence: 18 },
    treadmillMachine: { totalTime: '47:09', calories: 370, avgPacePerKm: '10:21' }
  };
  const text = createLissMarkdown({ session: detailed });
  assert.match(text, /Pre-session blood pressure/);
  assert.match(text, /127\/71 mmHg/);
  assert.match(text, /Coconut water:\*\* 500 ml/);
  assert.match(text, /estimated 22 g carbs \/ 88 kcal/);
  assert.match(text, /Started local:\*\* 2026-07-24T18:44:14\+01:00/);
  assert.match(text, /Date\/time:\*\* 2026-07-24T18:44:38\+01:00/);
  assert.match(text, /Minimum cadence:\*\* 18 steps\/min/);
  assert.match(text, /Average pace:\*\* 10:21 min\/km/);
  assert.match(text, /"doNotOverwriteStructuredValuesWithoutConfirmation": true/);
  assert.match(text, /"type": "true-liss"/);
});

test('re-exports imported screenshot evidence without overwriting structured values', () => {
  const detailed = structuredClone(session);
  detailed.cardio.sources = { vantageStrap: { avgHr: 105 }, watchDevice: {}, treadmillMachine: {} };
  detailed.cardio.analysis = {
    classification: 'true-liss',
    imageEvidenceSources: {
      vantageStrap: { avgHr: 106, calories: 435, sourceType: 'image-extracted', sourceFile: 'media/strap.png' },
      watchDevice: { distanceKm: 4.33, calories: 334, sourceType: 'image-extracted', sourceFile: 'media/watch.png' },
      treadmillMachine: { totalTime: '47:09', calories: 370, sourceType: 'image-extracted', sourceFile: 'media/machine.jpg' }
    }
  };
  const text = createLissMarkdown({ session: detailed });
  assert.match(text, /Screenshot-derived evidence awaiting confirmation/);
  assert.match(text, /Watch\/device screenshot evidence/);
  assert.match(text, /4.33 km/);
  assert.match(text, /"imageEvidenceSources"/);
  assert.match(text, /"structuredSources"/);
});


test('hardened export includes conflicts, image-reading templates and required BP/hydration keys', () => {
  const detailed = structuredClone(session);
  detailed.cardio.sources = {
    vantageStrap: { durationMinutes: 47, avgHr: 105, maxHr: 119, calories: 435, effort: 0.9, hrZones: { z1Percent: 25, z2Percent: 75 } },
    watchDevice: { duration: '00:47:50', avgHr: 91, maxHr: 131, calories: 334 },
    treadmillMachine: { totalTime: '47:09', calories: 370 }
  };
  const text = createLissMarkdown({
    session: detailed,
    media: [{ id: 'strap', archivePath: 'media/strap.png', name: 'strap.png', sourceRole: 'vantageStrap', sourceRoleConfirmed: true, fileDate: detailed.date }]
  });
  assert.match(text, /"preLissBloodPressure": \{\}/);
  assert.match(text, /"hydration": \{/);
  assert.match(text, /"field": "calories"/);
  assert.match(text, /"sourceRoleConfirmed": true/);
  assert.match(text, /"mappingConfidence": "user-confirmed"/);
});

test('source conflict builder preserves calories, duration and heart rate by source', () => {
  const conflicts = buildLissSourceConflicts({
    vantageStrap: { durationMinutes: 47, avgHr: 105, calories: 435 },
    watchDevice: { duration: '00:47:50', avgHr: 91, calories: 334 },
    treadmillMachine: { totalTime: '47:09', calories: 370 }
  }, 2946);
  assert.ok(conflicts.some(item => item.field === 'calories'));
  assert.ok(conflicts.some(item => item.field === 'duration'));
  assert.ok(conflicts.some(item => item.field === 'averageHeartRate'));
  assert.match(conflicts.find(item => item.field === 'calories').resolution, /Do not average/);
});

test('wrong-date screenshot evidence is excluded from current session population', () => {
  const result = sanitiseLissAnalysisEvidence({
    imageEvidenceSources: {
      vantageStrap: { avgHr: 106, sourceFile: 'media/old.png' },
      watchDevice: {},
      treadmillMachine: {}
    },
    imageReadings: [{ sourceFile: 'media/old.png', sourceRole: 'vantageStrap', dateShown: '2026-07-13', metrics: { avgHr: 106 } }]
  }, '2026-07-14');
  assert.equal(result.imageEvidenceSources.vantageStrap.avgHr, null);
  assert.match(result.warnings[0], /another day/);
});

test('hardened classification applies thresholds and low-recovery guardrails', () => {
  const trueLiss = classifyLissSession({
    sources: { vantageStrap: { durationMinutes: 48, avgHr: 105, maxHr: 119, effort: 0.9, hrZones: { z1Percent: 25, z2Percent: 75, z3Percent: 0 } } }
  });
  assert.equal(trueLiss.type, 'true-liss');

  const lowRecovery = classifyLissSession({
    vitals: { recovery: 30 },
    readiness: { level: 'red', title: 'Recovery only' },
    sources: { vantageStrap: { durationMinutes: 48, avgHr: 105, maxHr: 120, effort: 0.9, hrZones: { z1Percent: 25, z2Percent: 75 } } }
  });
  assert.equal(lowRecovery.guardrail.active, true);
  assert.ok(lowRecovery.guardrail.warnings.length >= 2);
});

test('analysis parser rejects multiple fenced blocks', () => {
  const payload = {
    schema: 'vantage-liss-analysis-v3', sessionId: 'liss-1', date: '2026-07-14', activityType: 'treadmill-walk',
    structuredSources: {}, imageEvidenceSources: {}, conflicts: [], confirmationPolicy: '', classification: 'unknown',
    summary: '', observations: [], warnings: [], hydration: {}, preLissBloodPressure: {}, imageReadings: []
  };
  const block = `\`\`\`vantage-liss-analysis\n${JSON.stringify(payload)}\n\`\`\``;
  assert.throws(() => parseLissAnalysisMarkdown(`${block}\n${block}`), /more than one/);
});


test('NOOP Strap walking summary remains a first-class source and classifies recovery walk', () => {
  const walk = structuredClone(session);
  walk.date = '2026-07-29';
  walk.cardio.activityType = 'outdoor-walk';
  walk.cardio.elapsedSeconds = 2922;
  walk.cardio.sources = {
    noopStrapSessionSummary: {
      sourceRole: 'noopStrapSessionSummary',
      sourceSystem: 'NOOP',
      sensor: 'noopStrap',
      activityShown: 'Walking',
      dateShown: '2026-07-29',
      timeRange: '17:59-18:46',
      durationMinutes: 47,
      avgHr: 95,
      maxHr: 119,
      minHr: 58,
      calories: 0,
      distanceKm: 4.9,
      effort: 0.7,
      hrSource: 'strap',
      hrZones: { z1Percent: 87, z1Minutes: 37, z2Percent: 13, z2Minutes: 5, z3Percent: 0, z3Minutes: 0 }
    }
  };
  const text = createLissMarkdown({
    session: walk,
    vitals: { recovery: 16, synthesis: 'Depleted', hrv: 45, hrvDeltaFromBaseline: -18, restingHr: 44, rhrDeltaFromBaseline: 3 },
    readiness: { level: 'red', title: 'Red — recovery only' },
    media: [{
      id: 'noop-1', name: '35888.png', archivePath: 'media/35888.png', type: 'image/png', size: 1000,
      sourceRole: 'noopStrapSessionSummary', sourceSystem: 'NOOP', sensor: 'noopStrap',
      sourceRoleConfirmed: true, mappingConfidence: 'user-confirmed', fileDate: '2026-07-29'
    }]
  });
  assert.match(text, /"noopStrapSessionSummary"/);
  assert.match(text, /"sourceSystem": "NOOP"/);
  assert.match(text, /"sensor": "noopStrap"/);
  assert.match(text, /"type": "true-liss"/);
  assert.match(text, /0 kcal despite 47 minutes and 4\.9 km/);
  assert.match(text, /suggested 20–30 minute cap/);
  assert.match(text, /"synthesis": "Depleted"/);
  assert.match(text, /"hrvBaseline": null/);
  assert.match(text, /"hrvDeltaFromBaseline": -18/);
});

test('activity conflict preserves VANTAGE and NOOP labels for Steve review', () => {
  const conflicted = structuredClone(session);
  conflicted.cardio.activityType = 'treadmill-walk';
  conflicted.cardio.analysis = {
    imageEvidenceSources: {
      noopStrapSessionSummary: { activityShown: 'Walking', sourceType: 'image-extracted', sourceFile: 'media/noop.png' }
    }
  };
  const text = createLissMarkdown({ session: conflicted });
  assert.match(text, /"field": "activityType"/);
  assert.match(text, /"vantageExport": "treadmill-walk"/);
  assert.match(text, /"noopStrapSessionSummary": "walking"/);
  assert.match(text, /Steve confirms/);
});
