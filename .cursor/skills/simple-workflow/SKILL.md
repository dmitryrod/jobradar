---
name: simple-workflow
description: Базовый workflow для /workflow-scaffold. Use when executing simple implementation tasks: worker creates code and tests, test-runner verifies, documenter adds documentation.
---

# Simple Workflow

Трёхшаговый workflow для быстрых задач (компонент, функция, эндпоинт). Команда: `/workflow-scaffold`.

## Последовательность

1. **Worker** — реализует код и тесты по описанию задачи
2. **Test-Runner** — запускает тесты, исправляет падения (сохраняя намерение теста)
3. **Documenter** — добавляет docstrings, README-секцию или API-описание

## Делегирование

Шаги выполняются через вызов **Task** с subagent_type. Не выполняй роли worker/test-runner/documenter самостоятельно — только через Task.

## Связанные workflow

- **workflow-implement** — scaffold + reviewer-senior (средняя сложность)
- **workflow-feature** — полная оркестрация (сложные фичи)
- **norissk** — агент сам выбирает workflow-scaffold/workflow-implement/workflow-feature

## Когда применять

- Одна функция, один компонент, один эндпоинт
- Нет сложной декомпозиции
- Без code review и security audit

## Результат

Краткое резюме: что реализовано, статус тестов, где документация.
