/**
 * Рабочий интервал для harvest: локальные часы машины (Node process).
 * HH_WORK_HOUR_START / HH_WORK_HOUR_END — целые часы 0–23, границы включительно.
 * Если start > end — ночная смена (например 22–6).
 */

export function parseWorkHourBounds(env) {
  let start = Number(env.HH_WORK_HOUR_START ?? 9);
  let end = Number(env.HH_WORK_HOUR_END ?? 18);
  if (!Number.isFinite(start)) start = 9;
  if (!Number.isFinite(end)) end = 18;
  start = Math.max(0, Math.min(23, Math.floor(start)));
  end = Math.max(0, Math.min(23, Math.floor(end)));
  return { start, end };
}

/** @param {NodeJS.ProcessEnv} env */
export function isWithinWorkHoursNow(env, now = new Date()) {
  if (env.HH_WORK_HOURS_ENABLED !== '1') return true;
  const { start, end } = parseWorkHourBounds(env);
  const h = now.getHours();
  if (start <= end) return h >= start && h <= end;
  return h >= start || h <= end;
}
