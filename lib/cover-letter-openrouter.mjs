import fs from 'fs';
import path from 'path';
import { extractJsonObject } from './openrouter-score.mjs';
import { getEffectiveLlmProvider, postChatCompletion } from './llm-chat.mjs';
import { ROOT } from './paths.mjs';
import { buildStyleContextBlock } from './cover-letter-style-context.mjs';
import { loadPreferences } from './preferences.mjs';
import { sanitizeLlmText } from './llm-text-utf8.mjs';
import {
  normalizeEmployerInstructions,
  buildVacancyDescriptionForCoverLetter,
  buildApplicationProfileBlock,
  enforceMustStartWith,
  computeCoverLetterMaxTokens,
  inferEmployerInstructionsFromText,
  mergeEmployerInstructions,
} from './employer-instructions.mjs';

const COVER_CANDIDATES = [
  path.join(ROOT, 'config', 'cover-letter.txt'),
  path.join(ROOT, 'config', 'cover-letter.example.txt'),
];

function loadCoverLetterTemplateHint() {
  for (const fp of COVER_CANDIDATES) {
    if (fs.existsSync(fp)) {
      const t = fs.readFileSync(fp, 'utf8').trim();
      if (t) return t.slice(0, 2000);
    }
  }
  return '';
}

const DEFAULT_VARIANT_COUNT = 3;
const MAX_VARIANT_COUNT = 10;
const QUESTION_STOPWORDS = new Set([
  'какой',
  'какая',
  'какие',
  'какое',
  'как',
  'что',
  'где',
  'когда',
  'почему',
  'зачем',
  'какую',
  'каких',
  'каком',
  'какими',
  'какому',
  'какую',
  'какого',
  'каком',
  'какая',
  'какие',
  'расскажите',
  'расскажи',
  'укажите',
  'укажи',
  'использовали',
  'используете',
  'работе',
  'работали',
  'письме',
  'сопроводительном',
  'ваши',
  'ваш',
  'есть',
  'если',
  'они',
]);

export function normalizeVariants(raw, variantCount = DEFAULT_VARIANT_COUNT) {
  const n = Math.min(MAX_VARIANT_COUNT, Math.max(1, Math.floor(Number(variantCount)) || DEFAULT_VARIANT_COUNT));
  const arr = Array.isArray(raw) ? raw.map((s) => String(s).trim()).filter(Boolean) : [];
  while (arr.length < n) {
    arr.push(arr[arr.length - 1] || 'Здравствуйте! Готов обсудить сотрудничество.');
  }
  return arr.slice(0, n);
}

function tokenizeQuestion(text) {
  const tokens =
    String(text || '')
      .toLowerCase()
      .match(/[a-zа-яё0-9+#.-]{3,}/gi) || [];
  return Array.from(new Set(tokens.filter((t) => !QUESTION_STOPWORDS.has(t))));
}

function buildEvidenceChunks(...texts) {
  const seen = new Set();
  const chunks = [];
  for (const text of texts) {
    const parts = String(text || '')
      .split(/\n+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 18);
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(part);
    }
  }
  return chunks;
}

function scoreEvidenceChunk(chunk, question, tokens) {
  const lower = chunk.toLowerCase();
  const q = String(question || '').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (lower.includes(token)) score += token.length >= 6 ? 3 : 2;
  }

  if (/(ai|llm|инстру|агент|rag)/i.test(q) && /(claude|gpt|gemini|ollama|langchain|langgraph|flowise|n8n|mcp|langfuse|qdrant|pinecone|pgvector|fastapi|docker)/i.test(lower)) {
    score += 6;
  }
  if (/(mvp|быстр|срок|дн|дня|недел|прототип)/i.test(q) && /(быстро|быстрый|mvp|прототип|гипотез|итерац|запуск)/i.test(lower)) {
    score += 5;
  }
  if (/(ссыл|github|gitlab|портф|проект)/i.test(q) && /(https?:\/\/|github|портфолио|dmitryrod\.ru|dmitryrod)/i.test(lower)) {
    score += 7;
  }

  return score;
}

/**
 * Подсказки по фактам для конкретных вопросов работодателя.
 * Это уменьшает общие ответы и заставляет модель брать опору из CV/applicationProfile.
 */
function buildQuestionEvidenceBlock(ei, profileBlock, cvText) {
  if (!ei.mustAnswerQuestions.length) return '';

  const chunks = buildEvidenceChunks(profileBlock, cvText);
  const lines = ['ФАКТЫ ДЛЯ ОТВЕТОВ НА ВОПРОСЫ РАБОТОДАТЕЛЯ:'];

  for (const [idx, question] of ei.mustAnswerQuestions.entries()) {
    const tokens = tokenizeQuestion(question);
    const top = chunks
      .map((chunk) => ({ chunk, score: scoreEvidenceChunk(chunk, question, tokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    lines.push(`- Вопрос ${idx + 1}: ${question}`);
    if (!top.length) {
      lines.push('  1. В текущем профиле нет прямого подтверждающего факта; не выдумывай детали и сроки.');
      continue;
    }
    top.forEach((item, i) => {
      lines.push(`  ${i + 1}. ${item.chunk.slice(0, 260)}`);
    });
  }

  return `\n${lines.join('\n')}\n`;
}

function shouldForceLinks(ei) {
  const raw = JSON.stringify(ei || {}).toLowerCase();
  return /(github|gitlab|портф|portfolio|telegram|телеграм|ссылк|проект)/i.test(raw);
}

function buildExplicitLinksBlock(ei, prefs) {
  if (!shouldForceLinks(ei)) return '';
  const ap = prefs?.applicationProfile;
  if (!ap || typeof ap !== 'object') return '';

  const lines = [];
  if (String(ap.githubUrl || '').trim()) lines.push(`- GitHub: ${String(ap.githubUrl).trim()}`);
  if (String(ap.portfolioUrl || '').trim()) lines.push(`- Портфолио / сайт: ${String(ap.portfolioUrl).trim()}`);
  if (String(ap.telegramUsername || '').trim()) lines.push(`- Telegram: ${String(ap.telegramUsername).trim()}`);
  if (!lines.length) return '';

  return `\nИЗВЕСТНЫЕ ССЫЛКИ КАНДИДАТА — если работодатель просит приложить ссылки/проекты, вставляй в письмо именно эти данные, а не фразы "по запросу" или "готов поделиться":\n${lines.join('\n')}\n`;
}

function buildExecutionRulesBlock(ei) {
  if (!ei.detected) return '';
  const lines = ['КРИТИЧЕСКИЕ ПРАВИЛА ВЫПОЛНЕНИЯ ИНСТРУКЦИЙ РАБОТОДАТЕЛЯ:'];
  if (ei.mustAnswerQuestions.length) {
    lines.push('- На каждый вопрос ответь прямо и предметно; нельзя заменять ответ общим абзацем.');
    lines.push('- Если в вопросах есть нумерация, сохрани ее в письме.');
  }
  if (shouldForceLinks(ei)) {
    lines.push('- Если просят ссылки / GitHub / портфолио, укажи конкретные URL из профиля кандидата прямо в письме.');
    lines.push('- Не пиши "по запросу" и "готов поделиться", если нужная ссылка уже есть в контексте.');
  }
  lines.push('- Если точного факта в контексте нет, скажи это коротко и честно; не выдумывай цифры, сроки и названия проектов.');
  return `\n${lines.join('\n')}\n`;
}

/**
 * @param {ReturnType<typeof normalizeEmployerInstructions>} ei
 */
function buildEmployerBlock(ei) {
  if (!ei.detected) return '';
  const lines = [
    'ТРЕБОВАНИЯ РАБОТОДАТЕЛЯ К ОТКЛИКУ (найдены в тексте описания вакансии):',
    `- Уверенность модели: ${ei.confidence.toFixed(2)}; строгость: ${ei.strictness}`,
    `- Формат ответа в письме: ${ei.responseFormat}`,
    `- Длина письма: ${ei.lengthPolicy} (если extended — допускай более развёрнутый текст ради выполнения требований)`,
  ];
  if (ei.mustStartWith) lines.push(`- Первое предложение письма должно начинаться ТОЧНО с: «${ei.mustStartWith}»`);
  if (ei.mustMention.length) lines.push(`- Обязательно раскрой/упомяни: ${ei.mustMention.join('; ')}`);
  if (ei.mustAnswerQuestions.length) {
    lines.push('- Ответь на вопросы работодателя (сохрани нумерацию):');
    ei.mustAnswerQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
  }
  if (ei.requiredArtifacts.length) {
    lines.push(
      `- Артефакты: ${ei.requiredArtifacts
        .map((a) => `${a.type}${a.required ? ' (обязательно)' : ''}`)
        .join(', ')}`
    );
  }
  if (ei.screeningChecklist.length) {
    lines.push(`- Если нужен скрининг по требованиям, отметь по пунктам: ${ei.screeningChecklist.join('; ')}`);
  }
  if (ei.notesForGenerator) lines.push(`- Подсказка: ${ei.notesForGenerator}`);
  const raw = (ei.rawFragments || []).filter(Boolean).slice(0, 5);
  if (raw.length) {
    lines.push('Цитаты из описания вакансии:');
    raw.forEach((f) => lines.push(`«${f.slice(0, 1200)}»`));
  }
  return `\n${lines.join('\n')}\n`;
}

/**
 * @param {ReturnType<typeof normalizeEmployerInstructions>} ei
 */
function buildLengthAndShapeLine(ei, variantCount) {
  const rf = ei.responseFormat || 'plain_short';
  if (rf === 'resume_only') {
    return `Каждый вариант — очень короткий (2–4 предложения), по сути только то, что просят (резюме/ссылки уже есть отдельно в профиле кандидата). Вариантов: ${variantCount}.`;
  }
  if (rf === 'question_answer') {
    return `Каждый вариант — короткое приветствие, затем ответы по пунктам на вопросы работодателя (без markdown-заголовков #). Можно длиннее обычного, если надо закрыть вопросы. Вариантов: ${variantCount}.`;
  }
  if (rf === 'checklist') {
    return `Каждый вариант — вступление и компактный список по требованиям (строки с +/- или кратко по пунктам), без воды. Вариантов: ${variantCount}.`;
  }
  if (rf === 'plain_extended' || ei.lengthPolicy === 'extended_if_needed') {
    return `Каждый вариант — 8–16 предложений, если нужно выполнить инструкции работодателя; не раздувай без необходимости. Вариантов: ${variantCount}.`;
  }
  return `Каждый вариант — ориентировочно 4–8 предложений, по-человечески, без markdown. Вариантов: ${variantCount}.`;
}

/**
 * @param {object} record — запись из очереди (vacancies-queue)
 * @param {{ text: string }} cvBundle
 * @param {{ variantCount?: number, prefs?: object }} [opts]
 */
export async function generateCoverLetterVariants(record, cvBundle, opts = {}) {
  const variantCount = Math.min(
    MAX_VARIANT_COUNT,
    Math.max(1, Math.floor(Number(opts.variantCount) || DEFAULT_VARIANT_COUNT))
  );
  const provider = getEffectiveLlmProvider();

  let prefs = opts.prefs;
  if (!prefs) {
    try {
      prefs = loadPreferences();
    } catch {
      prefs = {};
    }
  }

  const fullDesc = String(record?.vacancyDescriptionFull || '').trim();
  const fallbackEi = inferEmployerInstructionsFromText(fullDesc || String(record?.descriptionForLlm || ''));
  const ei = mergeEmployerInstructions(record?.employerInstructions, fallbackEi);
  const baseDesc = buildVacancyDescriptionForCoverLetter(record);
  const desc = ei.detected && fullDesc ? fullDesc.slice(0, 14_000) : baseDesc;
  const summary = String(record.geminiSummary || '').trim();
  const risks = String(record.geminiRisks || '').trim();
  const tags = Array.isArray(record.geminiTags) ? record.geminiTags.join(', ') : '';

  const templateHint = loadCoverLetterTemplateHint();
  const templateBlock = templateHint
    ? `\nПример структуры/тона (не копируй дословно, адаптируй):\n${templateHint}\n`
    : '';

  const styleBlockRaw = buildStyleContextBlock({
    maxChars: Number(process.env.COVER_LETTER_STYLE_MAX_CHARS) || 5000,
    maxItemsFromQueue: Number(process.env.COVER_LETTER_STYLE_QUEUE_ITEMS) || 4,
  });
  const styleBlock = styleBlockRaw
    ? `\nНиже — эталоны того, КАК автор уже писал сопроводительные (имитируй ритм, длину фраз, тёплость и прямоту; не переноси факты и формулировки из эталонов — пиши заново под эту вакансию).\n\n${styleBlockRaw}\n`
    : '';

  const profileBlock = buildApplicationProfileBlock(prefs);
  const questionEvidenceBlock = buildQuestionEvidenceBlock(ei, profileBlock, cvBundle.text);
  const explicitLinksBlock = buildExplicitLinksBlock(ei, prefs);
  const executionRulesBlock = buildExecutionRulesBlock(ei);

  const antiAiRules = `
Жёстко избегай признаков «нейросетевого» текста:
- не начинай с «Уважаемые рекрутеры/меня зовут/я пишу вам, чтобы…» шаблонно;
- не используй цепочки прилагательных и пустые усилители («глубокие знания», «уникальный опыт», «идеально подхожу»);
- не перечисляй качества списком без привязки к фактам из резюме;
- допускай разговорные короткие фразы, одно уместное «я» — как у живого человека;
- конкретика из вакансии и CV, не общие слова про «динамичную компанию».
- если фразу стыдно было бы сказать вслух обычным человеческим языком, не используй ее.

Пиши в коротком, прямом, спокойном деловом стиле. Без пафоса, без шаблонных HR-фраз, без искусственной мотивации и без корпоративной вежливости.

Не используй формулировки вроде:
- "Ваша вакансия привлекла мое внимание"
- "Мне близка ваша идея / миссия / продукт"
- "Буду рад обсудить, как мой опыт может помочь вашей команде"
- "Давайте обсудим детали"
- "Буду рад поговорить о возможностях сотрудничества"
- "Приветствую!"
- "С нетерпением жду обратной связи"

Предпочитай формулировки вроде:
- "Здравствуйте!" / "Добрый день!"
- "Интересуюсь вашей вакансией"
- "Посмотрел описание вакансии"
- "У меня есть опыт в ..."
- "Делал ..."
- "Работал с ..."
- "Мне интересна эта роль"
- "Буду рад пообщаться"
- "Готов рассказать подробнее"

Главный принцип: если фраза звучит слишком официально, слишком красиво, слишком шаблонно или как типовое сопроводительное письмо, упростить ее до естественной и короткой.
`;

  const employerBlock = buildEmployerBlock(ei);
  const lengthLine = buildLengthAndShapeLine(ei, variantCount);
  const strictEmployer = ei.detected && ei.strictness === 'mandatory';

  const variantPlaceholders = Array.from({ length: variantCount }, (_, i) => `"текст варианта ${i + 1}"`).join(', ');

  const userPromptParts = [];
  if (strictEmployer && employerBlock) {
    userPromptParts.push(
      `${employerBlock}\nСоблюди инструкции работодателя выше с высшим приоритетом.\n`
    );
  }

  userPromptParts.push(`Напиши ${variantCount} разных вариантов сопроводительного письма на русском для отклика на вакансию.
${lengthLine}
Учитывай резюме кандидата и текст вакансии; подчеркни релевантный опыт фактами, не лозунгами.`);

  if (!(ei.detected && ei.responseFormat === 'resume_only')) {
    userPromptParts.push(antiAiRules);
  }

  userPromptParts.push(styleBlock, templateBlock, executionRulesBlock, explicitLinksBlock, questionEvidenceBlock);

  if (!strictEmployer && employerBlock) {
    userPromptParts.push(employerBlock);
  }

  userPromptParts.push(`ВАКАНСИЯ:
Заголовок: ${record.title || ''}
Компания: ${record.company || ''}
Зарплата: ${record.salaryRaw || ''}
URL: ${record.url || ''}

Описание (полный текст, если доступен — важно для инструкций в конце):
${desc.slice(0, 14_000)}

Краткий разбор (модель-оценка): ${summary}
Риски и нюансы: ${risks}
Теги: ${tags}
${profileBlock}
РЕЗЮМЕ КАНДИДАТА:
${cvBundle.text.slice(0, 16_000)}

Верни СТРОГО один JSON без markdown и без текста до/после:
{
  "variants": [${variantPlaceholders}]
}`);

  const userPrompt = userPromptParts.join('\n');

  const maxTokens = computeCoverLetterMaxTokens(variantCount, ei);

  let systemContent = `Ты помогаешь одному соискателю писать сопроводительные письма на русском: звучат естественно, без канцелярита и клише нейросетей. Если даны эталоны — копируй только стиль, не содержание.`;
  if (ei.detected) {
    systemContent +=
      ' Если в запросе есть требования работодателя к отклику из текста вакансии — выполни их в первую очередь, в том числе ответы на вопросы, ссылки, формулировку первого предложения и желаемую длину.';
  }
  systemContent += ` Ответ только одним JSON-объектом с ключом variants (массив из ровно ${variantCount} строк), без обёртки markdown и без текста до/после.`;

  const { text, usedModel } = await postChatCompletion({
    provider,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.55,
    max_tokens: maxTokens,
    xTitle: 'hh-ru-apply-cover-letter',
  });

  const parsed = extractJsonObject(text);
  let variants = normalizeVariants(parsed.variants, variantCount);
  variants = variants.map((v) => sanitizeLlmText(v));
  variants = enforceMustStartWith(variants, ei.mustStartWith);

  return { variants, providerModel: usedModel, llmProvider: provider };
}
