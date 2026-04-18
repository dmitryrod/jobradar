# CREATING_ASSETS — Гайд по созданию агентов, скиллов и команд

Этот файл описывает соглашения для **этого** проекта. Следуй им при добавлении нового агента, скилла или команды в `.cursor/`.

<a id="task-delegation"></a>

## Инструмент `Task` и делегирование (канон)

Этот раздел — **единственный источник истины** по имени инструмента субагентов. Любая новая команда, skill, rule или правка примера в `.cursor/` **не должна** его обходить.

### Что писать в инструкциях

- Субагенты вызываются только через встроенный инструмент Cursor **`Task`** (параметры `subagent_type`, `prompt`, `description`, при необходимости `model`, `readonly`, `run_in_background`).
- В примерах вызова используй **`Task(subagent_type="...", ...)`** или формулировки «вызови **`Task`** с …».

### Чего не писать (чтобы проблема не вернулась)

| Запрещено | Почему |
|-----------|--------|
| **`mcp_task`** в любом виде | Такого инструмента нет; модель не вызовет субагентов и сделает всё в одном агенте. |
| Связка «субагенты через MCP» без уточнения | Субагенты — **не** из списка MCP-серверов в настройках; путаница снова приведёт к неверному имени. |
| Другое выдуманное имя (`agent_task`, `subagent_mcp`, …) | Только **`Task`** совпадает с палитрой инструментов Cursor. |

Историческая ошибка репозитория: везде писали ложное имя (см. ячейку «Запрещено» в таблице выше) — заменено на **`Task`**. **Не возвращай** его при копипасте из старых чатов или внешних гайдов.

### Поведение IDE

«Отдельные окна» контекста субагентов бывают только если модель **реально вызывает `Task`**. Если в сессии нет инструмента `Task` (Ask, отключённые агентные инструменты), вся цепочка остаётся в одном чате — см. [`workflow-selection.mdc`](../rules/workflow-selection.mdc).

<a id="custom-subagent-types"></a>

### Кастомные `subagent_type` и marketing-агенты

Файлы [`.cursor/agents/`](../agents/) с полем `name: <slug>` описывают роли, вызываемые как **`Task(subagent_type="<slug>", ...)`**. Cursor подхватывает такие агенты из репозитория, когда сборка поддерживает пользовательские subagents.

| Агент | Назначение |
|-------|------------|
| [`marketing`](../agents/marketing.md) | Точечные маркетинговые задачи после [`marketing-context`](../skills/marketing-context/SKILL.md) + [`marketing-router`](../skills/marketing-router/SKILL.md) |
| [`marketing-researcher`](../agents/marketing-researcher.md) | Полный intake/research/GTM roadmap по [`marketing-research-playbook`](../skills/marketing-research-playbook/SKILL.md) |

**Контекст продукта:** `.cursor/marketing-context.md` (шаблон: [`.cursor/marketing-context.example.md`](../marketing-context.example.md)). Карта upstream → локальных skills: [`MARKETING_SKILLS_UPSTREAM.md`](MARKETING_SKILLS_UPSTREAM.md).

**Fallback:** если `Task` с `subagent_type="marketing"` / `marketing-researcher` в среде недоступен, исполняющий агент читает те же `SKILL.md` и выполняет роль в текущей сессии **или** делегирует фрагменты существующим ролям (например `researcher` для веб-фактов), без выдумывания данных.

**Интеграция с `/norissk`:** если строка в [`agent-intent-map.csv`](agent-intent-map.csv) указывает `primary_agent=marketing` или `marketing-researcher`, команда [`norissk`](../commands/norissk.md) должна запускать именно этот `Task` как первый шаг, а не сводить такой запрос к generic `worker`-цепочке только из-за глаголов вроде «напиши» или «создай».

Если сработала строка **`hh_ru_apply`**, исполняющий агент **сначала** читает skill [`hh-ru-apply-workflow`](../skills/hh-ru-apply-workflow/SKILL.md), затем строит цепочку с **`Task(subagent_type="worker", …)`** (и при необходимости `debugger` / `test-runner` / `documenter`), а не угадывает пути и команды из памяти.

<a id="why-task-not-called"></a>

### Почему один и тот же `/norissk …` то вызывает субагентов, то делает всё в одном агенте

| Причина | Что происходит |
|--------|----------------|
| **Нет инструмента `Task` в сессии** | Режим Ask, часть сборок Composer/API без агентных инструментов, отключённые subagents в настройках. Модель **физически не может** вызвать субагентов — только отработать правила в одном ответе. |
| **`Task` есть, но модель не вызывает** | Нарушение инструкций (экономия шагов, «сделаю сам быстрее»). Это не детерминировано продуктом: зависит от модели и контекста. |
| **Конфликт целей** | В [`norissk.md`](../commands/norissk.md) сказано «полная цепочка workflow» — при длинном промпте модель может сократить путь. Нужна явная политика **минимальной цепочки по триггерам** (ниже). |

**Как сместить вероятность в сторону субагентов:** чат в **режиме Agent** (не Ask), включённые агентные инструменты, в конце промпта одна строка: «Вызови `Task` для каждого шага цепочки, не подменяй роли».

<a id="trigger-routing"></a>

### Триггеры → не «все субагенты подряд», а **релевантный** набор

Цель: при `/norissk` + словах из [карты формулировок](#agent-intent-map) вызывать **`Task` только для тех `subagent_type`, которые нужны по смыслу запроса**, в **логичном порядке** (зависимости: например после падения тестов — `debugger` перед повторным `test-runner`).

**Алгоритм для исполняющего агента**

1. **Собрать множество сработавших групп** по словам в запросе (RU/EN из таблицы и синонимы вроде **задеплой**, **проревьюй** — см. расширения ниже).
2. **Выбрать workflow** (`scaffold` / `implement` / `feature`) по [`workflow-selector`](../skills/workflow-selector/SKILL.md) и сложности задачи; при нескольких триггерах — как в [`norissk.md`](../commands/norissk.md): `feature` > `implement` > `scaffold`.
3. **Собрать упорядоченную цепочку `Task`**:
   - Взять **базовый шаблон** цепочки для выбранного workflow из [`workflow-scaffold`](../commands/workflow-scaffold.md) / [`workflow-implement`](../commands/workflow-implement.md) / [`workflow-feature`](../commands/workflow-feature.md).
   - **Включить шаг**, если выполняется хотя бы одно из условий:
     - шаг **обязателен** для выбранного типа артефакта (например правка кода → после `worker` обычно нужен `test-runner`; только доки без кода → можно **без** `worker`/`test-runner`);
     - шаг соответствует **первичному агенту** сработавшей группы триггеров ([карта сценариев](#agent-intent-map));
     - шаг нужен по **явным** словам («проревьюй» → `reviewer-senior`; «задеплой» → `worker` с промптом про деплой; «исправь» → при необходимости `debugger` перед `worker`).
   - **Исключить** шаг, если он **не следует** из запроса (пример: только «обнови README» → `documenter`, без `worker`/`test-runner`, если код не меняется).
4. **Не дублировать** один и тот же `subagent_type` подряд без причины; порядок — как в выбранном workflow, с вставкой `debugger` при провале тестов.

**Расширения слов (частые, не дублируя таблицу):** задеплой / deploy → как «собери/запусти» (`worker`); проревьюй / review → `reviewer-senior` (после кода и тестов, если они были в цепочке).

Итог: **обязательны не «все роли workflow всегда»**, а **минимально достаточная** цепочка, согласованная с триггерами и типом результата (код / доки / дизайн / смесь / marketing deliverable).

### Обязательная проверка перед merge любых правок в `.cursor/`

1. Поиск по `.cursor/`: строка из колонки «Запрещено» в таблице выше — **допустима только в этой таблице** (файл `CREATING_ASSETS.md`); во **всех остальных** файлах под `.cursor/` вхождений **ноль** (архив отчётов `.cursor/reports/*.json` не считается — там может быть история сессий). Удобно: `rg` / поиск IDE и просмотр совпадений.
2. В новых командах и skills — везде **`Task`**, не синонимы.
3. В [`rules/README.md`](../rules/README.md) при добавлении правила про workflow — ссылка на этот раздел (`#task-delegation`) или на [`workflow-selection.mdc`](../rules/workflow-selection.mdc).

---

<a id="agent-intent-map"></a>

## Карта формулировок → первичный агент → workflow

Визуальная схема: **какие глаголы в запросе** наводят на **кого звать первым** и **какой базовый workflow** (итоговая цепочка всё равно задаётся командами `/workflow-*` и skill [`workflow-selector`](../skills/workflow-selector/SKILL.md)). Делегирование — только через **`Task(subagent_type=...)`** ([`workflow-selection.mdc`](../rules/workflow-selection.mdc)).

**Локальная RAG-память проекта** (индексация `agent-transcripts/`, хуки, `active_memory.md`) описана в отдельном каноническом файле: [`PROJECT_RAG_MEMORY.md`](PROJECT_RAG_MEMORY.md).

**Поиск похожих проектов на GitHub** (скилл **`github-researcher`**, опционально MCP `github`): [`GITHUB_RESEARCH.md`](GITHUB_RESEARCH.md).

### Каноническая таблица (отдельный файл)

**Полная матрица сценариев** — в **[`agent-intent-map.csv`](agent-intent-map.csv)** (UTF-8, разделитель запятая). Там же: типичные цепочки субагентов, скиллы, опциональные MCP, скрипты, примечания. Открытие в Excel/LibreOffice/IDE сохраняет колонки.

**Правило целостности:** карта должна оставаться **исчерпывающей** для маршрутизации `/norissk` и workflow-команд. При добавлении или существенном изменении **агента** (`.cursor/agents/`), **скилла** (`.cursor/skills/`), типовой **команды** (`.cursor/commands/`), проектного **скрипта**, или когда новый сценарий пользователя не попадает ни в одну строку — **обнови CSV**: новая строка (`id` в snake_case) или правка колонок существующей. Если сценарий узкий и одноразовый — строка с развёрнутым `notes` и ссылкой на ассет; не оставляй «дыры» только в prose в этом файле.

**Приоритет при конфликте:** если краткий текст ниже или в команде расходится с **`agent-intent-map.csv`**, правь **сначала CSV**, затем согласуй остальные документы.

### Колонки `agent-intent-map.csv`

| Колонка | Назначение |
|---------|------------|
| `id` | Стабильный ключ строки (не переименовывать без поиска ссылок) |
| `group_ru` | Название группы сценария |
| `keywords_ru` / `keywords_en` | Триггерные слова (в CSV в кавычках при запятых) |
| `primary_agent` | С кого начинать цепочку `Task` |
| `workflow` | Ориентир: scaffold / implement / feature / вставка в цепочку |
| `agents_typical` | Типичный порядок субагентов (`;` между шагами) |
| `skills` | Релевантные скиллы (папки под `.cursor/skills/`) |
| `mcp` | Опциональные MCP: имена из настроек пользователя; не обязательны для работы репо |
| `scripts` | `node` / `uv` / пути скриптов от корня репозитория |
| `notes` | Граничные случаи, ссылки на § этого файла или на команды |

**Как читать карту**

- **Первичный агент** — с кого начать цепочку `Task` для типа задачи; стрелка `debugger → worker` означает: сначала отладка/диагностика, затем правка кода. Если нужны **только** правки в `app/docs/`, docstrings и README без смены логики кода — можно начать с **documenter** (или завершить любой workflow шагом documenter, как в командах `/workflow-*`).
- **Workflow** — ориентир по сложности: `scaffold` / `implement` / `feature` из [`workflow-selector`](../skills/workflow-selector/SKILL.md). Ячейка **по контексту** — выбери workflow по критериям скилла, не по одному глаголу.
- **По контексту** и границы **implement / feature**: при сомнении — более полный workflow (как в скилле workflow-selector).
- Явная пользовательская команда **`/workflow-scaffold`**, **`/workflow-implement`**, **`/workflow-feature`**, **`/norissk`** переопределяет эвристику по глаголам.
- Для marketing deliverables строки `marketing_tactical` / `marketing_research` могут **переопределять** generic `creation_simple` / `creation_complex`, даже если запрос содержит слова «напиши», «создай» или «сделай».
- Для автоматизации hh.ru / Playwright в этом репозитории строка **`hh_ru_apply`**: исполняющий агент **до** `Task(worker)` читает skill **`hh-ru-apply-workflow`** и передаёт субагенту контракты из него (пути данных, команды `npm run`, ограничения сценариев).
- **Команда `/norissk` + слова-триггеры** из CSV: исполняющий агент **обязан** пройти **согласованную** цепочку вызовов **`Task`** для выбранного workflow (не подменять роли субагентов самостоятельно). Детали и исключения: [`norissk.md` § trigger-delegation](../commands/norissk.md#trigger-delegation).
- **Marp-презентации** (Markdown → pptx/pdf/html): скилл **`marp-slide`**; пути **`presentations.source`** и **`presentations.output`** в [`.cursor/config.json`](../config.json) (`presentations`); сборка — **`@marp-team/marp-cli`** только если в корне проекта есть `package.json` с соответствующим script/dependency. Субагент **`designer`**. **Google Stitch** (скилл **`stitch-mcp`**) — для токенов/описания темы в MCP-ответах; **не** как источник готовых картинок по URL (скриншоты/SVG из Stitch для репо ненадёжны — см. **`stitch-mcp`**). Детали строки `design_deck` в CSV.

<a id="stitch-designer-canonical"></a>

### Stitch → сырой snapshot, designer → канонический спек

Правило репозитория (см. также [`stitch-mcp`](../skills/stitch-mcp/SKILL.md), [`designer`](../agents/designer.md), [`marp-slide`](../skills/marp-slide/SKILL.md)):

| Роль | Артефакт | Содержание |
|------|----------|------------|
| **Stitch (MCP)** | `*-raw.tokens.json` и/или сохранённый JSON-фрагмент ответа MCP | Сырой снимок: `theme`, `designMd`, `htmlCode`, метаданные, подсказки экранов — **без** агрессивной нормализации и без объявления «финальной правды» для Marp/UI. |
| **designer** | **`DESIGN_TOKENS.md`** (+ при необходимости **`*-extended.tokens.json`**) | Нормализованный дизайн-контракт: семантические токены, типографика, Marp-mapping, компонентные рецепты, правила изображений и графиков. |

- Если Stitch **недоступен** (quota, auth, timeout, нет MCP): **designer** обязан собрать полный контракт **самостоятельно** и явно пометить источник как **`designer-derived`** (в `DESIGN_TOKENS.md` → Overview → source).
- Гибрид (часть из Stitch, часть вручную) — пометка **`hybrid`** с разделом «что из Stitch / что нормализовано / что эвристически».

**Внешние ориентиры** (паттерны, не зависимости): `design-md` (DESIGN.md как человекочитаемый source of truth после извлечения из Stitch), `enhance-prompt` (структурированный промпт с design-context и role-based mapping), `stitch-loop` (раздельное хранение raw snapshot / canonical doc / metadata). Ссылки: [design-md](https://skills.sh/google-labs-code/stitch-skills/design-md), [enhance-prompt](https://skills.sh/google-labs-code/stitch-skills/enhance-prompt), [stitch-loop](https://skills.sh/google-labs-code/stitch-skills/stitch-loop).

**Polza (изображения для Marp):** только выборочно, локальные файлы под **`presentations/`**, не подменяют фактические графики. План токенов/слайдов — [`designer`](../agents/designer.md); **вызов API и запись файлов** — агент [`imager`](../agents/imager.md) и скрипт `presentations/scripts/polza_marp_images.py` (см. также скилл [`ai-image-generation`](../skills/ai-image-generation/SKILL.md); внешний ориентир по практикам: [tool-belt/ai-image-generation](https://skills.sh/tool-belt/skills/ai-image-generation)). Якорь: `#stitch-designer-canonical`.

<a id="ecosystem-integrator"></a>

### Безопасная интеграция внешних скиллов (ecosystem-integrator)

Пакеты из открытой экосистемы ([skills.sh](https://skills.sh/), CLI `npx skills`, GitHub) **не копируются в репозиторий без адаптации**: внешние `SKILL.md` часто предполагают прямое действие агента без **`Task`**, что ломает оркестрацию.

| Шаг | Кто | Что |
|-----|-----|-----|
| Поиск | `researcher` (и при необходимости `npx skills find`, веб) | Выбор пакета, оценка источника |
| Адаптация | `worker` | Переписывание под канон: **`Task`**, структура `.cursor/skills/<name>/SKILL.md`, опционально `.cursor/rules/*.mdc`, **только** `.cursor/mcp.*.example.json` для MCP |
| Проверка | `reviewer-senior` | Нет нарушений делегирования и секретов в git |
| Регистрация | `documenter` | **[`agent-intent-map.csv`](agent-intent-map.csv)** (строка `ecosystem_integration`), этот файл (списки команд/скиллов), [`rules/README.md`](../rules/README.md) при новом правиле; при затронутом `app/` — **`app/docs/`** по [`.cursor/rules/documentation.mdc`](../rules/documentation.mdc) |

**Команда:** [`workflow-integrate-skill`](../commands/workflow-integrate-skill.md). Скилл: [`ecosystem-integrator`](../skills/ecosystem-integrator/SKILL.md).

---

## Агенты (`.cursor/agents/`)

### Frontmatter-шаблон

```markdown
---
name: agent-name
description: >-
  One-sentence description of what this agent does and when to invoke it.
  Invoked via Task with subagent_type="agent-name".
skills: [skill-one, skill-two]
---
```

### Соглашения

- Имена — строчные, без префикса `agt-`: `worker`, `planner`, `researcher`, не `agt-worker`.
- `description` — одно-два предложения; первое: что делает, второе: когда использовать.
- `skills` — только скиллы из `.cursor/skills/`, которые агент реально читает.
- В начале файла — блок **Required Skill Dependencies** с явным указанием, какие файлы читать.
- Секции DO/DON'T — по 3–5 пунктов, конкретные запреты/обязательства.
- Quality Checklist в конце — что должно быть выполнено перед завершением.

### Структура файла агента

```markdown
---
(frontmatter)
---

Короткое описание роли (1–2 предложения).

## Required Skill Dependencies

Before performing tasks:
1. Read `.cursor/skills/<skill>/SKILL.md`
2. Apply patterns from the skill — do NOT duplicate its content

## When invoked

1. ...
2. ...

## ✅ DO:
- ...

## ❌ DON'T:
- ...

## Quality Checklist
- [ ] ...
```

### Примеры существующих агентов

- [`worker.md`](../agents/worker.md) — базовый реализатор
- [`designer.md`](../agents/designer.md) — дизайн: слайды, токены, UI-спеки (не код приложения)
- [`imager.md`](../agents/imager.md) — генерация локальных изображений для Marp через Polza (`polza_marp_images.py`); вызывается из цепочки после `designer`, когда нужны AI-фоны/обложки
- [`documenter.md`](../agents/documenter.md) — документация (`app/docs/`, docstrings, README); скилл [`docs`](../skills/docs/SKILL.md)
- [`planner.md`](../agents/planner.md) — декомпозиция задач
- [`reviewer-senior.md`](../agents/reviewer-senior.md) — двухуровневый ревью
- [`researcher.md`](../agents/researcher.md) — исследование подходов до реализации; скилл [`firecrawl-mcp`](../skills/firecrawl-mcp/SKILL.md) для веб-источников (MCP `user-firecrawl-mcp`)
- [`marketing.md`](../agents/marketing.md) — тактический маркетинг (копирайт, CRO, SEO-кусок и т.д.); skills: [`marketing-context`](../skills/marketing-context/SKILL.md), [`marketing-router`](../skills/marketing-router/SKILL.md)
- [`marketing-researcher.md`](../agents/marketing-researcher.md) — полный marketing research / GTM roadmap; skills: [`marketing-context`](../skills/marketing-context/SKILL.md), [`marketing-research-playbook`](../skills/marketing-research-playbook/SKILL.md), [`marketing-router`](../skills/marketing-router/SKILL.md)

---

## Скиллы (`.cursor/skills/`)

### Frontmatter-шаблон

```markdown
---
name: skill-name
description: What this skill provides. Use when doing X.
---
```

### Соглашения

- Каждый скилл — отдельная папка: `.cursor/skills/skill-name/SKILL.md`.
- Имя папки = имя скилла в frontmatter.
- Скилл описывает **паттерны и чеклисты**, не конкретные задачи.
- Примеры кода — на Python (стек проекта), не TypeScript/JS.
- Скилл не дублирует содержимое другого скилла — только ссылается.
- Связанные агенты указывают скилл в frontmatter `skills: [...]`.

### Примеры существующих скиллов

- [`code-quality-standards`](../skills/code-quality-standards/SKILL.md) — чеклист для reviewer-senior Level 1
- [`architecture-principles`](../skills/architecture-principles/SKILL.md) — чеклист для reviewer-senior Level 2
- [`task-management`](../skills/task-management/SKILL.md) — формат задач для planner
- [`brainstorming`](../skills/brainstorming/SKILL.md) — идея → дизайн → согласование до плана; ориентир: [obra/superpowers/brainstorming](https://skills.sh/obra/superpowers/brainstorming)
- [`security-guidelines`](../skills/security-guidelines/SKILL.md) — паттерны безопасности
- [`firecrawl-mcp`](../skills/firecrawl-mcp/SKILL.md) — поиск/скрейп/краул веба через MCP (совместно с агентом `researcher`; не дублирует `user-context7` для доков библиотек)
- [`ecosystem-integrator`](../skills/ecosystem-integrator/SKILL.md) — безопасное подключение внешних best-practices пакетов под **`Task`** и документацию; см. [§ ecosystem-integrator](#ecosystem-integrator)
- [`marketing-context`](../skills/marketing-context/SKILL.md) — единый продуктовый маркетинговый контекст (файл `.cursor/marketing-context.md`)
- [`marketing-router`](../skills/marketing-router/SKILL.md) — маршрутизация запроса к 1–3 leaf marketing skills
- [`marketing-research-playbook`](../skills/marketing-research-playbook/SKILL.md) — пошаговый playbook для агента `marketing-researcher`
- Остальные leaf skills: см. [`MARKETING_SKILLS_UPSTREAM.md`](MARKETING_SKILLS_UPSTREAM.md)

---

## Команды (`.cursor/commands/`)

### Соглашения

- Файл = команда: `workflow-feature.md` → `/workflow-feature`.
- Первая строка — заголовок `# command-name`.
- Вторая строка — краткое описание (что делает, какие субагенты).
- Субагенты вызываются **только** через `Task(subagent_type="...")`.
- Ссылки на другие команды и шаблоны — относительными путями `.cursor/...`.

### Список команд

- [`workflow-scaffold`](../commands/workflow-scaffold.md) — быстрый (при необходимости designer → worker или designer → documenter; см. ветвление в файле)
- [`workflow-implement`](../commands/workflow-implement.md) — средний (опционально designer; + reviewer-senior)
- [`workflow-feature`](../commands/workflow-feature.md) — полный (planner + designer/worker/refactor по плану + остальные субагенты)
- [`workflow-integrate-skill`](../commands/workflow-integrate-skill.md) — интеграция внешнего скилла / best practices в `.cursor/` с адаптацией и обновлением CSV/доков (см. [§ ecosystem-integrator](#ecosystem-integrator))
- [`norissk`](../commands/norissk.md) — авто-выбор workflow

---

## Чеклист перед добавлением нового ассета

- [ ] **Делегирование:** канон из раздела [Инструмент `Task` и делегирование](#task-delegation); запрещённая строка только в таблице там, в остальном `.cursor/` — нет; нет формулировок «субагент через MCP» вместо `Task` без уточнения.
- [ ] Если меняется логика маршрутизации — обновлён **[`agent-intent-map.csv`](agent-intent-map.csv)** (новая строка или правка колонок); при невозможности одной строки — `notes` + ссылка на ассет. Краткие упоминания в других `.md` не заменяют CSV.
- [ ] Имя не конфликтует с существующим агентом/скиллом/командой?
- [ ] Frontmatter заполнен корректно (name, description)?
- [ ] Если агент — есть блок Required Skill Dependencies?
- [ ] Если скилл — примеры на Python, не на TypeScript?
- [ ] Если команда — субагенты вызываются только через `Task(subagent_type="...")`?
- [ ] Ссылки из других файлов обновлены (если ассет заменяет старый)?
- [ ] README правил обновлён если добавлено новое правило?
- [ ] Если подключался **внешний** скилл / пакет skills.sh — адаптация под **`Task`**, команда **`/workflow-integrate-skill`** или эквивалентный набор шагов; обновлены **`agent-intent-map.csv`** и [§ ecosystem-integrator](#ecosystem-integrator)?
