import { estimateMonthlyUsd } from './salary-parse.mjs';
import {
  classifyWorkFormatKind,
  inferWorkFormatScore,
  inferLocationScore,
  salarySoftBonusPoints,
  ruleFormatDeltaPoints,
} from './scoring-inference.mjs';

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x)));
}

function isFiniteScore(n) {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 && x <= 100;
}

/**
 * Веса vacancy / cvMatch / workFormat / location — сумма нормализуется к 1.
 * Если workFormat и location не заданы (0), ведёт себя как прежняя пара vacancy+cvMatch.
 */
export function normalizeLlmWeights(prefs) {
  const w = prefs?.llmScoreWeights || {};
  let v = Number(w.vacancy);
  let c = Number(w.cvMatch);
  let wf = Number(w.workFormat);
  let loc = Number(w.location);
  if (!Number.isFinite(v)) v = 0.35;
  if (!Number.isFinite(c)) c = 0.65;
  if (!Number.isFinite(wf)) wf = 0;
  if (!Number.isFinite(loc)) loc = 0;
  const sum = v + c + wf + loc;
  if (sum <= 0) return { v: 0.35, c: 0.65, wf: 0, loc: 0 };
  return { v: v / sum, c: c / sum, wf: wf / sum, loc: loc / sum };
}

/**
 * Компоненты vacancy/cvMatch и legacy-итог (только веса пары v+c для фолбэка без wf/loc).
 */
function legacyComponentScores(llmParsed, prefs) {
  const legacy = Number(llmParsed.score);
  const svRaw = llmParsed.scoreVacancy;
  const scRaw = llmParsed.scoreCvMatch;
  const soRaw = llmParsed.scoreOverall;

  let scoreVacancy = clampScore(svRaw);
  let scoreCvMatch = clampScore(scRaw);

  if (
    !Number.isFinite(Number(svRaw)) &&
    !Number.isFinite(Number(scRaw)) &&
    Number.isFinite(legacy)
  ) {
    const o = clampScore(legacy);
    return { scoreVacancy: o, scoreCvMatch: o, legacyOverall: o };
  }

  let legacyOverall = clampScore(soRaw);
  const overallValid = Number.isFinite(Number(soRaw)) && Number(soRaw) >= 0 && Number(soRaw) <= 100;
  if (!overallValid) {
    const { v, c } = normalizeLlmWeights(prefs);
    const pairSum = v + c;
    const vn = pairSum > 1e-9 ? v / pairSum : 0.35;
    const cn = pairSum > 1e-9 ? c / pairSum : 0.65;
    legacyOverall = clampScore(vn * scoreVacancy + cn * scoreCvMatch);
  }

  return { scoreVacancy, scoreCvMatch, legacyOverall };
}

/**
 * @param {object} llmParsed — распарсенный JSON модели
 * @param {object} prefs
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, url?: string, address?: string, workConditionsLines?: string[], employment?: string }} vacancyCtx
 */
export function finalizeVacancyScores(llmParsed, prefs, vacancyCtx) {
  const weights = normalizeLlmWeights(prefs);
  const useExtended = weights.wf + weights.loc > 1e-9;

  const leg = legacyComponentScores(llmParsed, prefs);
  let scoreVacancy = leg.scoreVacancy;
  let scoreCvMatch = leg.scoreCvMatch;

  let scoreWorkFormat = clampScore(llmParsed.scoreWorkFormat);
  if (!isFiniteScore(llmParsed.scoreWorkFormat)) {
    scoreWorkFormat = inferWorkFormatScore(vacancyCtx, prefs);
  }

  let scoreLocation = clampScore(llmParsed.scoreLocation);
  if (!isFiniteScore(llmParsed.scoreLocation)) {
    scoreLocation = inferLocationScore(vacancyCtx, prefs);
  }

  let scoreOverall;
  let scoreBlendedLlm;

  if (useExtended) {
    scoreBlendedLlm = clampScore(
      weights.v * scoreVacancy +
        weights.c * scoreCvMatch +
        weights.wf * scoreWorkFormat +
        weights.loc * scoreLocation
    );
    scoreOverall = scoreBlendedLlm;
  } else {
    scoreBlendedLlm = leg.legacyOverall;
    scoreOverall = leg.legacyOverall;
  }

  const est = estimateMonthlyUsd(vacancyCtx.salaryRaw, prefs.rubPerUsd);
  let ruleDelta = 0;
  if (prefs.scoringWorkFormat?.useRuleBasedAdjustment) {
    ruleDelta += ruleFormatDeltaPoints(classifyWorkFormatKind(vacancyCtx, prefs), prefs);
  }
  const salaryDelta = salarySoftBonusPoints(est, prefs);
  const totalDelta = ruleDelta + salaryDelta;
  const beforeDelta = scoreOverall;
  scoreOverall = clampScore(scoreOverall + totalDelta);

  const scoreSortKey =
    scoreOverall + (est.ok ? Math.min(Number(est.maxUsd) || 0, 999_999) / 1e7 : 0);

  return {
    scoreVacancy,
    scoreCvMatch,
    scoreWorkFormat,
    scoreLocation,
    scoreOverall,
    scoreBlendedBeforeDelta: beforeDelta,
    scoreBlendedLlmOnly: scoreBlendedLlm,
    scoreRuleDelta: ruleDelta,
    scoreSalaryDelta: salaryDelta,
    scoreSortKey,
  };
}
