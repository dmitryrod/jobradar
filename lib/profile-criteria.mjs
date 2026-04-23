/**
 * Критерии профиля соискателя: hit / ban / вклад в дельту score.
 * Русские подписи — в манифесте; в preferences.json хранятся только id строк и числа.
 */

import { estimateMonthlyUsd } from './salary-parse.mjs';
import {
  buildScoringBlob,
  candidateHomeCityAppearsInVacancyBlob,
  classifyWorkFormatKind,
  inferLocationScore,
  normalizeCityToken,
} from './scoring-inference.mjs';
import {
  localYmdToday,
  publicationDeltaPoints,
  normalizePublicationTodayBonus,
} from './vacancy-published-date.mjs';

function includesAny(text, patterns) {
  const t = String(text).toLowerCase();
  return (patterns || []).some((p) => t.includes(String(p).toLowerCase()));
}

/** Критерии, у которых в `profileCriteria.rows` хранится текстовое поле `value` (списки через запятую). */
const PROFILE_ROW_VALUE_IDS = new Set(['text_whitelist', 'text_blacklist']);

function normalizeProfileRowValue(v) {
  return String(v ?? '').trim();
}

/**
 * Токены из поля value строки профиля: запятые, trim, пустые отброшены, lower-case для матча по hay.
 * @param {object} prefs
 * @param {string} rowId
 */
function commaTokensFromProfileRow(prefs, rowId) {
  const rows = prefs.profileCriteria?.rows;
  if (!Array.isArray(rows)) return [];
  const row = rows.find((r) => String(r?.id) === rowId);
  return normalizeProfileRowValue(row?.value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

function hayMatchesProfileCommaList(hayLower, prefs, rowId) {
  const tokens = commaTokensFromProfileRow(prefs, rowId);
  if (!tokens.length) return false;
  return tokens.some((t) => hayLower.includes(t));
}

/** @typedef {'off' | 'ban_if_matches' | 'ban_if_not_matches'} ProfileBanMode */
/** @typedef {'+' | '-' | '+-'} ProfileSignMode */

/** @type {ProfileBanMode[]} */
export const PROFILE_BAN_VALUES = ['off', 'ban_if_matches', 'ban_if_not_matches'];

/** @type {ProfileSignMode[]} */
export const PROFILE_SIGN_VALUES = ['+', '-', '+-'];

/**
 * Статический манифест для UI и движка.
 * @type {{ id: string, label: string, description: string, logicRef: string }[]}
 */
export const PROFILE_CRITERIA_MANIFEST = [
  {
    id: 'salary_meets_min',
    label: 'Зарплата не ниже минимума',
    description:
      'Совпадение: вилка зарплаты в тексте оценивается как не ниже minMonthlyUsd (USD/мес), по тем же правилам, что и жёсткий фильтр зарплаты. Колонка «Значение» в панели профиля редактирует minMonthlyUsd в preferences.json.',
    logicRef: 'passesSalary + minMonthlyUsd',
  },
  {
    id: 'salary_unknown',
    label: 'Зарплата не указана',
    description:
      'Совпадение: в карточке нет распознаваемой зарплаты (оценка estimateMonthlyUsd не удалась).',
    logicRef: '!estimateMonthlyUsd.ok',
  },
  {
    id: 'remote_signals',
    label: 'Есть признаки удалённой работы',
    description:
      'Совпадение: в тексте вакансии найдены подстроки из remotePositivePatterns (как для «удалёнки» в фильтрах).',
    logicRef: 'remotePositivePatterns',
  },
  {
    id: 'format_hybrid',
    label: 'Формат: гибрид',
    description: 'Совпадение: classifyWorkFormatKind === hybrid.',
    logicRef: 'classifyWorkFormatKind',
  },
  {
    id: 'format_office',
    label: 'Формат: офис',
    description: 'Совпадение: classifyWorkFormatKind === office.',
    logicRef: 'classifyWorkFormatKind',
  },
  {
    id: 'geo_base_city',
    label: 'Мой город в тексте',
    description:
      'Совпадение: в тексте есть базовый город из scoringGeo.baseCity (нормализация как в скоринге локации). Колонка «Значение» в панели профиля редактирует scoringGeo.baseCity в preferences.json.',
    logicRef: 'scoringGeo.baseCity',
  },
  {
    id: 'geo_acceptable_city',
    label: 'Подходящий город в тексте',
    description:
      'Совпадение: в тексте есть один из acceptableCities. Колонка «Значение» — города через запятую; сохраняется в scoringGeo.acceptableCities в preferences.json.',
    logicRef: 'scoringGeo.acceptableCities',
  },
  {
    id: 'geo_remote_compensates',
    label: 'Удалёнка (формат) приемлема',
    description:
      'Совпадение: формат remote и scoringGeo.remoteIsAcceptable !== false.',
    logicRef: 'remoteIsAcceptable + kind',
  },
  {
    id: 'geo_relocation',
    label: 'Релокация в описании',
    description:
      'Совпадение: в тексте есть подстрока из scoringGeo.relocationPatterns. Не считается совпадением, если в том же тексте уже есть базовый или допустимый город кандидата (формулировки про релокацию для иногородних).',
    logicRef: 'relocationPatterns + исключение при home city в тексте',
  },
  {
    id: 'geo_weak_location',
    label: 'Локация неясна / низкий матч',
    description:
      'Совпадение: inferLocationScore строго меньше 55 (эвристика «слабая локация» без дублирования penalty внутри).',
    logicRef: 'inferLocationScore < 55',
  },
  {
    id: 'pub_today',
    label: 'Опубликована сегодня',
    description:
      'Совпадение: дата публикации совпадает с «сегодня» (как бонус scoringPublicationTodayBonus).',
    logicRef: 'vacancyPublishedDate',
  },
  {
    id: 'text_whitelist',
    label: 'Белый список слов',
    description:
      'Совпадение: в тексте вакансии (как в скоринге локации) встречается хотя бы одна фраза из поля «Значение». Слова и фразы через запятую; регистр не важен; подстрока.',
    logicRef: 'value: CSV → substring any',
  },
  {
    id: 'text_blacklist',
    label: 'Чёрный список слов',
    description:
      'Совпадение: в тексте вакансии встречается хотя бы одна фраза из «Значение» (через запятую; подстрока; без учёта регистра). Можно назначить ban или минус по весу.',
    logicRef: 'value: CSV → substring any',
  },
];

const MANIFEST_BY_ID = Object.fromEntries(PROFILE_CRITERIA_MANIFEST.map((m) => [m.id, m]));

/**
 * @param {string} id
 * @param {object} parsed
 * @param {object} prefs
 * @param {{ todayYmd?: string }} [opt]
 */
export function criterionHit(id, parsed, prefs, opt = {}) {
  const rub = prefs.rubPerUsd || 98;
  const blob = buildScoringBlob(parsed);
  const hay = blob;
  const kind = classifyWorkFormatKind(parsed, prefs);
  const geo = prefs.scoringGeo || {};

  switch (id) {
    case 'salary_meets_min': {
      const est = estimateMonthlyUsd(parsed.salaryRaw, rub);
      if (!est.ok) return false;
      const minNeed = Number(prefs.minMonthlyUsd);
      const need = Number.isFinite(minNeed) ? minNeed : 1500;
      if (est.minUsd >= need) return true;
      if (est.maxUsd >= need) return true;
      return false;
    }
    case 'salary_unknown': {
      const est = estimateMonthlyUsd(parsed.salaryRaw, rub);
      return !est.ok;
    }
    case 'remote_signals':
      return includesAny(hay, prefs.remotePositivePatterns || []);
    case 'format_hybrid':
      return kind === 'hybrid';
    case 'format_office':
      return kind === 'office';
    case 'geo_base_city': {
      const base = normalizeCityToken(geo.baseCity || '');
      if (!base) return false;
      return hay.includes(base);
    }
    case 'geo_acceptable_city': {
      const acceptable = (geo.acceptableCities || []).map(normalizeCityToken).filter(Boolean);
      return acceptable.some((c) => c && hay.includes(c));
    }
    case 'geo_remote_compensates':
      return kind === 'remote' && geo.remoteIsAcceptable !== false;
    case 'geo_relocation': {
      if (!includesAny(hay, geo.relocationPatterns || [])) return false;
      if (candidateHomeCityAppearsInVacancyBlob(hay, prefs)) return false;
      return true;
    }
    case 'geo_weak_location': {
      const loc = inferLocationScore(parsed, prefs);
      return Number.isFinite(loc) && loc < 55;
    }
    case 'pub_today': {
      const todayYmd = opt.todayYmd ?? localYmdToday();
      const pubBonus = normalizePublicationTodayBonus(prefs.scoringPublicationTodayBonus);
      const pts = publicationDeltaPoints(parsed.vacancyPublishedDate ?? null, todayYmd, pubBonus);
      return pts > 0;
    }
    case 'text_whitelist':
      return hayMatchesProfileCommaList(hay, prefs, 'text_whitelist');
    case 'text_blacklist':
      return hayMatchesProfileCommaList(hay, prefs, 'text_blacklist');
    default:
      return false;
  }
}

function normalizeBan(v) {
  if (v === 'ban_if_matches' || v === 'ban_if_not_matches') return v;
  return 'off';
}

function normalizeSign(v) {
  if (v === '-' || v === '+-') return v;
  return '+';
}

/**
 * Дефолтные строки профиля: веса 0 → поведение скоринга как раньше, пока не настроишь сумму 100.
 * Ban для remote/salary наследуем из старых флагов.
 * @param {object} prefs
 */
export function buildDefaultProfileRows(prefs) {
  const requireRemote = !!prefs.requireRemote;
  const allowUnknown = prefs.allowUnknownSalary !== false;

  return [
    {
      id: 'salary_meets_min',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'salary_unknown',
      enabled: true,
      weight: 0,
      signMode: '-',
      ban: allowUnknown ? 'off' : 'ban_if_matches',
    },
    {
      id: 'remote_signals',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: requireRemote ? 'ban_if_not_matches' : 'off',
    },
    {
      id: 'format_hybrid',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'format_office',
      enabled: true,
      weight: 0,
      signMode: '-',
      ban: 'off',
    },
    {
      id: 'geo_base_city',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'geo_acceptable_city',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'geo_remote_compensates',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'geo_relocation',
      enabled: true,
      weight: 0,
      signMode: '-',
      ban: 'off',
    },
    {
      id: 'geo_weak_location',
      enabled: true,
      weight: 0,
      signMode: '-',
      ban: 'off',
    },
    {
      id: 'pub_today',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
    },
    {
      id: 'text_whitelist',
      enabled: true,
      weight: 0,
      signMode: '+',
      ban: 'off',
      value: '',
    },
    {
      id: 'text_blacklist',
      enabled: true,
      weight: 0,
      signMode: '-',
      ban: 'off',
      value: '',
    },
  ];
}

/**
 * Гарантирует наличие profileCriteria в объекте prefs (мутация).
 * @param {object} prefs
 */
export function ensureProfileCriteria(prefs) {
  if (!prefs || typeof prefs !== 'object') return;
  const defaults = buildDefaultProfileRows(prefs);
  const existing = prefs.profileCriteria;
  if (!existing || typeof existing !== 'object') {
    prefs.profileCriteria = { version: 1, rows: defaults };
    return;
  }
  if (!Array.isArray(existing.rows) || existing.rows.length === 0) {
    existing.version = 1;
    existing.rows = defaults;
    return;
  }
  const byId = Object.fromEntries(
    existing.rows.map((r) => [String(r?.id || ''), r]).filter(([k]) => k)
  );
  existing.rows = defaults.map((d) => {
    const cur = byId[d.id];
    if (!cur || typeof cur !== 'object') return { ...d };
    const merged = {
      id: d.id,
      enabled: cur.enabled !== false,
      weight: Math.max(0, Math.floor(Number(cur.weight) || 0)),
      signMode: normalizeSign(cur.signMode),
      ban: normalizeBan(cur.ban),
    };
    if (PROFILE_ROW_VALUE_IDS.has(d.id)) {
      merged.value = normalizeProfileRowValue(cur.value);
    }
    return merged;
  });
  if (typeof existing.version !== 'number') existing.version = 1;
}

/**
 * @param {number} w
 * @param {ProfileSignMode} signMode
 * @param {boolean} hit
 */
export function contributionFromRow(w, signMode, hit) {
  const W = Math.max(0, Number(w) || 0);
  if (W <= 0) return 0;
  const sm = normalizeSign(signMode);
  if (sm === '+') return hit ? W : 0;
  if (sm === '-') return hit ? -W : 0;
  return hit ? W : -W;
}

/**
 * @param {number} w
 * @param {ProfileSignMode} signMode
 */
export function contributionBoundsFromRow(w, signMode) {
  const W = Math.max(0, Number(w) || 0);
  if (W <= 0) return { minContribution: 0, maxContribution: 0 };
  const sm = normalizeSign(signMode);
  if (sm === '+') return { minContribution: 0, maxContribution: W };
  if (sm === '-') return { minContribution: -W, maxContribution: 0 };
  return { minContribution: -W, maxContribution: W };
}

/**
 * @param {number} raw
 * @param {number} min
 * @param {number} max
 */
export function normalizeProfileScore(raw, min, max) {
  const rawNum = Number(raw) || 0;
  const minNum = Number(min) || 0;
  const maxNum = Number(max) || 0;
  const denom = maxNum - minNum;
  if (!(denom > 0)) return null;
  const scaled = Math.round((100 * (rawNum - minNum)) / denom);
  return Math.max(0, Math.min(100, scaled));
}

/**
 * @param {object} parsed
 * @param {object} prefs
 * @param {{ todayYmd?: string }} [options]
 */
export function evaluateProfileCriteria(parsed, prefs, options = {}) {
  ensureProfileCriteria(prefs);
  const rows = prefs.profileCriteria?.rows || [];

  /** @type {{ id: string, hit: boolean, weight: number, signMode: string, ban: string, enabled: boolean, contribution: number, minContribution: number, maxContribution: number }[]} */
  const details = [];
  let scoreDelta = 0;
  let scoreMin = 0;
  let scoreMax = 0;

  for (const row of rows) {
    if (row.enabled === false) continue;
    const id = String(row.id || '');
    if (!MANIFEST_BY_ID[id]) continue;

    const hit = criterionHit(id, parsed, prefs, options);
    const ban = normalizeBan(row.ban);
    const weight = Math.max(0, Number(row.weight) || 0);
    const signMode = normalizeSign(row.signMode);
    const contribution = contributionFromRow(weight, signMode, hit);
    const { minContribution, maxContribution } = contributionBoundsFromRow(weight, signMode);

    details.push({
      id,
      hit,
      weight,
      signMode,
      ban,
      enabled: true,
      contribution,
      minContribution,
      maxContribution,
    });

    if (ban === 'ban_if_matches' && hit) {
      const label = MANIFEST_BY_ID[id].label;
      return {
        banned: true,
        banReason: `Профиль: «${label}» — условие выполнено (ban).`,
        banId: id,
        scoreDelta: 0,
        scoreRaw: 0,
        scoreMin: 0,
        scoreMax: 0,
        profileScore: null,
        hasProfileScore: false,
        details,
      };
    }
    if (ban === 'ban_if_not_matches' && !hit) {
      const label = MANIFEST_BY_ID[id].label;
      return {
        banned: true,
        banReason: `Профиль: «${label}» — условие не выполнено (ban).`,
        banId: id,
        scoreDelta: 0,
        scoreRaw: 0,
        scoreMin: 0,
        scoreMax: 0,
        profileScore: null,
        hasProfileScore: false,
        details,
      };
    }

    scoreDelta += contribution;
    scoreMin += minContribution;
    scoreMax += maxContribution;
  }

  return {
    banned: false,
    banReason: '',
    banId: null,
    scoreDelta,
    scoreRaw: scoreDelta,
    scoreMin,
    scoreMax,
    profileScore: normalizeProfileScore(scoreDelta, scoreMin, scoreMax),
    hasProfileScore: scoreMax > scoreMin,
    details,
  };
}

/**
 * Только дельта для finalizeVacancyScores (после проверки ban на harvest).
 */
export function profileCriteriaScoreDelta(parsed, prefs, options = {}) {
  const r = evaluateProfileCriteria(parsed, prefs, options);
  if (r.banned) return 0;
  return r.scoreDelta;
}

/**
 * Нормализованный score профиля 0..100 (после проверки ban на harvest).
 */
export function profileCriteriaScore(parsed, prefs, options = {}) {
  const r = evaluateProfileCriteria(parsed, prefs, options);
  if (r.banned) return 0;
  return r.profileScore;
}

/**
 * Валидация и нормализация строк из POST.
 * @param {unknown} rawRows
 */
export function normalizeProfileRowsFromClient(rawRows) {
  if (!Array.isArray(rawRows)) return null;
  const allowed = new Set(PROFILE_CRITERIA_MANIFEST.map((m) => m.id));
  const out = [];
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '');
    if (!allowed.has(id)) continue;
    const row = {
      id,
      enabled: r.enabled !== false,
      weight: Math.max(0, Math.min(1000, Math.floor(Number(r.weight) || 0))),
      signMode: normalizeSign(r.signMode),
      ban: normalizeBan(r.ban),
    };
    if (PROFILE_ROW_VALUE_IDS.has(id)) {
      row.value = normalizeProfileRowValue(r.value);
    }
    out.push(row);
  }
  if (out.length !== PROFILE_CRITERIA_MANIFEST.length) return null;
  const ids = new Set(out.map((x) => x.id));
  for (const m of PROFILE_CRITERIA_MANIFEST) {
    if (!ids.has(m.id)) return null;
  }
  return out;
}
