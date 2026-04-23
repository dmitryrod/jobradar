/**
 * Подробный лог отладки harvest в resolveDataDir()/harvest-debug.log (JSONL).
 * Включается HH_HARVEST_DEBUG=1|true|yes. Секреты в дампах env не пишутся.
 */

import fs from 'fs';
import path from 'path';
import { resolveDataDir } from './paths.mjs';

export const HARVEST_DEBUG_LOG_FILENAME = 'harvest-debug.log';

function truthyEnv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

export function isHarvestDebug() {
  return truthyEnv(process.env.HH_HARVEST_DEBUG);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function sanitizeEnvForLog(env) {
  const out = {};
  for (const k of Object.keys(env)) {
    const key = String(k);
    const val = env[key];
    if (val === undefined) continue;
    const u = key.toUpperCase();
    const sensitive =
      u.includes('POLZA') ||
      u.includes('OPENROUTER') ||
      u.includes('GEMINI') ||
      u.includes('API_KEY') ||
      u.includes('SECRET') ||
      u.includes('TOKEN') ||
      u.includes('PASSWORD') ||
      u.includes('AUTH');
    out[key] = sensitive ? '[redacted]' : String(val);
  }
  return out;
}

let currentRunId = null;

/** @param {string | null} id */
export function setHarvestDebugRunId(id) {
  currentRunId = id;
}

/** @param {Record<string, unknown>} obj */
export function harvestDebugLog(obj) {
  if (!isHarvestDebug()) return;
  const line =
    JSON.stringify({
      at: new Date().toISOString(),
      runId: currentRunId,
      ...obj,
    }) + '\n';
  try {
    const dir = resolveDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, HARVEST_DEBUG_LOG_FILENAME), line, 'utf8');
  } catch (e) {
    console.error('[harvest-debug] write failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function harvestDebugError(err, context = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  harvestDebugLog({
    event: 'error',
    ...context,
    errorName: e.name,
    errorMessage: e.message,
    stack: e.stack,
  });
}

let handlersRegistered = false;

export function registerHarvestDebugProcessHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  process.on('unhandledRejection', (reason) => {
    if (!isHarvestDebug()) return;
    const e = reason instanceof Error ? reason : new Error(String(reason));
    harvestDebugError(e, { phase: 'unhandledRejection' });
    console.error('[harvest] unhandledRejection:', e);
  });
  process.on('uncaughtException', (err) => {
    if (!isHarvestDebug()) return;
    harvestDebugError(err, { phase: 'uncaughtException' });
    console.error('[harvest] uncaughtException:', err);
  });
}
