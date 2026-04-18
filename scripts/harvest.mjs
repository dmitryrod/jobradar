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
 * HH_KEYWORDS_LOGIC:
 *   loop — без остановки повторять проходы (весь список ключей в каждом проходе);
 *   cycles — HH_KEYWORDS_CYCLES проходов подряд;
 *   keywords — один проход, в поиске только первые HH_KEYWORDS_MAX ключей (пусто = все).
 *
 * HH_WORK_HOURS_ENABLED=1 — вне интервала HH_WORK_HOUR_START–HH_WORK_HOUR_END (часы, включительно) пауза без целевых действий.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadEnv } from '../lib/load-env.mjs';
loadEnv();

import { loadSearchKeywords } from '../lib/load-keywords.mjs';
import { sessionProfilePath, ROOT, SKIPPED_FILE, DATA_DIR } from '../lib/paths.mjs';
import { loadPreferences } from '../lib/preferences.mjs';
import { parseVacancyPage, vacancyIdFromUrl } from '../lib/vacancy-parse.mjs';
import { runHardFilters } from '../lib/filters.mjs';
import { loadCvBundle } from '../lib/cv-load.mjs';
import { hasLlmApiKey } from '../lib/llm-chat.mjs';
import { scoreVacancyWithOpenRouter } from '../lib/openrouter-score.mjs';
import { addVacancyRecord, knownVacancyIds } from '../lib/store.mjs';
import { rotateSearchKeywordFirstToEnd } from '../lib/rotate-search-keyword.mjs';
import { isWithinWorkHoursNow } from '../lib/harvest-work-hours.mjs';

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

function parseKeywordsLogic() {
  const raw = (process.env.HH_KEYWORDS_LOGIC || 'cycles').trim().toLowerCase();
  if (raw === 'loop' || raw === 'cycles' || raw === 'keywords') return raw;
  return 'cycles';
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

async function waitForWorkHours() {
  if (process.env.HH_WORK_HOURS_ENABLED !== '1') return;
  while (!isWithinWorkHoursNow(process.env)) {
    harvestEvent({ event: 'idle_work_hours', message: 'Вне интервала рабочего времени, ожидание…' });
    await sleepMs(60_000);
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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(SKIPPED_FILE, `${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n`, 'utf8');
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

/**
 * Один проход: сбор URL по ключам → обход карточек.
 * @returns {{ shouldRotate: boolean, added: number, urlsTotal: number }}
 */
async function runHarvestPass(page, keywords, cvBundle, prefs) {
  await waitForWorkHours();
  const seenIds = knownVacancyIds();
  const urls = [];
  const globalSeen = new Set();

  for (const key of keywords) {
    await waitForWorkHours();
    if (urls.length >= sessionLimit) break;
    harvestEvent({ event: 'keyword_active', keyword: key, phase: 'search' });
    await page.goto(buildSearchUrl(key), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleepMs(randomIntInclusive(searchJitterMin, searchJitterMax));
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
  }

  if (!urls.length) {
    console.log('Нет новых ссылок (все уже в очереди или пустая выдача).');
    harvestEvent({ event: 'done', added: 0, urlsTotal: 0 });
    return { shouldRotate: true, added: 0, urlsTotal: 0 };
  }

  let added = 0;
  for (let i = 0; i < urls.length; i++) {
    await waitForWorkHours();
    if (i > 0) {
      const pause = randomIntInclusive(openDelayMin, openDelayMax);
      console.log(`Пауза ${pause} мс…`);
      await sleepMs(pause);
    }

    const { url, query } = urls[i];
    const vacancyId = vacancyIdFromUrl(url);
    console.log(`Парсинг ${i + 1}/${urls.length}`, url);

    harvestEvent({ event: 'keyword_active', keyword: query, phase: 'card' });
    harvestEvent({ event: 'url_opened', url, vacancyId });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleepMs(randomIntInclusive(postLoadMin, postLoadMax));
    const parsed = await parseVacancyPage(page);

    const filter = runHardFilters(parsed, prefs);
    if (!filter.pass) {
      console.log(`  SKIP [${filter.stage}]: ${filter.reason}`);
      logSkipped({
        vacancyId,
        url,
        query,
        stage: filter.stage,
        reason: filter.reason,
        title: parsed.title,
      });
      continue;
    }

    let llm = {
      score: 0,
      scoreVacancy: 0,
      scoreCvMatch: 0,
      scoreOverall: 0,
      summary: skipLlm ? '(LLM отключён — npm run harvest -- --skip-llm)' : '',
      risks: '',
      matchCv: 'unknown',
      tags: [],
      providerModel: null,
    };

    if (!skipLlm) {
      try {
        llm = await scoreVacancyWithOpenRouter(
          {
            title: parsed.title,
            company: parsed.company,
            salaryRaw: parsed.salaryRaw,
            description: parsed.description,
            url,
          },
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
      llmProvider: skipLlm ? 'skipped' : llm.llmProvider || 'openrouter',
      openRouterModel: llm.providerModel || null,
      scoreVacancy: llm.scoreVacancy,
      scoreCvMatch: llm.scoreCvMatch,
      scoreOverall: llm.scoreOverall,
      geminiScore: llm.scoreOverall ?? llm.score,
      geminiSummary: llm.summary,
      geminiRisks: llm.risks,
      geminiMatchCv: llm.matchCv,
      geminiTags: llm.tags,
      status: 'pending',
      feedbackReason: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    if (addVacancyRecord(record)) {
      added++;
      harvestEvent({ event: 'record_added', url, vacancyId });
      console.log('  → В очередь дашборда');
    } else {
      console.log('  → Уже была в очереди, пропуск');
    }
  }

  harvestEvent({ event: 'done', added, urlsTotal: urls.length });
  console.log(`\nПроход завершён. Новых записей в очереди: ${added}.`);
  return { shouldRotate: true, added, urlsTotal: urls.length };
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

async function main() {
  const prefs = loadPreferences();
  const logic = parseKeywordsLogic();

  if (!skipLlm && !hasLlmApiKey()) {
    console.error('Нужен POLZA_API_KEY (или POLZA_AI_API_KEY) или OpenRouter_API_KEY в .env или .env.local');
    console.error('Шаблон: .env.example  |  Либо: npm run harvest -- --skip-llm');
    process.exit(1);
  }

  if (!fs.existsSync(keywordsPath)) {
    console.error('Файл ключей не найден:', keywordsPath);
    process.exit(1);
  }

  if (!fs.existsSync(sessionProfilePath())) {
    console.error('Нет профиля Chromium. Сначала: npm run login');
    process.exit(1);
  }

  const cvBundle = await loadCvBundle();
  for (const w of cvBundle.warnings) console.warn('[CV]', w);
  if (!cvBundle.text.trim()) {
    console.error('Нет текста CV — положите .pdf или .txt в папку CV/');
    process.exit(1);
  }

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
      process.exit(1);
    }

    if (logic === 'loop') {
      console.log('Режим ключей: зацикливание (остановка — завершите процесс harvest).');
      let pass = 0;
      while (true) {
        pass++;
        await waitForWorkHours();
        const all = loadSearchKeywords(keywordsPath);
        if (!all.length) {
          console.error('Нет ключей в', keywordsPath);
          process.exit(1);
        }
        harvestEvent({ event: 'pass_start', pass, logic: 'loop', keywordsTotal: all.length });
        const r = await runHarvestPass(page, all, cvBundle, prefs);
        if (r.shouldRotate) rotateIfEnabled();
      }
    }

    if (logic === 'cycles') {
      const cyclesLeft = parseCyclesCount();
      console.log(`Режим ключей: ${cyclesLeft} проход(ов) по полному списку ключей.`);
      for (let pass = 1; pass <= cyclesLeft; pass++) {
        await waitForWorkHours();
        const all = loadSearchKeywords(keywordsPath);
        if (!all.length) {
          console.error('Нет ключей в', keywordsPath);
          process.exit(1);
        }
        harvestEvent({ event: 'pass_start', pass, logic: 'cycles', passTotal: cyclesLeft, keywordsTotal: all.length });
        const r = await runHarvestPass(page, all, cvBundle, prefs);
        if (r.shouldRotate) rotateIfEnabled();
      }
      console.log('Готово. Запустите: npm run dashboard');
    } else if (logic === 'keywords') {
      await waitForWorkHours();
      const all = loadSearchKeywords(keywordsPath);
      if (!all.length) {
        console.error('Нет ключей в', keywordsPath);
        process.exit(1);
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
    await ctx.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
