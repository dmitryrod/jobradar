function includesAny(text, patterns) {
  const t = String(text).toLowerCase();
  return (patterns || []).some((p) => t.includes(String(p).toLowerCase()));
}

/** @param {string} s */
export function normalizeCityToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u0451/g, 'е')
    .replace(/^г\.\s*/i, '')
    .trim();
}

/**
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, address?: string, workConditionsLines?: string[], employment?: string }} parsed
 */
export function buildScoringBlob(parsed) {
  const wc = Array.isArray(parsed.workConditionsLines) ? parsed.workConditionsLines.join('\n') : '';
  return [
    parsed.title,
    parsed.company,
    parsed.salaryRaw,
    parsed.employment,
    parsed.address,
    wc,
    parsed.description,
  ]
    .join('\n')
    .toLowerCase();
}

/**
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, address?: string, workConditionsLines?: string[], employment?: string }} parsed
 * @param {object} prefs
 * @returns {'remote' | 'hybrid' | 'office' | 'unknown'}
 */
export function classifyWorkFormatKind(parsed, prefs) {
  const blob = buildScoringBlob(parsed);
  const pos = includesAny(blob, prefs.remotePositivePatterns || []);
  const hyb = includesAny(blob, prefs.hybridPatterns || []);
  const off = includesAny(blob, prefs.officeOnlyPatterns || []);

  if (hyb && pos) return 'remote';
  if (hyb) return 'hybrid';
  if (pos) return 'remote';
  if (off && !pos) return 'office';
  if (/\bофис\b/.test(blob) && !pos && !hyb) return 'office';
  return 'unknown';
}

const PRESET_SCORES = {
  remote_first: { remote: 100, hybrid: 82, office: 55, unknown: 70 },
  remote_only: { remote: 100, hybrid: 48, office: 22, unknown: 42 },
  hybrid_ok: { remote: 98, hybrid: 94, office: 58, unknown: 72 },
  any: { remote: 92, hybrid: 90, office: 86, unknown: 84 },
};

/**
 * Детерминированная оценка 0–100: насколько формат работы подходит под prefer.
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, address?: string, workConditionsLines?: string[], employment?: string }} parsed
 */
export function inferWorkFormatScore(parsed, prefs) {
  const kind = classifyWorkFormatKind(parsed, prefs);
  const prefer = String(prefs.scoringWorkFormat?.prefer || 'remote_first').toLowerCase();
  const table = PRESET_SCORES[prefer] || PRESET_SCORES.remote_first;
  return table[kind] ?? 70;
}

/**
 * @param {{ title?: string, company?: string, salaryRaw?: string, description?: string, address?: string, workConditionsLines?: string[], employment?: string }} parsed
 */
export function inferLocationScore(parsed, prefs) {
  const geo = prefs.scoringGeo || {};
  const kind = classifyWorkFormatKind(parsed, prefs);
  if (kind === 'remote' && geo.remoteIsAcceptable !== false) {
    return 96;
  }

  const base = normalizeCityToken(geo.baseCity || '');
  const acceptable = (geo.acceptableCities || []).map(normalizeCityToken).filter(Boolean);
  if (!base && acceptable.length === 0) {
    return 78;
  }

  const hay = buildScoringBlob(parsed);
  let best = 38;

  if (base) {
    if (hay.includes(base)) best = 100;
    if (base === 'москва' && (hay.includes('мск') || hay.includes('moscow'))) best = Math.max(best, 98);
    if (
      (base === 'санкт-петербург' || base === 'спб') &&
      (hay.includes('спб') || hay.includes('петербург') || hay.includes('saint petersburg'))
    ) {
      best = Math.max(best, 96);
    }
  }
  for (const c of acceptable) {
    if (c && hay.includes(c)) best = Math.max(best, 94);
  }

  const reloc = includesAny(hay, geo.relocationPatterns || ['релокаци', 'relocat', 'релокация']);
  if (reloc) best = Math.min(100, best + 12);

  const pen = Number(geo.penaltyUnknownLocation);
  if (Number.isFinite(pen) && pen !== 0 && best < 55) {
    best = Math.max(0, Math.min(100, best + pen));
  }

  return Math.min(100, Math.max(0, Math.round(best)));
}

/**
 * Мягкий бонус к итоговому баллу (целые пункты), без смены жёсткого фильтра по зарплате.
 * @param {{ ok: boolean, minUsd?: number, maxUsd?: number }} estimate
 */
export function salarySoftBonusPoints(estimate, prefs) {
  const s = prefs.scoringSalarySoft;
  if (!s?.enabled || !estimate?.ok) return 0;
  const maxB = Math.min(25, Math.max(0, Number(s.maxBonusPoints) || 0));
  if (maxB <= 0) return 0;
  const ref = Math.max(1, Number(s.referenceUsd) || 4000);
  const minNeed = Math.max(0, Number(prefs.minMonthlyUsd) || 0);
  const upper = Math.max(Number(estimate.maxUsd) || 0, Number(estimate.minUsd) || 0);
  if (upper <= minNeed) return 0;
  const span = Math.max(1, ref - minNeed);
  const ratio = (upper - minNeed) / span;
  const raw = maxB * (1 - Math.exp(-Math.max(0, ratio)));
  return Math.round(Math.min(maxB, raw));
}

/**
 * Доп. пункты из правил формата (если включено; может суммироваться с LLM-осями — держи бонусы 0 по умолчанию).
 * @param {'remote' | 'hybrid' | 'office' | 'unknown'} kind
 */
export function ruleFormatDeltaPoints(kind, prefs) {
  const sf = prefs.scoringWorkFormat || {};
  if (!sf.useRuleBasedAdjustment) return 0;
  let d = 0;
  if (kind === 'remote') d += Number(sf.remoteBonus) || 0;
  if (kind === 'hybrid') d += Number(sf.hybridBonus) || 0;
  if (kind === 'office') d += Number(sf.officePenalty) || 0;
  return Math.round(d);
}
