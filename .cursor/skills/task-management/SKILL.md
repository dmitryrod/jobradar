---
name: task-management
description: Управление задачами и планами. Use when decomposing work, tracking subtasks, or delegating to subagents with structured task IDs and dependencies.
---

# Task Management

Формат задач для оркестрации и делегирования.

## Формат задачи

```
ID: TASK-001 (или AUTH-001, PAY-001 — префикс по фиче)
Описание: кратко, что сделать
Субагент: worker | refactor | documenter
Зависимости: TASK-000 (если есть)
Статус: pending | in_progress | done
```

## План

- Список задач в порядке выполнения
- Учёт зависимостей (не начинать TASK-002 до TASK-001)
- Рекомендация planner'а по субагенту на каждую задачу

## Делегирование

При вызове субагента передавать: ID задачи, описание, контекст (что уже сделано). Вызов — через Task с subagent_type.

## Связь с GitHub

При создании issues из плана сохраняй соответствие task ID ↔ issue number. В коммитах и PR используй `Closes #N` для привязки.
