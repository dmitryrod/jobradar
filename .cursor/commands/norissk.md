# norissk

**Универсальная точка входа** — агент анализирует задачу и сам выбирает workflow: workflow-scaffold, workflow-implement или workflow-feature. Выполняет соответствующие шаги.

**Использование:** `/norissk <описание задачи>` — например: `/norissk Добавь кнопку экспорта в PDF` или `/norissk Реализуй систему аутентификации с OAuth`

<a id="trigger-delegation"></a>

## Слова-триггеры и обязательное делегирование (`Task`)

Если в **одном запросе** с `/norissk` встречаются **слова-триггеры** из [карты формулировок](../docs/CREATING_ASSETS.md#agent-intent-map) (RU/EN), исполняющий агент **обязан**:

1. **Определить workflow** по таблице ниже (или по [`workflow-selector`](../skills/workflow-selector/SKILL.md), если триггеров несколько — склоняйся к **более полному** workflow: `feature` > `implement` > `scaffold`, как в скилле).
2. **Не выполнять** роли субагентов самостоятельно: каждый шаг **согласованной** цепочки — отдельный вызов **`Task(subagent_type=..., prompt=..., description=...)`**.
3. **Построить цепочку `Task`**: не «все роли workflow подряд без разбора», а **минимально достаточный** набор шагов по [маршрутизации триггеров → субагенты](../docs/CREATING_ASSETS.md#trigger-routing) (пересечение смысла запроса, типа артефакта и базового шаблона workflow). Пропуск шага допустим, если шаг **не следует** из запроса (пример: только документация — без `worker`). Исключения как раньше: нет тестов — пропуск `test-runner` с записью в резюме; дизайн-only — `designer` → `documenter`.
4. В **`session-*.json`** в `subagentsCalled` перечислить **все** вызванные `subagent_type` **по порядку** (для метрик делегирования).

Если инструмент **`Task`** в сессии **недоступен**, в ответе и в `workflowReason` укажи это явно; полную цепочку субагентов выполнить нельзя — см. [`CREATING_ASSETS.md` — Инструмент Task](../docs/CREATING_ASSETS.md#task-delegation).

### Триггеры → базовый workflow (сводка)

| Триггеры (примеры RU) | Триггеры (примеры EN) | Workflow по умолчанию |
|----------------------|------------------------|------------------------|
| добавь, создай, напиши, сгенерируй | add, create, write, generate | **scaffold** (если это код/артефакт в `app/` или инженерный ассет) |
| реализуй, имплементируй, разработай, построй | implement, build, develop | **implement** или **feature** (по сложности) |
| интегрируй, подключи, внедри, настрой | integrate, connect, setup, configure | **implement** или **feature** |
| сделай, выполни, реши | do, make, solve | **по контексту** (workflow-selector) |
| исправь, починь, устрани | fix, patch, resolve | **scaffold** или **implement** (часто нужен `debugger` → затем `worker`) |
| обнови, измени, переделай, расширь | update, change, modify, extend | **implement** |
| рефактори, улучши, оптимизируй | refactor, optimize, improve | **implement** / **feature** |
| мигрируй, перенеси, портируй | migrate, move, port | **feature** |
| переименуй, удали, перемести | rename, delete, remove | **scaffold** |
| задокументируй, опиши API, README, docstrings | document, describe API, update README | цепочка с **documenter** (часто **scaffold** / **implement** без кода) |
| копирайт, лендинг, CTA, рекламный текст, email, соцпост, CRO, SEO правки страницы | copy, landing page, CTA, ad copy, email, social post, page CRO, SEO copy | **по контексту** с первичным агентом **`marketing`** |
| маркетинговое исследование, GTM, позиционирование, запуск продукта, маркетинг под ключ, ICP | marketing research, GTM, positioning, product launch, full marketing plan, ICP | **по контексту** с первичным агентом **`marketing-researcher`** |
| оформи, макет слайдов, deck, tokens, mockup | design, layout, deck, slides | **designer** первым; часто **scaffold** (ветка дизайн-only) |
| hh.ru, отклик, вакансии, playwright, harvest, дашборд, codegen-hh, селекторы отклика | hh.ru apply, vacancy queue, playwright, harvest, dashboard, hh selectors | **по контексту**; исполняющий агент **сначала** читает [`hh-ru-apply-workflow`](../skills/hh-ru-apply-workflow/SKILL.md), затем **`worker`** (строка **`hh_ru_apply`** в CSV) |

Полная карта сценариев: [`agent-intent-map.csv`](../docs/agent-intent-map.csv). Контекст и правила обновления: [`CREATING_ASSETS.md` — Карта формулировок](../docs/CREATING_ASSETS.md#agent-intent-map).

### Базовые шаблоны цепочек `Task` после выбора workflow

Используй как **ориентир порядка и состава**; финальный список вызовов **сузь** по [триггерам и типу результата](../docs/CREATING_ASSETS.md#trigger-routing). Выполняй выбранные шаги **последовательно** (если не сработало исключение из соответствующей команды workflow):

- **`workflow-scaffold`** — см. [`workflow-scaffold.md`](workflow-scaffold.md):
  - **Код:** `worker` → `test-runner` → (`debugger` — только если test-runner не справился) → `documenter`.
  - **Дизайн-only** (слайды, токены, UI-спеки без кода): `designer` → `documenter` (без `worker` / `test-runner`; укажи причину в резюме).
  - **Дизайн + код:** `designer` → далее как «Код».

- **`workflow-implement`** — см. [`workflow-implement.md`](workflow-implement.md):
  - При необходимости UI/спеки перед кодом: `designer` → затем обязательно `worker` → `test-runner` → `reviewer-senior` → `documenter`.
  - Только дизайн-документы: `designer` → `documenter`.

- **`workflow-feature`** — см. [`workflow-feature.md`](workflow-feature.md):
  - `planner` (**brainstorming** по [`skills/brainstorming`](../skills/brainstorming/SKILL.md), затем декомпозиция) → по плану для каждой подзадачи `designer` / `worker` / `refactor` → `test-runner` (и `debugger` при падениях) → после всех подзадач `reviewer-senior` → при необходимости `security-auditor` → `documenter` (допускается параллель reviewer + documenter, как в команде).

- **Marketing tactical** (строка `marketing_tactical` в [`agent-intent-map.csv`](../docs/agent-intent-map.csv)):
  - **Точечный deliverable:** `marketing`
  - **Если нужны свежие факты о рынке/конкурентах/отзывах:** `researcher` → `marketing`

- **Marketing research / GTM** (строка `marketing_research`):
  - `marketing-researcher`
  - При необходимости веб-фактов: `marketing-researcher` → `researcher` → `marketing` (для финальных тактических артефактов после roadmap)

- **hh.ru / Playwright** (строка `hh_ru_apply` в [`agent-intent-map.csv`](../docs/agent-intent-map.csv)):
  - Родительский агент читает [`hh-ru-apply-workflow`](../skills/hh-ru-apply-workflow/SKILL.md), затем типичная цепочка: при сбое скрипта/браузера **`debugger`** → **`worker`** → при необходимости **`test-runner`** → **`documenter`** (если менялись контракты запуска или пользовательская дока).

**Триггер «исправь» / fix:** минимум **`Task(worker)`** после диагностики; если нужна отладка — **`Task(debugger)`** перед повторным **`Task(test-runner)`** по правилам workflow-scaffold / workflow-implement.

## Шаги

**Как вызывать субагентов:** при выполнении шагов workflow вызывай встроенный инструмент Cursor **`Task`** (`subagent_type`, `prompt`, `description`, …). Не выполняй роли planner/**designer**/**imager**/worker/refactor/test-runner/debugger/reviewer-senior/documenter/security-auditor и др. самостоятельно — только через **`Task`**. См. workflow-scaffold / workflow-implement / workflow-feature и [`workflow-selection.mdc`](../rules/workflow-selection.mdc) (там же: почему не появляются отдельные субагенты).

Для **marketing**-сценариев это правило работает так же: не подменяй роли **`marketing`** и **`marketing-researcher`** собственным ответом, если `Task` доступен.

1. **Анализ и выбор workflow**
   Проанализируй задачу по критериям из skill workflow-selector:
   - **scaffold** — один артефакт (функция, компонент, эндпоинт); мало зависимостей; нет auth/payments/sensitive data
   - **implement** — несколько связанных файлов; нужен review; средняя сложность; не требует декомпозиции
   - **feature** — auth, payments, sensitive data; много подзадач; нужна декомпозиция; архитектурные решения

   **Дизайн / презентации / UI-спеки без кода** (токены, слайды, макеты в markdown): обычно **scaffold** или **implement** с веткой **designer → documenter** — см. [`workflow-scaffold`](workflow-scaffold.md) / [`workflow-implement`](workflow-implement.md). Сложный продукт «дизайн + несколько подсистем кода» — **feature**, planner назначит **designer** на соответствующие подзадачи.

   Зафиксируй выбор (например: «Выбран workflow: scaffold»). Если сработали **слова-триггеры** — сверься с [«Слова-триггеры…»](#trigger-delegation) и [`CREATING_ASSETS.md` § trigger-routing](../docs/CREATING_ASSETS.md#trigger-routing): цепочка **`Task`** должна **покрывать** запрос, без лишних ролей.

2. **Выполнение выбранного workflow**
   Выполни шаги соответствующей команды (workflow-scaffold / workflow-implement / workflow-feature):
   - **Git (опционально):** если пользователь явно не просит инициализировать репо — можно пропустить. Иначе: папка не git-репозиторий → `git init`, при наличии `gh` — `gh repo create`. В workflow-feature — полная интеграция (issues, ветки, PR).
   - **workflow-scaffold** — см. команду: при необходимости **designer** (дизайн-only или перед worker), иначе **worker** → test-runner → documenter
   - **workflow-implement** — опционально **designer**, затем **worker** → test-runner → reviewer-senior → documenter; ветка только дизайн: **designer → documenter**
   - **workflow-feature** — planner → [**designer** / worker / refactor по плану] → test-runner (если менялся код) → reviewer-senior → security-auditor (если нужно) → documenter
   - **marketing_tactical** — начни с `Task(subagent_type="marketing", ...)`; если по контексту нужны свежие веб-факты о рынке/конкурентах, сначала `Task(subagent_type="researcher", ...)`, затем `marketing`
   - **marketing_research** — начни с `Task(subagent_type="marketing-researcher", ...)`; после roadmap при необходимости артефактов вызови `Task(subagent_type="marketing", ...)`
   - **hh_ru_apply** — сначала прочитай [`hh-ru-apply-workflow`](../skills/hh-ru-apply-workflow/SKILL.md), затем `Task(subagent_type="worker", ...)` с контекстом из skill (пути, команды, ограничения сценариев)

3. **Эскалация**
   Если в процессе выполнения задача оказалась сложнее выбранного workflow — переключись на следующий (scaffold → implement → feature). Триггеры: подзадачи, нужен security-auditor, >N файлов. При эскалации передай субагенту: выбранный workflow, что уже сделано, блокеры. Максимум одна эскалация за сессию.

## Результат

Перед возвратом результата:

1. **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (или путь из config.metrics.sessionsPath) со структурой: timestamp, reportDate, command (norissk), workflow, workflowReason, primaryAgent, taskType, escalation, subagentsCalled, debuggerCalls, testsApplicable, testsPassed, reviewerFindings, securityAuditorCalled, documentationCreated, taskSummary.
2. **Запусти скрипт метрик:** выполни `node .cursor/scripts/metrics-report.js`. Скрипт обновит METRICS_SUMMARY.md.
3. Включи итоговый скор из вывода скрипта в ответ (блок «Метрики» в конце).

Верни пользователю:
- Выбранный workflow и обоснование
- Результат выполнения (как в workflow-scaffold / workflow-implement / workflow-feature)
- Блок «Метрики» со скором

## Заметки

- Субагенты в отдельном контексте = вызовы **`Task`**. Канон и запреты по именам — [`CREATING_ASSETS.md` — «Инструмент Task»](../docs/CREATING_ASSETS.md#task-delegation).
- При **`/norissk` + слова-триггеры** — обязательна цепочка `Task`, **согласованная с триггерами** (см. [trigger-routing](../docs/CREATING_ASSETS.md#trigger-routing)), а не игнорирование делегирования.
- Для marketing-сценариев сперва смотри строки `marketing_tactical` / `marketing_research` в CSV; они имеют приоритет над generic `creation_*`, если пользователь просит маркетинговый deliverable, а не код в `app/`.
- Для сценариев hh.ru / Playwright — строка `hh_ru_apply`: прочитай [`hh-ru-apply-workflow`](../skills/hh-ru-apply-workflow/SKILL.md) до цепочки `Task(worker)`; код сценариев у корня репозитория (`lib/`, `scripts/`), не только `app/`.
- Используй skill workflow-selector для детальных критериев.
- При неопределённости — склоняйся к более полному workflow (implement лучше scaffold, feature лучше implement).
- Пользователь может явно указать workflow: `/norissk workflow-scaffold: добавь кнопку` — тогда не анализируй, выбери workflow-scaffold; цепочка **`Task`** для этой команды всё равно **обязательна** (если инструмент доступен).
- Явная команда **`/workflow-integrate-skill`** (интеграция внешнего скилла / best practices в `.cursor/`) — следуй [`workflow-integrate-skill.md`](workflow-integrate-skill.md); триггеры и CSV: строка **`ecosystem_integration`** в [`agent-intent-map.csv`](../docs/agent-intent-map.csv).
