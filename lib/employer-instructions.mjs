import fs from 'fs';
import path from 'path';
import { ROOT } from './paths.mjs';

/** Пустое состояние инструкций работодателя (совместимо со старыми записями очереди). */
export const EMPTY_EMPLOYER_INSTRUCTIONS = Object.freeze({
  detected: false,
  confidence: 0,
  strictness: 'none',
  responseFormat: 'plain_short',
  lengthPolicy: 'normal',
  mustStartWith: '',
  mustMention: [],
  mustAnswerQuestions: [],
  requiredArtifacts: [],
  screeningChecklist: [],
  rawFragments: [],
  notesForGenerator: '',
});

const STRICTNESS = new Set(['none', 'desired', 'mandatory']);
const LENGTH_POLICY = new Set(['short', 'normal', 'extended_if_needed']);
const RESPONSE_FORMAT = new Set([
  'plain_short',
  'plain_extended',
  'question_answer',
  'checklist',
  'resume_only',
  'mandatory_phrase_first',
]);
const COMPLEXITY = new Set(['none', 'low', 'medium', 'high']);
const INSTRUCTION_TRIGGER_RE =
  /как откликнуться|как подать заявку|в сопроводительном письме|сопроводительн|ответьте|ответь на|расскажите|приложите|github|gitlab|портфолио|portfolio|telegram|телеграм|начните со слов|будем рады познакомиться|ссылк[аи]? на проект/gi;

function asTrimmedString(v) {
  return v == null ? '' : String(v).trim();
}

function isValidStartWithPhrase(s) {
  const str = asTrimmedString(s);
  if (str.length < 2) return '';
  if (!/[a-zа-яё0-9]/i.test(str)) return '';
  return str;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asTrimmedString(x)).filter(Boolean);
}

/**
 * Нормализует объект employerInstructions из ответа LLM.
 * @param {unknown} raw
 */
export function normalizeEmployerInstructions(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_EMPLOYER_INSTRUCTIONS };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);

  const detected = o.detected === true;
  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) {
    confidence = detected ? 0.55 : 0;
  }
  confidence = Math.min(1, Math.max(0, confidence));

  const strictness = STRICTNESS.has(String(o.strictness)) ? String(o.strictness) : 'none';
  const responseFormat = RESPONSE_FORMAT.has(String(o.responseFormat))
    ? String(o.responseFormat)
    : 'plain_short';
  const lengthPolicy = LENGTH_POLICY.has(String(o.lengthPolicy))
    ? String(o.lengthPolicy)
    : 'normal';

  const requiredArtifacts = Array.isArray(o.requiredArtifacts)
    ? o.requiredArtifacts
        .map((a) => {
          if (!a || typeof a !== 'object') return null;
          const ao = /** @type {Record<string, unknown>} */ (a);
          const type = asTrimmedString(ao.type);
          const required = ao.required === true;
          if (!type) return null;
          return { type, required };
        })
        .filter(Boolean)
    : [];

  return {
    detected,
    confidence,
    strictness,
    responseFormat,
    lengthPolicy,
    mustStartWith: isValidStartWithPhrase(o.mustStartWith),
    mustMention: asStringArray(o.mustMention),
    mustAnswerQuestions: asStringArray(o.mustAnswerQuestions),
    requiredArtifacts,
    screeningChecklist: asStringArray(o.screeningChecklist),
    rawFragments: asStringArray(o.rawFragments),
    notesForGenerator: asTrimmedString(o.notesForGenerator),
  };
}

export function normalizeInstructionComplexity(raw) {
  const s = String(raw || 'none').toLowerCase();
  return COMPLEXITY.has(s) ? s : 'none';
}

/**
 * Есть ли смысл считать, что в описании обнаружены инструкции к отклику.
 * @param {ReturnType<typeof normalizeEmployerInstructions>} ei
 */
export function computeHasEmployerInstructions(ei) {
  if (!ei || !ei.detected) return false;
  if (ei.confidence < 0.35) return false;
  return true;
}

/**
 * Дополняет поле risks текстом про соответствие инструкциям (план: instructionFitRisk отдельно от score).
 * @param {string} baseRisks
 * @param {string} instructionFitRisk
 * @param {string} instructionComplexity
 */
export function mergeInstructionIntoRisks(baseRisks, instructionFitRisk, instructionComplexity) {
  const parts = [];
  const br = asTrimmedString(baseRisks);
  if (br) parts.push(br);
  const ifr = asTrimmedString(instructionFitRisk);
  if (ifr) parts.push(`По инструкциям к отклику: ${ifr}`);
  const ic = normalizeInstructionComplexity(instructionComplexity);
  if (ic !== 'none' && ic !== 'low') {
    parts.push(`Сложность требований в письме: ${ic}.`);
  }
  return parts.join('\n\n').trim();
}

/**
 * Для генерации письма: если модель нашла инструкции, берём полное описание (хвост не теряется).
 * @param {{ descriptionForLlm?: string, descriptionPreview?: string, vacancyDescriptionFull?: string, employerInstructions?: object, hasEmployerInstructions?: boolean }} record
 */
export function buildVacancyDescriptionForCoverLetter(record) {
  const full = asTrimmedString(record?.vacancyDescriptionFull);
  const short =
    asTrimmedString(record?.descriptionForLlm) ||
    asTrimmedString(record?.descriptionPreview) ||
    full.slice(0, 6000);

  const ei = record?.employerInstructions;
  const needFull =
    record?.hasEmployerInstructions === true ||
    (ei && ei.detected === true && Number(ei.confidence) >= 0.35);

  if (needFull && full.length > 0) {
    return full.slice(0, 14_000);
  }
  return short.slice(0, 8000);
}

function collectInstructionSnippets(text, { windowChars = 320, maxSnippets = 4 } = {}) {
  const src = asTrimmedString(text);
  if (!src) return [];

  const out = [];
  const seen = new Set();
  let match;
  while ((match = INSTRUCTION_TRIGGER_RE.exec(src)) && out.length < maxSnippets) {
    const idx = match.index || 0;
    const start = Math.max(0, idx - windowChars);
    const end = Math.min(src.length, idx + match[0].length + windowChars);
    const snippet = src
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();
    if (!snippet) continue;
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snippet);
  }
  return out;
}

function uniqueStringArray(items) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const v = asTrimmedString(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function uniqueArtifacts(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const type = asTrimmedString(item.type).toLowerCase();
    if (!type) continue;
    const prev = map.get(type);
    map.set(type, { type, required: !!item.required || !!prev?.required });
  }
  return Array.from(map.values());
}

/**
 * Для extraction инструкций в score: даём не только начало описания, но и хвост/окна вокруг триггеров.
 * Это снижает шанс потерять блок "как откликнуться" в длинной вакансии.
 * @param {{ description?: string, vacancyDescriptionFull?: string }} vacancy
 */
export function buildVacancyDescriptionForScoring(vacancy) {
  const full =
    asTrimmedString(vacancy?.vacancyDescriptionFull) || asTrimmedString(vacancy?.description);
  if (!full) return '';
  if (full.length <= 12_000) return full;

  const head = full.slice(0, 5500);
  const tail = full.slice(-3500);
  const snippets = collectInstructionSnippets(full);

  return [
    'НАЧАЛО ОПИСАНИЯ:',
    head,
    snippets.length ? `ВОЗМОЖНЫЕ ИНСТРУКЦИИ К ОТКЛИКУ:\n${snippets.join('\n...\n')}` : '',
    'ХВОСТ ОПИСАНИЯ:',
    tail,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 14_000);
}

/**
 * Fallback-эвристика для старых/непересчитанных карточек: достаём инструкции прямо из текста вакансии.
 * @param {string} text
 */
export function inferEmployerInstructionsFromText(text) {
  const src = asTrimmedString(text)
    .replace(/\s+/g, ' ')
    .replace(/([?.!])(?=[A-ZА-ЯЁ])/g, '$1 ');
  if (!src) return { ...EMPTY_EMPLOYER_INSTRUCTIONS };

  const anchorMatch = src.match(/как откликнуться|в сопроводительном письме|ответьте|расскажите|приложите/i);
  const anchor = anchorMatch ? src.toLowerCase().indexOf(anchorMatch[0].toLowerCase()) : -1;
  const segment = (anchor >= 0 ? src.slice(anchor, anchor + 1800) : src.slice(0, 1800)).trim();
  const hasApplyHints =
    /(как откликнуться|в сопроводительном письме|ответьте|расскажите|приложите|github|портфолио|portfolio|telegram|телеграм)/i.test(
      segment
    );
  if (!hasApplyHints) return { ...EMPTY_EMPLOYER_INSTRUCTIONS };

  const mustAnswerQuestions = [];
  const qRe = /([А-ЯA-ZЁ][^?]{8,220}\?)/g;
  let match;
  while ((match = qRe.exec(segment)) && mustAnswerQuestions.length < 6) {
    const q = asTrimmedString(match[1]).replace(/^[—–\-•:\s]+/, '');
    if (q) mustAnswerQuestions.push(q);
  }

  const requiredArtifacts = [];
  if (/github|gitlab/i.test(segment)) requiredArtifacts.push({ type: 'github', required: true });
  if (/портфолио|portfolio|ссылк/i.test(segment)) {
    requiredArtifacts.push({ type: 'portfolio', required: true });
  }
  if (/telegram|телеграм/i.test(segment)) requiredArtifacts.push({ type: 'telegram', required: false });

  const responseFormat = mustAnswerQuestions.length ? 'question_answer' : requiredArtifacts.length ? 'plain_extended' : 'plain_short';
  const lengthPolicy =
    mustAnswerQuestions.length || requiredArtifacts.length ? 'extended_if_needed' : 'normal';

  return {
    detected: true,
    confidence: mustAnswerQuestions.length || requiredArtifacts.length ? 0.74 : 0.45,
    strictness: 'mandatory',
    responseFormat,
    lengthPolicy,
    mustStartWith: '',
    mustMention: [],
    mustAnswerQuestions: uniqueStringArray(mustAnswerQuestions),
    requiredArtifacts: uniqueArtifacts(requiredArtifacts),
    screeningChecklist: [],
    rawFragments: collectInstructionSnippets(segment, { windowChars: 220, maxSnippets: 3 }),
    notesForGenerator:
      'Эвристика из текста вакансии: ответь по вопросам прямо и приложи ссылки, если они запрошены.',
  };
}

/**
 * Объединяет сохранённые instructions из queue и fallback-эвристику из текста вакансии.
 * Приоритет у сохранённых полей, но пустые/незаполненные поля добираются из fallback.
 * @param {unknown} primaryRaw
 * @param {unknown} fallbackRaw
 */
export function mergeEmployerInstructions(primaryRaw, fallbackRaw) {
  const primary = normalizeEmployerInstructions(primaryRaw);
  const fallback = normalizeEmployerInstructions(fallbackRaw);
  if (!fallback.detected) return primary;
  if (!primary.detected) return fallback;

  return {
    detected: true,
    confidence: Math.max(primary.confidence, fallback.confidence),
    strictness: primary.strictness !== 'none' ? primary.strictness : fallback.strictness,
    responseFormat:
      primary.responseFormat !== 'plain_short' || !fallback.mustAnswerQuestions.length
        ? primary.responseFormat
        : fallback.responseFormat,
    lengthPolicy:
      primary.lengthPolicy !== 'normal' || fallback.lengthPolicy === 'normal'
        ? primary.lengthPolicy
        : fallback.lengthPolicy,
    mustStartWith: primary.mustStartWith || fallback.mustStartWith,
    mustMention: uniqueStringArray([...primary.mustMention, ...fallback.mustMention]),
    mustAnswerQuestions: uniqueStringArray([
      ...primary.mustAnswerQuestions,
      ...fallback.mustAnswerQuestions,
    ]),
    requiredArtifacts: uniqueArtifacts([...primary.requiredArtifacts, ...fallback.requiredArtifacts]),
    screeningChecklist: uniqueStringArray([
      ...primary.screeningChecklist,
      ...fallback.screeningChecklist,
    ]),
    rawFragments: uniqueStringArray([...primary.rawFragments, ...fallback.rawFragments]).slice(0, 5),
    notesForGenerator: primary.notesForGenerator || fallback.notesForGenerator,
  };
}

function readOptionalFile(relPath) {
  const rel = asTrimmedString(relPath);
  if (!rel) return '';
  const fp = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  try {
    if (!fs.existsSync(fp)) return '';
    const t = fs.readFileSync(fp, 'utf8').trim();
    return t;
  } catch {
    return '';
  }
}

/**
 * Текстовый блок из config/preferences.json → applicationProfile (ссылки + файлы с диска).
 * @param {object} prefs
 */
export function buildApplicationProfileBlock(prefs) {
  const ap = prefs?.applicationProfile;
  if (!ap || typeof ap !== 'object') return '';

  const lines = [];
  const addLine = (label, text) => {
    const t = asTrimmedString(text);
    if (t) lines.push(`${label}: ${t}`);
  };

  addLine('GitHub', ap.githubUrl);
  addLine('Сайт / портфолио', ap.portfolioUrl);
  addLine('Telegram', ap.telegramUsername);
  addLine('Ожидания по зарплате', ap.salaryExpectation);
  addLine('Ставка', ap.hourlyRate);
  addLine('Доступность / график', ap.availabilityNote);

  if (Array.isArray(ap.targetRoleDirections) && ap.targetRoleDirections.length) {
    const t = ap.targetRoleDirections.map((x) => asTrimmedString(x)).filter(Boolean).join(', ');
    if (t) lines.push(`Интересующие направления: ${t}`);
  }

  const filePairs = [
    ['caseStudiesFile', 'Кейсы (файл)'],
    ['projectLinksFile', 'Проекты / ссылки (файл)'],
    ['experienceHighlightsFile', 'Опыт / места работы (файл)'],
    ['aiExperienceFile', 'Опыт с AI (файл)'],
    ['screeningChecklistFile', 'Скрининг навыков +/- (файл)'],
    ['employerQuestionAnswersFile', 'Заготовки ответов работодателю (файл)'],
    ['motivationNotesFile', 'Мотивация / почему ищу работу (файл)'],
  ];
  for (const [key, label] of filePairs) {
    const chunk = readOptionalFile(ap[key]);
    if (chunk) {
      lines.push(`${label}:\n${chunk.slice(0, 6000)}`);
    }
  }

  if (!lines.length) return '';
  return `\nДанные кандидата из config/preferences.json (applicationProfile) — используй, если в инструкциях работодателя просят ссылки, кейсы, Telegram и т.п.:\n${lines.join('\n\n')}\n`;
}

/**
 * Постобработка вариантов: первая фраза письма точно как просит работодатель.
 * @param {string[]} variants
 * @param {string} mustStartWith
 */
export function enforceMustStartWith(variants, mustStartWith) {
  const m = isValidStartWithPhrase(mustStartWith);
  if (!m || !Array.isArray(variants)) return variants;
  return variants.map((v) => {
    const s = asTrimmedString(v);
    if (!s) return m;
    if (s.startsWith(m)) return s;
    return `${m}\n\n${s}`;
  });
}

/**
 * Подсказка max_tokens для OpenAI-совместимого chat/completions.
 */
export function computeCoverLetterMaxTokens(variantCount, employerInstructions) {
  const n = Math.min(10, Math.max(1, Math.floor(Number(variantCount) || 3)));
  const ei = employerInstructions && typeof employerInstructions === 'object' ? employerInstructions : null;
  const rf = ei?.responseFormat || 'plain_short';
  const lp = ei?.lengthPolicy || 'normal';

  let per = 900;
  if (rf === 'question_answer' || rf === 'checklist') per = 1300;
  if (rf === 'plain_extended') per = 1100;
  if (lp === 'extended_if_needed') per += 400;

  let base = 500 + n * per;
  if (rf === 'resume_only') base = Math.min(base, 400 + n * 500);

  return Math.min(8000, base);
}
