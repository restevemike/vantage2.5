import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadiness } from '../readiness.js';

const good = {
  recovery: 80, hrv: 95, hrvBaseline: 90, restingHr: 54, rhrBaseline: 58,
  stress: 20, sleepHours: 7.5, systolic: 126, diastolic: 76, feeling: 'good'
};

test('good readings produce green', () => {
  assert.equal(calculateReadiness(good).level, 'green');
});

test('approximately 140+ systolic forces at least amber', () => {
  const result = calculateReadiness({ ...good, systolic: 142 });
  assert.equal(result.level, 'amber');
  assert.equal(result.bpStatus, 'elevated');
});

test('160+ systolic forces red regardless of other signals', () => {
  const result = calculateReadiness({ ...good, systolic: 165 });
  assert.equal(result.level, 'red');
  assert.equal(result.bpStatus, 'high');
});

test('symptoms force recovery-only recommendation', () => {
  assert.equal(calculateReadiness({ ...good, symptoms: true }).level, 'red');
});

test('heavily suppressed HRV produces red', () => {
  assert.equal(calculateReadiness({ ...good, hrv: 65, hrvBaseline: 90 }).level, 'red');
});
