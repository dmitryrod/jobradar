import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAcceptableCitiesInput,
  applyDashboardPreferencesPatch,
} from '../lib/preferences.mjs';

test('normalizeAcceptableCitiesInput: CSV и массив', () => {
  assert.deepEqual(normalizeAcceptableCitiesInput(' a , b '), ['a', 'b']);
  assert.deepEqual(normalizeAcceptableCitiesInput(['x', '', ' y ']), ['x', 'y']);
  assert.deepEqual(normalizeAcceptableCitiesInput(''), []);
});

test('applyDashboardPreferencesPatch: minMonthlyUsd и scoringGeo', () => {
  const p = {
    minMonthlyUsd: 100,
    scoringGeo: { baseCity: 'X', acceptableCities: ['a'], relocationPatterns: ['релокаци'] },
  };
  applyDashboardPreferencesPatch(p, {
    minMonthlyUsd: '42.9',
    scoringGeo: { baseCity: ' СПб ', acceptableCities: 'Казань, , Москва' },
  });
  assert.equal(p.minMonthlyUsd, 42);
  assert.equal(p.scoringGeo.baseCity, 'СПб');
  assert.deepEqual(p.scoringGeo.acceptableCities, ['Казань', 'Москва']);
  assert.ok(Array.isArray(p.scoringGeo.relocationPatterns));
});

test('applyDashboardPreferencesPatch: частичный scoringGeo', () => {
  const p = { scoringGeo: { baseCity: 'Old', acceptableCities: ['1'], foo: 1 } };
  applyDashboardPreferencesPatch(p, { scoringGeo: { baseCity: 'New' } });
  assert.equal(p.scoringGeo.baseCity, 'New');
  assert.deepEqual(p.scoringGeo.acceptableCities, ['1']);
  assert.equal(p.scoringGeo.foo, 1);
});

test('applyDashboardPreferencesPatch: пустой minMonthlyUsd → 0', () => {
  const p = { minMonthlyUsd: 99 };
  applyDashboardPreferencesPatch(p, { minMonthlyUsd: NaN });
  assert.equal(p.minMonthlyUsd, 0);
});
