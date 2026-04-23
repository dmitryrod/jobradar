import fs from 'fs';
import path from 'path';
import { PREFS_FILE } from './paths.mjs';
import { ensureProfileCriteria } from './profile-criteria.mjs';

export const REVIEW_AUTOMATION_DEFAULTS = {
  targetScore: 70,
  autoRejectBelowTarget: false,
  autoCoverLetterAtOrAboveTarget: false,
  /** @type {'new_only' | 'new_and_pending'} */
  coverLetterScope: 'new_only',
  coverLetterVariantCount: 3,
};

export const OVERALL_SCORE_WEIGHTS_DEFAULTS = {
  llm: 0.65,
  profile: 0.35,
};

/**
 * @param {unknown} raw
 * @returns {typeof REVIEW_AUTOMATION_DEFAULTS}
 */
export function mergeReviewAutomation(raw) {
  const base = { ...REVIEW_AUTOMATION_DEFAULTS };
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const ts = Number(o.targetScore);
  if (Number.isFinite(ts)) base.targetScore = ts;

  if (typeof o.autoRejectBelowTarget === 'boolean') base.autoRejectBelowTarget = o.autoRejectBelowTarget;
  if (typeof o.autoCoverLetterAtOrAboveTarget === 'boolean') {
    base.autoCoverLetterAtOrAboveTarget = o.autoCoverLetterAtOrAboveTarget;
  }

  const scope = o.coverLetterScope;
  if (scope === 'new_only' || scope === 'new_and_pending') base.coverLetterScope = scope;

  const vc = Number(o.coverLetterVariantCount);
  if (Number.isFinite(vc)) base.coverLetterVariantCount = Math.min(10, Math.max(1, Math.floor(vc)));

  return base;
}

/**
 * @param {unknown} raw
 * @returns {typeof OVERALL_SCORE_WEIGHTS_DEFAULTS}
 */
export function mergeOverallScoreWeights(raw) {
  const base = { ...OVERALL_SCORE_WEIGHTS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const llm = Number(o.llm);
  const profile = Number(o.profile);
  if (Number.isFinite(llm)) base.llm = llm;
  if (Number.isFinite(profile)) base.profile = profile;
  const sum = base.llm + base.profile;
  if (!(sum > 0)) return { ...OVERALL_SCORE_WEIGHTS_DEFAULTS };
  return { llm: base.llm / sum, profile: base.profile / sum };
}

/**
 * Нормализация списка городов из CSV или массива (дашборд / API).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeAcceptableCitiesInput(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Частичный PATCH из дашборда: `minMonthlyUsd`, `scoringGeo.baseCity`, `scoringGeo.acceptableCities`.
 * Мутирует `prefs`; остальные ключи `scoringGeo` не трогает.
 * @param {object} prefs
 * @param {object} patch
 */
export function applyDashboardPreferencesPatch(prefs, patch) {
  if (!prefs || typeof prefs !== 'object' || !patch || typeof patch !== 'object') return;

  if ('minMonthlyUsd' in patch) {
    const n = Number(patch.minMonthlyUsd);
    prefs.minMonthlyUsd = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  const sg = patch.scoringGeo;
  if (sg && typeof sg === 'object') {
    if (!prefs.scoringGeo || typeof prefs.scoringGeo !== 'object') prefs.scoringGeo = {};
    if ('baseCity' in sg) {
      prefs.scoringGeo.baseCity = String(sg.baseCity ?? '').trim();
    }
    if ('acceptableCities' in sg) {
      prefs.scoringGeo.acceptableCities = normalizeAcceptableCitiesInput(sg.acceptableCities);
    }
  }
}

export function loadPreferences() {
  const raw = fs.readFileSync(PREFS_FILE, 'utf8');
  const p = JSON.parse(raw);
  p.reviewAutomation = mergeReviewAutomation(p.reviewAutomation);
  p.overallScoreWeights = mergeOverallScoreWeights(p.overallScoreWeights);
  ensureProfileCriteria(p);
  return p;
}

/**
 * @param {object} prefs — полный объект preferences (как после loadPreferences без merge, но обычно с reviewAutomation)
 */
export function savePreferences(prefs) {
  const tmp = `${PREFS_FILE}.tmp`;
  fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(prefs, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, PREFS_FILE);
}
