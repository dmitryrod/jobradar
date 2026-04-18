# Счётчики на вкладках дашборда вакансий

## Цель

Числа на кнопках: «Сбор вакансий» (= `uniqueUrlsOpened` как в «Открыто карточек»), «На проверке» / «Подходят» / «Отклонённые» (= количество записей в `store` по `status`).

## Бэкенд

- `GET /api/vacancy-counts` → `{ pending, approved, rejected }` из `loadQueue()` (один проход).

## Фронтенд

- В `index.html` — `<span class="tab-count">` внутри каждой вкладки.
- В `style.css` — компактный бейдж, `inline-flex` у `.tab`.
- В `app.js`:
  - `refreshVacancyCounts()` → API → обновить три вкладки очереди.
  - В `refreshHarvestStats()` → обновить бейдж вкладки «Сбор вакансий» из `s.uniqueUrlsOpened`.
  - Вызывать `refreshVacancyCounts` в начале `load()` (параллельно с загрузкой списка) и в `setInterval` вместе с `refreshHarvestStats`.

## Поведение

- Сбор: обновляется каждые2 с с harvest-status (как блок статистики).
- Очередь: при смене вкладки, после approve/reject/dismiss и каждые 2 с.
