---
name: docs
description: Генерация документации. Use when creating README, docstrings, API docs, or onboarding materials.
---

# Docs

Стандарты и шаблоны для документации проекта.

## Переменные проекта

```
APP  = app
DOCS = app/docs
```

## Python Docstrings (Google-style)

```python
def function(param: type) -> type:
    """Краткое описание.

    Args:
        param: описание параметра

    Returns:
        описание возвращаемого значения

    Raises:
        ErrorType: когда и почему
    """
```

Публичные функции, классы, модули — обязательно. Примеры — для неочевидных сценариев.

## Сопроводительная документация

| Файл | Назначение |
|------|-----------|
| `app/docs/README.md` | Первый контакт: установка, запуск, структура |
| `app/docs/CHANGELOG.md` | Версия, изменения поведения |
| `app/docs/ARCHITECTURE.md` | Потоки данных, модули, интеграции |
| `app/docs/CONTRIBUTING.md` | Toolchain, команды проверки |
| `app/docs/ROADMAP.md` | Планы вперёд |
| `app/docs/troubleshooting.md` | Симптом → причина → шаги |
| `app/.env.example` | Все env-переменные без значений |

**Один источник истины:** не дублировать текст между файлами — только ссылки.
**Не создавать новые `.md`** без явного запроса пользователя.

## Где документировать по workflow

| Workflow | Scope documenter | Пути |
|----------|------------------|------|
| **scaffold, implement** | Docstrings в коде, при необходимости раздел в `app/docs/` | Не создавать новых файлов без запроса |
| **feature** | План + итоговый отчёт | План → `.cursor/plans`, отчёт → `.cursor/reports` (из config.json) |

## Итоговый отчёт (workflow-feature)

- Что реализовано (список модулей с путями в `app/`)
- Структура новых файлов
- Как использовать (примеры запуска/вызова)
- Что тестировать (ключевые сценарии для `app/tests/`)
- Какие файлы в `app/docs/` обновлены
