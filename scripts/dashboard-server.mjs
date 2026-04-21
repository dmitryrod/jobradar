/**
 * Локальный мини-дашборд: http://127.0.0.1:3849
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
loadEnv();

import {
  ROOT,
  HH_APPLY_CHAT_LOG_FILE,
  DATA_DIR,
  HARVEST_RUN_LOG_FILE,
  SKIPPED_FILE,
  FEEDBACK_FILE,
  COVER_LETTER_USER_EDITS_FILE,
  getHarvestGracefulStopFile,
} from '../lib/paths.mjs';
import { countApplyLaunchesLastHour, recordApplyLaunch } from '../lib/hh-apply-rate.mjs';
import {
  loadQueue,
  saveQueue,
  updateVacancyRecord,
  getVacancyRecord,
  removeVacancyRecord,
} from '../lib/store.mjs';
import { loadPreferences, mergeReviewAutomation, savePreferences } from '../lib/preferences.mjs';
import { appendFeedback } from '../lib/feedback-context.mjs';
import { hasLlmApiKey } from '../lib/llm-chat.mjs';
import { formatTimestampForDashboard } from '../lib/tz-env.mjs';
import { readUtf8Body as readBody } from '../lib/read-utf8-body.mjs';
/** Тяжёлые модули (openrouter, cover-letter, playwright refresh) — только через dynamic import в обработчиках, иначе OOM при старте. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveStaticDir() {
  const candidates = [
    path.join(ROOT, 'dashboard', 'public'),
    path.join(ROOT, 'lib', 'dashboard', 'public'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* ignore */
    }
  }
  throw new Error(`Не найдена директория статики дашборда. Проверены: ${candidates.join(', ')}`);
}

const STATIC_DIR = resolveStaticDir();
const PORT_START = Number(process.env.DASHBOARD_PORT || 3849) || 3849;
/** Сколько портов подряд пробовать при EADDRINUSE (3849, 3850, …). При `DASHBOARD_STRICT_PORT=1` не используется. */
const PORT_RANGE = Math.min(50, Math.max(1, Math.floor(Number(process.env.DASHBOARD_PORT_RANGE) || 20)));
const DASHBOARD_STRICT_PORT = process.env.DASHBOARD_STRICT_PORT === '1';
/** 127.0.0.1 — только локально; в Docker задайте DASHBOARD_BIND=0.0.0.0 */
const DASHBOARD_BIND = process.env.DASHBOARD_BIND || '127.0.0.1';
let listenPort = PORT_START;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  });
  res.end(body, 'utf8');
}

/** Сортировка списка вакансий: scoreSortKey или итог + микродоля по maxUsd. */
function vacancySortKey(rec) {
  const sk = Number(rec.scoreSortKey);
  if (Number.isFinite(sk)) return sk;
  const base = Number(rec.scoreOverall ?? rec.geminiScore ?? 0);
  const add =
    rec.salaryEstimate?.ok && Number.isFinite(Number(rec.salaryEstimate.maxUsd))
      ? Math.min(Number(rec.salaryEstimate.maxUsd), 999_999) / 1e7
      : 0;
  return base + add;
}

/**
 * Последние строки лога сценария отклика (для UI и отладки).
 * @param {number} lineCount
 */
function readApplyChatLogTail(lineCount) {
  const n = Math.min(500, Math.max(1, Number(lineCount) || 80));
  if (!fs.existsSync(HH_APPLY_CHAT_LOG_FILE)) {
    return { exists: false, lines: [], text: '' };
  }
  const raw = fs.readFileSync(HH_APPLY_CHAT_LOG_FILE, 'utf8');
  const all = raw.split('\n');
  const slice = all.length > n ? all.slice(-n) : all;
  const text = slice.join('\n');
  return { exists: true, lines: slice, text, path: HH_APPLY_CHAT_LOG_FILE };
}


function getMaxApplyChatPerHour() {
  try {
    const p = loadPreferences();
    const n = Number(p.hhApplyChatMaxPerHour);
    if (Number.isFinite(n) && n >= 1) return Math.min(100, Math.floor(n));
  } catch {
    /* ignore */
  }
  return 8;
}

/** Без завершающего слэша, кроме корня `/` — иначе `/api/foo/` не совпадёт с маршрутом. */
function requestPathname(url) {
  let p = url.pathname || '/';
  if (p !== '/') p = p.replace(/\/+$/, '');
  return p || '/';
}

/** Только эти ключи можно передать в дочерний harvest из UI (whitelist). */
const HARVEST_ENV_KEYS = [
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
];

function harvestEnvForForm() {
  const o = {};
  for (const k of HARVEST_ENV_KEYS) {
    o[k] = process.env[k] != null && process.env[k] !== '' ? String(process.env[k]) : '';
  }
  return o;
}

/**
 * @param {Record<string, unknown>} body
 */
function mergeHarvestChildEnv(body) {
  const merged = { ...process.env };
  if (!body || typeof body !== 'object') return merged;
  for (const k of HARVEST_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const v = body[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        merged[k] = String(v).trim();
      }
    }
  }
  return merged;
}

/** @type {{ running: boolean, runId: string | null, pid: number | null, startedAt: string | null, exitCode: number | null, exitAt: string | null }} */
let harvestRun = {
  running: false,
  runId: null,
  pid: null,
  startedAt: null,
  exitCode: null,
  exitAt: null,
};

function readHarvestLogTail(maxBytes = 400_000) {
  if (!fs.existsSync(HARVEST_RUN_LOG_FILE)) return '';
  const st = fs.statSync(HARVEST_RUN_LOG_FILE);
  const start = Math.max(0, st.size - maxBytes);
  const fd = fs.openSync(HARVEST_RUN_LOG_FILE, 'r');
  try {
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Хвост от последнего `======== HARVEST_RUN … ========`, до ~48 MiB — чтобы в окне были keyword_done и длинная фаза карточек. */
function readLastHarvestRunWindow(maxBytes = 48 * 1024 * 1024) {
  const text = readHarvestLogTail(maxBytes);
  const needle = '\n======== HARVEST_RUN ';
  let pos = text.lastIndexOf(needle);
  if (pos !== -1) return text.slice(pos + 1);
  const at0 = text.indexOf('======== HARVEST_RUN ');
  if (at0 !== -1) return text.slice(at0);
  return text;
}

function harvestRunEndedAfterPos(text, pos, runId) {
  const after = text.slice(pos);
  if (after.includes(`\n--- harvest exit runId=${runId} code=`)) return true;
  if (after.includes('\n--- harvest exit code=')) return true;
  return false;
}

/**
 * Разбор строки маркера: старый формат `… RUN runId ISO…` или новый `… RUN runId pid=N ISO…`.
 * @returns {{ runId: string, pid: number | null } | null}
 */
function parseHarvestRunHeaderLine(firstLine) {
  const p = '======== HARVEST_RUN ';
  if (!firstLine.startsWith(p)) return null;
  const inner = firstLine.slice(p.length).replace(/\s*========\s*$/i, '').trim();
  const parts = inner.split(/\s+/);
  if (parts.length < 2) return null;
  const runId = parts[0];
  let pid = null;
  let i = 1;
  if (parts[1].startsWith('pid=')) {
    const n = Number(parts[1].slice(4));
    if (Number.isFinite(n) && n > 0) pid = n;
    i = 2;
  }
  if (!runId) return null;
  return { runId, pid };
}

/** Последний маркер HARVEST_RUN в тексте. */
function findLastHarvestRunHeader(text) {
  const marker = '======== HARVEST_RUN ';
  let pos = text.lastIndexOf('\n' + marker);
  if (pos !== -1) pos += 1;
  else {
    pos = text.indexOf(marker);
    if (pos === -1) return null;
  }
  const nl = text.indexOf('\n', pos);
  const firstLine = nl === -1 ? text.slice(pos) : text.slice(pos, nl);
  const parsed = parseHarvestRunHeaderLine(firstLine);
  if (!parsed) return null;
  return { ...parsed, pos };
}

function findHarvestHeaderForRunId(text, runId) {
  const marker = `======== HARVEST_RUN ${runId} `;
  const pos = text.lastIndexOf(marker);
  if (pos === -1) return null;
  const nl = text.indexOf('\n', pos);
  const firstLine = nl === -1 ? text.slice(pos) : text.slice(pos, nl);
  const parsed = parseHarvestRunHeaderLine(firstLine);
  if (!parsed || parsed.runId !== runId) return null;
  return { ...parsed, pos };
}

/** Windows + detached: родитель может получить `exit` раньше времени — смотрим лог. */
function harvestStillActiveFromLog(runId) {
  if (!runId) return false;
  try {
    const text = readHarvestLogTail(6 * 1024 * 1024);
    const header = findHarvestHeaderForRunId(text, runId);
    if (!header) return false;
    if (harvestRunEndedAfterPos(text, header.pos, runId)) return false;
    if (header.pid != null && !isProcessLikelyRunning(header.pid)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Последний прогон в хвосте лога ещё без строки завершения — нужен после перезапуска дашборда
 * (in-memory harvestRun сброшен, а node harvest.mjs ещё идёт).
 * Если в маркере есть pid и процесса нет — считаем прогон завершённым (зависшая запись в логе).
 */
function harvestLastRunActiveFromLog() {
  try {
    const text = readHarvestLogTail(6 * 1024 * 1024);
    const header = findLastHarvestRunHeader(text);
    if (!header) return false;
    if (harvestRunEndedAfterPos(text, header.pos, header.runId)) return false;
    if (header.pid != null && !isProcessLikelyRunning(header.pid)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Процесс с этим PID ещё существует (сигнал 0). Нужен при ложном `exit` у ChildProcess при detached на Windows. */
function isProcessLikelyRunning(pid) {
  if (pid == null || typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Есть ли живой harvest: PID из текущей сессии дашборда или из последнего маркера в логе. */
function harvestLooksLiveForStop(header) {
  if (harvestRun.pid != null && isProcessLikelyRunning(harvestRun.pid)) return true;
  if (header?.pid != null && isProcessLikelyRunning(header.pid)) return true;
  return false;
}

function harvestRunActiveForUi() {
  if (harvestRun.running) return true;
  if (isProcessLikelyRunning(harvestRun.pid)) return true;
  if (harvestRun.runId && harvestStillActiveFromLog(harvestRun.runId)) return true;
  if (harvestLastRunActiveFromLog()) return true;
  return false;
}

function parseHarvestJsonFromText(text) {
  const urlsQueued = [];
  const urlsOpened = [];
  const seenQ = new Set();
  const seenO = new Set();
  let addedFromEvents = 0;
  /** Сумма `added` по всем `done` в чанке (при cycles/loop каждый проход шлёт своё `done`) */
  let sumDoneAdded = 0;
  let urlsTotal = 0;
  let done = false;
  /** @type {string | null} */
  let currentKeyword = null;
  /** Отработанные ключи за прогон: последний в логе — сверху в UI */
  const keywordsCompleted = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('HARVEST_JSON ')) continue;
    try {
      const ev = JSON.parse(line.slice('HARVEST_JSON '.length));
      if (ev.event === 'keyword_active' && typeof ev.keyword === 'string' && ev.keyword.trim()) {
        currentKeyword = ev.keyword.trim();
      }
      if (ev.event === 'keyword_done' && typeof ev.keyword === 'string' && ev.keyword.trim()) {
        keywordsCompleted.unshift(ev.keyword.trim());
      }
      if (ev.event === 'url_queued' && ev.url && !seenQ.has(ev.url)) {
        seenQ.add(ev.url);
        urlsQueued.push(ev.url);
      }
      if (ev.event === 'url_opened' && ev.url && !seenO.has(ev.url)) {
        seenO.add(ev.url);
        urlsOpened.push(ev.url);
      }
      if (ev.event === 'record_added') addedFromEvents += 1;
      if (ev.event === 'done') {
        done = true;
        if (ev.added != null && ev.added !== '') {
          sumDoneAdded += Number(ev.added) || 0;
        }
        if (ev.urlsTotal != null) urlsTotal = Number(ev.urlsTotal) || urlsTotal;
      }
    } catch {
      /* ignore */
    }
  }
  const addedToQueue = Math.max(addedFromEvents, sumDoneAdded);
  return {
    urlsQueued,
    urlsOpened,
    addedToQueue,
    urlsTotal,
    done,
    currentKeyword,
    keywordsCompleted,
  };
}

function parseLastHarvestRunStats() {
  const windowText = readLastHarvestRunWindow(48 * 1024 * 1024);
  const delim = /\n======== HARVEST_RUN [^\n]+ ========\n/g;
  const parts = windowText.split(delim);
  const lastChunk = parts.length > 1 ? parts[parts.length - 1] : windowText;
  return parseHarvestJsonFromText(lastChunk);
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '127.0.0.1';
  const url = new URL(req.url || '/', `http://${host}`);
  const pathname = requestPathname(url);

  if (req.method === 'POST' && pathname === '/api/data/reset') {
    try {
      const raw = await readBody(req);
      if (raw.trim()) JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    if (harvestRunActiveForUi()) {
      return sendJson(res, 409, {
        error:
          'Сейчас активен сбор вакансий (harvest) или он отображается как идущий. Остановите поиск, дождитесь завершения — затем повторите очистку. Иначе лог прогона обнуляется некорректно.',
      });
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      saveQueue([]);
      for (const f of [
        SKIPPED_FILE,
        FEEDBACK_FILE,
        COVER_LETTER_USER_EDITS_FILE,
        HH_APPLY_CHAT_LOG_FILE,
        HARVEST_RUN_LOG_FILE,
      ]) {
        fs.writeFileSync(f, '', 'utf8');
      }
    } catch (e) {
      return sendJson(res, 500, { error: e instanceof Error ? e.message : 'reset failed' });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/vacancy-counts') {
    const q = loadQueue();
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const x of q) {
      const st = x.status;
      if (st === 'pending') counts.pending += 1;
      else if (st === 'approved') counts.approved += 1;
      else if (st === 'rejected') counts.rejected += 1;
    }
    return sendJson(res, 200, counts);
  }

  if (req.method === 'GET' && pathname === '/api/vacancies') {
    const status = url.searchParams.get('status') || 'pending';
    const q = loadQueue().filter((x) => x.status === status);
    q.sort((a, b) => vacancySortKey(b) - vacancySortKey(a));
    return sendJson(res, 200, { items: q });
  }

  if (req.method === 'GET' && pathname === '/api/cover-letters') {
    const letterStatus = url.searchParams.get('status') || 'pending';
    if (!['pending', 'approved', 'declined'].includes(letterStatus)) {
      return sendJson(res, 400, { error: 'status: pending | approved | declined' });
    }
    const q = loadQueue().filter((x) => x.coverLetter?.status === letterStatus);
    q.sort((a, b) => vacancySortKey(b) - vacancySortKey(a));
    return sendJson(res, 200, { items: q });
  }

  if (req.method === 'GET' && pathname === '/api/hh-apply-chat-log') {
    const lines = url.searchParams.get('lines');
    const tail = readApplyChatLogTail(lines);
    const rel = path.relative(ROOT, HH_APPLY_CHAT_LOG_FILE).replace(/\\/g, '/');
    const relativePath =
      rel && rel !== '.' && !rel.startsWith('..') ? rel : 'data/hh-apply-chat.log';
    return sendJson(res, 200, {
      ...tail,
      relativePath,
    });
  }

  if (req.method === 'GET' && pathname === '/api/preferences') {
    try {
      const p = loadPreferences();
      return sendJson(res, 200, { preferences: p });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (req.method === 'GET' && pathname === '/api/review-automation') {
    try {
      const p = loadPreferences();
      return sendJson(res, 200, { reviewAutomation: p.reviewAutomation });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/review-automation') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { error: 'Нужен объект настроек' });
    }
    try {
      const p = loadPreferences();
      const merged = mergeReviewAutomation({ ...p.reviewAutomation, ...body });
      const ts = Number(merged.targetScore);
      if (!Number.isFinite(ts) || ts < 0 || ts > 100) {
        return sendJson(res, 400, { error: 'targetScore: число 0–100' });
      }
      merged.targetScore = ts;
      const vc = Math.floor(Number(merged.coverLetterVariantCount));
      if (!Number.isFinite(vc) || vc < 1 || vc > 10) {
        return sendJson(res, 400, { error: 'coverLetterVariantCount: целое 1–10' });
      }
      merged.coverLetterVariantCount = vc;
      p.reviewAutomation = merged;
      savePreferences(p);
      return sendJson(res, 200, { ok: true, reviewAutomation: merged });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || 'save failed' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/review-automation/run-pending-cover-letters') {
    try {
      const { runPendingCoverLetterBatch } = await import('../lib/review-automation.mjs');
      const r = await runPendingCoverLetterBatch();
      const code = r.ok ? 200 : 400;
      return sendJson(res, code, r);
    } catch (e) {
      return sendJson(res, 500, { error: e.message || 'batch failed' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/harvest-env') {
    let requireRemoteDefault = false;
    try {
      requireRemoteDefault = !!loadPreferences().requireRemote;
    } catch {
      /* ignore */
    }
    return sendJson(res, 200, {
      env: harvestEnvForForm(),
      requireRemoteDefault,
    });
  }

  if (req.method === 'GET' && pathname === '/api/harvest-status') {
    const stats = parseLastHarvestRunStats();
    const rel = path.relative(ROOT, HARVEST_RUN_LOG_FILE).replace(/\\/g, '/');
    const running = harvestRunActiveForUi();
    const gracefulStopFile = getHarvestGracefulStopFile();
    const gracefulStopPending = fs.existsSync(gracefulStopFile);
    const hdrTail = readHarvestLogTail(256 * 1024);
    const lastHdr = findLastHarvestRunHeader(hdrTail);
    return sendJson(res, 200, {
      running,
      gracefulStopPending,
      lastHarvestPid: lastHdr?.pid ?? null,
      lastHarvestRunId: lastHdr?.runId ?? null,
      runId: harvestRun.runId,
      pid: harvestRun.pid,
      startedAt: harvestRun.startedAt,
      startedAtDisplay: formatTimestampForDashboard(harvestRun.startedAt, process.env),
      exitCode: harvestRun.exitCode,
      exitAt: harvestRun.exitAt,
      exitAtDisplay: formatTimestampForDashboard(harvestRun.exitAt, process.env),
      urlsQueued: stats.urlsQueued,
      urlsOpened: stats.urlsOpened,
      uniqueUrlsQueued: stats.urlsQueued.length,
      uniqueUrlsOpened: stats.urlsOpened.length,
      addedToQueue: stats.addedToQueue,
      urlsTotal: stats.urlsTotal,
      done: stats.done,
      harvestCurrentKeyword: stats.currentKeyword ?? null,
      harvestKeywordsCompleted: stats.keywordsCompleted ?? [],
      harvestKeywordsCompletedCount: (stats.keywordsCompleted ?? []).length,
      logRelativePath: rel && !rel.startsWith('..') ? rel : 'data/harvest-run.log',
    });
  }

  if (req.method === 'POST' && pathname === '/api/harvest-clear-stale') {
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const force = body.force === true;
    const text = readHarvestLogTail(6 * 1024 * 1024);
    const header = findLastHarvestRunHeader(text);
    if (!header) {
      return sendJson(res, 400, { error: 'В логе нет маркера HARVEST_RUN — сбрасывать нечего.' });
    }
    if (harvestRunEndedAfterPos(text, header.pos, header.runId)) {
      return sendJson(res, 409, { error: 'Прогон в логе уже помечен как завершённый.' });
    }
    if (header.pid != null && isProcessLikelyRunning(header.pid)) {
      return sendJson(res, 409, {
        error: 'Процесс harvest с этим PID ещё работает. Сначала «Остановить поиск».',
        pid: header.pid,
      });
    }
    if ((header.pid == null || header.pid === 0) && !force) {
      return sendJson(res, 409, {
        error:
          'В маркере нет PID (старый лог). Повторите с телом {"force":true}, если процесс harvest точно не запущен.',
        needForce: true,
      });
    }
    const ts = new Date().toISOString();
    const tail = `\n--- harvest exit runId=${header.runId} code=0 signal=stale_log_clear at ${ts} ---\n`;
    try {
      fs.appendFileSync(HARVEST_RUN_LOG_FILE, tail, 'utf8');
    } catch (e) {
      return sendJson(res, 500, { error: e instanceof Error ? e.message : 'Не удалось дописать лог' });
    }
    try {
      const sf = getHarvestGracefulStopFile();
      if (fs.existsSync(sf)) fs.unlinkSync(sf);
    } catch {
      /* ignore */
    }
    return sendJson(res, 200, { ok: true, clearedRunId: header.runId });
  }

  if (req.method === 'POST' && pathname === '/api/harvest-stop-graceful') {
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const forceStale = body.force === true;

    if (!harvestRunActiveForUi()) {
      return sendJson(res, 409, {
        error: 'Сбор не запущен — останавливать нечего.',
      });
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        getHarvestGracefulStopFile(),
        `${JSON.stringify({ requestedAt: new Date().toISOString() })}\n`,
        'utf8'
      );
    } catch (e) {
      return sendJson(res, 500, {
        error: e instanceof Error ? e.message : 'Не удалось записать флаг остановки',
      });
    }

    /**
     * Зависший индикатор в UI: прогон в логе без exit, но процесс не жив.
     * С теми же оговорками, что POST /api/harvest-clear-stale: маркер без PID — только с force или если известный PID спавна мёртв.
     */
    let staleLogCleared = false;
    let needStaleForce = false;
    try {
      const text = readHarvestLogTail(6 * 1024 * 1024);
      const header = findLastHarvestRunHeader(text);
      if (header && !harvestRunEndedAfterPos(text, header.pos, header.runId)) {
        const live = harvestLooksLiveForStop(header);
        if (!live) {
          const hasPid = header.pid != null && header.pid > 0;
          let canClearStale = false;
          if (hasPid) {
            canClearStale = !isProcessLikelyRunning(header.pid);
          } else {
            canClearStale =
              forceStale ||
              (harvestRun.pid != null && !isProcessLikelyRunning(harvestRun.pid));
          }
          if (canClearStale) {
            const ts = new Date().toISOString();
            const tail = `\n--- harvest exit runId=${header.runId} code=0 signal=stop_unified at ${ts} ---\n`;
            fs.appendFileSync(HARVEST_RUN_LOG_FILE, tail, 'utf8');
            staleLogCleared = true;
            try {
              const sf = getHarvestGracefulStopFile();
              if (fs.existsSync(sf)) fs.unlinkSync(sf);
            } catch {
              /* ignore */
            }
          } else if (!hasPid) {
            needStaleForce = true;
          }
        }
      }
    } catch (e) {
      console.error('[harvest-stop-graceful] stale log branch', e);
    }

    let mode = 'graceful_stop_pending';
    if (staleLogCleared) mode = 'stale_log_cleared';
    else if (needStaleForce) mode = 'need_stale_force';

    return sendJson(res, 200, { ok: true, mode, staleLogCleared, needStaleForce });
  }

  if (req.method === 'POST' && pathname === '/api/harvest-start') {
    if (harvestRunActiveForUi()) {
      return sendJson(res, 409, {
        error:
          'Уже выполняется сбор (harvest). Дождитесь завершения или нажмите «Остановить поиск» (в т.ч. сбросит зависший индикатор в логе, если процесса уже нет).',
        runId: harvestRun.runId,
        pid: harvestRun.pid,
      });
    }
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const scriptPath = path.join(ROOT, 'scripts', 'harvest.mjs');
    if (!fs.existsSync(scriptPath)) {
      return sendJson(res, 500, { error: 'Скрипт harvest.mjs не найден' });
    }

    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    /** Не бросать исключения наружу — иначе падает весь процесс дашборда и браузер даёт «Failed to fetch». */
    const harvestLogStream = fs.createWriteStream(HARVEST_RUN_LOG_FILE, { flags: 'a' });
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      try {
        const sf = getHarvestGracefulStopFile();
        if (fs.existsSync(sf)) fs.unlinkSync(sf);
      } catch {
        /* ignore */
      }

      /**
       * Windows: в stdio нельзя числовой fd; передача того же fs.WriteStream в stdout+stderr дочернего процесса
       * в некоторых сборках Node приводит к падению родителя при spawn → обрыв TCP и Failed to fetch.
       * Надёжно: pipe + запись в файл в родителе.
       */
      const gracefulStopAbs = getHarvestGracefulStopFile();
      const child = spawn(process.execPath, [scriptPath], {
        cwd: ROOT,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...mergeHarvestChildEnv(body),
          /** Один и тот же абсолютный путь, что и у POST harvest-stop-graceful (без расхождений cwd/HH_DATA_DIR). */
          HH_GRACEFUL_STOP_FILE: gracefulStopAbs,
        },
      });

      const markerLine = `======== HARVEST_RUN ${runId} pid=${child.pid ?? 0} ${new Date().toISOString()} ========`;
      fs.appendFileSync(HARVEST_RUN_LOG_FILE, `\n${markerLine}\n`, 'utf8');

      const pipeOut = (stream, label) => {
        if (!stream) return;
        stream.pipe(harvestLogStream, { end: false });
        stream.on('error', (err) => {
          console.error(`[harvest] child ${label}`, err);
        });
      };
      pipeOut(child.stdout, 'stdout');
      pipeOut(child.stderr, 'stderr');

      harvestRun = {
        running: true,
        runId,
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        exitCode: null,
        exitAt: null,
      };

      child.on('error', (err) => {
        console.error('[harvest] spawn error', err);
        try {
          harvestLogStream.end();
        } catch {
          /* ignore */
        }
        if (harvestRun.runId === runId) {
          harvestRun.running = false;
          harvestRun.exitCode = -1;
          harvestRun.exitAt = new Date().toISOString();
        }
      });

      child.on('exit', (code, signal) => {
        const ridAtExit = harvestRun.runId;
        const pidAtExit = harvestRun.pid;
        setTimeout(() => {
          const endHarvestLog = () => {
            try {
              harvestLogStream.end();
            } catch {
              /* ignore */
            }
          };
          if (ridAtExit !== harvestRun.runId) {
            endHarvestLog();
            return;
          }
          if (isProcessLikelyRunning(pidAtExit)) return;
          if (harvestRun.exitAt && harvestRun.runId === ridAtExit) return;

          harvestRun.running = false;
          harvestRun.exitCode = code;
          harvestRun.exitAt = new Date().toISOString();
          const tail = `\n--- harvest exit runId=${ridAtExit || ''} code=${code} signal=${signal || ''} at ${harvestRun.exitAt} ---\n`;
          try {
            fs.appendFileSync(HARVEST_RUN_LOG_FILE, tail, 'utf8');
          } catch {
            /* ignore */
          }
          endHarvestLog();
        }, 450);
      });

      child.unref();

      return sendJson(res, 200, {
        ok: true,
        runId,
        pid: child.pid,
        logFile: path.relative(ROOT, HARVEST_RUN_LOG_FILE).replace(/\\/g, '/'),
      });
    } catch (e) {
      console.error('[harvest-start]', e);
      try {
        harvestLogStream.end();
      } catch {
        /* ignore */
      }
      return sendJson(res, 500, {
        error: e instanceof Error ? e.message : 'Не удалось запустить harvest',
      });
    }
  }

  if (req.method === 'POST' && pathname === '/api/action') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id, action, reason } = body;
    if (!id || !['approve', 'reject'].includes(action)) {
      return sendJson(res, 400, { error: 'Нужны id и action: approve | reject' });
    }

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });
    if (rec.status !== 'pending') {
      return sendJson(res, 409, { error: 'Уже обработана' });
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    updateVacancyRecord(id, {
      status: nextStatus,
      feedbackReason: String(reason || '').trim(),
    });

    appendFeedback({
      at: new Date().toISOString(),
      action,
      reason: String(reason || '').trim(),
      vacancyId: rec.vacancyId,
      title: rec.title,
      recordId: id,
      url: rec.url,
    });

    return sendJson(res, 200, { ok: true, status: nextStatus });
  }

  if (req.method === 'POST' && pathname === '/api/vacancy/refresh-body') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id } = body;
    if (!id) return sendJson(res, 400, { error: 'Нужен id' });

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });
    if (!rec.url) return sendJson(res, 400, { error: 'У записи нет url' });

    let parsed;
    try {
      const { fetchVacancyTextFromHh } = await import('../lib/refresh-vacancy-from-hh.mjs');
      parsed = await fetchVacancyTextFromHh(rec.url);
    } catch (e) {
      return sendJson(res, 502, { error: e.message || 'Не удалось загрузить страницу вакансии' });
    }

    const desc = String(parsed.description || '');
    const now = new Date().toISOString();
    const title = parsed.title || rec.title;
    const company = parsed.company || rec.company;
    const salaryRaw = parsed.salaryRaw || rec.salaryRaw;

    const patch = {
      title,
      company,
      salaryRaw,
      descriptionPreview: desc.slice(0, 600),
      descriptionForLlm: desc.slice(0, 6000),
      vacancyDescriptionFull: parsed.vacancyDescriptionFull || desc,
      hhWorkConditions: Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines : [],
      vacancyBodyRefreshedAt: now,
    };

    let scoreUpdated = false;
    let scoreError = null;

    if (hasLlmApiKey()) {
      try {
        const { loadCvBundle } = await import('../lib/cv-load.mjs');
        const { scoreVacancyWithOpenRouter } = await import('../lib/openrouter-score.mjs');
        const cvBundle = await loadCvBundle();
        if (!cvBundle.text.trim()) {
          scoreError = 'Нет текста CV в CV/ — оценка пропущена';
        } else {
          const prefs = loadPreferences();
          const llm = await scoreVacancyWithOpenRouter(
            {
              title,
              company,
              salaryRaw,
              description: desc,
              url: rec.url,
              address: parsed.address || '',
              workConditionsLines: Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines : [],
              employment: parsed.employment || '',
            },
            cvBundle,
            prefs
          );
          Object.assign(patch, {
            llmProvider: llm.llmProvider || 'openrouter',
            openRouterModel: llm.providerModel || null,
            scoreVacancy: llm.scoreVacancy,
            scoreCvMatch: llm.scoreCvMatch,
            scoreWorkFormat: llm.scoreWorkFormat,
            scoreLocation: llm.scoreLocation,
            scoreOverall: llm.scoreOverall,
            scoreSortKey: llm.scoreSortKey,
            scoreBlendedBeforeDelta: llm.scoreBlendedBeforeDelta,
            scoreRuleDelta: llm.scoreRuleDelta,
            scoreSalaryDelta: llm.scoreSalaryDelta,
            geminiScore: llm.scoreOverall ?? llm.score,
            geminiSummary: llm.summary,
            geminiRisks: llm.risks,
            geminiMatchCv: llm.matchCv,
            geminiTags: llm.tags,
            employerInstructions: llm.employerInstructions,
            instructionComplexity: llm.instructionComplexity || 'none',
            hasEmployerInstructions: !!llm.hasEmployerInstructions,
          });
          scoreUpdated = true;
        }
      } catch (e) {
        scoreError = e.message || String(e);
      }
    } else {
      scoreError = 'Нет ключа LLM (Polza/OpenRouter) — обновлён только текст с hh.ru';
    }

    updateVacancyRecord(id, patch);

    const next = getVacancyRecord(id);
    return sendJson(res, 200, {
      ok: true,
      vacancyBodyRefreshedAt: now,
      scoreUpdated,
      scoreError,
      item: next,
    });
  }

  if (req.method === 'POST' && pathname === '/api/cover-letter/generate') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id, force } = body;
    if (!id) return sendJson(res, 400, { error: 'Нужен id' });

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });

    const prev = rec.coverLetter;
    if (prev?.status === 'approved' && !force) {
      return sendJson(res, 409, {
        error: 'Письмо уже утверждено. Отправьте force: true для перегенерации.',
      });
    }

    if (!hasLlmApiKey()) {
      return sendJson(res, 503, { error: 'Нет POLZA_API_KEY или OpenRouter_API_KEY в окружении' });
    }

    let cvBundle;
    let generateCoverLetterVariants;
    try {
      const cvMod = await import('../lib/cv-load.mjs');
      const clMod = await import('../lib/cover-letter-openrouter.mjs');
      generateCoverLetterVariants = clMod.generateCoverLetterVariants;
      cvBundle = await cvMod.loadCvBundle();
    } catch (e) {
      return sendJson(res, 500, { error: e.message || 'Не удалось загрузить CV' });
    }
    if (!cvBundle.text.trim()) {
      return sendJson(res, 400, { error: 'Нет текста CV — положите файлы в папку CV/' });
    }

    const prefs = loadPreferences();
    const ra = mergeReviewAutomation(prefs.reviewAutomation);
    const variantCount = Math.min(10, Math.max(1, Math.floor(Number(ra.coverLetterVariantCount) || 3)));

    let result;
    try {
      result = await generateCoverLetterVariants(rec, cvBundle, { variantCount, prefs });
    } catch (e) {
      return sendJson(res, 502, { error: e.message || 'Ошибка LLM' });
    }

    const now = new Date().toISOString();
    const coverLetter = {
      status: 'pending',
      variants: result.variants,
      approvedText: '',
      openRouterModel: result.providerModel || null,
      updatedAt: now,
    };
    updateVacancyRecord(id, { coverLetter });

    return sendJson(res, 200, { ok: true, coverLetter });
  }

  if (req.method === 'POST' && pathname === '/api/cover-letter/save-draft') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id, variants: rawVariants } = body;
    if (!id) return sendJson(res, 400, { error: 'Нужен id' });

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });
    if (rec.coverLetter?.status !== 'pending') {
      return sendJson(res, 409, { error: 'Черновик можно править только в статусе «на согласовании»' });
    }

    const { normalizeVariants } = await import('../lib/cover-letter-openrouter.mjs');
    const { appendCoverLetterUserEditSnippet } = await import('../lib/cover-letter-user-edits.mjs');

    const prefs = loadPreferences();
    const ra = mergeReviewAutomation(prefs.reviewAutomation);
    const rawLen = Array.isArray(rawVariants) ? rawVariants.length : 0;
    const variantSlots = Math.min(
      10,
      Math.max(rawLen || 1, Math.floor(Number(ra.coverLetterVariantCount) || 3))
    );
    const normalized = normalizeVariants(rawVariants, variantSlots);
    const now = new Date().toISOString();
    const prev = rec.coverLetter || {};
    const coverLetter = {
      ...prev,
      status: 'pending',
      variants: normalized,
      updatedAt: now,
    };
    updateVacancyRecord(id, { coverLetter });

    const snippet = normalized.filter(Boolean).join('\n---\n').trim();
    if (snippet) appendCoverLetterUserEditSnippet(snippet);

    return sendJson(res, 200, { ok: true, coverLetter });
  }

  if (req.method === 'POST' && pathname === '/api/cover-letter/action') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id, action, text } = body;
    if (!id || !['approve', 'decline'].includes(action)) {
      return sendJson(res, 400, { error: 'Нужны id и action: approve | decline' });
    }

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });

    const now = new Date().toISOString();
    const model = rec.coverLetter?.openRouterModel ?? null;

    if (action === 'approve') {
      const t = String(text || '').trim();
      if (!t) return sendJson(res, 400, { error: 'Для approve нужен непустой text' });
      const coverLetter = {
        status: 'approved',
        variants: [],
        approvedText: t,
        openRouterModel: model,
        updatedAt: now,
      };
      updateVacancyRecord(id, { coverLetter });
      return sendJson(res, 200, { ok: true, coverLetter });
    }

    const coverLetter = {
      status: 'declined',
      variants: [],
      approvedText: '',
      openRouterModel: model,
      updatedAt: now,
    };
    updateVacancyRecord(id, { coverLetter });
    return sendJson(res, 200, { ok: true, coverLetter });
  }

  if (req.method === 'POST' && pathname === '/api/hh-launch-apply-chat') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id } = body;
    if (!id) return sendJson(res, 400, { error: 'Нужен id' });

    const rec = getVacancyRecord(id);
    if (!rec) return sendJson(res, 404, { error: 'Запись не найдена' });
    const letter = String(rec.coverLetter?.approvedText || '').trim();
    if (!letter) {
      return sendJson(res, 400, {
        error: 'Нет сохранённого письма — в «Черновик письма» нажмите «Подходит»',
      });
    }

    const scriptPath = path.join(ROOT, 'scripts', 'hh-apply-chat-letter.mjs');
    if (!fs.existsSync(scriptPath)) {
      return sendJson(res, 500, { error: 'Скрипт hh-apply-chat-letter.mjs не найден' });
    }

    const maxApply = getMaxApplyChatPerHour();
    if (countApplyLaunchesLastHour() >= maxApply) {
      return sendJson(res, 429, {
        error: `Слишком частые отклики: максимум ${maxApply} запусков в час (hhApplyChatMaxPerHour в preferences.json).`,
      });
    }
    recordApplyLaunch();

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const header = `\n======== ${new Date().toISOString()} recordId=${id} launch dashboard pid=${process.pid} ========\n`;
    fs.appendFileSync(HH_APPLY_CHAT_LOG_FILE, header, 'utf8');

    const applyChatLogStream = fs.createWriteStream(HH_APPLY_CHAT_LOG_FILE, { flags: 'a' });
    let child;
    try {
      child = spawn(process.execPath, [scriptPath, `--id=${id}`], {
        cwd: ROOT,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (e) {
      try {
        applyChatLogStream.end();
      } catch {
        /* ignore */
      }
      console.error('[hh-apply-chat launch]', e);
      return sendJson(res, 500, { error: e instanceof Error ? e.message : 'spawn failed' });
    }

    const pipeChat = (stream, label) => {
      if (!stream) return;
      stream.pipe(applyChatLogStream, { end: false });
      stream.on('error', (err) => console.error(`[hh-apply-chat ${label}]`, err));
    };
    pipeChat(child.stdout, 'stdout');
    pipeChat(child.stderr, 'stderr');

    child.on('exit', (code, signal) => {
      const line = `\n--- child exit code=${code} signal=${signal || ''} at ${new Date().toISOString()} ---\n`;
      try {
        fs.appendFileSync(HH_APPLY_CHAT_LOG_FILE, line, 'utf8');
      } catch {
        /* ignore */
      }
      try {
        applyChatLogStream.end();
      } catch {
        /* ignore */
      }
    });

    child.unref();

    return sendJson(res, 200, {
      ok: true,
      pid: child.pid,
      logFile: path.relative(ROOT, HH_APPLY_CHAT_LOG_FILE),
      logFileAbsolute: HH_APPLY_CHAT_LOG_FILE,
    });
  }

  if (req.method === 'POST' && pathname === '/api/dismiss') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const { id } = body;
    if (!id) return sendJson(res, 400, { error: 'Нужен id' });
    if (!removeVacancyRecord(id)) {
      return sendJson(res, 404, { error: 'Запись не найдена' });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api')) {
    return sendJson(res, 404, { error: 'Неизвестный путь API', path: pathname });
  }

  const staticRel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(STATIC_DIR, staticRel);
  const staticRoot = path.resolve(STATIC_DIR);
  filePath = path.resolve(filePath);
  if (!filePath.startsWith(staticRoot + path.sep) && filePath !== staticRoot) {
    res.writeHead(403);
    return res.end();
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  const code = err && err.code;
  if (code === 'EADDRINUSE' && !DASHBOARD_STRICT_PORT && listenPort < PORT_START + PORT_RANGE - 1) {
    const prev = listenPort;
    listenPort += 1;
    console.warn('');
    console.warn(
      `  Порт ${prev} на ${DASHBOARD_BIND} занят — поднимаю дашборд на ${listenPort} (диапазон ${PORT_START}…${PORT_START + PORT_RANGE - 1}; строго один порт: DASHBOARD_STRICT_PORT=1).`
    );
    console.warn('');
    server.listen(listenPort, DASHBOARD_BIND);
    return;
  }

  console.error('');
  console.error('  Не удалось запустить дашборд:', err.message || String(err));
  if (code === 'EADDRINUSE') {
    console.error(
      `  Порт ${listenPort} на ${DASHBOARD_BIND} уже занят (часто это уже запущенный npm run dashboard, Docker или другой сервис).`
    );
    if (DASHBOARD_STRICT_PORT || PORT_RANGE <= 1) {
      console.error(
        '  Освободите порт или задайте другой, например: $env:DASHBOARD_PORT=3850; npm run dashboard'
      );
    } else {
      console.error(
        `  Либо увеличьте диапазон: DASHBOARD_PORT_RANGE=30, либо отключите строгий режим (не задавайте DASHBOARD_STRICT_PORT=1).`
      );
    }
    console.error(
      `  Найти PID в PowerShell: Get-NetTCPConnection -LocalPort ${listenPort} -State Listen | Select-Object -ExpandProperty OwningProcess`
    );
  }
  console.error('');
  process.exit(1);
});

server.listen(listenPort, DASHBOARD_BIND, () => {
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr && Number.isFinite(addr.port) ? addr.port : listenPort;
  const logUrl = process.env.DASHBOARD_LOG_URL || `http://127.0.0.1:${actualPort}/`;
  console.log('');
  console.log(`  Дашборд → ${logUrl}`);
  if (actualPort !== PORT_START) {
    console.log(`  (запрошен был порт ${PORT_START}, слушаю ${actualPort} — предыдущий был занят)`);
  }
  if (DASHBOARD_BIND === '0.0.0.0' && !process.env.DASHBOARD_LOG_URL) {
    console.log('  (слушает 0.0.0.0 — с другой машины подставьте IP хоста и тот же порт)');
  }
  console.log('');
});
