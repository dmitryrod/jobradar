import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criterionHit,
  evaluateProfileCriteria,
  contributionFromRow,
  contributionBoundsFromRow,
  normalizeProfileScore,
  normalizeProfileRowsFromClient,
  ensureProfileCriteria,
  PROFILE_CRITERIA_MANIFEST,
} from '../lib/profile-criteria.mjs';

const baseParsed = {
  title: 'Dev',
  company: 'X',
  salaryRaw: '100 000 – 150 000 ₽',
  description: 'удаленная работа, полная удалёнка',
  address: '',
  workConditionsLines: [],
  employment: '',
  vacancyPublishedDate: null,
};

const basePrefs = {
  minMonthlyUsd: 0,
  rubPerUsd: 80,
  requireRemote: false,
  allowHybrid: true,
  allowUnknownSalary: true,
  remotePositivePatterns: ['удален'],
  hybridPatterns: ['гибрид'],
  officeOnlyPatterns: [],
  scoringGeo: {
    baseCity: 'Москва',
    acceptableCities: [],
    remoteIsAcceptable: true,
    penaltyUnknownLocation: 0,
    relocationPatterns: ['релокаци'],
  },
  scoringPublicationTodayBonus: 0,
};

test('criterionHit: remote_signals', () => {
  assert.equal(criterionHit('remote_signals', baseParsed, basePrefs), true);
});

test('criterionHit: salary_unknown на пустой зарплате', () => {
  const p = { ...basePrefs };
  const vac = { ...baseParsed, salaryRaw: '' };
  assert.equal(criterionHit('salary_unknown', vac, p), true);
});

test('contributionFromRow: знаки', () => {
  assert.equal(contributionFromRow(5, '+', true), 5);
  assert.equal(contributionFromRow(5, '+', false), 0);
  assert.equal(contributionFromRow(5, '-', true), -5);
  assert.equal(contributionFromRow(5, '+-', false), -5);
});

test('contributionBoundsFromRow: диапазон по signMode', () => {
  assert.deepEqual(contributionBoundsFromRow(5, '+'), { minContribution: 0, maxContribution: 5 });
  assert.deepEqual(contributionBoundsFromRow(5, '-'), { minContribution: -5, maxContribution: 0 });
  assert.deepEqual(contributionBoundsFromRow(5, '+-'), { minContribution: -5, maxContribution: 5 });
});

test('normalizeProfileScore: нормализует raw в диапазон 0..100', () => {
  assert.equal(normalizeProfileScore(10, -10, 30), 50);
  assert.equal(normalizeProfileScore(-100, -10, 30), 0);
  assert.equal(normalizeProfileScore(100, -10, 30), 100);
  assert.equal(normalizeProfileScore(0, 0, 0), null);
});

test('evaluateProfileCriteria: ban_if_not_matches на remote_signals', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  const row = prefs.profileCriteria.rows.find((r) => r.id === 'remote_signals');
  assert.ok(row);
  row.enabled = true;
  row.ban = 'ban_if_not_matches';
  row.weight = 10;
  row.signMode = '+';
  const vac = { ...baseParsed, description: 'работа в офисе полный день', salaryRaw: '100000' };
  const r = evaluateProfileCriteria(vac, prefs);
  assert.equal(r.banned, true);
  assert.match(r.banReason, /удалённ/i);
  assert.equal(r.profileScore, null);
});

test('evaluateProfileCriteria: считает raw/min/max и profileScore 0..100', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  for (const row of prefs.profileCriteria.rows) {
    row.enabled = row.id === 'remote_signals' || row.id === 'format_office';
    row.weight = row.id === 'remote_signals' ? 60 : row.id === 'format_office' ? 40 : 0;
    row.ban = 'off';
    row.signMode = row.id === 'format_office' ? '-' : '+';
  }
  const r = evaluateProfileCriteria(baseParsed, prefs);
  assert.equal(r.banned, false);
  assert.equal(r.scoreDelta, 60);
  assert.equal(r.scoreRaw, 60);
  assert.equal(r.scoreMin, -40);
  assert.equal(r.scoreMax, 60);
  assert.equal(r.profileScore, 100);
  assert.equal(r.hasProfileScore, true);
});

test('evaluateProfileCriteria: отключенные строки не влияют на нормализацию', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  for (const row of prefs.profileCriteria.rows) {
    row.enabled = row.id === 'remote_signals';
    row.weight = row.id === 'remote_signals' ? 7 : 999;
    row.ban = 'off';
    row.signMode = '+';
  }
  const r = evaluateProfileCriteria(baseParsed, prefs);
  assert.equal(r.banned, false);
  assert.equal(r.scoreDelta, 7);
  assert.equal(r.scoreMin, 0);
  assert.equal(r.scoreMax, 7);
  assert.equal(r.profileScore, 100);
});

test('evaluateProfileCriteria: без активных весов profileScore = null', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  for (const row of prefs.profileCriteria.rows) {
    row.enabled = true;
    row.weight = 0;
    row.ban = 'off';
    row.signMode = '+';
  }
  const r = evaluateProfileCriteria(baseParsed, prefs);
  assert.equal(r.banned, false);
  assert.equal(r.scoreDelta, 0);
  assert.equal(r.profileScore, null);
});

test('criterionHit: geo_relocation ложно, если в тексте базовый город и релокация (иногородним)', () => {
  const prefs = structuredClone(basePrefs);
  prefs.scoringGeo = {
    ...basePrefs.scoringGeo,
    baseCity: 'Санкт-Петербург',
    relocationPatterns: ['релокаци'],
  };
  const vac = {
    ...baseParsed,
    description:
      'Где работать: Санкт-Петербург. Оплата: оклад + релокационный пакет для иногородних.',
  };
  assert.equal(criterionHit('geo_relocation', vac, prefs), false);
});

test('criterionHit: geo_relocation истина, если релокация без города кандидата в тексте', () => {
  const prefs = structuredClone(basePrefs);
  prefs.scoringGeo = {
    ...basePrefs.scoringGeo,
    baseCity: 'Санкт-Петербург',
    relocationPatterns: ['релокаци'],
  };
  const vac = {
    ...baseParsed,
    description:
      'Место работы: Москва, м. Улица 1905 года. Релокационный пакет для иногородних.',
  };
  assert.equal(criterionHit('geo_relocation', vac, prefs), true);
});

test('criterionHit: geo_relocation ложно при совпадении acceptableCities', () => {
  const prefs = structuredClone(basePrefs);
  prefs.scoringGeo = {
    baseCity: '',
    acceptableCities: ['Казань'],
    remoteIsAcceptable: true,
    penaltyUnknownLocation: 0,
    relocationPatterns: ['релокаци'],
  };
  const vac = {
    ...baseParsed,
    description: 'Офис в Казань. Предлагаем релокацию.',
  };
  assert.equal(criterionHit('geo_relocation', vac, prefs), false);
});

test('evaluateProfileCriteria: geo_relocation не банит при городе кандидата в тексте', () => {
  const prefs = structuredClone(basePrefs);
  prefs.scoringGeo = {
    ...basePrefs.scoringGeo,
    baseCity: 'Санкт-Петербург',
    relocationPatterns: ['релокаци'],
  };
  ensureProfileCriteria(prefs);
  for (const row of prefs.profileCriteria.rows) {
    row.enabled = row.id === 'geo_relocation';
    row.ban = row.id === 'geo_relocation' ? 'ban_if_matches' : 'off';
    row.weight = row.id === 'geo_relocation' ? 10 : 0;
    row.signMode = '-';
  }
  const vac = {
    ...baseParsed,
    description: 'Санкт-Петербург. релокационный пакет для иногородних.',
    salaryRaw: '100000',
  };
  const r = evaluateProfileCriteria(vac, prefs);
  assert.equal(r.banned, false);
});

test('criterionHit: text_whitelist по CSV и подстроке', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  const row = prefs.profileCriteria.rows.find((x) => x.id === 'text_whitelist');
  assert.ok(row);
  row.value = 'langchain, n8n';
  const vac = { ...baseParsed, description: 'Стек: LangChain и векторная БД' };
  assert.equal(criterionHit('text_whitelist', vac, prefs), true);
  row.value = '';
  assert.equal(criterionHit('text_whitelist', vac, prefs), false);
});

test('criterionHit: text_blacklist по CSV', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  const row = prefs.profileCriteria.rows.find((x) => x.id === 'text_blacklist');
  assert.ok(row);
  row.value = 'стартап, outsourc';
  const vac = { ...baseParsed, description: 'Мы небольшой стартап' };
  assert.equal(criterionHit('text_blacklist', vac, prefs), true);
  row.value = 'никогда';
  assert.equal(criterionHit('text_blacklist', vac, prefs), false);
});

test('criterionHit: белый и чёрный списки без учёта регистра (hay и токены)', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  const w = prefs.profileCriteria.rows.find((x) => x.id === 'text_whitelist');
  const b = prefs.profileCriteria.rows.find((x) => x.id === 'text_blacklist');
  assert.ok(w && b);
  w.value = 'N8N, БИТРИКС';
  const vacW = { ...baseParsed, description: 'Интеграции: n8n и битрикс24' };
  assert.equal(criterionHit('text_whitelist', vacW, prefs), true);
  b.value = 'OUTSOURCE, КОДИНГ';
  const vacB = { ...baseParsed, description: 'Ищем outsource на аутсорс' };
  assert.equal(criterionHit('text_blacklist', vacB, prefs), true);
});

test('evaluateProfileCriteria: ban_if_matches на text_blacklist', () => {
  const prefs = structuredClone(basePrefs);
  ensureProfileCriteria(prefs);
  for (const row of prefs.profileCriteria.rows) {
    row.enabled = row.id === 'text_blacklist';
    row.ban = row.id === 'text_blacklist' ? 'ban_if_matches' : 'off';
    row.weight = row.id === 'text_blacklist' ? 3 : 0;
    row.signMode = '-';
    if (row.id === 'text_blacklist') row.value = 'офис обязателен';
  }
  const vac = { ...baseParsed, description: 'Офис обязателен каждый день' };
  const r = evaluateProfileCriteria(vac, prefs);
  assert.equal(r.banned, true);
  assert.match(r.banReason, /Чёрный список слов/);
});

test('normalizeProfileRowsFromClient: сохраняет value для белого/чёрного списка', () => {
  const rows = PROFILE_CRITERIA_MANIFEST.map((m) => {
    const base = { id: m.id, enabled: true, weight: 0, signMode: '+', ban: 'off' };
    if (m.id === 'text_whitelist') base.value = ' a , beta ';
    if (m.id === 'text_blacklist') base.value = 'spam';
    return base;
  });
  const norm = normalizeProfileRowsFromClient(rows);
  assert.ok(norm);
  assert.equal(norm.find((x) => x.id === 'text_whitelist')?.value, 'a , beta');
  assert.equal(norm.find((x) => x.id === 'text_blacklist')?.value, 'spam');
  assert.equal(norm.find((x) => x.id === 'salary_meets_min')?.value, undefined);
});

test('normalizeProfileRowsFromClient: полный набор id', () => {
  const rows = PROFILE_CRITERIA_MANIFEST.map((m, i) => ({
    id: m.id,
    enabled: true,
    weight: i === 0 ? 3 : 0,
    signMode: '+',
    ban: 'off',
  }));
  const norm = normalizeProfileRowsFromClient(rows);
  assert.ok(norm);
  assert.equal(norm.length, PROFILE_CRITERIA_MANIFEST.length);
});

test('normalizeProfileRowsFromClient: отклоняет неполный список', () => {
  assert.equal(normalizeProfileRowsFromClient([{ id: 'remote_signals', enabled: true, weight: 1, signMode: '+', ban: 'off' }]), null);
});
