/**
 * Ключи окружения harvest, которые дашборд передаёт в дочерний процесс (whitelist тела POST /api/harvest-start).
 * После loadEnv() в harvest.mjs их нужно восстановить, иначе dotenv с override перетрёт значения из формы.
 */
export const HARVEST_FORM_ENV_KEYS = [
  'HH_PER_KEYWORD_LIMIT',
  'HH_SESSION_LIMIT',
  'HH_MAX_TOTAL',
  'HH_OPEN_DELAY_MIN_MS',
  'HH_OPEN_DELAY_MAX_MS',
  'HH_SEARCH_JITTER_MIN_MS',
  'HH_SEARCH_JITTER_MAX_MS',
  'HH_POST_LOAD_JITTER_MIN_MS',
  'HH_POST_LOAD_JITTER_MAX_MS',
  'HH_KEYWORDS_LOGIC',
  'HH_KEYWORDS_CYCLES',
  'HH_KEYWORDS_MAX',
  'HH_WORK_HOURS_ENABLED',
  'HH_WORK_HOUR_START',
  'HH_WORK_HOUR_END',
  /** 0/1 — перекрывает requireRemote из config/preferences.json на время запуска harvest (дашборд / CLI). */
  'HH_REQUIRE_REMOTE',
  /** 1/true — подробный JSONL-лог в data/harvest-debug.log */
  'HH_HARVEST_DEBUG',
];
