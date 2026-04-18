# LLM: Polza AI и OpenRouter (оценка вакансий и письма)

## Polza AI (предпочтительно, если задан ключ)

[Polza.ai](https://polza.ai/) — единый OpenAI-compatible API (`POST https://polza.ai/api/v1/chat/completions`). Ключ в [консоли Polza](https://polza.ai/).

В **`.env`** в корне проекта (шаблон — **`.env.example`**; при необходимости дублируйте переопределения в `.env.local`):

```
POLZA_API_KEY=...
```

Допустимо имя **`POLZA_AI_API_KEY`**. Опционально:

- **`POLZA_BASE_URL`** — по умолчанию `https://polza.ai/api/v1` (если в документации указан другой базовый путь — задайте целиком).
- **`POLZA_MODEL`** — id модели на стороне Polza (например `openai/gpt-4o-mini`). Если не задано, в коде используется **`openai/gpt-4o-mini`**.
- **`LLM_PROVIDER=polza`** — явно только Polza; **`LLM_PROVIDER=openrouter`** — только OpenRouter; **`auto`** (по умолчанию) — при наличии `POLZA_*` ключа выбирается Polza, иначе OpenRouter.

Расширенные опции маршрутизации провайдеров на стороне Polza (объект `provider` в теле запроса) см. в [документации Polza](https://polza.ai/docs) — при необходимости их можно добавить в код отдельно.

---

## OpenRouter (альтернатива)

### Ключ

1. Зарегистрируйтесь на [openrouter.ai](https://openrouter.ai/), создайте API key.
2. В **`.env`** в корне проекта (шаблон — **`.env.example`**; при необходимости дублируйте переопределения в `.env.local`):

   ```
   OpenRouter_API_KEY=sk-or-v1-...
   ```

   Допустимо и имя **`OPENROUTER_API_KEY`**. Без пробелов вокруг `=`.

## Только бесплатные модели (по умолчанию)

Скрипт принимает модель только если:

- **`openrouter/free`** — маршрутизатор, сам выбирает доступную бесплатную модель, или  
- id заканчивается на **`:free`** (например `google/gemma-2-9b-it:free`).

Переменная **`OPENROUTER_MODEL`**, если не задана: в коде используется **`qwen/qwen3.6-plus-preview:free`**. Чтобы снова доверить выбор модели OpenRouter, задайте **`OPENROUTER_MODEL=openrouter/free`**.

Чтобы разрешить **платные** модели (не для тестового «только free» режима):

```
OPENROUTER_ALLOW_PAID=1
OPENROUTER_MODEL=anthropic/claude-3.5-haiku
```

## Запросы

Используется endpoint `https://openrouter.ai/api/v1/chat/completions` (совместим с OpenAI Chat).

Заголовки `HTTP-Referer` и `X-Title` — по [рекомендации OpenRouter](https://openrouter.ai/docs); при желании задайте `OPENROUTER_HTTP_REFERER`.

## Три скора (кандидат решает, откликаться ли)

В одном запросе модель возвращает:

- **scoreVacancy** (0–100) — насколько объявление само по себе уместно под ваш профиль (без детальной сверки с CV).
- **scoreCvMatch** (0–100) — насколько ваши резюме из `CV/` перекрывают требования вакансии.
- **scoreOverall** (0–100) — стоит ли в целом откликаться; если модель дала некорректное значение, итог пересчитывается как взвешенная сумма двух первых.

Веса в `config/preferences.json`: **`llmScoreWeights.vacancy`** и **`llmScoreWeights.cvMatch`** (сумма нормализуется к 1).

Промпт сформулирован от лица **соискателя** (советы «вам», отклик).

Резюме в `CV/` поддерживаются **`.md`**, `.txt` и `.pdf`.

## Команды

- `npm run harvest` — сбор и оценка вакансий.
- `npm run dashboard` — очередь на http://127.0.0.1:3849
