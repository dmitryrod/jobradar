# fix-issue

Получить детали issue, найти релевантный код, исправить и открыть PR.

**Использование:** `/fix-issue [number]` — номер issue из GitHub (например, `123`).

## Шаги

1. **Получить детали issue**  
   Выполни `gh issue view <number>` (или `gh issue view <number> --repo owner/repo` при необходимости). Изучи title, body, labels, assignees — всё, что описывает задачу и ожидаемое поведение.

   **Эскалация:** Если issue требует декомпозиции, auth, payments, sensitive data или много подзадач — переключись на `/workflow-feature` с полным описанием issue. Не выполняй шаги 2–6.

2. **Найти релевантный код**  
   На основе описания issue найди в проекте файлы и участки кода, связанные с проблемой. Используй семантический поиск, grep по ключевым словам, навигацию по импортам и ссылкам.

3. **Спланировать и внести исправление**  
   Определи причину бага или недочёта и внеси минимально необходимое изменение. Сохрани стиль и принятые практики проекта.

4. **Test-Runner — верификация**
   Вызови Task(subagent_type="test-runner", prompt="Прогон тестов после исправления issue", description="Test-runner verification") для прогона тестов. Если тесты падают — test-runner исправляет или делегирует debugger. Продолжай к PR только при успешных тестах или явном решении пользователя.

5. **Создать ветку, закоммитить и открыть PR**  
   - Создай ветку вида `fix/issue-<number>` или `fix/<short-description>`.
   - Добавь изменения (`git add`), сделай коммит с сообщением, ссылающимся на issue (например, `fix: resolve #123 - описание`).
   - Запушь ветку.
   - Для **gh pr create** — см. [.cursor/templates/gh-commands.md](.cursor/templates/gh-commands.md). В body укажи: что исправлено; ссылку `Closes #<number>` или `Fixes #<number>`.
   - Удали временные файлы после создания PR.

6. **Результат**

   Перед возвратом:
   - **Session report:** сохрани отчёт в `.cursor/reports/session-<YYYYMMDD-HHmm>.json` (путь из config.metrics.sessionsPath) со структурой: timestamp, reportDate, command (fix-issue), workflow (null или выбранный при эскалации), workflowReason, primaryAgent, taskType, subagentsCalled, debuggerCalls, testsApplicable, testsPassed, reviewerFindings, securityAuditorCalled, documentationCreated, taskSummary (кратко issue).
   - **Запусти скрипт метрик:** `node .cursor/scripts/metrics-report.js`.
   - Включи итоговый скор в ответ (блок «Метрики»).

   Верни пользователю URL созданного pull request'а и блок «Метрики» со скором.

## Заметки

- В начале проверь наличие `gh` (например, `gh auth status`). Если не установлен или не авторизован — сообщи пользователю до начала работы и подскажи, как настроить.
- Если issue неоднозначен — задай уточняющие вопросы или укажи предположения в PR description.
- **Windows + кириллица:** для title/body PR используй запись в файлы (как в шаге 5), не передавай строкой в терминале.
- Шаг 4 (test-runner) гарантирует, что тесты проходят перед созданием PR.
