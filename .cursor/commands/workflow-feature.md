# workflow-feature

**Полный workflow** — задействует planner, worker, refactor, test-runner, debugger, reviewer-senior, security-auditor, documenter. Для сложных фич с планированием, реализацией, проверками, review и аудитом. Для сложных marketing/GTM инициатив первичный агент — `marketing-researcher`, а тактические артефакты после roadmap делает `marketing`.

**Использование:** `/workflow-feature <описание фичи>` — например: `/workflow-feature Добавь систему аутентификации с email/password и OAuth`

## Шаги

**Как вызывать субагентов:** для каждого шага вызывай инструмент **Task** с параметрами:
- **subagent_type:** `planner` | `designer` | `imager` | `worker` | `refactor` | `test-runner` | `debugger` | `reviewer-senior` | `security-auditor` | `documenter`
- **marketing path:** `marketing-researcher` | `marketing` | `researcher` можно использовать как первичный/вспомогательный путь для marketing/GTM feature work
- **prompt:** формулировка задачи для субагента (включая контекст, ID подзадачи, что уже сделано)
- **description:** краткое описание вызова (3–5 слов)
- **resume:** при необходимости продолжить прерванную сессию — передай agent ID из предыдущего вызова

Не выполняй шаги planner/worker/test-runner/reviewer-senior/documenter/security-auditor/marketing/marketing-researcher самостоятельно — только через Task.

Выполни последовательно:

0. **Инициализация репо (если новый проект)**
   - **Опционально:** если пользователь явно не просит инициализировать репо (например, «быстрый прототип», «без git») — можно пропустить шаг.
   - Иначе: если папка не git-репозиторий (или нет remote) — выполни `git init`, при наличии `gh` и прав — `gh repo create` (или выведи команду пользователю). Задай origin. Первый коммит — после создания структуры worker'ом.

**Ветвление по типу feature:**

- **Engineering-heavy feature:** следуй шагам 1–6 ниже как обычно.
- **Marketing / GTM feature:** если задача — полный marketing research, positioning, ICP, launch plan, multi-channel roadmap — начни с `Task(subagent_type="marketing-researcher", ...)`. После roadmap вызывай `researcher` только для свежих веб-фактов и `marketing` для конечных тактических deliverables.

1. **Planner — брейншторм затем декомпозиция**
   - Вызови Task с subagent_type="planner" и prompt с описанием фичи из запроса пользователя.
   - В промпте требуй **двухфазный** процесс агента `planner`: (1) скилл `brainstorming` — контекст, варианты, согласованный дизайн, при необходимости файл `.cursor/plans/YYYY-MM-DD-<topic>-design.md`; (2) скилл `planning` — Gap-to-Goal, таблица Plan, Next Prompts.
   - Пример: `Task(subagent_type="planner", prompt="Фича: [описание]. Сначала brainstorming по .cursor/skills/brainstorming/SKILL.md (полный или trivial path), затем декомпозиция: подзадачи с ID, порядком, зависимостями и рекомендуемым субагентом.", description="Planner brainstorm + decomposition")`
   - Planner разбивает задачу на подзадачи с ID (например AUTH-001, AUTH-002), порядком, зависимостями и **рекомендуемым субагентом на каждую** (worker, refactor, documenter и т.д.).
   - Перед сохранением плана: если папок из `config.json` (documentation.paths) не существует — создай их с `.gitkeep` в каждой.
   - Сохрани план. Дождись завершения.

   **Если есть GitHub (origin, gh):** для каждой подзадачи из плана создай GitHub issue через `gh issue create`. Сохрани соответствие task ID ↔ issue number (например, в плане `.cursor/plans/`). В промптах для worker/test-runner передавай ссылку на issue (например, «Closes #N»). Используй [gh-commands.md](.cursor/templates/gh-commands.md) для кириллицы.

   **Перед циклом реализации:** создай ветку `feature/<short-name>`.

2. **Для каждой задачи из плана — цикл реализации**
   Выполняй по порядку с учётом зависимостей:

   a. **Реализация (designer, worker или refactor)**
      - Вызови Task с subagent_type, **рекомендованным planner'ом** для этой подзадачи:
        - **designer** — токены, UI-спеки, слайды, markdown-макеты (без кода приложения);
        - **worker** — для новой функциональности, исправлений, изменений кода;
        - **refactor** — для улучшения структуры без изменения поведения (дублирование, нейминг, перестройка модулей).
      - Дождись завершения.

   b. **Test-Runner — тесты**
      - Вызови Task(subagent_type="test-runner", ...) для запуска тестов.
      - Если тесты падают:
        - Вызови Task(subagent_type="debugger", ...) (максимум 3 попытки на задачу).
        - После каждой попытки — снова test-runner.
      - Продолжай только при успешных тестах или явном решении пользователя.

   c. После каждой подзадачи (или группы): коммит с `Closes #N` или `Fixes #N` при наличии issue.

3. **Reviewer-Senior — code review + архитектурный обзор**
   - После завершения всех подзадач вызови Task(subagent_type="reviewer-senior", ...).
   - Reviewer-senior выполняет двухуровневый обзор: быстрая проверка (линтеры, типичные проблемы) + архитектурный обзор (граничные случаи, производительность, maintainability).
   - Если reviewer-senior нашёл проблемы:
     - **Простые правки** (одно-два точечных изменения: rate limit, env-переменная, валидация) — родительский агент может применить их сам (StrReplace).
     - **Сложные исправления** (stack trace, неочевидные баги, рефакторинг по замечаниям) — вызови Task(subagent_type="debugger", ...).
     - Повтори reviewer-senior при необходимости.
   - Зафиксируй замечания и исправления.

4. **Security-Auditor — финальный аудит (если фича security-sensitive)**
   - Если фича касается auth, payments, sensitive data — вызови Task(subagent_type="security-auditor", ...) для финальной проверки всей реализации.
   - При критичных находках — см. раздел «Исправления по ревью» ниже.

**Batch review:** Шаги reviewer-senior и security-auditor можно выполнять **параллельно** — вызови два Task одновременно.

**Исправления по ревью (reviewer-senior, security-auditor):**
- **Простые правки** (одно-два точечных изменения: rate limit, env-переменная, валидация) — родительский агент может применить их сам (StrReplace).
- **Сложные исправления** (stack trace, неочевидные баги, рефакторинг по замечаниям) — вызови Task(subagent_type="debugger", ...).

5. **Documenter — итоговый отчёт**
   - Вызови Task(subagent_type="documenter", ...) для создания итогового отчёта: что реализовано, структура, как использовать, что тестировать.
   - Дождись завершения.

6. **PR (если есть GitHub)**
   - Выполни `gh pr create` с body, привязывающим PR к issues. См. [gh-commands.md](.cursor/templates/gh-commands.md).

## Marketing feature branch

Используй эту ветку, если задача — не кодовая фича в `app/`, а **полный marketing/GTM initiative**:

1. **Marketing-Researcher — intake + roadmap**
   - Вызови Task(subagent_type="marketing-researcher", prompt="...", description="Marketing roadmap").
   - Требуй: intake → `.cursor/marketing-context.md` → research synthesis → positioning/GTM → conditional branches → roadmap + Next Prompts.

2. **Researcher — свежие веб-факты (опционально)**
   - Если roadmap зависит от актуальных рыночных/конкурентных данных, вызови Task(subagent_type="researcher", ...).
   - Не выдумывай цены, обзоры, конкурентные claims без этого шага.

3. **Marketing — tactical execution**
   - Для первых приоритетных артефактов из roadmap вызови Task(subagent_type="marketing", ...).
   - Один вызов = один deliverable или маленький пакет близких deliverables.

4. **Reviewer-Senior / Documenter (опционально)**
   - `reviewer-senior` — если нужен дополнительный review структуры/качества `.cursor`-ассетов или сложных deliverables.
   - `documenter` — если результат надо зафиксировать в `.cursor/`, README, process-doc.

5. **Метрики и отчёт**
   - В session report укажи `taskType: "marketing_research"` или `taskType: "marketing_tactical"`; для неинженерных шагов `testsApplicable: false`.

**Параллельность:** Шаги 4 (`Reviewer-Senior / Documenter` в marketing branch) можно выполнять параллельно, если оба действительно нужны. В инженерной ветке reviewer-senior и итоговый `documenter` тоже можно выполнять параллельно после завершения реализации.

## Результат

Перед возвратом результата:

1. **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (путь из config.metrics.sessionsPath) со структурой: timestamp, reportDate, command (workflow-feature), workflow (feature), workflowReason, primaryAgent, taskType, escalation, subagentsCalled, debuggerCalls, testsApplicable, testsPassed, reviewerFindings, securityAuditorCalled, documentationCreated, taskSummary.
2. **Запусти скрипт метрик:** `node .cursor/scripts/metrics-report.js`.
3. Включи итоговый скор в ответ (блок «Метрики»).

Верни пользователю:
- План (список выполненных задач)
- Статус тестов по каждой задаче
- Резюме reviewer-senior
- Результаты security-auditor (если вызывался)
- Ссылку на итоговую документацию
- Блок «Метрики» со скором

## Заметки

- **Полный набор субагентов:** planner, worker, refactor, test-runner, debugger, reviewer-senior, security-auditor, documenter.
- Для marketing/GTM feature допустим полный путь `marketing-researcher` → `researcher` (опц.) → `marketing`, без обязательного `worker` / `test-runner`, если код не меняется.
- Security-auditor вызывается один раз в конце (шаг 4), не на каждую подзадачу.
- Соблюдай порядок задач из плана (учти зависимости).
- Уважай рекомендацию planner'а по субагенту (worker vs refactor) для каждой подзадачи.
- Ограничение: максимум 3 попытки debugger на одну подзадачу при падении тестов.
- **Debugger vs родитель:** простые правки по ревью — родитель; сложные (stack trace, неочевидные баги) — debugger.
- При зацикливании или неразрешимых ошибках — остановись и сообщи пользователю.
- Можно пропустить тесты, review или security-auditor для конкретной задачи, если пользователь явно попросит.
