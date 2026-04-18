/**
 * HH_TZ_OFFSET_HOURS — смещение от UTC в целых часах (например 3 для UTC+3).
 * Используется для рабочих часов harvest и подписей времени в дашборде (без DST).
 */

/** @param {NodeJS.ProcessEnv} env */
export function parseTzOffsetHours(env) {
  const raw = env.HH_TZ_OFFSET_HOURS;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  if (n < -12 || n > 14) return null;
  return Math.trunc(n);
}

/**
 * Час 0–23 для проверки HH_WORK_HOURS_* в «локали» по смещению (или getHours() ОС, если смещение не задано).
 * @param {NodeJS.ProcessEnv} env
 * @param {Date} [now]
 */
export function hourInConfiguredZone(env, now = new Date()) {
  const off = parseTzOffsetHours(env);
  if (off == null) return now.getHours();
  return new Date(now.getTime() + off * 3600000).getUTCHours();
}

/**
 * @param {string | null | undefined} iso
 * @param {NodeJS.ProcessEnv} env
 */
export function formatTimestampForDashboard(iso, env) {
  if (iso == null || iso === '') return '';
  const off = parseTzOffsetHours(env);
  if (off == null) return String(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const t = d.getTime() + off * 3600000;
  const dd = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  const sign = off >= 0 ? '+' : '';
  return `${dd.getUTCFullYear()}-${p(dd.getUTCMonth() + 1)}-${p(dd.getUTCDate())} ${p(dd.getUTCHours())}:${p(dd.getUTCMinutes())}:${p(dd.getUTCSeconds())} (UTC${sign}${off})`;
}
