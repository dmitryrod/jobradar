import fs from 'fs';
import path from 'path';
import { PREFS_FILE } from './paths.mjs';

export const REVIEW_AUTOMATION_DEFAULTS = {
  targetScore: 70,
  autoRejectBelowTarget: false,
  autoCoverLetterAtOrAboveTarget: false,
  /** @type {'new_only' | 'new_and_pending'} */
  coverLetterScope: 'new_only',
  coverLetterVariantCount: 3,
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

export function loadPreferences() {
  const raw = fs.readFileSync(PREFS_FILE, 'utf8');
  const p = JSON.parse(raw);
  p.reviewAutomation = mergeReviewAutomation(p.reviewAutomation);
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
