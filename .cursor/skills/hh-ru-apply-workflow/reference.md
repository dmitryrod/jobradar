# Справка: LLM, секреты, стиль писем

## OpenRouter и оценка вакансий

Полная инструкция: [config/OPENROUTER.md](../../../config/OPENROUTER.md). Ключ и модель — в **`.env`** в корне (шаблон: [.env.example](../../../.env.example)).

## Gemini

Файл [config/GEMINI.md](../../../config/GEMINI.md) помечен как устаревший; актуальный путь — OpenRouter, см. выше.

## Стиль сопроводительных (env)

Из [README.md](../../../README.md): опционально в `.env` задают `COVER_LETTER_STYLE_MAX_CHARS` (по умолчанию 5000), `COVER_LETTER_STYLE_QUEUE_ITEMS` (по умолчанию 4). Ручные эталоны — `config/cover-letter-style-examples.txt` (шаблон: `config/cover-letter-style-examples.example.txt`).

Код контекста стиля: [lib/cover-letter-style-context.mjs](../../../lib/cover-letter-style-context.mjs); генерация через LLM (Polza или OpenRouter) — `lib/cover-letter-openrouter.mjs`, общий HTTP-слой `lib/llm-chat.mjs` (см. [config/OPENROUTER.md](../../../config/OPENROUTER.md)).
