# metrics-report

**Просмотр метрик NoRissk** — запуск скрипта анализа session reports и вывод итогового скора.

**Использование:** `/metrics-report` — без аргументов.

## Шаги

1. **Запусти скрипт метрик**
   - Выполни `node .cursor/scripts/metrics-report.js` из корня проекта.
   - Скрипт читает session reports из `.cursor/reports/` (или путь из config.metrics.sessionsPath).
   - Обновляет `METRICS_SUMMARY.md` и выводит скор в stdout.

2. **Выведи результат пользователю**
   - Покажи вывод скрипта (блок со скором).
   - При наличии — приложи или укажи путь к `.cursor/reports/METRICS_SUMMARY.md` для деталей.

## Заметки

- Если session reports нет — скрипт сообщит об этом. Метрики появляются после выполнения workflow (norissk, workflow-scaffold, workflow-implement, workflow-feature, fix-issue).
- При `config.metrics.enabled: false` скрипт выходит без действий.
- Скрипт идемпотентен — можно запускать многократно.
