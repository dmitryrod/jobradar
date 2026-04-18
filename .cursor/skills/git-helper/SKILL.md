---
name: git-helper
description: Git операции и коммиты. Use when creating commits, branches, or pull requests. Follows Conventional Commits and project git workflow.
---

# Git Helper

## Conventional Commits

```
<type>(<scope>): <description>
```

Типы: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Ветки

- `feature/<short-name>` — новая функциональность
- `fix/<short-name>` или `fix/issue-<N>` — исправления

## PR body

- Описание изменений
- `Closes #N` или `Fixes #N` для привязки к issue

## Создание проекта через /norissk или /workflow-feature

При создании нового проекта: инициализировать git; при наличии `gh` и прав — создать репо на GitHub; по плану planner'а создавать issues; работать в ветках и привязывать коммиты/PR к issues.

## Windows + кириллица

Для `gh issue create` и `gh pr create` — записывать title и body в файлы (UTF-8), не передавать строкой в аргументах. Каноничные команды: см. [.cursor/templates/gh-commands.md](.cursor/templates/gh-commands.md).
