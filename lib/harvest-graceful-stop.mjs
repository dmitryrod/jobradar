/**
 * Кооперативная остановка harvest / open-vacancies по флагу (дашборд: POST /api/harvest-stop-graceful).
 * Путь: HH_GRACEFUL_STOP_FILE от родителя при spawn или getHarvestGracefulStopFile() после loadEnv.
 */
import fs from 'fs';
import path from 'path';
import { getHarvestGracefulStopFile } from './paths.mjs';

export function resolvedHarvestGracefulStopFile() {
  const fromEnv = (process.env.HH_GRACEFUL_STOP_FILE || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return getHarvestGracefulStopFile();
}

export function isHarvestGracefulStopRequested() {
  try {
    return fs.existsSync(resolvedHarvestGracefulStopFile());
  } catch {
    return false;
  }
}

export function clearHarvestGracefulStopFlag() {
  try {
    const f = resolvedHarvestGracefulStopFile();
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {
    /* ignore */
  }
}
