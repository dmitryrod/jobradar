---
name: workflow-selector
description: Use when implementing features. Analyze task complexity and choose workflow-scaffold/workflow-implement/workflow-feature. Apply when user asks to add, create, or implement something.
---

# Workflow Selector

При запросе на реализацию (добавить, создать, реализовать) — оцени сложность задачи и выбери один из трёх workflow.

## Ранний branch: marketing vs engineering

Перед выбором workflow проверь **тип результата**:

- Если пользователь просит **маркетинговый deliverable** (headline, CTA, landing copy, email sequence, CRO-аудит, SEO-план, соцконтент, launch asset) — сначала сверься с [`agent-intent-map.csv`](../../docs/agent-intent-map.csv) и запускай **`Task(subagent_type="marketing", ...)`**, а не `worker`.
- Если пользователь просит **маркетинговое исследование / GTM** (ICP, positioning, full marketing plan, launch strategy, pricing research) — сначала запускай **`Task(subagent_type="marketing-researcher", ...)`**.
- Только если задача реально про код/структуру/доки в `app/` или инженерный ассет в `.cursor/`, выбирай `workflow-scaffold` / `workflow-implement` / `workflow-feature`.

## Ранний branch: hh.ru / Playwright (репозиторий hh-ru-apply)

- Если задача про **автоматизацию hh.ru**: отклики, очередь вакансий, локальный дашборд, скрипты `npm run …` из **корневого** [`package.json`](../../../package.json), селекторы в `lib/hh-*-selectors.mjs`, Playwright codegen — **до** вызова **`Task(subagent_type="worker", ...)`** прочитай [`.cursor/skills/hh-ru-apply-workflow/SKILL.md`](../hh-ru-apply-workflow/SKILL.md) и включи в промпт субагенту: пути из `lib/paths.mjs`, различие **`hh-fill-letter`** (только форма, без отправки) и **`hh-apply-chat`** (чат), запрет снимать rate-limit / human-delay без явного запроса пользователя.
- Строка карты сценариев: **`hh_ru_apply`** в [`agent-intent-map.csv`](../../docs/agent-intent-map.csv).
- Вопросы по API Playwright — по необходимости **`user-context7`**, не путай с маркетинговыми ветками выше.

## Критерии выбора

| Workflow | Когда выбирать |
|----------|---------------|
| **workflow-scaffold** | Один артефакт (функция, компонент, эндпоинт); мало зависимостей; нет auth/payments/sensitive data; задача укладывается в 1–3 файла |
| **workflow-implement** | Несколько связанных файлов; нужен code review; средняя сложность; не требует декомпозиции на подзадачи; 4–10 файлов |
| **workflow-feature** | Auth, payments, sensitive data; много подзадач; нужна декомпозиция; архитектурные решения; интеграция нескольких подсистем |
| **workflow-integrate-skill** | Не фича в `app/`, а расширение тулчейна: внешний скилл / best practices из skills.sh в `.cursor/` с адаптацией под **Task** — см. [`ecosystem-integrator`](../ecosystem-integrator/SKILL.md) и команду `/workflow-integrate-skill` |

## Шаги каждого workflow (команды: /workflow-scaffold, /workflow-implement, /workflow-feature, /workflow-integrate-skill)

**workflow-scaffold:** при необходимости designer (дизайн-only: designer → documenter; или designer перед worker) → worker → test-runner → documenter

**workflow-implement:** при необходимости designer → worker → test-runner → reviewer-senior → documenter (ветка только дизайн: designer → documenter)

**workflow-feature:** planner (brainstorming → план по скиллам) → [designer / worker / refactor по плану] → test-runner → reviewer-senior → security-auditor (если security-sensitive) → documenter

**marketing_tactical (по CSV):**
- без свежих веб-фактов: `marketing`
- если нужны актуальные конкурентные / рыночные данные: `researcher` → `marketing`

**marketing_research (по CSV):** marketing-researcher → researcher (по необходимости) → marketing (для конечных тактических артефактов после roadmap)

## Делегирование

Шаги выполняются через вызов **Task** с subagent_type. Не выполняй роли субагентов сам — только делегируй через Task.

## Эскалация

Если в процессе выполнения задача оказалась сложнее выбранного workflow — переключись на следующий. **Триггеры эскалации:**
- scaffold → implement: появились связанные изменения, нужен review, затронуто >3 файлов
- implement → feature: появились подзадачи, нужна декомпозиция, нужен security-auditor (auth/payments/sensitive data)

**При эскалации** передай субагенту: выбранный workflow, что уже сделано, текущие блокеры. Максимум одна эскалация за сессию — при повторной необходимости сообщи пользователю.

## При неопределённости

Склоняйся к более полному workflow: workflow-implement лучше workflow-scaffold, workflow-feature лучше workflow-implement.

## Примеры

- `Напиши 5 вариантов headline + CTA для лендинга` → `Task(subagent_type="marketing", ...)`
- `Исследуй рынок и собери GTM для нового продукта` → `Task(subagent_type="marketing-researcher", ...)`
- `Добавь кнопку экспорта в PDF` → `workflow-scaffold`
