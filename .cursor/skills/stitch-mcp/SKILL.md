---
name: stitch-mcp
description: Google Stitch MCP (UI screens, design systems). Use when generating or editing Stitch projects/screens or syncing tokens with the designer agent.
---

# Google Stitch MCP

Официальный MCP: `https://stitch.googleapis.com/mcp`. В Cursor сервер задаётся в пользовательском `mcp.json` под именем **`stitch`** (см. заголовок `X-Goog-Api-Key`). **Ключ не коммитить** — только в локальном `mcp.json` или секретах окружения.

## Канонический статус Stitch в репозитории

- Stitch отдаёт **сырьё** для дизайна: `theme`, `designMd`, `htmlCode`, метаданные проекта/экранов, подсказки композиции.
- Ответы Stitch **не** считаются финальным каноническим артефактом репозитория для Marp или UI.
- Канонический спек формирует агент **`designer`**: **`DESIGN_TOKENS.md`** и при необходимости расширенный **`*.tokens.json`** (см. `presentations/DESIGN_TOKENS.md`, [`.cursor/agents/designer.md`](../../agents/designer.md)).
- Сырой снимок MCP сохраняй как **`*-raw.tokens.json`** или фрагмент JSON без сильной нормализации — см. [`.cursor/docs/CREATING_ASSETS.md` § Stitch → snapshot](../../docs/CREATING_ASSETS.md#stitch-designer-canonical).

## Когда вызывать

- Генерация экранов из текста, варианты, правки экранов.
- Проекты Stitch: список, создание, детали.
- Дизайн-системы: список, создание, обновление, применение к экранам.

Агент **`designer`** использует эти инструменты для визуальной работы; реализация кода в приложении остаётся за **`worker`**.

## Вызов из Cursor

Перед первым вызовом прочитай JSON-схему нужного инструмента в каталоге MCP descriptors (если доступен): `mcps/user-stitch/tools/<tool>.json`.

Используй **`call_mcp_tool`** с **`server`**: в пользовательском `mcp.json` обычно **`stitch`**; в сессии Cursor иногда отображается как **`user-stitch`** — смотри список доступных MCP-серверов. Далее **`toolName`** из таблицы ниже.

## Инструменты (toolName)

| toolName | Назначение |
|----------|------------|
| `list_projects` | Список проектов (фильтр `view=owned` / `view=shared`). |
| `get_project` | Детали проекта по ID. |
| `create_project` | Новый проект (контейнер экранов). |
| `list_screens` | Экраны в проекте. |
| `get_screen` | Конкретный экран (после генерации — дождаться готовности). |
| `generate_screen_from_text` | Новый экран из промпта (**долго**, не ретраить подряд; при обрыве — позже `get_screen`). |
| `edit_screens` | Правки экранов по промпту. |
| `generate_variants` | Варианты дизайна. |
| `list_design_systems` | Доступные дизайн-системы. |
| `create_design_system` | Создать дизайн-систему. |
| `update_design_system` | Обновить. |
| `apply_design_system` | Применить к выбранным screen instances (`assetId` из list, инстансы из `get_project`). |

## Практический порядок

1. Нет `projectId` → `list_projects` или `create_project` → сохранить numeric **projectId** (без префикса `projects/`).
2. Генерация → `generate_screen_from_text` с `projectId`, `prompt`, при необходимости `deviceType` / `modelId`.
3. Подождать; при сбое соединения не спамить повтором — проверить `get_screen` / список экранов.
4. Дизайн-система: `list_design_systems` → при необходимости `apply_design_system` с ID из `get_project.screenInstances`.

## Ограничения

- Долгие операции: не считать зависанием; не делать параллельных дублей одной генерации.
- Итог для репозитория: по возможности дублировать ключевые токены/описание в markdown в `presentations/` или `app/docs/`, чтобы не зависеть только от облака Stitch.
- Ошибки квоты/ключа — зафиксировать в ответе пользователю, перейти на спеки без MCP.

### Экспорт картинок / SVG / скриншоты (ненадёжно)

**Не рассчитывай** на скачивание изображений из Stitch для вставки в Marp, сайт или артефакты репозитория:

- URL **скриншотов** / превью из ответов API часто дают **битые файлы**, **чёрный экран**, **не тот контент** (прокси, сессии, форматы).
- **SVG** и скачанные «как файл» превью из Stitch — часто **битые**; не использовать как готовый встраиваемый ассет.

**HTML экрана (`htmlCode` / ответ `get_screen`) — да, как референс для Marp (не вставка целиком):**

- Прочитать разметку/стили **вручную** или из сохранённого файла: палитра, шрифты, иерархия блоков → перенести в **`style:` / theme** Marp и в структуру слайдов (заголовки, списки).
- **Не** копировать весь DOM в `.md` ожидая стабильного **pptx** — Marp/PowerPoint не воспроизводят веб-макет 1:1.
- Наравне с HTML полезны **`theme.namedColors`**, **`designMd`**, текстовые описания — то же переносится в Marp.

**Что делать для картинок в слайдах:**

- **Локальные** PNG/SVG (`presentations/assets/`), matplotlib/plotly (`chart_from_csv.py`); Stitch **не** как источник бинарных картинок по URL.
- Если нужна иллюстрация «как на экране» без HTML — описать словами или собрать макет локально.
