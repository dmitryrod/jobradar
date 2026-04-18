/**
 * Унифицированный chat completions: Polza AI (по умолчанию при наличии ключа) или OpenRouter.
 * Polza: https://polza.ai/api/v1/chat/completions (OpenAI-compatible).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** @see .cursor/config.json polza.baseUrlDefault */
export const DEFAULT_POLZA_BASE_URL = 'https://polza.ai/api/v1';

/** Дефолт модели Polza, если POLZA_MODEL не задан (дёшево/доступно на маршруте Polza). */
export const DEFAULT_POLZA_MODEL = 'openai/gpt-4o-mini';

export function getPolzaApiKey() {
  return (process.env.POLZA_API_KEY || process.env.POLZA_AI_API_KEY || '').trim();
}

export function getOpenRouterApiKeyRaw() {
  return (process.env.OpenRouter_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
}

/**
 * Явный выбор в env: polza | openrouter | auto (по умолчанию auto).
 */
export function resolveLlmProvider() {
  const raw = (process.env.LLM_PROVIDER || 'auto').trim().toLowerCase();
  if (raw === 'polza' || raw === 'openrouter' || raw === 'auto') return raw;
  return 'auto';
}

export function hasLlmApiKey() {
  return Boolean(getPolzaApiKey() || getOpenRouterApiKeyRaw());
}

export function getPolzaBaseUrl() {
  const u = (process.env.POLZA_BASE_URL || DEFAULT_POLZA_BASE_URL).trim().replace(/\/+$/, '');
  return u || DEFAULT_POLZA_BASE_URL;
}

/** Дефолт при отсутствии OPENROUTER_MODEL (и для free, и для allow paid без env). */
export const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen3.6-plus-preview:free';

export function resolveFreeOpenRouterModel() {
  const raw = (process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL).trim();
  if (raw === 'openrouter/free') return raw;
  if (raw.endsWith(':free')) return raw;
  throw new Error(
    `OPENROUTER_MODEL="${raw}" — не бесплатный вариант. Используйте "openrouter/free" или id модели с суффиксом ":free". Для платных моделей задайте OPENROUTER_ALLOW_PAID=1 (не рекомендуется для тестов).`
  );
}

export function resolveOpenRouterModelForRequest() {
  const allowPaid = process.env.OPENROUTER_ALLOW_PAID === '1';
  if (allowPaid) {
    return (process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL).trim();
  }
  return resolveFreeOpenRouterModel();
}

/**
 * Модель для текущего провайдера.
 */
export function resolveChatModelForProvider(provider) {
  if (provider === 'polza') {
    const m = (process.env.POLZA_MODEL || '').trim();
    return m || DEFAULT_POLZA_MODEL;
  }
  return resolveOpenRouterModelForRequest();
}

/**
 * Активный ключ для resolveLlmProvider() (без auto-развилки).
 */
export function getLlmApiKeyForProvider(provider) {
  if (provider === 'polza') {
    const k = getPolzaApiKey();
    if (!k) {
      throw new Error('Нет POLZA_API_KEY или POLZA_AI_API_KEY (см. .env.example, config/OPENROUTER.md § Polza)');
    }
    return k;
  }
  const k = getOpenRouterApiKeyRaw();
  if (!k) {
    throw new Error('Нет OpenRouter_API_KEY или OPENROUTER_API_KEY (см. .env.example)');
  }
  return k;
}

/**
 * Разрешает auto-режим: какой провайдер реально использовать.
 */
export function getEffectiveLlmProvider() {
  const r = resolveLlmProvider();
  if (r === 'polza') {
    if (getPolzaApiKey()) return 'polza';
    if (getOpenRouterApiKeyRaw()) return 'openrouter';
    throw new Error('LLM_PROVIDER=polza, но нет POLZA_API_KEY / POLZA_AI_API_KEY');
  }
  if (r === 'openrouter') {
    if (getOpenRouterApiKeyRaw()) return 'openrouter';
    if (getPolzaApiKey()) return 'polza';
    throw new Error('LLM_PROVIDER=openrouter, но нет OpenRouter_API_KEY');
  }
  if (getPolzaApiKey()) return 'polza';
  if (getOpenRouterApiKeyRaw()) return 'openrouter';
  throw new Error('Нет ни POLZA_API_KEY, ни OpenRouter_API_KEY');
}

/**
 * @param {object} opts
 * @param {string} opts.provider
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.max_tokens]
 * @param {string} [opts.xTitle] — только OpenRouter (X-Title)
 * @param {Record<string, unknown>} [opts.extraBody] — доп. поля тела (например provider для Polza)
 */
export async function postChatCompletion(opts) {
  const { provider, messages, temperature, max_tokens: maxTokens, xTitle, extraBody } = opts;
  const apiKey = getLlmApiKeyForProvider(provider);
  const model = resolveChatModelForProvider(provider);

  const url =
    provider === 'polza' ? `${getPolzaBaseUrl()}/chat/completions` : OPENROUTER_URL;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER || 'http://localhost';
    headers['X-Title'] = xTitle || 'hh-ru-apply';
  }

  const body = {
    model,
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(extraBody && typeof extraBody === 'object' ? extraBody : {}),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    const label = provider === 'polza' ? 'Polza' : 'OpenRouter';
    throw new Error(`${label} ${res.status}: ${rawText.slice(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const label = provider === 'polza' ? 'Polza' : 'OpenRouter';
    throw new Error(`${label}: не JSON в теле ответа: ${rawText.slice(0, 300)}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    const label = provider === 'polza' ? 'Polza' : 'OpenRouter';
    throw new Error(`${label}: пустой ответ choices[0].message.content`);
  }

  const usedModel = data?.model || model;
  return { data, text, usedModel, provider };
}
