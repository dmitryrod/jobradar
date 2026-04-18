import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampLeftEdge } from '../dashboard/public/score-tooltip-clamp.js';

test('центр в пределах вьюпорта — без сдвига', () => {
  assert.equal(clampLeftEdge(100, 200, 400, 8), 100);
});

test('блок уезжает влево — прижать к margin', () => {
  assert.equal(clampLeftEdge(-10, 200, 400, 8), 8);
});

test('блок уезжает вправо — прижать к правому margin', () => {
  assert.equal(clampLeftEdge(250, 200, 400, 8), 192);
});

test('width <= 0 — вернуть left как есть', () => {
  assert.equal(clampLeftEdge(5, 0, 400, 8), 5);
});

test('узкий вьюпорт — max < min, левый край', () => {
  assert.equal(clampLeftEdge(0, 500, 100, 8), 8);
});
