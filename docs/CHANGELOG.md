# История изменений (hh-ru-apply)

Канон для заметных изменений поведения, запуска и зависимостей. Детали использования — в [USAGE.md](./USAGE.md).

## 2026-04

### Дашборд: визуальный редизайн (Sentinel Console)

- **`lib/dashboard/public/style.css`** — расширенные дизайн-токены (поверхности, primary/secondary, шрифты **Inter** / **Space Grotesk** с системным fallback), sticky **top bar**, компактные вкладки в стиле консоли, обновлённые кнопки/модалки/поля фокуса, карточка вакансии (accent-полоса, круговой score).
- **`lib/dashboard/public/index.html`** — оболочка **`app-shell`**: шапка с навигацией отделена от контента; панели «На проверке» / «Сбор» и список очереди в **`app-main`** (поведение и **id** без изменений).

### Профиль: колонка «Значение» для зарплаты и гео

- **Дашборд** — для строк **«Зарплата не ниже минимума»**, **«Мой город в тексте»**, **«Подходящий город в тексте»** колонка **«Значение»** редактирует **`minMonthlyUsd`**, **`scoringGeo.baseCity`**, **`scoringGeo.acceptableCities`** (города через запятую) в **`config/preferences.json`** при сохранении панели профиля.
- **`lib/preferences.mjs`** — **`normalizeAcceptableCitiesInput`**, **`applyDashboardPreferencesPatch`**; **`scripts/dashboard-server.mjs`** — мердж этих полей в **`POST /api/preferences`**.
- Тест: **`tests/preferences-patch.test.mjs`**.

### Профиль: белый и чёрный список слов в тексте вакансии

- **`lib/profile-criteria.mjs`** — критерии **`text_whitelist`** и **`text_blacklist`**: поле **`value`** в строке профиля (слова/фразы **через запятую**), матч **подстроки** без учёта регистра по тому же объединённому тексту, что и остальные критерии; вес / **±** / **ban** — как у остальных строк.
- **Дашборд** — в таблице «Профиль соискателя» для этих строк редактируемая колонка «Значение».
- **`config/preferences.json`** — в **`profileCriteria.rows`** добавлены две строки с пустым **`value`** (при старых файлах строки дозаполняются через **`ensureProfileCriteria`**).

### Профиль: «Релокация в описании» и город кандидата

- **`lib/profile-criteria.mjs`** — критерий **`geo_relocation`**: если в тексте вакансии уже есть **базовый** или **допустимый** город из **`scoringGeo`** (те же алиасы МСК/СПб, что в **`lib/scoring-inference.mjs`** / **`inferLocationScore`**), упоминание релокации **не** считается совпадением — формулировки вроде «релокационный пакет для иногородних» не банят локального кандидата.
- Хелпер **`candidateHomeCityAppearsInVacancyBlob`**, общая логика **`homeCityPresenceScore`** с **`inferLocationScore`**.

### Отладка harvest: `HH_HARVEST_DEBUG` и `harvest-debug.log`

- **`lib/harvest-debug.mjs`** — JSONL в **`data/harvest-debug.log`** (через **`resolveDataDir()`**): старт сессии, эффективный env после восстановления spawn (без секретов), флаг graceful до/после сброса, события **`debug_graceful`** с причиной, **`process_exit`** с кодом и причиной, **`unhandledRejection`** / **`uncaughtException`**, **`main_catch`**.
- **`scripts/harvest.mjs`** — инструментация прохода и выходов; **`HH_HARVEST_DEBUG`** в whitelist формы **`lib/harvest-env-keys.mjs`**.
- **Дашборд** — кнопка **Debug** в панели **«Настройки»**, скрытый чекбокс **`HH_HARVEST_DEBUG`** на вкладке сбора; в запрос старта передаётся **`0`/`1`**; если в env сервера переменная не задана — состояние из **localStorage** (`hhRuHarvestDebug`).
- Тест: **`tests/harvest-debug.test.mjs`** (маскирование env).

### Сбор вакансий: дефолт «зациклить» и путь к данным после `loadEnv`

- **`HH_KEYWORDS_LOGIC`** — по умолчанию **`loop`** (CLI и дашборд): один проход с **`cycles` + `HH_KEYWORDS_CYCLES=1`** выглядел как «сам остановился через несколько минут». Для одноразового прогона явно задайте **`cycles`** / **`keywords`**.
- **`lib/store.mjs`**, фрагмент **`scripts/harvest.mjs`** (`skipped-vacancies.jsonl`) — путь к файлам данных через **`resolveDataDir()`**, чтобы **`HH_DATA_DIR` из `.env`** учитывался даже когда константа **`DATA_DIR`** в `paths.mjs` зафиксирована на момент первого импорта (до `loadEnv()`).

### Исправление: параметры запуска из дашборда перетирались `.env`

- **`lib/load-env.mjs`** грузит `.env` / `.env.local` с **`override: true`**, из‑за чего в дочернем **`harvest`** значения, переданные при **`spawn`** из формы (в т.ч. **`HH_KEYWORDS_CYCLES`**, **`HH_KEYWORDS_LOGIC`**), подменялись строками из файла — визуально «ставлю 100 циклов, а поиск сразу обрывается» или один проход вместо зацикливания.
- **`lib/harvest-env-keys.mjs`**, **`lib/harvest-spawn-env.mjs`**, **`scripts/harvest.mjs`** — снимок этих переменных и **`HH_GRACEFUL_STOP_FILE`** до **`loadEnv()`** и восстановление после; whitelist формы вынесен в общий модуль для **`scripts/dashboard-server.mjs`**.
- Тест: **`tests/harvest-spawn-env.test.mjs`**.

### Мониторинг сбора: таблица итогов по каждой открытой ссылке

- **`scripts/harvest.mjs`** — в лог прогона (`HARVEST_JSON`) добавлено событие **`url_outcome`** после обработки карточки: ссылка, усечённое название, время, машинный **`outcome`** (`skipped_filter`, `duplicate`, `pending`, `pending_draft`, `rejected_auto`, `review_automation_error`) и опционально **`detail`**.
- **`scripts/dashboard-server.mjs`** — ответ **`GET /api/harvest-status`** дополнен массивом **`urlOutcomes`** (порядок как в прогоне).
- **Дашборд** (`lib/dashboard/public/index.html`, `app.js`, `style.css`) — блок «Список открытых ссылок» заменён на **таблицу** (Ссылка, Название, Дата/время, Действие). Для логов **без** `url_outcome` — fallback: только ссылки, в «Действие» пояснение про старый лог.

### Дата публикации вакансии (hh.ru) и приоритет в score

- **`lib/vacancy-parse.mjs`** — из страницы извлекается строка вида «Вакансия опубликована …» (`vacancyPublishedLine`), в Node парсится дата **`vacancyPublishedDate`** (`YYYY-MM-DD`), см. **`lib/vacancy-published-date.mjs`**.
- **`lib/scoring-blend.mjs`** — если дата публикации совпадает с локальным «сегодня» на момент оценки, к итоговому score добавляется бонус **`scorePublicationDelta`** (по умолчанию **+5**, задаётся в **`config/preferences.json`** → **`scoringPublicationTodayBonus`**); учтено в **`scoreSortKey`**.
- **`scripts/harvest.mjs`**, **`scripts/dashboard-server.mjs`** (refresh) — поля сохраняются в записи очереди; проброс в контекст LLM-скоринга.
- **Дашборд** (`lib/dashboard/public/*`) — блок «Дата публикации» под «Условия работы»; при совпадении даты с сегодняшней в браузере — **зеленоватый** фон панели; в подсказке к score отображается ветка «свежая публикация».

### LLM: кириллица и символы «�» в summary/risks

- **`lib/llm-chat.mjs`** — тело ответа провайдера читается через **`arrayBuffer` + `TextDecoder('utf-8')`**; поддержан **`message.content`** как строка или массив блоков `{ type, text }` (OpenAI-совместимый формат).
- **`lib/openrouter-score.mjs`** — при символе замены U+FFFD в summary/risks выполняется **второй запрос** с уточнением в system prompt; строки проходят **`stripLoneUtf16Surrogates`**.
- **`lib/llm-text-utf8.mjs`** — общие утилиты нормализации текста от модели.

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
