import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const db = await readFile(new URL('../db.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('metrics dashboard and navigation are present', () => {
  assert.match(html, /id="metricsScreen"/);
  assert.match(html, /data-nav="metrics"/);
  assert.match(html, /id="metricsStrengthChart"/);
  assert.match(html, /id="metricsMuscleChart"/);
  assert.match(html, /id="bodyMeasurementForm"/);
});

test('metrics are rendered from local sessions and nutrition', () => {
  assert.match(js, /function renderMetrics/);
  assert.match(js, /metricsOverview/);
  assert.match(js, /muscleDistribution/);
  assert.match(js, /nutritionWeightSummary/);
  assert.match(js, /readinessAlignment/);
});

test('body measurements are durable and included in the app shell', () => {
  assert.match(db, /bodyMeasurements:/);
  assert.match(db, /schemaVersion: 12/);
  assert.match(sw, /metrics-engine\.js/);
});
