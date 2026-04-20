/**
 * Автоматизация по score: автоотклонение, авто-генерация черновика письма, батч по pending.
 */

import { loadPreferences, mergeReviewAutomation } from './preferences.mjs';
import { getVacancyRecord, updateVacancyRecord, loadQueue } from './store.mjs';
import { appendFeedback } from './feedback-context.mjs';
import { loadCvBundle } from './cv-load.mjs';
import { hasLlmApiKey } from './llm-chat.mjs';
import { generateCoverLetterVariants } from './cover-letter-openrouter.mjs';

/** @param {object} record */
export function getNumericCardScore(record) {
  const v = record?.scoreOverall ?? record?.geminiScore;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Без реальной LLM-оценки автоматику не применяем. */
export function isLlmScoreMissing(record) {
  return String(record?.llmProvider || '') === 'skipped';
}

/** @param {object} record */
export function hasPendingDraft(record) {
  const cl = record?.coverLetter;
  return cl?.status === 'pending' && Array.isArray(cl?.variants) && cl.variants.length > 0;
}

/** @param {object} record */
export function hasApprovedLetter(record) {
  const cl = record?.coverLetter;
  return cl?.status === 'approved' && String(cl?.approvedText || '').trim().length > 0;
}

/**
 * После добавления новой записи из harvest: автоотклонение, затем опционально черновик.
 * @param {string} recordId
 */
export async function applyReviewAutomationForNewRecord(recordId) {
  let prefs;
  try {
    prefs = loadPreferences();
  } catch {
    return { ok: false, reason: 'preferences' };
  }
  const ra = mergeReviewAutomation(prefs.reviewAutomation);

  const rec = getVacancyRecord(recordId);
  if (!rec || rec.status !== 'pending') return { ok: true, skipped: true };

  if (isLlmScoreMissing(rec)) return { ok: true, skipped: true, reason: 'no_llm_score' };

  const score = getNumericCardScore(rec);
  if (!Number.isFinite(score)) return { ok: true, skipped: true, reason: 'no_score' };

  const target = Number(ra.targetScore);
  if (!Number.isFinite(target)) return { ok: true, skipped: true };

  if (ra.autoRejectBelowTarget && score < target) {
    const ok = updateVacancyRecord(recordId, {
      status: 'rejected',
      feedbackReason: '',
    });
    if (ok) {
      appendFeedback({
        at: new Date().toISOString(),
        action: 'reject',
        reason: '',
        vacancyId: rec.vacancyId,
        title: rec.title,
        recordId,
        url: rec.url,
        source: 'reviewAutomation',
      });
    }
    return { ok: true, rejected: true };
  }

  const scopeOk =
    ra.coverLetterScope === 'new_only' || ra.coverLetterScope === 'new_and_pending';
  if (
    ra.autoCoverLetterAtOrAboveTarget &&
    score >= target &&
    scopeOk &&
    !hasPendingDraft(rec) &&
    !hasApprovedLetter(rec)
  ) {
    if (!hasLlmApiKey()) return { ok: true, skipped: true, reason: 'no_llm_key' };
    let cvBundle;
    try {
      cvBundle = await loadCvBundle();
    } catch {
      return { ok: false, reason: 'cv' };
    }
    if (!cvBundle.text.trim()) return { ok: true, skipped: true, reason: 'no_cv' };

    const n = Math.min(10, Math.max(1, Math.floor(Number(ra.coverLetterVariantCount) || 3)));
    try {
      const result = await generateCoverLetterVariants(rec, cvBundle, { variantCount: n });
      const now = new Date().toISOString();
      const coverLetter = {
        status: 'pending',
        variants: result.variants,
        approvedText: '',
        openRouterModel: result.providerModel || null,
        updatedAt: now,
      };
      updateVacancyRecord(recordId, { coverLetter });
      return { ok: true, coverLetterGenerated: true };
    } catch (e) {
      console.error('[review-automation] cover letter:', e?.message || e);
      return { ok: false, reason: e?.message || 'llm' };
    }
  }

  return { ok: true, skipped: true };
}

/**
 * Ручной проход по pending: автоотклонение при score < target (если включено), затем опционально черновики при score ≥ target.
 * LLM и CV нужны только если включён авточерновик — иначе отклонения по порогу работают без ключа.
 * @returns {Promise<{ ok: boolean, processed: number, generated: number, rejected: number, skipped: number, errors: { id: string, error: string }[] }>}
 */
export async function runPendingCoverLetterBatch() {
  let prefs;
  try {
    prefs = loadPreferences();
  } catch (e) {
    return {
      ok: false,
      processed: 0,
      generated: 0,
      rejected: 0,
      skipped: 0,
      errors: [{ id: '', error: e?.message || 'preferences' }],
    };
  }
  const ra = mergeReviewAutomation(prefs.reviewAutomation);
  const target = Number(ra.targetScore);
  if (!Number.isFinite(target)) {
    return {
      ok: false,
      processed: 0,
      generated: 0,
      rejected: 0,
      skipped: 0,
      errors: [{ id: '', error: 'targetScore' }],
    };
  }

  const wantCover = !!ra.autoCoverLetterAtOrAboveTarget;
  let cvBundle = { text: '' };
  if (wantCover) {
    if (!hasLlmApiKey()) {
      return {
        ok: false,
        processed: 0,
        generated: 0,
        rejected: 0,
        skipped: 0,
        errors: [{ id: '', error: 'no_llm_key' }],
      };
    }
    try {
      cvBundle = await loadCvBundle();
    } catch (e) {
      return {
        ok: false,
        processed: 0,
        generated: 0,
        rejected: 0,
        skipped: 0,
        errors: [{ id: '', error: e?.message || 'cv' }],
      };
    }
    if (!cvBundle.text.trim()) {
      return {
        ok: false,
        processed: 0,
        generated: 0,
        rejected: 0,
        skipped: 0,
        errors: [{ id: '', error: 'no_cv' }],
      };
    }
  }

  const n = Math.min(10, Math.max(1, Math.floor(Number(ra.coverLetterVariantCount) || 3)));
  const queue = loadQueue().filter((x) => x.status === 'pending');
  let processed = 0;
  let generated = 0;
  let rejected = 0;
  let skipped = 0;
  const errors = [];

  for (const row of queue) {
    const id = row.id;
    const rec = getVacancyRecord(id);
    if (!rec || rec.status !== 'pending') {
      skipped++;
      continue;
    }
    if (isLlmScoreMissing(rec)) {
      skipped++;
      continue;
    }
    const score = getNumericCardScore(rec);
    if (!Number.isFinite(score)) {
      skipped++;
      continue;
    }

    if (ra.autoRejectBelowTarget && score < target) {
      const ok = updateVacancyRecord(id, {
        status: 'rejected',
        feedbackReason: '',
      });
      if (ok) {
        appendFeedback({
          at: new Date().toISOString(),
          action: 'reject',
          reason: '',
          vacancyId: rec.vacancyId,
          title: rec.title,
          recordId: id,
          url: rec.url,
          source: 'reviewAutomation',
        });
        rejected++;
      } else {
        skipped++;
      }
      continue;
    }

    if (score < target) {
      skipped++;
      continue;
    }

    if (!wantCover) {
      skipped++;
      continue;
    }

    if (hasPendingDraft(rec) || hasApprovedLetter(rec)) {
      skipped++;
      continue;
    }

    processed++;
    try {
      const result = await generateCoverLetterVariants(rec, cvBundle, { variantCount: n });
      const now = new Date().toISOString();
      const fresh = getVacancyRecord(id);
      if (!fresh || fresh.status !== 'pending' || hasPendingDraft(fresh) || hasApprovedLetter(fresh)) {
        skipped++;
        continue;
      }
      const coverLetter = {
        status: 'pending',
        variants: result.variants,
        approvedText: '',
        openRouterModel: result.providerModel || null,
        updatedAt: now,
      };
      updateVacancyRecord(id, { coverLetter });
      generated++;
    } catch (e) {
      errors.push({ id, error: e?.message || String(e) });
    }
  }

  return { ok: true, processed, generated, rejected, skipped, errors };
}
