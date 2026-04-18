---
name: orchestration
description: Полная оркестрация для /workflow-feature. Use when coordinating complex features: planner runs brainstorming then planning, worker/refactor implement, test-runner and debugger verify, reviewer-senior checks quality and architecture, security-auditor audits, documenter reports.
---

# Orchestration

Полный workflow для сложных фич с задействованием всех 8 субагентов. Команда: `/workflow-feature`.

## Последовательность

1. **Planner** — по скиллам **`brainstorming`** затем **`planning`**: согласование дизайна (для нетривиальной фичи — спека в `.cursor/plans/`), затем декомпозиция на подзадачи с ID, порядком, зависимостями, рекомендуемым субагентом (worker/refactor)
2. **Для каждой задачи:** worker или refactor → test-runner → debugger при падении
3. **Reviewer-Senior** — двухуровневый обзор: быстрый (линтеры, типичные проблемы) + архитектурный (граничные случаи, производительность, maintainability). Можно запускать параллельно с documenter.
4. **Security-Auditor** — финальный аудит один раз в конце (если фича security-sensitive)
5. **Documenter** — итоговый отчёт

## Делегирование

Все шаги выполняются через вызов **Task** с subagent_type. Не выполняй роли planner/worker/reviewer-senior и др. самостоятельно — только через Task.

## Когда применять

- Сложная фича (auth, payments, новая подсистема)
- Требуется планирование и декомпозиция
- Нужны проверки качества и безопасности
