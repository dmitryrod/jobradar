import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLlmWeights,
  normalizeOverallScoreShares,
  finalizeVacancyScores,
} from '../lib/scoring-blend.mjs';
import { inferLocationScore, classifyWorkFormatKind } from '../lib/scoring-inference.mjs';

const basePrefs = {
  remotePositivePatterns: ['удален', 'удалён', 'remote'],
  hybridPatterns: ['гибрид', 'hybrid'],
  officeOnlyPatterns: ['только офис'],
  scoringGeo: { baseCity: 'Казань', acceptableCities: [], remoteIsAcceptable: true },
  scoringWorkFormat: { prefer: 'remote_first' },
  scoringSalarySoft: { enabled: false },
  scoringPublicationTodayBonus: 5,
  rubPerUsd: 98,
  minMonthlyUsd: 0,
};

test('normalizeLlmWeights: legacy two weights only', () => {
  const w = normalizeLlmWeights({
    llmScoreWeights: { vacancy: 0.35, cvMatch: 0.65, workFormat: 0, location: 0 },
  });
  assert.equal(w.v + w.c, 1);
  assert.ok(Math.abs(w.v - 0.35) < 1e-9);
  assert.ok(Math.abs(w.c - 0.65) < 1e-9);
});

test('normalizeLlmWeights: игнорирует workFormat/location в semantic LLM score', () => {
  const w = normalizeLlmWeights({
    llmScoreWeights: { vacancy: 0.25, cvMatch: 0.45, workFormat: 0.15, location: 0.15 },
  });
  assert.equal(w.v + w.c, 1);
  assert.ok(Math.abs(w.v - 0.3571428571) < 1e-9);
  assert.ok(Math.abs(w.c - 0.6428571429) < 1e-9);
});

test('normalizeOverallScoreShares: default 65/35 и нормализация кастомных долей', () => {
  assert.deepEqual(normalizeOverallScoreShares({}), { llm: 0.65, profile: 0.35 });
  const s = normalizeOverallScoreShares({ scoreBlendShares: { llm: 2, profile: 1 } });
  assert.ok(Math.abs(s.llm - 2 / 3) < 1e-9);
  assert.ok(Math.abs(s.profile - 1 / 3) < 1e-9);
});

test('classifyWorkFormatKind: remote from text', () => {
  const k = classifyWorkFormatKind(
    { description: 'Полная удалённая работа', workConditionsLines: [] },
    basePrefs
  );
  assert.equal(k, 'remote');
});

test('inferLocationScore: remote vacancy high', () => {
  const s = inferLocationScore(
    { description: 'remote work from anywhere', title: 'Dev' },
    basePrefs
  );
  assert.ok(s >= 90);
});

test('finalizeVacancyScores: scoreOverall = weighted average(llmScore, profileScore)', () => {
  const llm = {
    scoreVacancy: 80,
    scoreCvMatch: 60,
    scoreWorkFormat: 50,
    scoreLocation: 40,
    scoreOverall: 73,
  };
  const ctx = {
    title: 'X',
    company: 'Y',
    salaryRaw: '',
    description: 'полная удалёнка',
    address: '',
    workConditionsLines: ['Удаленная работа'],
    employment: '',
  };
  const prefs = {
    ...basePrefs,
    llmScoreWeights: { vacancy: 0.5, cvMatch: 0.5, workFormat: 0.1, location: 0.1 },
    scoreBlendShares: { llm: 0.6, profile: 0.4 },
    profileCriteria: {
      version: 1,
      rows: [
        { id: 'salary_meets_min', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'salary_unknown', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'remote_signals', enabled: true, weight: 100, signMode: '+', ban: 'off' },
        { id: 'format_hybrid', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'format_office', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_base_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_acceptable_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_remote_compensates', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_relocation', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_weak_location', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'pub_today', enabled: false, weight: 0, signMode: '+', ban: 'off' },
      ],
    },
  };
  const fin = finalizeVacancyScores(llm, prefs, ctx);
  assert.equal(fin.scoreLlm, 70);
  assert.equal(fin.scoreProfile, 100);
  assert.equal(fin.scoreOverall, 82);
  assert.equal(fin.scoreWorkFormat, 50);
  assert.equal(fin.scoreBlendedBeforeDelta, 70);
  assert.equal(fin.scoreLlmWeight, 0.6);
  assert.equal(fin.scoreProfileWeight, 0.4);
});

test('finalizeVacancyScores: raw rule/salary/publication delta не влияют на итог', () => {
  const llm = { scoreVacancy: 80, scoreCvMatch: 60, scoreOverall: 73 };
  const ctx = {
    title: 't',
    company: 'c',
    salaryRaw: '500000 руб.',
    description: 'только офис в Казани',
    address: 'Казань',
    workConditionsLines: ['Только офис'],
    vacancyPublishedDate: '2030-06-15',
  };
  const prefs = {
    ...basePrefs,
    llmScoreWeights: { vacancy: 0.5, cvMatch: 0.5, workFormat: 0.2, location: 0.2 },
    scoreBlendShares: { llm: 0.6, profile: 0.4 },
    scoringWorkFormat: {
      prefer: 'remote_first',
      remoteBonus: 5,
      hybridBonus: 1,
      officePenalty: 20,
      useRuleBasedAdjustment: true,
    },
    scoringSalarySoft: { enabled: true, maxBonusPoints: 3, referenceUsd: 2000 },
    scoringPublicationTodayBonus: 7,
    profileCriteria: {
      version: 1,
      rows: [
        { id: 'salary_meets_min', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'salary_unknown', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'remote_signals', enabled: true, weight: 100, signMode: '+', ban: 'off' },
        { id: 'format_hybrid', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'format_office', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_base_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_acceptable_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_remote_compensates', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_relocation', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_weak_location', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'pub_today', enabled: false, weight: 0, signMode: '+', ban: 'off' },
      ],
    },
  };
  const fin = finalizeVacancyScores(llm, prefs, ctx, { todayYmd: '2030-06-15' });
  assert.equal(fin.scoreLlm, 70);
  assert.equal(fin.scoreProfile, 0);
  assert.equal(fin.scoreOverall, 42);
  assert.notEqual(fin.scoreRuleDelta, 0);
  assert.notEqual(fin.scoreSalaryDelta, 0);
  assert.equal(fin.scorePublicationDelta, 7);
});

test('finalizeVacancyScores: sort key остаётся scoreOverall + salary tiebreaker', () => {
  const llm = { scoreVacancy: 80, scoreCvMatch: 60, scoreOverall: 73 };
  const ctx = {
    title: 't',
    company: 'c',
    salaryRaw: '200000-250000 руб.',
    description: 'удалёнка',
    address: '',
    workConditionsLines: [],
  };
  const fin = finalizeVacancyScores(llm, basePrefs, ctx);
  assert.equal(fin.scoreLlm, 67);
  assert.equal(fin.scoreProfile, null);
  assert.equal(fin.scoreOverall, 67);
  assert.equal(fin.scoreLlmWeight, 1);
  assert.equal(fin.scoreProfileWeight, 0);
  assert.ok(fin.scoreSortKey > fin.scoreOverall);
  assert.ok(Math.abs(fin.scoreSortKey - (fin.scoreOverall + 2551 / 1e7)) < 1e-9);
});

test('finalizeVacancyScores: без LLM и с активным профилем итог берётся из profileScore', () => {
  const ctx = {
    title: 't',
    company: 'c',
    salaryRaw: '',
    description: 'удалёнка',
    address: '',
    workConditionsLines: ['Удаленная работа'],
  };
  const prefs = {
    ...basePrefs,
    profileCriteria: {
      version: 1,
      rows: [
        { id: 'salary_meets_min', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'salary_unknown', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'remote_signals', enabled: true, weight: 100, signMode: '+', ban: 'off' },
        { id: 'format_hybrid', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'format_office', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_base_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_acceptable_city', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_remote_compensates', enabled: false, weight: 0, signMode: '+', ban: 'off' },
        { id: 'geo_relocation', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'geo_weak_location', enabled: false, weight: 0, signMode: '-', ban: 'off' },
        { id: 'pub_today', enabled: false, weight: 0, signMode: '+', ban: 'off' },
      ],
    },
  };
  const fin = finalizeVacancyScores(
    { scoreVacancy: null, scoreCvMatch: null, scoreOverall: null, score: null },
    prefs,
    ctx
  );
  assert.equal(fin.scoreLlm, 0);
  assert.equal(fin.scoreProfile, 100);
  assert.equal(fin.scoreOverall, 100);
  assert.equal(fin.scoreLlmWeight, 0);
  assert.equal(fin.scoreProfileWeight, 1);
});
