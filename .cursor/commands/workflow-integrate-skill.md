# workflow-integrate-skill

**Workflow безопасной интеграции внешних скиллов / best practices** в сборку `.cursor/`: поиск пакета, адаптация под делегирование через **`Task`**, опциональные правила и примеры MCP, обязательное обновление документации и карты намерений.

**Использование:** `/workflow-integrate-skill <что подключить: домен, технология, имя пакета skills.sh или ссылка>` — например: `/workflow-integrate-skill best practices для FastAPI + pydantic v2`

## Назначение

- Подтянуть знания из экосистемы (CLI `npx skills`, [skills.sh](https://skills.sh/), GitHub) **без** установки «сырых» инструкций, ломающих оркестрацию.
- Расширить **`.cursor/skills/`**, при необходимости **`.cursor/rules/`**, зафиксировать опциональные MCP в **`.cursor/mcp.*.example.json`**.
- Сохранить канон: [`.cursor/docs/CREATING_ASSETS.md` § Task](../docs/CREATING_ASSETS.md#task-delegation).

## Шаги

**Как вызывать субагентов:** для каждого шага вызывай инструмент **Task** с `subagent_type` из списка ниже, `prompt`, `description`. Не выполняй роли самостоятельно.

Перед стартом прочитай скилл [`.cursor/skills/ecosystem-integrator/SKILL.md`](../skills/ecosystem-integrator/SKILL.md).

1. **Researcher — поиск и выбор источника**
   - Вызови `Task(subagent_type="researcher", prompt="...", description="Ecosystem search")`.
   - Задача: найти релевантный пакет (например `npx skills find "<query>"`), оценить репутацию источника; зафиксировать **URL репозитория / skills.sh**, лицензию при необходимости.
   - Выход: краткий отчёт «что ставим» и «почему», путь к сырому содержимому или команда установки в песочницу.

2. **Planner — план адаптации (опционально, при сложном пакете)**
   - Если пакет большой или несколько подпакетов: `Task(subagent_type="planner", ...)` с промптом: декомпозиция на один адаптированный скилл vs правило `.mdc`, список файлов для `worker`.
   - Если интеграция тривиальна — шаг можно пропустить, указать причину в резюме.

3. **Worker — адаптация и запись в репозиторий**
   - Вызови `Task(subagent_type="worker", prompt="...", description="Adapt external skill")`.
   - Задача:
     - Создать **`.cursor/skills/<kebab-name>/SKILL.md`** по шаблону проекта (frontmatter, `Task`, When to use).
     - Убрать инструкции «сделай без Task»; связать применение правил с `worker` / `reviewer-senior` через **`Task`**.
     - При необходимости: **`.cursor/rules/<topic>-best-practices.mdc`** (без секретов; осмысленный `description` в frontmatter).
     - При необходимости MCP: **только** `.cursor/mcp.<server>.example.json` + комментарий в доке, что пользователь добавляет сервер в UI Cursor.
   - **Не** коммитить токены; **не** добавлять внешний скилл в `.cursor/skills/` без переписывания.

4. **Test-runner — только если есть автоматизируемые проверки**
   - Если worker добавил скрипты/тесты в `app/` — `Task(subagent_type="test-runner", ...)`.
   - Если менялись только `.cursor/` markdown — шаг пропусти, укажи в резюме.

5. **Reviewer-senior — соответствие архитектуре**
   - Вызови `Task(subagent_type="reviewer-senior", ...)` для проверки: нет нарушений делегирования, дублирования, лишних секретов.

6. **Documenter — актуализация документации (обязательно)**
   - Вызови `Task(subagent_type="documenter", prompt="...", description="Ecosystem integration docs")`.
   - Минимум:
     - **[`.cursor/docs/agent-intent-map.csv`](../docs/agent-intent-map.csv)** — ключевые слова / колонка `skills` / `notes` для сценария `ecosystem_integration` или новая строка при сужении домена.
     - **[`.cursor/docs/CREATING_ASSETS.md`](../docs/CREATING_ASSETS.md)** — при необходимости ссылка на новый скилл/команду (раздел «Скиллы» / «Команды»).
     - **[`.cursor/rules/README.md`](../rules/README.md)** — если добавлено новое правило `.mdc`.
     - При изменении **`app/`** или поведения для оператора: **`app/docs/CHANGELOG.md`** и файлы по матрице [`.cursor/rules/documentation.mdc`](../rules/documentation.mdc).

7. **Debugger** — только при сбое тестов или после замечаний reviewer; затем повтор `test-runner` / `reviewer-senior` по необходимости.

## Результат

Перед возвратом результата:

1. **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (путь из `config.metrics.sessionsPath`) со структурой: `timestamp`, `reportDate`, `command` (`workflow-integrate-skill`), `workflow` (`integrate-skill` или `custom`), `workflowReason`, `primaryAgent`, `taskType`, `escalation`, `subagentsCalled`, `debuggerCalls`, `testsApplicable`, `testsPassed`, `reviewerFindings`, `securityAuditorCalled`, `documentationCreated`, `taskSummary`.
2. **Запусти скрипт метрик:** `node .cursor/scripts/metrics-report.js`.
3. Включи итоговый скор в ответ (блок «Метрики»).

Верни пользователю резюме:

- Что добавлено (пути файлов под `.cursor/`, примеры MCP).
- Что обновлено в документации (CSV, CREATING_ASSETS, app/docs при наличии).
- Замечания reviewer-senior.
- Блок «Метрики» со скором.

## Заметки

- Этот workflow **не** заменяет `/workflow-scaffold|implement|feature` для обычных фич; он для **расширения тулчейна** оркестрации.
- При **`/norissk`** и явном запросе «подключи внешний скилл / best practices» — см. строку **`ecosystem_integration`** в [`agent-intent-map.csv`](../docs/agent-intent-map.csv).
- **Security-auditor** — по желанию, если интеграция касается секретов, токенов или выполнения произвольного кода из пакета.
