---
name: ecosystem-integrator
description: >-
  Безопасное подключение внешних скиллов (skills.sh / CLI), адаптация под делегирование через Task и документацию репозитория.
  Use when extending .cursor with external best-practices packages without breaking orchestration rules.
---

# Ecosystem Integrator (Safe External Skills)

Цель: подтянуть **лучшие практики** для новой технологии или домена из открытой экосистемы (например [skills.sh](https://skills.sh/), репозиторий `vercel-labs/skills`, `npx skills find/add`), **не нарушая** канон этого репозитория:

- Субагенты вызываются **только** через **`Task(subagent_type=..., ...)`** — см. [`.cursor/docs/CREATING_ASSETS.md` § Task](../docs/CREATING_ASSETS.md#task-delegation).
- Внешний скилл **никогда** не устанавливается «как есть» в рабочую ветку без шага **адаптации** и **документирования**.

## Когда использовать

- Пользователь или `planner`/`researcher` выявили **пробел** в локальных скиллах (новый стек, фреймворк, нишевый инструмент).
- Нужно **расширить** `.cursor/skills/`, `.cursor/rules/` или задокументировать опциональный MCP **без** поломки `/norissk` и workflow-команд.
- Явный запуск: команда **`/workflow-integrate-skill`** (см. [`.cursor/commands/workflow-integrate-skill.md`](../commands/workflow-integrate-skill.md)).

## Когда НЕ использовать

- Обычная фича в `app/` без необходимости внешнего пакета — достаточно [`workflow-selector`](../workflow-selector/SKILL.md) и стандартных `/workflow-*`.
- Нужен только поиск в интернете без установки артефакта — [`firecrawl-mcp`](../firecrawl-mcp/SKILL.md) / `researcher` без интеграции.

## Пайплайн (логика, не замена `Task`)

Полная цепочка субагентов — в команде **`workflow-integrate-skill`**. Здесь — инварианты:

1. **Поиск (researcher)**  
   - Предпочтительно: `npx skills find "<query>"` или страница на skills.sh (версии CLI и флаги — по актуальной документации пакета `skills`).  
   - Альтернатива: веб/GitHub через [`github-researcher`](../github-researcher/SKILL.md) / Firecrawl — если CLI недоступен.

2. **Песочница**  
   - Сырой пакет скилла — только во временной папке (например `.cursor/skills/_incoming/<slug>/`) или после `npx skills add` — **сразу** копирование содержимого для анализа; не смешивать с каноническим `SKILL.md` до адаптации.

3. **Адаптация (worker)**  
   - Переписать `SKILL.md` в стиль репозитория: frontmatter `name` / `description`, секции **When to use**, ссылки на **`Task`**, запрет прямых «сделай сам без делегирования».  
   - Удалить/заменить инструкции, противоречащие [`workflow-selection.mdc`](../../rules/workflow-selection.mdc) (например «вызови MCP вместо субагента» без уточнения, что прод-код пишет только `worker` через `Task`).

4. **Правила (опционально)**  
   - Если из пакета извлекаются **чеклисты** для ревью — оформить `.cursor/rules/<topic>-best-practices.mdc` с `alwaysApply: false` и `description:` **или** `agent_requestable_workspace_rule`, чтобы `reviewer-senior` мог запросить правило.  
   - Не дублировать глобально всё подряд — только то, что реально нужно команде проекта.

5. **MCP**  
   - Никогда не подставлять секреты в репозиторий.  
   - Если скилл требует MCP: добавить **пример** в `.cursor/mcp.<name>.example.json` (как существующие [`mcp.github.example.json`](../../mcp.github.example.json), [`mcp.figma.example.json`](../../mcp.figma.example.json), [`mcp.docker.example.json`](../../mcp.docker.example.json)) и инструкцию пользователю вручную внести сервер в настройки Cursor.  
   - Не создавать боевой `mcp.json` с токенами в git.

6. **Документирование (documenter) — обязательный финал**  
   - Обновить **[`agent-intent-map.csv`](../../docs/agent-intent-map.csv)** (ключевые слова / `skills` / `notes` для новой строки или правки).  
   - Обновить **[`CREATING_ASSETS.md`](../../docs/CREATING_ASSETS.md)** (список команд/скиллов, при необходимости якорь § ecosystem-integrator).  
   - Обновить **[`rules/README.md`](../../rules/README.md)** при добавлении нового `.mdc`.  
   - Если изменилось поведение приложения или env (`app/`): **`app/docs/CHANGELOG.md`** и зона ответственности по [`.cursor/rules/documentation.mdc`](../../rules/documentation.mdc).

## Чеклист качества перед merge

- [ ] В новом/изменённом `SKILL.md` **нет** запрещённых имён инструментов из таблицы в `CREATING_ASSETS.md` (только **`Task`** для субагентов).
- [ ] Новый скилл лежит в **`.cursor/skills/<kebab-name>/SKILL.md`**, имя папки совпадает с `name` в frontmatter.
- [ ] CSV и prose-доки не противоречат друг другу; при конфликте править **сначала CSV**.
- [ ] Секреты не в коммите; примеры MCP — только `*.example.json` или плейсхолдеры.

## Связанные ассеты

- Команда: [`workflow-integrate-skill.md`](../../commands/workflow-integrate-skill.md)  
- Карта триггеров: [`agent-intent-map.csv`](../../docs/agent-intent-map.csv) (строка `ecosystem_integration`)
