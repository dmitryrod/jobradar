import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLlmWeights, finalizeVacancyScores } from '../lib/scoring-blend.mjs';
import { inferLocationScore, classifyWorkFormatKind } from '../lib/scoring-inference.mjs';

const basePrefs = {
  remotePositivePatterns: ['удален', 'удалён', 'remote'],
  hybridPatterns: ['гибрид', 'hybrid'],
  officeOnlyPatterns: ['только офис'],
  scoringGeo: { baseCity: 'Казань', acceptableCities: [], remoteIsAcceptable: true },
  scoringWorkFormat: { prefer: 'remote_first' },
  scoringSalarySoft: { enabled: false },
  rubPerUsd: 98,
  minMonthlyUsd: 0,
};

test('normalizeLlmWeights: legacy two weights only', () => {
  const w = normalizeLlmWeights({
    llmScoreWeights: { vacancy: 0.35, cvMatch: 0.65, workFormat: 0, location: 0 },
  });
  assert.equal(w.v + w.c + w.wf + w.loc, 1);
  assert.ok(Math.abs(w.v - 0.35) < 1e-9);
  assert.ok(Math.abs(w.c - 0.65) < 1e-9);
});

test('normalizeLlmWeights: four weights', () => {
  const w = normalizeLlmWeights({
    llmScoreWeights: { vacancy: 0.25, cvMatch: 0.45, workFormat: 0.15, location: 0.15 },
  });
  assert.equal(w.v + w.c + w.wf + w.loc, 1);
  assert.ok(Math.abs(w.wf - 0.15) < 1e-9);
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

test('finalizeVacancyScores: extended blend changes overall vs two-axis only', () => {
  const llm = {
    scoreVacancy: 88,
    scoreCvMatch: 88,
    scoreWorkFormat: 50,
    scoreLocation: 40,
    scoreOverall: 88,
  };
  const ctx = {
    title: 'X',
    company: 'Y',
    salaryRaw: '200000-250000 руб.',
    description: 'офис в Москве',
    address: 'Москва',
    workConditionsLines: ['Офис'],
    employment: '',
  };
  const prefsExtended = {
    ...basePrefs,
    llmScoreWeights: { vacancy: 0.25, cvMatch: 0.25, workFormat: 0.25, location: 0.25 },
  };
  const fin = finalizeVacancyScores(llm, prefsExtended, ctx);
  assert.ok(fin.scoreOverall < 88);
  assert.equal(fin.scoreWorkFormat, 50);
  assert.ok(Number.isFinite(fin.scoreSortKey));
});

test('finalizeVacancyScores: zero wf/loc weights keeps legacy path magnitude', () => {
  const llm = { scoreVacancy: 80, scoreCvMatch: 90, scoreOverall: 87 };
  const ctx = { title: 't', company: 'c', salaryRaw: '', description: 'удалёнка', address: '', workConditionsLines: [] };
  const prefsLegacy = {
    ...basePrefs,
    llmScoreWeights: { vacancy: 0.4, cvMatch: 0.6, workFormat: 0, location: 0 },
  };
  const fin = finalizeVacancyScores(llm, prefsLegacy, ctx);
  assert.equal(fin.scoreOverall, 87);
  assert.ok(Number.isFinite(fin.scoreWorkFormat));
});
