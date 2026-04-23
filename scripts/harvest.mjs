/**
 * Сбор вакансий: поиск → парсинг → фильтры → оценка через LLM (Polza или OpenRouter) → data/vacancies-queue.json.
 *
 * Перед запуском: npm run login, в .env — POLZA_API_KEY и/или OpenRouter_API_KEY (см. .env.example, config/OPENROUTER.md).
 * Флаги: --skip-llm | --skip-gemini — без вызова LLM (score=0).
 *
 * События для дашборда: строки `HARVEST_JSON {...}` в stdout (в лог через UI). Пишем через writeSync, иначе при файле вместо TTY буферизация и дашборд не видит keyword_active.
 * `keyword_done` — ключ отработан на этапе поиска/сбора ссылок (список в UI с новыми сверху).
 * После успешного прохода первая строка config/search-keywords.txt переносится в конец (HH_ROTATE_KEYWORD_AFTER_RUN=0 — отключить).
 *
 * HH_KEYWORDS_LOGIC (по умолчанию loop):
 *   loop — без остановки повторять проходы (весь список ключей в каждом проходе);
 *   cycles — HH_KEYWORDS_CYCLES проходов подряд;
 *   keywords — один проход, в поиске только первые HH_KEYWORDS_MAX ключей (пусто = все).
 *
 * HH_WORK_HOURS_ENABLED=1 — вне интервала HH_WORK_HOUR_START–HH_WORK_HOUR_END (часы, включительно) пауза без целевых действий.
 *
 * HH_HARVEST_DEBUG=1 — подробный JSONL в data/harvest-debug.log (причины выхода, env без секретов).
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadEnv } from '../lib/load-env.mjs';
import {
  snapshotHarvestSpawnEnv,
  restoreHarvestSpawnEnv,
} from '../lib/harvest-spawn-env.mjs';

const __harvestSpawnEnvSnap = snapshotHarvestSpawnEnv();
loadEnv();
restoreHarvestSpawnEnv(__harvestSpawnEnvSnap);

import { loadSearchKeywords } from '../lib/load-keywords.mjs';
import {
  sessionProfilePath,
  ROOT,
  resolveDataDir,
} from '../lib/paths.mjs';
import {
  isHarvestGracefulStopRequested as isGracefulStopRequested,
  clearHarvestGracefulStopFlag as clearGracefulStopFlag,
  resolvedHarvestGracefulStopFile,
} from '../lib/harvest-graceful-stop.mjs';
import { loadPreferences } from '../lib/preferences.mjs';
import { parseVacancyPage, vacancyIdFromUrl } from '../lib/vacancy-parse.mjs';
import { runHardFilters } from '../lib/filters.mjs';
import { evaluateProfileCriteria } from '../lib/profile-criteria.mjs';
import { loadCvBundle } from '../lib/cv-load.mjs';
import { hasLlmApiKey } from '../lib/llm-chat.mjs';
import { scoreVacancyWithOpenRouter } from '../lib/openrouter-score.mjs';
import { normalizeEmployerInstructions } from '../lib/employer-instructions.mjs';
import { finalizeVacancyScores } from '../lib/scoring-blend.mjs';
import { addVacancyRecord, knownVacancyIds } from '../lib/store.mjs';
import { applyReviewAutomationForNewRecord } from '../lib/review-automation.mjs';
import { rotateSearchKeywordFirstToEnd } from '../lib/rotate-search-keyword.mjs';
import { isWithinWorkHoursNow } from '../lib/harvest-work-hours.mjs';
import { HARVEST_FORM_ENV_KEYS } from '../lib/harvest-env-keys.mjs';
import {
  isHarvestDebug,
  harvestDebugLog,
  harvestDebugError,
  setHarvestDebugRunId,
  registerHarvestDebugProcessHandlers,
  sanitizeEnvForLog,
} from '../lib/harvest-debug.mjs';

registerHarvestDebugProcessHandlers();
if (isHarvestDebug()) {
  const eff = Object.create(null);
  for (const k of HARVEST_FORM_ENV_KEYS) {
    if (k in process.env) eff[k] = process.env[k];
  }
  for (const k of ['HH_GRACEFUL_STOP_FILE', 'HH_DATA_DIR']) {
    if (k in process.env) eff[k] = process.env[k];
  }
  harvestDebugLog({
    event: 'boot',
    phase: 'after_loadEnv_restore',
    pid: process.pid,
    env: sanitizeEnvForLog(eff),
  });
}

const DEFAULT_KEYWORDS_FILE = path.join(ROOT, 'config', 'search-keywords.txt');

const headless = process.env.HH_HEADLESS === '1';
const skipLlm =
  process.argv.includes('--skip-llm') || process.argv.includes('--skip-gemini');
const sessionLimit = Math.min(40, Math.max(1, Number(process.env.HH_SESSION_LIMIT ?? process.env.HH_MAX_TOTAL ?? 7) || 7));
const perKeyLimit = Math.min(30, Math.max(1, Number(process.env.HH_PER_KEYWORD_LIMIT || 8) || 8));

const openDelayMin = Math.max(0, Number(process.env.HH_OPEN_DELAY_MIN_MS || 3000) || 3000);
const openDelayMax = Math.max(openDelayMin, Number(process.env.HH_OPEN_DELAY_MAX_MS || 5000) || 5000);
const searchJitterMin = Math.max(0, Number(process.env.HH_SEARCH_JITTER_MIN_MS || 1000) || 1000);
const searchJitterMax = Math.max(searchJitterMin, Number(process.env.HH_SEARCH_JITTER_MAX_MS || 2000) || 2000);
const postLoadMin = Math.max(0, Number(process.env.HH_POST_LOAD_JITTER_MIN_MS || 200) || 200);
const postLoadMax = Math.max(postLoadMin, Number(process.env.HH_POST_LOAD_JITTER_MAX_MS || 800) || 800);

const keywordsPath = path.resolve(
  process.cwd(),
  (process.env.HH_KEYWORDS_FILE || '').trim() || DEFAULT_KEYWORDS_FILE
);

/** База — preferences.json; HH_REQUIRE_REMOTE=0|1|true|false перекрывает requireRemote на этот запуск. */
function resolveHarvestPreferences() {
  const base = loadPreferences();
  const raw = (process.env.HH_REQUIRE_REMOTE ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return { ...base, requireRemote: true };
  }
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return { ...base, requireRemote: false };
  }
  return base;
}

function parseKeywordsLogic() {
  const raw = (process.env.HH_KEYWORDS_LOGIC || 'loop').trim().toLowerCase();
  if (raw === 'loop' || raw === 'cycles' || raw === 'keywords') return raw;
  return 'loop';
}

function parseCyclesCount() {
  return Math.max(1, Math.floor(Number(process.env.HH_KEYWORDS_CYCLES || 1) || 1));
}

/** Сколько первых ключей взять в режиме keywords (пустой env = весь файл). */
function keywordTakeCount(allLen) {
  const raw = process.env.HH_KEYWORDS_MAX;
  if (raw == null || String(raw).trim() === '') return allLen;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return allLen;
  return Math.min(allLen, Math.floor(n));
}

function randomIntInclusive(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Пауза с опросом остановки (чтобы не ждать целиком openDelay / jitter после «Остановить поиск»). */
async function sleepMsInterruptible(ms, isStop) {
  const step = 400;
  let left = Math.max(0, ms);
  while (left > 0) {
    const t = Math.min(step, left);
    await sleepMs(t);
    left -= t;
    if (isStop()) return true;
  }
  return false;
}

async function waitForWorkHours() {
  if (process.env.HH_WORK_HOURS_ENABLED !== '1') return;
  while (!isWithinWorkHoursNow(process.env)) {
    harvestEvent({ event: 'idle_work_hours', message: 'Вне интервала рабочего времени, ожидание…' });
    for (let i = 0; i < 12; i++) {
      await sleepMs(5000);
      if (isWithinWorkHoursNow(process.env)) return;
      if (isGracefulStopRequested()) return;
    }
  }
}

function looksLikeLoginUrl(url) {
  const u = url.toLowerCase();
  return u.includes('/account/login') || u.includes('oauth.hh.ru') || u.includes('/logon');
}

function buildSearchUrl(text) {
  const params = new URLSearchParams();
  params.set('text', text);
  params.set('ored_clusters', 'true');
  const area = (process.env.HH_AREA || '').trim();
  if (area) params.set('area', area);
  return `https://hh.ru/search/vacancy?${params.toString()}`;
}

async function collectVacancyUrls(page) {
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const seen = new Set();
    const out = [];
    for (const a of document.querySelectorAll('a[href*="/vacancy/"]')) {
      const href = a.href || '';
      const m = href.match(/\/vacancy\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(`https://hh.ru/vacancy/${id}`);
    }
    return out;
  });
}

function logSkipped(payload) {
  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const skippedFile = path.join(dir, 'skipped-vacancies.jsonl');
  fs.appendFileSync(skippedFile, `${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n`, 'utf8');
}

/** События для дашборда (парсятся из лога по префиксу HARVEST_JSON). */
function harvestEvent(obj) {
  const line = `HARVEST_JSON ${JSON.stringify(obj)}\n`;
  try {
    fs.writeSync(1, line, 'utf8');
  } catch {
    try {
      process.stdout.write(line);
    } catch {
      /* ignore */
    }
  }
}

const URL_OUTCOME_TITLE_MAX = 200;

function outcomeTitleForLog(t) {
  const s = String(t || '').trim();
  if (!s) return '—';
  return s.length > URL_OUTCOME_TITLE_MAX ? `${s.slice(0, URL_OUTCOME_TITLE_MAX)}…` : s;
}

/**
 * Итог обработки одной карточки для таблицы «Список открытых ссылок» в дашборде.
 * @param {{ url: string, vacancyId?: string | null, title?: string, outcome: string, detail?: string }} p
 */
function emitUrlOutcome(p) {
  const payload = {
    event: 'url_outcome',
    url: p.url,
    vacancyId: p.vacancyId ?? null,
    title: outcomeTitleForLog(p.title),
    at: new Date().toISOString(),
    outcome: p.outcome,
  };
  if (p.detail != null && String(p.detail).trim()) {
    payload.detail = String(p.detail).trim().slice(0, 500);
  }
  harvestEvent(payload);
}

/**
 * Один проход: сбор URL по ключам → обход карточек.
 * @returns {{ shouldRotate: boolean, added: number, urlsTotal: number, gracefulStop: boolean }}
 */
async function runHarvestPass(page, keywords, cvBundle, prefs) {
  let gracefulReason = null;
  await waitForWorkHours();
  if (isGracefulStopRequested()) {
    gracefulReason = 'stop_flag_at_pass_start';
    harvestDebugLog({ event: 'debug_graceful', reason: gracefulReason });
    harvestEvent({ event: 'done', added: 0, urlsTotal: 0, gracefulStop: true });
    return { shouldRotate: false, added: 0, urlsTotal: 0, gracefulStop: true };
  }
  const seenIds = knownVacancyIds();
  const urls = [];
  const globalSeen = new Set();
  let stopAfterKeywords = false;

  for (const key of keywords) {
    await waitForWorkHours();
    if (urls.length >= sessionLimit) break;
    if (isGracefulStopRequested()) {
      stopAfterKeywords = true;
      gracefulReason = gracefulReason || 'stop_flag_in_keyword_loop';
      break;
    }
    harvestEvent({ event: 'keyword_active', keyword: key, phase: 'search' });
    await page.goto(buildSearchUrl(key), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await sleepMsInterruptible(randomIntInclusive(searchJitterMin, searchJitterMax), isGracefulStopRequested)) {
      stopAfterKeywords = true;
      gracefulReason = gracefulReason || 'interrupt_jitter_after_search';
      break;
    }
    const found = await collectVacancyUrls(page);
    let n = 0;
    for (const u of found) {
      if (urls.length >= sessionLimit) break;
      if (n >= perKeyLimit) break;
      const id = vacancyIdFromUrl(u);
      if (!id || globalSeen.has(id) || seenIds.has(id)) continue;
      globalSeen.add(id);
      urls.push({ url: u, query: key });
      harvestEvent({ event: 'url_queued', url: u, vacancyId: id });
      n++;
    }
    console.log(`Ключ «${key}»: +${n} URL (в очереди на обход ${urls.length})`);
    harvestEvent({ event: 'keyword_done', keyword: key });
    if (isGracefulStopRequested()) {
      stopAfterKeywords = true;
      gracefulReason = gracefulReason || 'stop_flag_after_keyword_done';
      break;
    }
  }

  if (!urls.length) {
    console.log('Нет новых ссылок (все уже в очереди или пустая выдача).');
    const gracefulStop = stopAfterKeywords;
    if (gracefulStop && isHarvestDebug()) {
      harvestDebugLog({
        event: 'debug_graceful',
        reason: gracefulReason || 'after_keyword_phase_no_urls',
        emptyUrls: true,
      });
    }
    harvestEvent({ event: 'done', added: 0, urlsTotal: 0, gracefulStop });
    return { shouldRotate: !gracefulStop, added: 0, urlsTotal: 0, gracefulStop };
  }

  let added = 0;
  let stoppedCardsEarly = false;
  let cardsStopReason = null;
  for (let i = 0; i < urls.length; i++) {
    await waitForWorkHours();
    if (isGracefulStopRequested()) {
      stoppedCardsEarly = true;
      cardsStopReason = cardsStopReason || 'stop_flag_before_card_iter';
      break;
    }
    if (i > 0) {
      const pause = randomIntInclusive(openDelayMin, openDelayMax);
      console.log(`Пауза ${pause} мс…`);
      if (await sleepMsInterruptible(pause, isGracefulStopRequested)) {
        stoppedCardsEarly = true;
        cardsStopReason = cardsStopReason || 'interrupt_open_delay';
        break;
      }
    }

    const { url, query } = urls[i];
    const vacancyId = vacancyIdFromUrl(url);
    console.log(`Парсинг ${i + 1}/${urls.length}`, url);

    harvestEvent({ event: 'keyword_active', keyword: query, phase: 'card' });
    harvestEvent({ event: 'url_opened', url, vacancyId });
    if (isGracefulStopRequested()) {
      stoppedCardsEarly = true;
      cardsStopReason = cardsStopReason || 'stop_flag_after_url_opened_event';
      break;
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (await sleepMsInterruptible(randomIntInclusive(postLoadMin, postLoadMax), isGracefulStopRequested)) {
      stoppedCardsEarly = true;
      cardsStopReason = cardsStopReason || 'interrupt_post_load_jitter';
      break;
    }
    const parsed = await parseVacancyPage(page);
    const vacancyCtx = {
      title: parsed.title,
      company: parsed.company,
      salaryRaw: parsed.salaryRaw,
      description: parsed.description,
      url,
      address: parsed.address || '',
      workConditionsLines: Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines : [],
      employment: parsed.employment || '',
      vacancyPublishedDate: parsed.vacancyPublishedDate ?? null,
    };

    const profileEval = evaluateProfileCriteria(parsed, prefs);
    if (profileEval.banned) {
      console.log(`  PROFILE BAN: ${profileEval.banReason}`);
      const rejectRecord = {
        id: crypto.randomUUID(),
        vacancyId,
        url,
        searchQuery: query,
        title: parsed.title,
        company: parsed.company,
        salaryRaw: parsed.salaryRaw,
        salaryEstimate: null,
        remoteNote: '',
        salaryNote: '',
        descriptionPreview: parsed.description.slice(0, 600),
        descriptionForLlm: parsed.description.slice(0, 6000),
        vacancyDescriptionFull: parsed.vacancyDescriptionFull || parsed.description,
        hhWorkConditions: Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines : [],
        vacancyPublishedLine: String(parsed.vacancyPublishedLine || '').trim(),
        vacancyPublishedDate: parsed.vacancyPublishedDate ?? null,
        llmProvider: 'skipped',
        openRouterModel: null,
        scoreVacancy: null,
        scoreCvMatch: null,
        scoreWorkFormat: null,
        scoreLocation: null,
        scoreLlm: 0,
        scoreProfile: 0,
        scoreLlmWeight: null,
        scoreProfileWeight: null,
        scoreOverall: 0,
        scoreSortKey: 0,
        scoreBlendedBeforeDelta: 0,
        scoreRuleDelta: 0,
        scoreSalaryDelta: 0,
        scorePublicationDelta: 0,
        scoreProfileCriteriaDelta: 0,
        geminiScore: null,
        geminiSummary: profileEval.banReason,
        geminiRisks: '',
        geminiMatchCv: 'unknown',
        geminiTags: [],
        employerInstructions: null,
        instructionComplexity: 'none',
        hasEmployerInstructions: false,
        status: 'rejected',
        feedbackReason: profileEval.banReason,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      if (addVacancyRecord(rejectRecord)) {
        harvestEvent({ event: 'record_added', url, vacancyId });
        emitUrlOutcome({
          url,
          vacancyId,
          title: parsed.title,
          outcome: 'rejected_profile',
          detail: profileEval.banReason,
        });
        console.log('  → В очередь (отклонено по профилю)');
      }
      if (isGracefulStopRequested()) {
        stoppedCardsEarly = true;
        cardsStopReason = cardsStopReason || 'stop_flag_after_profile_reject';
        break;
      }
      continue;
    }

    const filter = runHardFilters(parsed, prefs);
    if (!filter.pass) {
      console.log(`  SKIP [${filter.stage}]: ${filter.reason}`);
      emitUrlOutcome({
        url,
        vacancyId,
        title: parsed.title,
        outcome: 'skipped_filter',
        detail: `[${filter.stage}] ${filter.reason}`,
      });
      logSkipped({
        vacancyId,
        url,
        query,
        stage: filter.stage,
        reason: filter.reason,
        title: parsed.title,
      });
      if (isGracefulStopRequested()) {
        stoppedCardsEarly = true;
        cardsStopReason = cardsStopReason || 'stop_flag_after_filter_skip';
        break;
      }
      continue;
    }

    let llm = {
      score: 0,
      scoreVacancy: 0,
      scoreCvMatch: 0,
      scoreWorkFormat: 0,
      scoreLocation: 0,
      scoreLlm: 0,
      scoreProfile: null,
      scoreLlmWeight: 0,
      scoreProfileWeight: 0,
      scoreOverall: 0,
      scoreSortKey: 0,
      scoreBlendedBeforeDelta: 0,
      scoreRuleDelta: 0,
      scoreSalaryDelta: 0,
      scorePublicationDelta: 0,
      scoreProfileCriteriaDelta: 0,
      summary: skipLlm ? '(LLM отключён — npm run harvest -- --skip-llm)' : '',
      risks: '',
      matchCv: 'unknown',
      tags: [],
      providerModel: null,
      employerInstructions: null,
      instructionComplexity: 'none',
      hasEmployerInstructions: false,
    };

    if (skipLlm) {
      const fin = finalizeVacancyScores(
        {
          scoreVacancy: null,
          scoreCvMatch: null,
          scoreWorkFormat: null,
          scoreLocation: null,
          scoreOverall: null,
          score: null,
        },
        prefs,
        vacancyCtx
      );
      Object.assign(llm, fin);
    } else {
      if (isGracefulStopRequested()) {
        stoppedCardsEarly = true;
        cardsStopReason = cardsStopReason || 'stop_flag_before_llm';
        break;
      }
      try {
        llm = await scoreVacancyWithOpenRouter(
          vacancyCtx,
          cvBundle,
          prefs
        );
        console.log(
          `  LLM (${llm.llmProvider || '?'}): итог ${llm.scoreOverall} (вакансия ${llm.scoreVacancy}, CV ${llm.scoreCvMatch}) — ${llm.providerModel || '?'}`
        );
      } catch (e) {
        console.error('  LLM error:', e.message);
        llm.summary = `Ошибка LLM: ${e.message}`;
      }
    }

    const record = {
      id: crypto.randomUUID(),
      vacancyId,
      url,
      searchQuery: query,
      title: parsed.title,
      company: parsed.company,
      salaryRaw: parsed.salaryRaw,
      salaryEstimate: filter.salaryEstimate,
      remoteNote: filter.remoteReason,
      salaryNote: filter.salaryReason,
      descriptionPreview: parsed.description.slice(0, 600),
      descriptionForLlm: parsed.description.slice(0, 6000),
      vacancyDescriptionFull: parsed.vacancyDescriptionFull || parsed.description,
      hhWorkConditions: Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines : [],
      vacancyPublishedLine: String(parsed.vacancyPublishedLine || '').trim(),
      vacancyPublishedDate: parsed.vacancyPublishedDate ?? null,
      llmProvider: skipLlm ? 'skipped' : llm.llmProvider || 'openrouter',
      openRouterModel: llm.providerModel || null,
      scoreVacancy: llm.scoreVacancy,
      scoreCvMatch: llm.scoreCvMatch,
      scoreWorkFormat: llm.scoreWorkFormat,
      scoreLocation: llm.scoreLocation,
      scoreLlm: llm.scoreLlm,
      scoreProfile: llm.scoreProfile,
      scoreLlmWeight: llm.scoreLlmWeight,
      scoreProfileWeight: llm.scoreProfileWeight,
      scoreOverall: llm.scoreOverall,
      scoreSortKey: llm.scoreSortKey,
      scoreBlendedBeforeDelta: llm.scoreBlendedBeforeDelta,
      scoreRuleDelta: llm.scoreRuleDelta,
      scoreSalaryDelta: llm.scoreSalaryDelta,
      scorePublicationDelta: llm.scorePublicationDelta,
      scoreProfileCriteriaDelta: llm.scoreProfileCriteriaDelta ?? 0,
      geminiScore: llm.scoreOverall ?? llm.score,
      geminiSummary: llm.summary,
      geminiRisks: llm.risks,
      geminiMatchCv: llm.matchCv,
      geminiTags: llm.tags,
      employerInstructions: normalizeEmployerInstructions(llm.employerInstructions),
      instructionComplexity: llm.instructionComplexity || 'none',
      hasEmployerInstructions: !!llm.hasEmployerInstructions,
      status: 'pending',
      feedbackReason: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    if (addVacancyRecord(record)) {
      added++;
      harvestEvent({ event: 'record_added', url, vacancyId });
      console.log('  → В очередь дашборда');
      let raResult;
      let outcomeEmitted = false;
      try {
        raResult = await applyReviewAutomationForNewRecord(record.id);
      } catch (e) {
        console.error('  review-automation:', e?.message || e);
        emitUrlOutcome({
          url,
          vacancyId,
          title: record.title,
          outcome: 'review_automation_error',
          detail: e?.message || String(e),
        });
        outcomeEmitted = true;
      }
      if (!outcomeEmitted) {
        if (!raResult.ok) {
          emitUrlOutcome({
            url,
            vacancyId,
            title: record.title,
            outcome: 'review_automation_error',
            detail: raResult.reason || 'unknown',
          });
        } else if (raResult.rejected) {
          emitUrlOutcome({ url, vacancyId, title: record.title, outcome: 'rejected_auto' });
        } else if (raResult.coverLetterGenerated) {
          emitUrlOutcome({ url, vacancyId, title: record.title, outcome: 'pending_draft' });
        } else {
          emitUrlOutcome({ url, vacancyId, title: record.title, outcome: 'pending' });
        }
      }
    } else {
      console.log('  → Уже была в очереди, пропуск');
      emitUrlOutcome({
        url,
        vacancyId,
        title: record.title,
        outcome: 'duplicate',
      });
    }

    if (isGracefulStopRequested()) {
      stoppedCardsEarly = true;
      cardsStopReason = cardsStopReason || 'stop_flag_end_card_iteration';
      break;
    }
  }

  const gracefulStop = stopAfterKeywords || stoppedCardsEarly;
  if (gracefulStop && isHarvestDebug()) {
    const reason = stoppedCardsEarly
      ? cardsStopReason || 'during_cards'
      : gracefulReason || 'after_keywords';
    harvestDebugLog({
      event: 'debug_graceful',
      reason,
      stopAfterKeywords,
      stoppedCardsEarly,
      urlsTotal: urls.length,
      added,
    });
  }
  harvestEvent({ event: 'done', added, urlsTotal: urls.length, gracefulStop });
  if (gracefulStop) {
    console.log(`\nОстановка по запросу. Новых записей в очереди за проход: ${added}.`);
  } else {
    console.log(`\nПроход завершён. Новых записей в очереди: ${added}.`);
  }
  return { shouldRotate: !gracefulStop, added, urlsTotal: urls.length, gracefulStop };
}

function rotateIfEnabled() {
  if (process.env.HH_ROTATE_KEYWORD_AFTER_RUN === '0') return;
  try {
    const r = rotateSearchKeywordFirstToEnd(keywordsPath);
    if (r.ok) {
      console.log('Первая строка в config/search-keywords.txt перенесена в конец (следующий проход — другой порядок ключей).');
    } else if (r.reason) {
      console.warn('Ротация ключей пропущена:', r.reason);
    }
  } catch (e) {
    console.error('Ротация ключей:', e.message);
  }
}

function exitHarvest(code, reason) {
  if (isHarvestDebug()) {
    harvestDebugLog({ event: 'process_exit', reason, code });
  }
  process.exit(code);
}

async function main() {
  setHarvestDebugRunId(crypto.randomUUID());
  const prefs = resolveHarvestPreferences();
  const logic = parseKeywordsLogic();

  if (!skipLlm && !hasLlmApiKey()) {
    console.error('Нужен POLZA_API_KEY (или POLZA_AI_API_KEY) или OpenRouter_API_KEY в .env или .env.local');
    console.error('Шаблон: .env.example  |  Либо: npm run harvest -- --skip-llm');
    exitHarvest(1, 'no_llm_key');
  }

  if (!fs.existsSync(keywordsPath)) {
    console.error('Файл ключей не найден:', keywordsPath);
    exitHarvest(1, 'no_keywords_file');
  }

  if (!fs.existsSync(sessionProfilePath())) {
    console.error('Нет профиля Chromium. Сначала: npm run login');
    exitHarvest(1, 'no_chromium_profile');
  }

  const cvBundle = await loadCvBundle();
  for (const w of cvBundle.warnings) console.warn('[CV]', w);
  if (!cvBundle.text.trim()) {
    console.error('Нет текста CV — положите .pdf или .txt в папку CV/');
    exitHarvest(1, 'no_cv_text');
  }

  const cyclesLeft = logic === 'cycles' ? parseCyclesCount() : null;
  const keywordTakeLog =
    logic === 'keywords' ? keywordTakeCount(loadSearchKeywords(keywordsPath).length) : null;
  harvestDebugLog({
    event: 'session_start',
    phase: 'main',
    logic,
    cyclesTotal: cyclesLeft,
    keywordTake: keywordTakeLog,
    sessionLimit,
    perKeyLimit,
    keywordsPath,
    headless,
    skipLlm,
  });

  const gracefulFile = resolvedHarvestGracefulStopFile();
  const flagBefore = fs.existsSync(gracefulFile);
  harvestDebugLog({ event: 'graceful_flag', phase: 'before_clear', path: gracefulFile, exists: flagBefore });
  clearGracefulStopFlag();
  harvestDebugLog({ event: 'graceful_flag', phase: 'after_clear', exists: fs.existsSync(gracefulFile) });

  const ctx = await chromium.launchPersistentContext(sessionProfilePath(), {
    headless,
    viewport: { width: 1280, height: 800 },
    locale: 'ru-RU',
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  try {
    await page.goto('https://hh.ru/applicant', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    if (looksLikeLoginUrl(page.url())) {
      console.error('Сессия не активна. Выполните: npm run login');
      exitHarvest(1, 'login_required');
    }

    if (logic === 'loop') {
      console.log(
        'Режим ключей: зацикливание (остановка — «Остановить поиск» в дашборде или завершите процесс harvest).'
      );
      let pass = 0;
      while (true) {
        pass++;
        await waitForWorkHours();
        if (isGracefulStopRequested()) break;
        const all = loadSearchKeywords(keywordsPath);
        if (!all.length) {
          console.error('Нет ключей в', keywordsPath);
          exitHarvest(1, 'no_keywords_in_file');
        }
        harvestEvent({ event: 'pass_start', pass, logic: 'loop', keywordsTotal: all.length });
        const r = await runHarvestPass(page, all, cvBundle, prefs);
        if (r.gracefulStop) break;
        if (r.shouldRotate) rotateIfEnabled();
      }
    }

    if (logic === 'cycles') {
      console.log(`Режим ключей: ${cyclesLeft} проход(ов) по полному списку ключей.`);
      for (let pass = 1; pass <= cyclesLeft; pass++) {
        await waitForWorkHours();
        if (isGracefulStopRequested()) break;
        const all = loadSearchKeywords(keywordsPath);
        if (!all.length) {
          console.error('Нет ключей в', keywordsPath);
          exitHarvest(1, 'no_keywords_in_file');
        }
        harvestEvent({ event: 'pass_start', pass, logic: 'cycles', passTotal: cyclesLeft, keywordsTotal: all.length });
        const r = await runHarvestPass(page, all, cvBundle, prefs);
        if (r.gracefulStop) break;
        if (r.shouldRotate) rotateIfEnabled();
      }
      console.log('Готово. Запустите: npm run dashboard');
    } else if (logic === 'keywords') {
      await waitForWorkHours();
      const all = loadSearchKeywords(keywordsPath);
      if (!all.length) {
        console.error('Нет ключей в', keywordsPath);
        exitHarvest(1, 'no_keywords_in_file');
      }
      const take = keywordTakeCount(all.length);
      const slice = all.slice(0, take);
      console.log(`Режим ключей: один проход по первым ${slice.length} ключам (в файле ${all.length}).`);
      harvestEvent({ event: 'pass_start', pass: 1, logic: 'keywords', keywordsTotal: slice.length });
      const r = await runHarvestPass(page, slice, cvBundle, prefs);
      if (r.shouldRotate) rotateIfEnabled();
      console.log('Готово. Запустите: npm run dashboard');
    }
  } finally {
    harvestDebugLog({ event: 'session_end', phase: 'main_finally' });
    await ctx.close();
    clearGracefulStopFlag();
  }
}

main().catch((e) => {
  harvestDebugError(e, { phase: 'main_catch' });
  console.error(e);
  process.exit(1);
});
