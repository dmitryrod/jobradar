# workflow-implement

**Workflow с review** — четыре субагента для задач средней сложности (несколько связанных файлов, нужен code review) и для маркетинговых deliverables, которым нужен review/синтез нескольких skills. Для кода: Worker создаёт код и тесты, Test-Runner верифицирует, Reviewer-Senior проверяет качество и архитектуру, Documenter добавляет документацию. Для marketing tactical review-first задач первичный агент — `marketing`.

**Использование:** `/workflow-implement <описание задачи>` — например: `/workflow-implement Добавь валидацию форм с отображением ошибок`

## Шаги

**Как вызывать субагентов:** для каждого шага вызывай инструмент **Task** с параметрами subagent_type (`designer` | `imager` | `worker` | `test-runner` | `debugger` | `reviewer-senior` | `documenter` | `marketing` | `researcher`), prompt, description. Не выполняй роли designer/imager/worker/test-runner/reviewer-senior/documenter/marketing самостоятельно — только через Task.

Выполни последовательно, делегируя каждому субагенту его часть:

0. **Инициализация репо (если задача — создать новый проект)**
   - Если папка не git-репозиторий: `git init`, при наличии `gh` — `gh repo create`. Опционально — один issue на задачу. Ветка + PR в конце.

**Ветвление:** если нужны токены/UI-спека/макет перед кодом — сначала `Task(subagent_type="designer", ...)`, затем worker. Если задача **только** дизайн-документы без кода — `designer` → `documenter` (без worker, test-runner, reviewer-senior). Если задача — **marketing deliverable средней сложности** (например, несколько связанных артефактов: landing copy + email sequence + CRO notes), **перейди сразу к секции `Marketing branch` ниже** и не выполняй инженерные шаги 1–4; при свежих веб-фактах добавь перед `marketing` шаг `researcher`.

1. **Worker — реализация**
   - Вызови Task(subagent_type="worker", prompt="...", description="Worker implementation") с задачей из запроса пользователя.
   - Worker создаёт код и тесты (если применимо).
   - Дождись завершения.

2. **Test-Runner — верификация**
   - Вызови Task(subagent_type="test-runner", ...) для запуска тестов.
   - Если тесты падают — test-runner исправляет (сохраняя намерение теста).
   - Если test-runner не справляется — вызови Task(subagent_type="debugger", ...). После исправления — снова test-runner.
   - Дождись успешного прохождения или явного отчёта о проблемах.

3. **Reviewer-Senior — code review**
   - Вызови Task(subagent_type="reviewer-senior", ...) для проверки качества кода и архитектуры.
   - Если reviewer-senior нашёл проблемы — исправь или вызови Task(subagent_type="debugger", ...) для сложных исправлений.
   - Повтори reviewer-senior при необходимости.

4. **Documenter — документация**
   - Вызови Task(subagent_type="documenter", ...) для создания документации.
   - Documenter добавляет docstrings, README-секцию или API-описание. Не создаёт `ai_docs/` — только inline и README.
   - Дождись завершения.

**Marketing branch:**

1. **Researcher — веб-факты (опционально)**
   - Если deliverable зависит от актуальных конкурентов, обзоров, цен, рыночных данных — вызови Task(subagent_type="researcher", ...).
   - Передай сводку в следующий шаг.

2. **Marketing — реализация deliverable**
   - Вызови Task(subagent_type="marketing", prompt="...", description="Marketing implementation") с задачей из запроса пользователя.
   - Marketing выбирает 1–3 leaf skills через `marketing-router`.

3. **Reviewer-Senior — review deliverable (опционально)**
   - Если нужен второй взгляд на структуру/качество/согласованность ассета или `.cursor`-изменений — вызови Task(subagent_type="reviewer-senior", ...).

4. **Documenter — документация**
   - Если результат надо зафиксировать в `.cursor/`, README или process-doc — вызови Task(subagent_type="documenter", ...).

## Результат

Перед возвратом результата:

1. **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (путь из config.metrics.sessionsPath) со структурой: timestamp, reportDate, command (workflow-implement), workflow (implement), workflowReason, primaryAgent, taskType, escalation, subagentsCalled, debuggerCalls, testsApplicable, testsPassed, reviewerFindings, securityAuditorCalled, documentationCreated, taskSummary.
2. **Запусти скрипт метрик:** `node .cursor/scripts/metrics-report.js`.
3. Включи итоговый скор в ответ (блок «Метрики»).

Верни пользователю резюме:
- Что реализовано
- Статус тестов
- Замечания reviewer-senior и исправления
- Где находится документация
- Блок «Метрики» со скором

## Заметки

- **Средний уровень.** Для простых задач используй `/workflow-scaffold`, для сложных фич с декомпозицией — `/workflow-feature`.
- Не вызывай planner, security-auditor — это scope `/workflow-feature`.
- Debugger вызывается при падении тестов (шаг 2) или при необходимости исправить замечания reviewer-senior (шаг 3).
- Для marketing deliverables test-runner обычно не нужен; выставляй `testsApplicable: false`, а review/documentation — по необходимости результата.
- Если проект без тестов — пропусти шаг 2, укажи это в резюме.
