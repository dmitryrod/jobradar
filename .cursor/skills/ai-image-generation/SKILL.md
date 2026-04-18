---
name: ai-image-generation
description: Структурированная генерация изображений для Marp/деков через Polza (OpenAI-совместимый API) и опциональные внешние CLI. Use when batch-generating narrative slide backgrounds or cover art.
---

# AI Image Generation (проект)

Внешний скилл [tool-belt/ai-image-generation](https://skills.sh/tool-belt/skills/ai-image-generation) описывает экосистему **inference.sh / `infsh`** и десятки моделей (FLUX, Gemini, Seedream и т.д.) — полезен как **ориентир по практикам**: явный `prompt`, выбор модели, `aspect_ratio`, разделение subject/style.

В **этом репозитории** канон генерации для Marp-деков:

1. **Polza** — HTTP API (OpenAI-compatible `images/generations`), ключи из `app/.env` / окружения; см. [`.cursor/config.json`](../../config.json) → `polza`. Если провайдер требует другой префикс (`/api/v2` и т.д.), переопредели **`POLZA_BASE_URL`** целиком по [документации Polza](https://polza.ai/docs/api-reference/images/generations).
2. **Скрипт** — [`presentations/scripts/polza_marp_images.py`](../../../presentations/scripts/polza_marp_images.py): утилиты слайдов, `build_image_prompt`, **`generate_image_polza()`**, CLI `generate`.
3. **Агент** — **`imager`** (`.cursor/agents/imager.md`) — единственная роль, которая должна дергать API/CLI генерации по смыслу «картинка для дека»; **designer** задаёт токены/структуру и делегирует **`Task(imager)`**.

## Что перенять с внешнего скилла (без обязательного `infsh`)

| Паттерн | Применение здесь |
|--------|-------------------|
| Явный промпт + параметры | `prompt`, `size` (например `1792x1024` для 16:9), `POLZA_MODEL` |
| «Для чего модель» | Выбор `POLZA_MODEL` в [Polza docs](https://polza.ai/docs) под стиль дека |
| Аспект | Поле `size` в запросе API; для слайдов предпочитать широкий формат |
| Не смешивать data-графики и AI | Как в [`marp-slide`](../marp-slide/SKILL.md) |

**Опционально:** установка `infsh` и запуск моделей через `infsh app run …` — вне обязательного пайплайна; при появлении у команды — можно добавлять обёртки, не заменяя Polza без решения в `DESIGN_TOKENS.md` / задаче.

## Промпт (обязательные якоря)

- Тема домена (экономика → терминал, графики, валюта; **не** generic glow).
- Палитра из `presentations/DESIGN_TOKENS.md` / `semanticTokens` в JSON.
- Негатив: без читаемого текста, логотипов, водяных знаков.

## Ссылки

- Внешний скилл: [skills.sh — ai-image-generation](https://skills.sh/tool-belt/skills/ai-image-generation)
- Polza Images API: [polza.ai — images/generations](https://polza.ai/docs/api-reference/images/generations)
- Агент: [`.cursor/agents/imager.md`](../../agents/imager.md)
