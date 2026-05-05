import { loadRecentFeedback } from './feedback-context.mjs';
import {
  getOpenRouterApiKeyRaw,
  getEffectiveLlmProvider,
  postChatCompletion,
} from './llm-chat.mjs';
import { finalizeVacancyScores } from './scoring-blend.mjs';
import {
  stripLoneUtf16Surrogates,
  hasUnicodeReplacementChar,
  sanitizeLlmText,
} from './llm-text-utf8.mjs';
import {
  normalizeEmployerInstructions,
  normalizeInstructionComplexity,
  mergeInstructionIntoRisks,
  computeHasEmployerInstructions,
  buildVacancyDescriptionForScoring,
} from './employer-instructions.mjs';

export {
  resolveFreeOpenRouterModel,
  resolveOpenRouterModelForRequest,
  DEFAULT_OPENROUTER_MODEL,
} from './llm-chat.mjs';

export function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('В ответе модели нет JSON-объекта');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function buildFeedbackNarrative(entries) {
  if (!entries.length) return '';
  const lines = entries
    .filter((e) => e.action === 'reject' && e.reason)
    .slice(-12)
    .map((e) => `- «${(e.title || '').slice(0, 80)}»: ${e.reason}`);
  if (!lines.length) return '';
  return `\nРанее вы отклоняли вакансии с такими формулировками (учти при отклике):\n${lines.join('\n')}\n`;
}

/** Совместимость: только ключ OpenRouter (без Polza). */
export function getOpenRouterApiKey() {
  return getOpenRouterApiKeyRaw();
}

function buildCandidatePreferencesBlock(prefs) {
  const geo = prefs.scoringGeo || {};
  const sw = prefs.scoringWorkFormat || {};
  return [
    'Предпочтения кандидата (обязательно отрази в scoreWorkFormat и scoreLocation, целые 0–100):',
    `- Базовый город: ${geo.baseCity || '(не задан в preferences.json)'}`,
    `- Допустимые города/локации: ${(geo.acceptableCities || []).length ? (geo.acceptableCities || []).join(', ') : '(не заданы)'}`,
    `- Для полностью удалённых вакансий высокая оценка локации уместна, если remoteIsAcceptable: ${geo.remoteIsAcceptable !== false}`,
    `- Предпочтение формата (см. scoringWorkFormat.prefer): ${sw.prefer || 'remote_first'}`,
  ].join('\n');
}

/**
 * @param {{ title: string, company: string, salaryRaw: string, description: string, url: string, address?: string, workConditionsLines?: string[], employment?: string }} vacancy
 * @param {{ text: string }} cvBundle
 * @param {object} prefs — preferences.json (в т.ч. llmScoreWeights и scoreBlendShares/scoreOverallShares)
 */
export async function scoreVacancyWithOpenRouter(vacancy, cvBundle, prefs) {
  const provider = getEffectiveLlmProvider();
  const vacancyTextForScoring = buildVacancyDescriptionForScoring(vacancy);

  const feedbackBlock = buildFeedbackNarrative(loadRecentFeedback(25));

  const candidateBlock = buildCandidatePreferencesBlock(prefs);

  const userPrompt = `Ты помощник одного соискателя. Он сам решает, на какие вакансии откликаться. У него ДВЕ версии резюме ниже — ОБЕ его, просто под разные акценты/направления (не два разных человека).
Жёсткие фильтры (зарплата, удалёнка и т.д.) уже применены скриптом до тебя.
${feedbackBlock}
${candidateBlock}

Оцени вакансию с его точки зрения: стоит ли тратить время на отклик.

Смысл полей — целые от 0 до 100:
- scoreVacancy: насколько сама вакансия по тексту объявления уместна и интересна для его профиля (домен, уровень, тип роли, красные флаги). Без построчной сверки с резюме.
- scoreCvMatch: насколько его оба резюме перекрывают требования вакансии; насколько обоснован отклик с этими CV.
- scoreWorkFormat: насколько формат работы (удалёнка / гибрид / офис) совпадает с его предпочтениями выше.
- scoreLocation: насколько локация / офис / релокация совместимы с его городом и списком допустимых локаций; для полной удалёнки можно ставить высокий балл, если это ему подходит.
- scoreOverall: необязательно; если заполнишь — это только справочный целостный балл модели. Скрипт сам считает итог: отдельный LLM score из scoreVacancy + scoreCvMatch, потом blend с profile score. scoreWorkFormat и scoreLocation сохраняются для UI/отладки, но не входят в итог первой версии.

Поле summary: кратко для него, обращение на «ты»; без сухого от третьего лица про «кандидата».

Поле risks: нюансы и зоны внимания при отклике с ЕГО двумя резюме. Пиши ТОЛЬКО на «ты» / «у тебя» (например: «У тебя больше опыта в X, а в вакансии упор на Y»). НЕ пиши «кандидаты», «кандидат», «соискатели» — это всегда один и тот же человек с двумя версиями CV.

matchCv: primary | secondary | both | none — какое резюме логичнее вести первым (первый файл в блоке «МОИ РЕЗЮМЕ» = primary, второй = secondary).

Отдельно вычитывай из ТЕКСТА ОПИСАНИЯ ВАКАНСИИ инструкции работодателя К ТОМУ, КАК ПОДАВАТЬ ОТКЛИК (часто в конце текста: «как откликнуться», «в сопроводительном письме», «ответьте на вопрос», «приложите GitHub», обязательная первая фраза, перечень вопросов, скрининг +/- и т.д.). Отдельных полей hh.ru для этого нет — всё только в свободном тексте описания.
- Поле employerInstructions: заполни структуру ниже; если явных инструкций к отклику нет — detected=false, confidence близко к 0.
- rawFragments: 1–3 дословных цитаты из описания, на которых основано извлечение (короткие фрагменты).
- instructionComplexity: насколько сложно формально выполнить требования в письме (none/low/medium/high).
- instructionFitRisk: одно короткое предложение на «ты»: чего не хватает или на что обратить внимание при отклике с его резюме (не дублируй summary).

Верни СТРОГО один JSON без markdown и без текста до/после:
{
  "scoreVacancy": 0,
  "scoreCvMatch": 0,
  "scoreWorkFormat": 0,
  "scoreLocation": 0,
  "scoreOverall": 0,
  "summary": "",
  "risks": "",
  "matchCv": "both",
  "tags": [],
  "instructionComplexity": "none",
  "instructionFitRisk": "",
  "employerInstructions": {
    "detected": false,
    "confidence": 0,
    "strictness": "none",
    "responseFormat": "plain_short",
    "lengthPolicy": "normal",
    "mustStartWith": "",
    "mustMention": [],
    "mustAnswerQuestions": [],
    "requiredArtifacts": [],
    "screeningChecklist": [],
    "rawFragments": [],
    "notesForGenerator": ""
  }
}
strictness: none | desired | mandatory — насколько обязательно следовать инструкциям.
responseFormat: plain_short | plain_extended | question_answer | checklist | resume_only | mandatory_phrase_first
lengthPolicy: short | normal | extended_if_needed — можно ли сделать письмо длиннее обычного ради требований работодателя.
requiredArtifacts: массив объектов {"type": "github|portfolio|telegram|resume|other", "required": true/false}
(подставь свои числа и строки вместо примеров)

ВАКАНСИЯ:
Заголовок: ${vacancy.title}
Компания: ${vacancy.company}
Зарплата (как на сайте): ${vacancy.salaryRaw}
URL: ${vacancy.url}
${vacancy.address ? `Адрес/локация (с карточки): ${vacancy.address}` : ''}
${vacancy.employment ? `Занятость: ${vacancy.employment}` : ''}
${Array.isArray(vacancy.workConditionsLines) && vacancy.workConditionsLines.length ? `Условия (строки с карточки):\n${vacancy.workConditionsLines.slice(0, 12).join('\n')}` : ''}

Описание (начало + важные фрагменты + хвост, чтобы не потерять инструкции к отклику):
${vacancyTextForScoring}

МОИ РЕЗЮМЕ (два варианта):
${cvBundle.text.slice(0, 18_000)}
`;

  const systemBase =
    'Ты помогаешь одному соискателю решить, откликаться ли на вакансию. У него два варианта одного резюме под разные роли. В summary и risks обращайся на «ты». Ответ только одним JSON-объектом, без ``` и без текста до/после. Всегда включай ключи employerInstructions, instructionComplexity и instructionFitRisk.';

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usedModel } = await postChatCompletion({
      provider,
      messages: [
        {
          role: 'system',
          content:
            systemBase +
            (attempt === 0
              ? ''
              : ' В summary, risks и instructionFitRisk используй только обычные символы кириллицы и латиницы; не вставляй символ � (битая кодировка) и не порти UTF-8.'),
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: attempt === 0 ? 0.35 : 0.28,
      max_tokens: attempt === 0 ? 3500 : 4000,
      xTitle: 'hh-ru-apply',
    });

    let parsed;
    try {
      parsed = extractJsonObject(text);
    } catch (e) {
      if (attempt === 1) throw e;
      continue;
    }

    const employerInstructions = normalizeEmployerInstructions(parsed.employerInstructions);
    const instructionComplexity = normalizeInstructionComplexity(parsed.instructionComplexity);
    const instructionFitRisk = sanitizeLlmText(String(parsed.instructionFitRisk || '').trim());

    const mergedRisks = sanitizeLlmText(
      mergeInstructionIntoRisks(
        sanitizeLlmText(String(parsed.risks || '').trim()),
        instructionFitRisk,
        instructionComplexity
      )
    );

    const summary = sanitizeLlmText(String(parsed.summary || '').trim());

    const badEncoding =
      hasUnicodeReplacementChar(summary) ||
      hasUnicodeReplacementChar(mergedRisks) ||
      hasUnicodeReplacementChar(instructionFitRisk);

    if (badEncoding && attempt === 0) continue;

    const vacancyCtx = {
      title: vacancy.title,
      company: vacancy.company,
      salaryRaw: vacancy.salaryRaw,
      description: vacancy.description,
      url: vacancy.url,
      address: vacancy.address || '',
      workConditionsLines: vacancy.workConditionsLines || [],
      employment: vacancy.employment || '',
      vacancyPublishedDate: vacancy.vacancyPublishedDate ?? null,
    };
    const fin = finalizeVacancyScores(parsed, prefs, vacancyCtx);

    return {
      score: fin.scoreOverall,
      scoreVacancy: fin.scoreVacancy,
      scoreCvMatch: fin.scoreCvMatch,
      scoreWorkFormat: fin.scoreWorkFormat,
      scoreLocation: fin.scoreLocation,
      scoreLlm: fin.scoreLlm,
      scoreProfile: fin.scoreProfile,
      scoreOverall: fin.scoreOverall,
      scoreBlendedBeforeDelta: fin.scoreBlendedBeforeDelta,
      scoreBlendedLlmOnly: fin.scoreBlendedLlmOnly,
      scoreLlmWeight: fin.scoreLlmWeight,
      scoreProfileWeight: fin.scoreProfileWeight,
      scoreModelOverallHint: fin.scoreModelOverallHint,
      scoreRuleDelta: fin.scoreRuleDelta,
      scoreSalaryDelta: fin.scoreSalaryDelta,
      scorePublicationDelta: fin.scorePublicationDelta,
      scoreProfileCriteriaDelta: fin.scoreProfileCriteriaDelta ?? 0,
      scoreSortKey: fin.scoreSortKey,
      summary,
      risks: mergedRisks,
      matchCv: String(parsed.matchCv || 'none').trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      employerInstructions,
      instructionComplexity,
      instructionFitRisk,
      hasEmployerInstructions: computeHasEmployerInstructions(employerInstructions),
      rawModelText: text.slice(0, 2000),
      providerModel: usedModel,
      llmProvider: provider,
    };
  }

  throw new Error('LLM: не удалось получить оценку вакансии после повтора');
}
