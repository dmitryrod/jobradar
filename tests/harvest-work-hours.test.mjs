import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWorkHoursNow, parseWorkHourBounds } from '../lib/harvest-work-hours.mjs';

test('disabled: always true', () => {
  assert.equal(isWithinWorkHoursNow({ HH_WORK_HOURS_ENABLED: '0' }, new Date('2026-04-17T03:00:00')), true);
  assert.equal(isWithinWorkHoursNow({}, new Date('2026-04-17T03:00:00')), true);
});

test('same-day window inclusive', () => {
  const env = { HH_WORK_HOURS_ENABLED: '1', HH_WORK_HOUR_START: '9', HH_WORK_HOUR_END: '18' };
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T08:59:00')), false);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T09:00:00')), true);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T18:00:00')), true);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T18:59:00')), true);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T19:00:00')), false);
});

test('overnight window', () => {
  const env = { HH_WORK_HOURS_ENABLED: '1', HH_WORK_HOUR_START: '22', HH_WORK_HOUR_END: '6' };
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T21:00:00')), false);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T22:00:00')), true);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T03:00:00')), true);
  assert.equal(isWithinWorkHoursNow(env, new Date('2026-04-17T07:00:00')), false);
});

test('parseWorkHourBounds clamps', () => {
  const b = parseWorkHourBounds({ HH_WORK_HOUR_START: '-1', HH_WORK_HOUR_END: '99' });
  assert.equal(b.start, 0);
  assert.equal(b.end, 23);
});
