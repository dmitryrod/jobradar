import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
/** Переопределение каталога данных (тесты, отдельный volume на сервере). */
export const DATA_DIR = process.env.HH_DATA_DIR
  ? path.resolve(process.env.HH_DATA_DIR)
  : path.join(ROOT, 'data');

/**
 * Каталог данных с учётом .env (вызывать после loadEnv в точке входа).
 * Константа DATA_DIR может устареть, если импорт paths произошёл до loadEnv.
 */
export function resolveDataDir() {
  const raw = (process.env.HH_DATA_DIR || '').trim();
  if (!raw) return path.resolve(ROOT, 'data');
  if (path.isAbsolute(raw)) return path.resolve(raw);
  /** Относительные пути — от корня репозитория, не от process.cwd() (иначе дашборд и spawn с cwd=ROOT расходятся). */
  return path.resolve(ROOT, raw);
}

/** Флаг кооперативной остановки harvest — абсолютный путь. */
export function getHarvestGracefulStopFile() {
  return path.resolve(resolveDataDir(), 'harvest-graceful-stop.flag');
}
export const QUEUE_FILE = path.join(DATA_DIR, 'vacancies-queue.json');
export const SKIPPED_FILE = path.join(DATA_DIR, 'skipped-vacancies.jsonl');
export const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');
export const COVER_LETTER_USER_EDITS_FILE = path.join(DATA_DIR, 'cover-letter-user-edits.jsonl');
/** Лог сценария «Отклик в браузере» (Playwright), дописывается при каждом запуске. */
export const HH_APPLY_CHAT_LOG_FILE = path.join(DATA_DIR, 'hh-apply-chat.log');
/** Лог фонового `harvest` из дашборда (HARVEST_JSON + stdout). */
export const HARVEST_RUN_LOG_FILE = path.join(DATA_DIR, 'harvest-run.log');
export const PREFS_FILE = path.join(ROOT, 'config', 'preferences.json');
export const CV_DIR = path.join(ROOT, 'CV');

export function sessionProfilePath() {
  const SESSION_DIR = process.env.HH_SESSION_DIR
    ? path.resolve(process.cwd(), process.env.HH_SESSION_DIR)
    : path.join(ROOT, 'data', 'session');
  return path.join(SESSION_DIR, 'chromium-profile');
}
