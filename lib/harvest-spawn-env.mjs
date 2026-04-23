import { HARVEST_FORM_ENV_KEYS } from './harvest-env-keys.mjs';

/** Как форма + путь флага остановки, выставленные родителем до первого вызова loadEnv() в дочернем процессе. */
export const HARVEST_SPAWN_PRESERVE_KEYS = [...HARVEST_FORM_ENV_KEYS, 'HH_GRACEFUL_STOP_FILE'];

/**
 * Снимок переменных, уже заданных в process.env до loadEnv() (spawn из дашборда / shell).
 * @returns {Record<string, string>}
 */
export function snapshotHarvestSpawnEnv() {
  const o = Object.create(null);
  for (const k of HARVEST_SPAWN_PRESERVE_KEYS) {
    if (k in process.env && process.env[k] !== undefined) o[k] = process.env[k];
  }
  return o;
}

/**
 * Вернуть значения из снимка (после loadEnv), чтобы форма и HH_GRACEFUL_STOP_FILE не перетирались .env.
 * @param {Record<string, string>} snap
 */
export function restoreHarvestSpawnEnv(snap) {
  if (!snap || typeof snap !== 'object') return;
  for (const k of HARVEST_SPAWN_PRESERVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(snap, k)) process.env[k] = snap[k];
  }
}
