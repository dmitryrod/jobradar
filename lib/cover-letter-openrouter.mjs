import fs from 'fs';
import path from 'path';
import { extractJsonObject } from './openrouter-score.mjs';
import { getEffectiveLlmProvider, postChatCompletion } from './llm-chat.mjs';
import { ROOT } from './paths.mjs';
import { buildStyleContextBlock } from './cover-letter-style-context.mjs';

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

export function normalizeVariants(raw, variantCount = DEFAULT_VARIANT_COUNT) {
  const n = Math.min(MAX_VARIANT_COUNT, Math.max(1, Math.floor(Number(variantCount)) || DEFAULT_VARIANT_COUNT));
  const arr = Array.isArray(raw) ? raw.map((s) => String(s).trim()).filter(Boolean) : [];
  while (arr.length < n) {
    arr.push(arr[arr.length - 1] || 'Здравствуйте! Готов обсудить сотрудничество.');
  }
  return arr.slice(0, n);
}

/**
 * @param {object} record — запись из очереди (vacancies-queue)
 * @param {{ text: string }} cvBundle
 * @param {{ variantCount?: number }} [opts]
 */
export async function generateCoverLetterVariants(record, cvBundle, opts = {}) {
  const variantCount = Math.min(
    MAX_VARIANT_COUNT,
    Math.max(1, Math.floor(Number(opts.variantCount) || DEFAULT_VARIANT_COUNT))
  );
  const provider = getEffectiveLlmProvider();

  const desc =
    (record.descriptionForLlm && String(record.descriptionForLlm)) ||
    (record.descriptionPreview && String(record.descriptionPreview)) ||
    '';
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

  const variantPlaceholders = Array.from({ length: variantCount }, (_, i) => `"текст варианта ${i + 1}"`).join(', ');
  const userPrompt = `Напиши ${variantCount} разных вариантов короткого сопроводительного письма на русском для отклика на вакансию.
Каждый вариант — 4–8 предложений, по-человечески, без markdown.
Учитывай резюме кандидата и текст вакансии; подчеркни релевантный опыт фактами, не лозунгами.
${antiAiRules}
${styleBlock}
${templateBlock}
ВАКАНСИЯ:
Заголовок: ${record.title || ''}
Компания: ${record.company || ''}
Зарплата: ${record.salaryRaw || ''}
URL: ${record.url || ''}

Описание:
${desc.slice(0, 8000)}

Краткий разбор (модель-оценка): ${summary}
Риски: ${risks}
Теги: ${tags}

РЕЗЮМЕ КАНДИДАТА:
${cvBundle.text.slice(0, 16_000)}

Верни СТРОГО один JSON без markdown и без текста до/после:
{
  "variants": [${variantPlaceholders}]
}`;

  const { text, usedModel } = await postChatCompletion({
    provider,
    messages: [
      {
        role: 'system',
        content: `Ты помогаешь одному соискателю писать короткие сопроводительные письма на русском: звучат естественно, без канцелярита и клише нейросетей. Если даны эталоны — копируй только стиль, не содержание. Ответ только одним JSON-объектом с ключом variants (массив из ровно ${variantCount} строк), без обёртки markdown и без текста до/после.`,
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.55,
    max_tokens: Math.min(8000, 600 + variantCount * 900),
    xTitle: 'hh-ru-apply-cover-letter',
  });

  const parsed = extractJsonObject(text);
  const variants = normalizeVariants(parsed.variants, variantCount);

  return { variants, providerModel: usedModel, llmProvider: provider };
}
