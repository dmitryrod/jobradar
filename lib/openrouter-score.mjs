import { loadRecentFeedback } from './feedback-context.mjs';
import {
  getOpenRouterApiKeyRaw,
  getEffectiveLlmProvider,
  postChatCompletion,
} from './llm-chat.mjs';
import { finalizeVacancyScores } from './scoring-blend.mjs';

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
 * @param {object} prefs — preferences.json (в т.ч. llmScoreWeights)
 */
export async function scoreVacancyWithOpenRouter(vacancy, cvBundle, prefs) {
  const provider = getEffectiveLlmProvider();

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
- scoreOverall: необязательно; если заполнишь — это твоя целостная оценка. Скрипт может пересчитать итог как взвешенную сумму осей по весам из preferences (если заданы веса workFormat/location).

Поле summary: кратко для него, обращение на «ты»; без сухого от третьего лица про «кандидата».

Поле risks: нюансы и зоны внимания при отклике с ЕГО двумя резюме. Пиши ТОЛЬКО на «ты» / «у тебя» (например: «У тебя больше опыта в X, а в вакансии упор на Y»). НЕ пиши «кандидаты», «кандидат», «соискатели» — это всегда один и тот же человек с двумя версиями CV.

matchCv: primary | secondary | both | none — какое резюме логичнее вести первым (первый файл в блоке «МОИ РЕЗЮМЕ» = primary, второй = secondary).

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
  "tags": []
}
(подставь свои числа и строки вместо примеров)

ВАКАНСИЯ:
Заголовок: ${vacancy.title}
Компания: ${vacancy.company}
Зарплата (как на сайте): ${vacancy.salaryRaw}
URL: ${vacancy.url}
${vacancy.address ? `Адрес/локация (с карточки): ${vacancy.address}` : ''}
${vacancy.employment ? `Занятость: ${vacancy.employment}` : ''}
${Array.isArray(vacancy.workConditionsLines) && vacancy.workConditionsLines.length ? `Условия (строки с карточки):\n${vacancy.workConditionsLines.slice(0, 12).join('\n')}` : ''}

Описание (фрагмент):
${vacancy.description.slice(0, 8000)}

МОИ РЕЗЮМЕ (два варианта):
${cvBundle.text.slice(0, 18_000)}
`;

  const { text, usedModel } = await postChatCompletion({
    provider,
    messages: [
      {
        role: 'system',
        content:
          'Ты помогаешь одному соискателю решить, откликаться ли на вакансию. У него два варианта одного резюме под разные роли. В summary и risks обращайся на «ты». Ответ только одним JSON-объектом, без ``` и без текста до/после.',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.35,
    max_tokens: 1200,
    xTitle: 'hh-ru-apply',
  });

  const parsed = extractJsonObject(text);
  const vacancyCtx = {
    title: vacancy.title,
    company: vacancy.company,
    salaryRaw: vacancy.salaryRaw,
    description: vacancy.description,
    url: vacancy.url,
    address: vacancy.address || '',
    workConditionsLines: vacancy.workConditionsLines || [],
    employment: vacancy.employment || '',
  };
  const fin = finalizeVacancyScores(parsed, prefs, vacancyCtx);

  return {
    score: fin.scoreOverall,
    scoreVacancy: fin.scoreVacancy,
    scoreCvMatch: fin.scoreCvMatch,
    scoreWorkFormat: fin.scoreWorkFormat,
    scoreLocation: fin.scoreLocation,
    scoreOverall: fin.scoreOverall,
    scoreBlendedBeforeDelta: fin.scoreBlendedBeforeDelta,
    scoreBlendedLlmOnly: fin.scoreBlendedLlmOnly,
    scoreRuleDelta: fin.scoreRuleDelta,
    scoreSalaryDelta: fin.scoreSalaryDelta,
    scoreSortKey: fin.scoreSortKey,
    summary: String(parsed.summary || '').trim(),
    risks: String(parsed.risks || '').trim(),
    matchCv: String(parsed.matchCv || 'none').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    rawModelText: text.slice(0, 2000),
    providerModel: usedModel,
    llmProvider: provider,
  };
}
