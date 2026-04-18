---
name: code-quality-standards
description: Стандарты качества кода для reviewer-senior (Level 1). Use when running code review, linters, or checking for common issues.
---

# Code Quality Standards

Чеклист для reviewer-senior (Level 1 — Quick Review).

## Линтеры

- Запустить Ruff, Pylint и т.п. (Python) или ESLint, Prettier (JS/TS)
- Собрать ошибки и предупреждения
- Указать файлы и строки

## Типичные проблемы

- [ ] Потенциальные баги (null/undefined, необработанные исключения)
- [ ] Дублирование кода
- [ ] Нарушение конвенций проекта (`app/`)
- [ ] Нечитаемый или избыточный код

## Формат отчёта

- **Линтеры:** статус, основные замечания
- **Частые проблемы:** список с файлом/строкой
- **Рекомендации:** что исправить в первую очередь

## Эскалация

Глубокий security — security-auditor. Архитектура — передать в Level 2 reviewer-senior.
