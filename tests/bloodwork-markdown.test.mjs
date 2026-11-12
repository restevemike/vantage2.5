import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseBloodworkMarkdown,
  parseBloodworkAnalysisMarkdown,
  markerHistory,
  createBloodworkAnalysisRequest
} from '../bloodwork-markdown.js';

const bloodwork = `# Bloods\n\n\`\`\`vantage-bloodwork\n{
  "schema": "vantage-bloodwork-v1",
  "date": "2026-07-07",
  "source": "typed-gp-message",
  "fasted": true,
  "notes": "Fasted and off TRT",
  "markers": [
    {"group":"Kidney / hydration / electrolytes","name":"Urea","value":9.3,"unit":"mmol/L","referenceLow":2.5,"referenceHigh":7.8,"status":"high","confidence":"clear","sourceNote":"GP result"},
    {"group":"Hormones / TRT","name":"Testosterone","value":11.8,"unit":"nmol/L","referenceLow":8.6,"referenceHigh":29,"status":"normal","confidence":"manual-entry","sourceNote":"6.5 weeks after Sustanon"}
  ]
}\n\`\`\``;

test('parses and normalises VANTAGE bloodwork', () => {
  const parsed = parseBloodworkMarkdown(bloodwork, 'bloods.md');
  assert.equal(parsed.date, '2026-07-07');
  assert.equal(parsed.markers.length, 2);
  assert.equal(parsed.markers[0].numericValue, 9.3);
  assert.equal(parsed.markers[0].status, 'high');
  assert.match(parsed.id, /^bloodwork-2026-07-07-/);
});

test('identical bloodwork creates a stable import id', () => {
  assert.equal(parseBloodworkMarkdown(bloodwork).id, parseBloodworkMarkdown(bloodwork).id);
});

test('parses an importable bloodwork analysis', () => {
  const markdown = `\`\`\`vantage-bloodwork-analysis\n{"schema":"vantage-bloodwork-analysis-v1","date":"2026-07-07","overallStatus":"amber","summary":"Watch urea.","alerts":[],"trends":[],"supportSuggestions":[],"questionsForClinician":[],"notes":""}\n\`\`\``;
  const parsed = parseBloodworkAnalysisMarkdown(markdown);
  assert.equal(parsed.overallStatus, 'amber');
  assert.equal(parsed.summary, 'Watch urea.');
});

test('marker history compares numeric results without merging names incorrectly', () => {
  const first = parseBloodworkMarkdown(bloodwork);
  const second = structuredClone(first);
  second.id = 'second'; second.date = '2026-08-01'; second.markers[0].value = 8.1; second.markers[0].numericValue = 8.1;
  const history = markerHistory([first, second], 'Urea');
  assert.deepEqual(history.map(item => item.value), [9.3, 8.1]);
});

test('analysis request contains current test id and prior history', () => {
  const first = parseBloodworkMarkdown(bloodwork);
  const second = structuredClone(first); second.id = 'second'; second.date = '2026-08-01';
  const request = createBloodworkAnalysisRequest(second, [first, second]);
  assert.match(request, /vantage-bloodwork-analysis/);
  assert.match(request, /Earlier same-marker history/);
  assert.match(request, /second/);
});

test('BioLab UI and exact vitals input are present', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const db = await readFile(new URL('../db.js', import.meta.url), 'utf8');
  assert.match(html, /id="biolabScreen"/);
  assert.match(html, /data-nav="biolab"/);
  assert.match(html, /name="stress"[^>]*step="any"/);
  assert.match(html, /name="sleepHours"[^>]*step="any"/);
  assert.match(db, /bloodTests:/);
  assert.match(db, /bloodAnalyses:/);
});
