# jobradar

Автоматизация работы с [hh.ru](https://hh.ru) на Node.js + Playwright: сбор вакансий, оценка с помощью LLM, генерация сопроводительных писем и отклики через браузер с сохранением сессии.

> **Важно:** Автоматизация откликов и массовые действия могут противоречить правилам сервиса и привести к ограничению аккаунта. Используйте на свой страх и риск.

## Локально
git clone <repo> && cd hh-ru
npm install
npx playwright install chromium
npm run bootstrap
npm run dashboard

## Возможности

| Команда | Описание |
|---------|----------|
| `npm run login` | Вход на hh.ru с сохранением браузерного профиля (повторный логин не требуется) |
| `npm run vacancies` | Поиск вакансий по ключевым словам с hh.ru |
| `npm run harvest` | Сбор и оценка вакансий через LLM (OpenRouter) — три скора: релевантность, совпадение с CV, общий |
| `npm run dashboard` | Веб-дашборд для просмотра очереди, генерации и редактирования сопроводительных |
| `npm run scan-tg` | Сканирование вакансий из Telegram-каналов через бота |
| `npm run hh-fill-letter` | Вставка сопроводительного письма в форму отклика на странице вакансии (без авто-отправки) |
| `npm run hh-apply-chat` | Отклик с письмом в чате с работодателем |
| `npm run codegen-hh` | Генерация/обновление селекторов Playwright через Codegen |

* Путь для сохранения профилей: Профиль сохранён: C:\dima_work\hh-ru\data\session\chromium-profile

## Docker (сервер)
git clone <repo> && cd hh-ru
npm run bootstrap
# отредактировать .env на хосте
docker compose build
docker compose up -d

## Требования

- Node.js 18+
- Chromium (устанавливается через Playwright)

## Быстрый старт

### Вариант А: Локальный запуск

```bash
git clone https://github.com/Steev193/hh-ru-apply.git
cd hh-ru-apply
npm install
npx playwright install chromium
npm run bootstrap
```

### Вариант Б: Docker (рекомендуется на сервере)

Образ сам ставит зависимости (`npm ci`) и тянет Chromium (`playwright install --with-deps chromium`). На хосте нужны только Git, Docker и Docker Compose v2.24+ (для `env_file` с `required: false`).

```bash
git clone https://github.com/Steev193/hh-ru-apply.git
cd hh-ru-apply
# Опционально до сборки: npm run bootstrap && отредактировать .env на хосте
docker compose build
docker compose up -d
```

При каждом старте контейнера **entrypoint** автоматически выполняет **`node scripts/bootstrap.mjs`** (каталоги `data/`, при необходимости `config/cover-letter.txt` из примера). Отключить: переменная **`SKIP_BOOTSTRAP=1`** в `environment` сервиса.

Дашборд: http://127.0.0.1:3849 (или `http://<IP-сервера>:3849`). Персистентные данные: `./data` (очередь, сессия браузера), `./config` смонтирован с хоста (запись нужна для bootstrap).

**Про `.env`:** на хосте по-прежнему удобно один раз скопировать `.env.example` → `.env` и вписать ключи — Compose подхватит их через `env_file`. Файл `.env`, созданный только внутри контейнера при bootstrap, **не сохранится** между пересозданиями контейнера, если не смонтировать его отдельно.

**Первый вход на hh.ru (сохранение сессии):** в контейнере по умолчанию нет дисплея. Варианты:

1. **Локально:** `npm run login` на своей машине, затем скопировать `data/session/` на сервер.
2. **На сервере с X11:** проброс `DISPLAY` или VNC.
3. **В контейнере с виртуальным дисплеем:** например установить в образ `xvfb` и запускать `xvfb-run` вокруг `npm run login` (сложнее; для продакшена чаще делают п.1).

```bash
docker compose run --rm dashboard npm run login
```

**Остальные команды:**

```bash
docker compose run --rm dashboard npm run harvest
docker compose run --rm dashboard npm run hh-fill-letter -- --id=...
```

**Старый Docker Compose** без `env_file.path/required`: если `docker compose` ругается на синтаксис, замените в `docker-compose.yml` блок `env_file` на одну строку `- .env` и перед `up` выполните `npm run bootstrap` (чтобы файл `.env` существовал).

**Полный `config` каталог:** раньше монтировался только `config/cover-letter.txt`, из‑за отсутствия файла Docker создавал каталог вместо файла и ломал запуск. Сейчас монтируется весь `./config` — достаточно положить `cover-letter.txt` (или дать `bootstrap` создать его из примера).

## Настройка

### 1. Браузерная сессия

```bash
npm run login
```

Откроется окно Chromium. Войдите на hh.ru, затем нажмите Enter в терминале. Профиль сохраняется в `data/session/chromium-profile` и переиспользуется при последующих запусках.

Проверить сессию:

```bash
npm run apply
```

### 2. Ключевые слова для поиска

Отредактируйте [`config/search-keywords.txt`](config/search-keywords.txt) — по одному запросу на строку. Пример:

```
python backend
python developer
senior python developer москва удалённо
```

### 3. CV / Резюме

Положите свои резюме в папку `CV/`. Поддерживаются форматы `.md`, `.txt`, `.pdf`. Они используются при оценке вакансий LLM.

### 4. Шаблон сопроводительного письма

Создайте `config/cover-letter.txt` по образцу [`config/cover-letter.example.txt`](config/cover-letter.example.txt). Файл добавлен в `.gitignore` и не попадёт в репозиторий.

Для сохранения вашего стиля в письмах положите примеры в `config/cover-letter-style-examples.txt` (несколько писем, разделённых `---`). Шаблон — `config/cover-letter-style-examples.example.txt`.

### 5. LLM для оценки вакансий (опционально)

**Рекомендуется [Polza AI](https://polza.ai/)** (OpenAI-compatible `chat/completions`): добавьте в **`.env`** (шаблон — [`.env.example`](.env.example)):

```
POLZA_API_KEY=...
```

Опционально: `POLZA_MODEL`, `LLM_PROVIDER=auto|polza|openrouter` — см. [`config/OPENROUTER.md`](config/OPENROUTER.md).

**Альтернатива — [OpenRouter](https://openrouter.ai/):** `OpenRouter_API_KEY=sk-or-v1-...` в `.env`. По умолчанию для OpenRouter используются бесплатные модели; для платных задайте `OPENROUTER_ALLOW_PAID=1`. Подробности — в [`config/OPENROUTER.md`](config/OPENROUTER.md).

### 6. Telegram-бот (опционально)

Для `npm run scan-tg` задайте в `.env`:
```
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=your_chat_id
```

## Использование

### Сбор вакансий

```bash
npm run vacancies
```

Поиск по ключам из `config/search-keywords.txt`. Настройки лимитов, пауз и джиттера — в `.env` (переменные `HH_*`)

### Оценка через LLM

```bash
npm run harvest
```

Результат сохраняется в очередь `data/vacancies-queue.json`. Каждая вакансия получает три оценки:

- **scoreVacancy** (0–100) — насколько объявление релевантно
- **scoreCvMatch** (0–100) — насколько ваше CV покрывает требования
- **scoreOverall** (0–100) — стоит ли откликаться

Веса скоров настраиваются в `config/preferences.json` (`llmScoreWeights.vacancy` и `llmScoreWeights.cvMatch`).

### Дашборд

```bash
npm run dashboard
```

Открывается на http://127.0.0.1:3849. Здесь можно:

- **Сбор вакансий** — вкладка «Сбор вакансий»: параметры `HH_*` (лимиты, паузы, джиттеры) подставляются из `.env`, при изменении в форме уходят в фоновый `harvest` и **перекрывают** `.env`. Один запуск = тот же пайплайн, что `npm run harvest` (поиск по `config/search-keywords.txt`, парсинг, три скора LLM). После успешного завершения первая строка ключей **ротируется в конец файла** (отключить: `HH_ROTATE_KEYWORD_AFTER_RUN=0`). Лог: `data/harvest-run.log`. Одновременно допускается только один такой процесс.
- Просматривать очередь вакансий с оценками
- Генерировать сопроводительные письма
- Утверждать / редактировать письма
- Запускать отклик в браузере прямо из интерфейса

### Отклик через форму на странице вакансии

```bash
npm run hh-fill-letter -- --id=<uuid-записи>
```

Открывает страницу, нажимает «Откликнуться», вставляет письмо и ждёт вашей ручной проверки. Можно и по URL

```bash
npm run hh-fill-letter -- --url=https://hh.ru/vacancy/123 --text-file=./letter.txt
```

### Отклик через чат

```bash
npm run hh-apply-chat -- --id=<uuid-записи>
```

Флаги:
- `--stay-open` — не закрывать браузер
- `--dry-run` — открыть чат, но не вставлять письмо
- `--no-submit` — открыть форму отклика без отправки

## Обновление селекторов

Если hh.ru изменил вёрстку и скрипты перестали находить элементы:

```bash
npm run codegen-hh
```

Или вручную через `npx playwright codegen https://hh.ru`, актуальные селекторы в `lib/hh-response-selectors.mjs` и `lib/hh-chat-selectors.mjs`.

## Структура проекта

```
├── scripts/
│   ├── login.mjs                  # Сохранение браузерной сессии
│   ├── apply.mjs                  # Проверка сессии
│   ├── open-vacancies.mjs         # Поиск вакансий
│   ├── harvest.mjs                # Сбор + оценка через LLM
│   ├── scan-telegram.mjs          # Сканирование Telegram-каналов
│   ├── dashboard-server.mjs       # Сервер дашборда
│   ├── hh-fill-response-letter.mjs # Письмо в форме отклика
│   ├── hh-apply-chat-letter.mjs    # Письмо через чат
│   └── codegen-hh.mjs              # Генерация селекторов
├── lib/                           # Общие модули
├── config/                        # Конфигурация, шаблоны, секреты
├── CV/                            # Ваши резюме
├── data/                          # Сессия, очередь, логи (игнорируется)
├── dashboard/                     # Фронтенд дашборда
├── .env.example                   # Шаблон переменных окружения
└── package.json
```

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `HH_SESSION_DIR` | Путь к папке профиля Chromium |
| `HH_HEADLESS=1` | Безголовый режим |
| `HH_KEYWORDS` | Ключевые слова (через запятую) |
| `HH_KEYWORDS_FILE` | Путь к файлу ключей |
| `HH_MAX_TOTAL` / `HH_SESSION_LIMIT` | Лимит вакансий за запуск |
| `HH_OPEN_DELAY_MIN_MS` | Пауза между открытиями, мс |
| `POLZA_API_KEY` / `POLZA_AI_API_KEY` | Ключ Polza AI |
| `POLZA_MODEL` | Модель Polza (по умолчанию в коде `openai/gpt-4o-mini`) |
| `LLM_PROVIDER` | `auto` \| `polza` \| `openrouter` |
| `OpenRouter_API_KEY` | Ключ OpenRouter (если не используете Polza) |
| `OPENROUTER_MODEL` | Модель OpenRouter (по умолчанию `qwen/qwen3.6-plus-preview:free`) |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота |
| `TELEGRAM_CHAT_ID` | ID чата/канала |

Полный список и значения по умолчанию — в [`.env.example`](.env.example).

## Лицензия

MIT
>>>>>>> 57409b4 (v1.0.0)
