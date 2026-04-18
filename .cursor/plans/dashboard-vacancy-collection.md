# План: «Сбор вакансий» в дашборде

## Контекст по коду

- **[`scripts/harvest.mjs`](../../scripts/harvest.mjs)** — один процесс: логин-проверка → цикл по **всем** ключам из [`config/search-keywords.txt`](../../config/search-keywords.txt) (через [`lib/load-keywords.mjs`](../../lib/load-keywords.mjs)) → сбор URL с выдачи → переход по карточкам → фильтры → LLM → [`addVacancyRecord`](../../lib/store.mjs).
- **[`scripts/open-vacancies.mjs`](../../scripts/open-vacancies.mjs)** (`npm run vacancies`) — тот же поиск по ключам, но **только открытие вкладок** в браузере; **очередь дашборда не пополняется**. Использует `HH_POST_LOAD_*`; **harvest сейчас эти переменные не читает** (стоит добавить паузу после `goto` карточки для паритета с UI).
- Паттерн фонового процесса уже есть: [`POST /api/hh-launch-apply-chat`](../../scripts/dashboard-server.mjs) — `spawn` + лог в файл + `unref` (см. ~413–477).

**Важно для ТЗ «объединить vacancies и harvest»:** в текущей архитектуре осмысленный «один клик — поиск + оценка» = **запуск `harvest.mjs`** с переданными через `env` overrides. Параллельный запуск `open-vacancies.mjs` не добавит записей в очередь и конфликтует с тем же Chromium-профилем. Рекомендуется **один дочерний процесс `harvest`**; при жёстком требовании именно двух npm-скриптов — отдельная задача: общая библиотека или флаг у vacancies без ожидания Enter (дублирует harvest).

## 1. Бэкенд дашборда ([`scripts/dashboard-server.mjs`](../../scripts/dashboard-server.mjs))

- **`GET /api/harvest-env`**: вернуть только поля формы (без секретов):  
  `HH_PER_KEYWORD_LIMIT`, `HH_SESSION_LIMIT`, `HH_MAX_TOTAL`, `HH_OPEN_DELAY_MIN_MS` / `MAX`, `HH_SEARCH_JITTER_MIN_MS` / `MAX`, `HH_POST_LOAD_JITTER_MIN_MS` / `MAX`.  
  Источник: `process.env` после `loadEnv()`.
- **`POST /api/harvest-start`**: JSON с теми же ключами (частично).  
  - `childEnv = { ...process.env, ...whitelist(body) }`, числа нормализовать; правило: если задан `HH_SESSION_LIMIT`, он важнее `HH_MAX_TOTAL` (как в скриптах).  
  - Mutex: один активный прогон — иначе `409`.  
  - `spawn(process.execPath, [scripts/harvest.mjs], { cwd: ROOT, env: childEnv, stdio → лог-файл })` по аналогии с hh-launch-apply-chat.  
  - Ответ: `{ ok, runId, pid, logFile }`.
- **`GET /api/harvest-status`**: `running`, счётчики, список URL, `addedToQueue`, ошибка, `exitCode`.

## 2. Ротация ключевого слова

- Новый **[`lib/rotate-search-keyword.mjs`](../../lib/rotate-search-keyword.mjs)**: первая непустая строка-запрос (семантика как у `loadSearchKeywords`) → в конец файла; атомарная запись (temp + rename).
- Вызов из **`harvest.mjs`** в конце успешного `main()`, опционально отключаемый env-флаг.

**Замечание:** за один run harvest обходит **все** ключи; ротация одной «первой» строки после полного прогона меняет порядок для следующего запуска.

## 3. Статистика в реальном времени

- В **`harvest.mjs`** — машиночитаемые строки, например префикс `HARVEST_JSON` + JSON-события (`url_seen`, `record_added`, `done`), чтобы сервер парсил лог и обновлял статус.

## 4. `HH_POST_LOAD_*` в harvest

- Скопировать логику из `open-vacancies.mjs` (дефолты 200–800 мс) и `sleepMs` после `page.goto` на карточку, перед парсингом.

## 5. Фронтенд ([`dashboard/public/`](../../dashboard/public/))

- В **`.vacancy-tabs`**: первая кнопка «Сбор вакансий» (`data-mode="collect"` или отдельный state), затем три существующие.
- Под табами — **панель** только в режиме сбора: поля из ТЗ, «Старт поиска», блок статистики (уникальные URL + expand, собрано в очередь), опционально бейдж «идёт сбор» в шапке при переключении на другие вкладки.
- Polling `harvest-status` пока `running`.

## 6. Тесты и документация

- Тесты на ротацию файла ключей; при необходимости — парсер `HARVEST_JSON`.
- Обновить **`README.md`** / **`docs/USAGE.md`**: вкладка, приоритет настроек страницы над `.env`, ротация, один процесс harvest.

## 7. Безопасность

- Whitelist только перечисленных `HH_*` в теле POST. Не отдавать весь `.env`. Учесть эксклюзивный доступ к профилю Chromium.

## Порядок внедрения

1. `rotate-search-keyword` + тесты + harvest (ротация + POST_LOAD).  
2. `HARVEST_JSON` в harvest.  
3. API dashboard + лог + статус.  
4. UI.  
5. Документация.

## Norissk

- **Workflow:** `implement`.  
- **Task:** при недоступности — не делегировать.
