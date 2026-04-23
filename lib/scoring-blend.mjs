import { estimateMonthlyUsd } from './salary-parse.mjs';
import {
  classifyWorkFormatKind,
  inferWorkFormatScore,
  inferLocationScore,
  salarySoftBonusPoints,
  ruleFormatDeltaPoints,
} from './scoring-inference.mjs';
import {
  localYmdToday,
  publicationDeltaPoints,
  normalizePublicationTodayBonus,
} from './vacancy-published-date.mjs';
import { evaluateProfileCriteria } from './profile-criteria.mjs';

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x)));
}

function isFiniteScore(n) {
  if (n === null || n === undefined || n === '') return false;
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 && x <= 100;
}

/**
 * В первой версии итогового LLM score участвуют только semantic-оси vacancy / cvMatch.
 */
export function normalizeLlmWeights(prefs) {
  const w = prefs?.llmScoreWeights || {};
  let v = Number(w.vacancy);
  let c = Number(w.cvMatch);
  if (!Number.isFinite(v)) v = 0.35;
  if (!Number.isFinite(c)) c = 0.65;
  const sum = v + c;
  if (sum <= 0) return { v: 0.35, c: 0.65 };
  return { v: v / sum, c: c / sum };
}

/**
 * Доли финального blended score: LLM + профиль.
 */
export function normalizeOverallScoreShares(prefs) {
  const raw = prefs?.overallScoreWeights || prefs?.scoreBlendShares || prefs?.scoreOverallShares || {};
  let llm = Number(raw.llm);
  let profile = Number(raw.profile);
  if (!Number.isFinite(llm)) llm = 0.65;
  if (!Number.isFinite(profile)) profile = 0.35;
  const sum = llm + profile;
  if (sum <= 0) return { llm: 0.65, profile: 0.35 };
  return { llm: llm / sum, profile: profile / sum };
}

function resolveSemanticScores(llmParsed, prefs) {
  const legacyRaw = llmParsed.score;
  const svRaw = llmParsed.scoreVacancy;
  const scRaw = llmParsed.scoreCvMatch;
  const soRaw = llmParsed.scoreOverall;
  const hasVacancy = isFiniteScore(svRaw);
  const hasCvMatch = isFiniteScore(scRaw);
  const hasLegacy = isFiniteScore(legacyRaw) || isFiniteScore(soRaw);

  let scoreVacancy = clampScore(svRaw);
  let scoreCvMatch = clampScore(scRaw);

  if (!hasVacancy && !hasCvMatch && isFiniteScore(legacyRaw)) {
    const fallback = clampScore(legacyRaw);
    return {
      scoreVacancy: fallback,
      scoreCvMatch: fallback,
      scoreModelOverallHint: fallback,
      hasSemanticInput: true,
    };
  }

  const weights = normalizeLlmWeights(prefs);
  const scoreModelOverallHint = isFiniteScore(soRaw)
    ? clampScore(soRaw)
    : isFiniteScore(legacyRaw)
      ? clampScore(legacyRaw)
      : clampScore(weights.v * scoreVacancy + weights.c * scoreCvMatch);

  return {
    scoreVacancy,
    scoreCvMatch,
    scoreModelOverallHint,
    hasSemanticInput: hasVacancy || hasCvMatch || hasLegacy,
  };
}

function resolveAppliedOverallShares(baseShares, hasSemanticInput, hasProfileScore) {
  let llm = hasSemanticInput ? baseShares.llm : 0;
  let profile = hasProfileScore ? baseShares.profile : 0;
  const sum = llm + profile;
  if (sum > 0) return { llm: llm / sum, profile: profile / sum };
  if (hasSemanticInput) return { llm: 1, profile: 0 };
  if (hasProfileScore) return { llm: 0, profile: 1 };
  return { llm: 1, profile: 0 };
}

/**
 * @param {object} llmParsed — распарсенный JSON модели
 * @param {object} prefs
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, url?: string, address?: string, workConditionsLines?: string[], employment?: string, vacancyPublishedDate?: string|null }} vacancyCtx
 * @param {{ todayYmd?: string }} [options] — для тестов: зафиксировать «сегодня» (YYYY-MM-DD)
 */
export function finalizeVacancyScores(llmParsed, prefs, vacancyCtx, options = {}) {
  const llmWeights = normalizeLlmWeights(prefs);
  const overallShares = normalizeOverallScoreShares(prefs);
  const semantic = resolveSemanticScores(llmParsed, prefs);

  const scoreVacancy = semantic.scoreVacancy;
  const scoreCvMatch = semantic.scoreCvMatch;

  let scoreWorkFormat = clampScore(llmParsed.scoreWorkFormat);
  if (!isFiniteScore(llmParsed.scoreWorkFormat)) {
    scoreWorkFormat = inferWorkFormatScore(vacancyCtx, prefs);
  }

  let scoreLocation = clampScore(llmParsed.scoreLocation);
  if (!isFiniteScore(llmParsed.scoreLocation)) {
    scoreLocation = inferLocationScore(vacancyCtx, prefs);
  }

  const scoreLlm = clampScore(llmWeights.v * scoreVacancy + llmWeights.c * scoreCvMatch);

  const est = estimateMonthlyUsd(vacancyCtx.salaryRaw, prefs.rubPerUsd);
  let ruleDelta = 0;
  if (prefs.scoringWorkFormat?.useRuleBasedAdjustment) {
    ruleDelta += ruleFormatDeltaPoints(classifyWorkFormatKind(vacancyCtx, prefs), prefs);
  }
  const salaryDelta = salarySoftBonusPoints(est, prefs);
  const todayYmd = options.todayYmd ?? localYmdToday();
  const pubBonus = normalizePublicationTodayBonus(prefs.scoringPublicationTodayBonus);
  const publicationDelta = publicationDeltaPoints(
    vacancyCtx.vacancyPublishedDate,
    todayYmd,
    pubBonus
  );
  const profileEval = evaluateProfileCriteria(vacancyCtx, prefs, { todayYmd });
  const profileDelta = profileEval.banned ? 0 : profileEval.scoreDelta;
  const scoreProfile =
    profileEval.banned || profileEval.profileScore == null ? null : clampScore(profileEval.profileScore);
  const appliedShares = resolveAppliedOverallShares(
    overallShares,
    semantic.hasSemanticInput,
    scoreProfile != null
  );
  const scoreOverall = clampScore(
    scoreLlm * appliedShares.llm + (scoreProfile ?? 0) * appliedShares.profile
  );

  const scoreSortKey =
    scoreOverall + (est.ok ? Math.min(Number(est.maxUsd) || 0, 999_999) / 1e7 : 0);

  return {
    scoreVacancy,
    scoreCvMatch,
    scoreWorkFormat,
    scoreLocation,
    scoreLlm,
    scoreProfile,
    scoreOverall,
    scoreBlendedBeforeDelta: scoreLlm,
    scoreBlendedLlmOnly: scoreLlm,
    scoreLlmWeight: appliedShares.llm,
    scoreProfileWeight: appliedShares.profile,
    scoreModelOverallHint: semantic.scoreModelOverallHint,
    scoreRuleDelta: ruleDelta,
    scoreSalaryDelta: salaryDelta,
    scorePublicationDelta: publicationDelta,
    scoreProfileCriteriaDelta: profileDelta,
    scoreSortKey,
  };
}
