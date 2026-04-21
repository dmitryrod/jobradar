# История изменений (hh-ru-apply)

Канон для заметных изменений поведения, запуска и зависимостей. Детали использования — в [USAGE.md](./USAGE.md).

## 2026-04

### Стабильность дашборда (`npm run dashboard`)

- **`scripts/dashboard-server.mjs`**  
  Модули **не подгружаются целиком при старте**: LLM-скоринг, генерация сопроводительных, обновление текста вакансии с hh.ru и батч review-automation подключаются через **динамический `import()`** внутри соответствующих HTTP-обработчиков.  
  Цель — не тянуть в память при запуске тяжёлый граф зависимостей (в т.ч. цепочку OpenRouter / генерацию писем), чтобы избежать `JavaScript heap out of memory` / `Zone Allocation failed` на ограниченной куче.  
  При **`EADDRINUSE`** на `DASHBOARD_PORT` по умолчанию **авто-подбор следующего свободного порта** в диапазоне `DASHBOARD_PORT_RANGE` (1–50, по умолчанию 20). Строго только заданный порт: **`DASHBOARD_STRICT_PORT=1`**. Обработчик `server.on('error')` без «Unhandled error event».

- **`lib/cv-load.mjs`**  
  Пакет **`pdf-parse`** загружается только при фактическом разборе `.pdf` в `loadCvBundle()` (динамический `import`), а не при загрузке модуля.

- **`lib/refresh-vacancy-from-hh.mjs`**  
  **`playwright`** подключается только при вызове `fetchVacancyTextFromHh()`, не при `import` модуля (старт дашборда не должен поднимать движок браузера).

- **`lib/cover-letter-openrouter.mjs`**  
  Исправлено: использование `path.join` для путей к шаблонам писем при явном `import` из `node:path` (раньше возможен был `ReferenceError: path is not defined` после рефакторинга).

### Документация

- **`docs/USAGE.md`** (раздел «Работа с дашбордом»): кратко описана ленивая загрузка и что проверить при повторном OOM (в т.ч. слишком малый `--max-old-space-size` в `NODE_OPTIONS`).
