# workflow-scaffold

**Быстрый workflow** — три субагента для простых задач (компонент, функция, эндпоинт) и точечных deliverables. Без планирования, без code review, без security audit. Для кода: Worker создаёт код и тесты, Test-Runner верифицирует, Documenter добавляет документацию. Для marketing tactical: первичный агент — `marketing`.

**Использование:** `/workflow-scaffold <описание задачи>` — например: `/workflow-scaffold Создай React компонент Button с пропсами label и onClick`

## Шаги

**Как вызывать субагентов:** для каждого шага вызывай инструмент **Task** с параметрами subagent_type (`designer` | `imager` | `worker` | `test-runner` | `debugger` | `documenter` | `marketing` | `researcher`), prompt, description. Не выполняй роли designer/imager/worker/test-runner/documenter/marketing самостоятельно — только через Task.

Выполни последовательно, делегируя каждому субагенту его часть:

0. **Инициализация репо (если задача — создать новый проект)**
   - Если папка не git-репозиторий: `git init`, при наличии `gh` — `gh repo create`. Ветка и PR — опционально.

**Ветвление по типу задачи**

- **Только дизайн / токены / UI-спеки / слайды (без кода приложения):** `designer` → `documenter`. Пропусти worker и test-runner; в резюме укажи причину.
- **Marp-дек с AI-иллюстрациями (Polza):** `designer` (токены + план слайдов) → **`imager`** (скрипт `polza_marp_images.py`) → `documenter` при необходимости. См. [`.cursor/agents/imager.md`](../agents/imager.md).
- **Дизайн-спека, затем код:** `designer` → далее шаги 1–3 как ниже.
- **Точечный marketing deliverable** (headline, CTA, landing copy, email sequence, social post, CRO/SEO page slice): `marketing`. Если нужны свежие веб-факты о рынке/конкурентах — `researcher` → `marketing`. Test-runner пропусти; в session report выставь `testsApplicable: false`.
- **Обычная реализация кода:** шаг 1 без designer.

1. **Worker — реализация**
   - Вызови Task(subagent_type="worker", prompt="...", description="Worker implementation") с задачей из запроса пользователя.
   - Worker создаёт код и тесты (если применимо).
   - Дождись завершения.

2. **Test-Runner — верификация**
   - Вызови Task(subagent_type="test-runner", ...) для запуска тестов.
   - Если тесты падают — test-runner исправляет (сохраняя намерение теста).
   - Если test-runner не справляется — вызови Task(subagent_type="debugger", ...) (единственное исключение для этого workflow).
   - Дождись успешного прохождения или явного отчёта о проблемах.

3. **Documenter — документация**
   - Вызови Task(subagent_type="documenter", ...) для создания документации.
   - Documenter добавляет docstrings, README-секцию или API-описание. Не создаёт `ai_docs/` — только inline и README.
   - Дождись завершения.

**Marketing branch:**

1. **Marketing — tactical execution**
   - Вызови Task(subagent_type="marketing", prompt="...", description="Marketing deliverable") с точным deliverable из запроса.
   - Если нужны актуальные данные о рынке/конкурентах — сначала вызови Task(subagent_type="researcher", ...), затем передай вывод в `marketing`.
   - Дождись завершения.

2. **Documenter — документация (опционально)**
   - Если marketing-результат нужно зафиксировать в `.cursor/`/README/доке процесса — вызови Task(subagent_type="documenter", ...).
   - Иначе шаг можно пропустить с явной причиной в резюме.

## Результат

Перед возвратом результата:

1. **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (путь из config.metrics.sessionsPath) со структурой: timestamp, reportDate, command (workflow-scaffold), workflow (scaffold), workflowReason, primaryAgent, taskType, escalation, subagentsCalled, debuggerCalls, testsApplicable, testsPassed, reviewerFindings, securityAuditorCalled, documentationCreated, taskSummary.
2. **Запусти скрипт метрик:** `node .cursor/scripts/metrics-report.js`.
3. Включи итоговый скор в ответ (блок «Метрики»).

Верни пользователю краткое резюме:
- Что реализовано
- Статус тестов
- Где находится документация
- Блок «Метрики» со скором

## Заметки

- **Минимальный набор.** Не вызывай planner, reviewer-senior, refactor, security-auditor. Debugger — только если test-runner не справляется с падениями тестов. Для сложных фич используй `/workflow-implement` или `/workflow-feature`.
- Для простых задач (одна функция, один компонент) этот workflow занимает минуты.
- Для marketing tactical этот workflow допустим только для **точечного** результата; полный GTM / research — это уже `marketing-researcher` и обычно не `workflow-scaffold`.
- Если проект без тестов — пропусти шаг 2, укажи это в резюме.
