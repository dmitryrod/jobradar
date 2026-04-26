# JobRadar: Design Documentation

Документ описывает текущий UI проекта JobRadar / hh-ru-apply и дает дизайн-спецификацию для генерации экранов в Google Stitch.

Статус проверки: текущая инвентаризация основана на `lib/dashboard/public/index.html`, `lib/dashboard/public/app.js`, `lib/dashboard/public/style.css`, `lib/dashboard/public/score-tooltip-clamp.js`, `README.md`, `docs/USAGE.md`, `docs/CHANGELOG.md` и скриншотах из `docs/images/readme/`. Браузерная проверка не выполнена: browser-use subagent не стартовал из-за регионального ограничения. Все визуальные и интерактивные детали, не подтвержденные живым браузером, помечены как `Needs verification`.

## Оглавление

1. [UI Inventory](#ui-inventory)
2. [Information Architecture](#information-architecture)
3. [Design Principles](#design-principles)
4. [Visual Language](#visual-language)
5. [Design Tokens](#design-tokens)
6. [Layout/Grid System](#layoutgrid-system)
7. [UI Components](#ui-components)
8. [Pages And States](#pages-and-states)
9. [Key User Flows](#key-user-flows)
10. [Design Improvement Backlog](#design-improvement-backlog)
11. [Stitch Prompting Guide](#stitch-prompting-guide)

## UI Inventory

### Реальные источники UI

- `lib/dashboard/public/index.html` - единственная HTML-страница дашборда, шаблон карточки вакансии, модальные окна, панели профиля и настроек.
- `lib/dashboard/public/app.js` - вся клиентская логика: вкладки, загрузка очереди, отрисовка карточек, статусы, модалки, toast, profile/settings side panels, harvest status, batch review automation.
- `lib/dashboard/public/style.css` - темная визуальная система, layout, responsive rules, состояния кнопок/табов/карточек/модалок.
- `lib/dashboard/public/score-tooltip-clamp.js` - helper для удержания tooltip score внутри viewport.
- Скриншоты:
  - `docs/images/readme/dashboard-pending-overview.png`
  - `docs/images/readme/dashboard-collect-automation.png`
  - `docs/images/readme/dashboard-draft-modal.png`
  - `docs/images/readme/dashboard-approved-actions.png`
  - `docs/images/readme/dashboard-apply-log.png`
- Технические документы:
  - `README.md`
  - `docs/USAGE.md`
  - `docs/CHANGELOG.md`

### Продукт и UI surface

JobRadar - локальный веб-дашборд для hh.ru pipeline:

- сбор вакансий через Node.js + Playwright;
- очередь вакансий с LLM scoring;
- генерация сопроводительных писем;
- ручное утверждение или отклонение;
- запуск браузерного отклика;
- просмотр логов и настройка profile/preferences.

UI представлен одной страницей дашборда. Внутри страницы есть:

- top header;
- tab navigation;
- collect panel;
- pending automation panel;
- vacancy queue list;
- vacancy cards;
- side panel "Профиль соискателя";
- side panel "Настройки";
- modal "Черновик письма";
- modal "Лог «Отклик в браузере»";
- modal "Утверждённое письмо";
- dynamic toast notifications.

### Страницы, вкладки и режимы

В UI нет маршрутизации и отдельных HTML-страниц. Состояния управляются вкладками:

- `Сбор вакансий` - включает `viewMode = 'collect'`, показывает `#harvest-panel`, скрывает список карточек очереди как основной контент.
- `На проверке` - `viewMode = 'queue'`, `currentStatus = 'pending'`, показывает очередь pending и `#review-pending-panel`.
- `Подходят` - `viewMode = 'queue'`, `currentStatus = 'approved'`, показывает approved queue.
- `Отклонённые` - `viewMode = 'queue'`, `currentStatus = 'rejected'`, показывает rejected queue.

У каждой вкладки есть counter в `.tab-count`.

### Верхняя шапка

Реальные элементы:

- `h1` с текстом `JobRadar`.
- На скриншотах виден заголовочный контекст "Очередь вакансий". `Needs verification`: это может быть содержимое скриншота/старой версии или визуальный контекст вокруг карточек, но в текущем HTML `h1` равен `JobRadar`.
- Индикатор `Идёт сбор вакансий…` в `#harvest-badge`, скрыт по умолчанию.
- Icon button "Профиль" с SVG user icon.
- Icon button "Настройки" с SVG gear icon.
- Button `Лог отклика hh`.
- Ниже - tab bar с 4 вкладками и счетчиками.

### `#harvest-panel`: сбор вакансий

Панель видна на вкладке `Сбор вакансий`.

Состав:

- lead text: параметры формы перекрывают одноименные env переменные для запуска harvest;
- блок `Логика работы с ключевыми словами`:
  - select `HH_KEYWORDS_LOGIC`;
  - варианты `loop` / `cycles` / `keywords`;
  - input `HH_KEYWORDS_CYCLES`;
  - input `HH_KEYWORDS_MAX`;
- блок preferences:
  - select `HH_REMOTE_TYPE`: `all`, `remote_hybrid`, `office`, `vakhata`;
  - checkbox `HH_WORK_HOURS_ENABLED`;
  - input `HH_WORK_HOUR_START`;
  - input `HH_WORK_HOUR_END`;
- лимиты и паузы:
  - `HH_PER_KEYWORD_LIMIT`;
  - `HH_SESSION_LIMIT`;
  - `HH_OPEN_DELAY_MIN_MS`;
  - `HH_OPEN_DELAY_MAX_MS`;
  - `HH_SEARCH_JITTER_MIN_MS`;
  - `HH_SEARCH_JITTER_MAX_MS`;
  - `HH_POST_LOAD_JITTER_MIN_MS`;
  - `HH_POST_LOAD_JITTER_MAX_MS`;
- hidden debug checkbox `HH_HARVEST_DEBUG`;
- actions:
  - `Старт поиска`;
  - `Остановить поиск`, hidden по умолчанию;
- stale hint про кооперативную остановку;
- статистика:
  - `Уникальных ссылок в очереди на обход`;
  - `Открыто карточек (уникальных URL)`;
  - meta line;
  - details/table `Список открытых ссылок`;
  - columns: `Ссылка`, `Название`, `Дата/время`, `Действие`;
  - harvest log hint.

### Aside "Автоматизация отклика" на collect

Панель находится внутри `#harvest-panel`.

Состав:

- title `Автоматизация отклика`;
- lead: для новых карточек после сбора, сводка на "На проверке";
- input `Целевой score (0-100)`;
- checkbox `Автоотклонение, если score ниже порога`;
- checkbox `Авточерновик письма при score >= порога`;
- conditional select `Условие генерации`:
  - `Только новые из harvest`;
  - `Новые и ручной батч на «На проверке»`;
- conditional input `Число вариантов письма (1-10)`;
- button `Сохранить`.

### `#review-pending-panel`: фильтр и batch automation

Панель видна на вкладке `На проверке`.

Состав:

- title `Фильтр вакансий`;
- lead: общие настройки с вкладкой "Сбор вакансий" и `preferences.json`;
- fixed mode note: только вакансии `На проверке`, без черновика письма, ручной batch по очереди, к LLM по одной карточке за шаг;
- toolbar:
  - input `Целевой score (0-100)`;
  - checkbox `Автоотклонение, если score ниже порога`;
  - checkbox `Авточерновик письма при score >= порога`;
  - conditional input `Число вариантов письма (1-10)`;
  - button `Сохранить`;
  - button `Запустить`.

### Vacancy card

Карточка вакансии создается из template `#card-tpl`.

Анатомия:

- dismiss button `×` с aria-label `Удалить из очереди`;
- score block:
  - score pill;
  - tooltip;
  - score parts: `LLM · Профиль · Итог`;
  - model info button `i` и panel;
- title link, opens vacancy in new tab;
- meta: company, salary, search query and related metadata;
- summary;
- risks line with prefix `Нюансы:`;
- tags;
- employer instructions panel:
  - title `Отклик: что просит работодатель`;
  - badges;
  - summary;
  - details with raw fragments;
- apply action row:
  - `Отклик в браузере`;
- pending top actions:
  - refresh icon;
  - `Создать сопроводительное`;
  - `Черновик письма`;
  - `Подходит`;
- reject block:
  - textarea reason/comment;
  - `Не подходит`;
- approved/rejected state:
  - `Письмо`;
  - done reason/comment;
  - browser apply may be visible for non-pending and disabled if no approved letter.

Card grid:

- main column;
- middle stack with `Условия работы` and `Дата публикации`;
- description panel `Описание вакансии`;
- description scrolls.

### Pending card actions

For `status === 'pending'`:

- browser apply row hidden;
- pending action toolbar visible;
- refresh icon available;
- `Создать сопроводительное`;
- `Черновик письма` visible when draft exists;
- `Подходит` visible when draft exists;
- reject textarea and `Не подходит`;
- browser apply hidden.

### Approved card actions

For `status === 'approved'`:

- pending actions hidden;
- browser apply row visible;
- `Отклик в браузере` active only if approved letter exists;
- `Письмо` opens approved letter modal;
- done reason/comment can be shown.

### Rejected card actions

For `status === 'rejected'`:

- card remains similar to approved/non-pending card;
- comment/reason appears in done reason/comment area;
- browser apply may be visible for non-pending, but disabled if there is no approved letter.

### Modals

Current modals:

- `Черновик письма`:
  - variants radio;
  - textarea;
  - `Сохранить правки`;
  - `Подходит`;
  - `Отклонить`;
  - empty state `Нет вариантов.`;
- `Лог «Отклик в браузере»`:
  - path `data/hh-apply-chat.log`;
  - hint with terminal command;
  - button `Обновить`;
  - `pre` log viewer;
  - auto-refresh interval 2.5s in `app.js`;
- `Утверждённое письмо`:
  - vacancy title/url;
  - `pre` with approved text;
  - button `Копировать`.

### Side panels

`Профиль соискателя`:

- side dialog width `min(52rem, 100vw)`;
- criteria table columns:
  - `Вкл`;
  - `Логика`;
  - `Название`;
  - `Значение`;
  - `Вес`;
  - `±`;
  - `Ban`;
- sum line `Сумма весов (вкл.)`;
- save button `Сохранить в config/preferences.json`;
- loading row `Загрузка…`;
- error row `Ошибка: ...`.

`Настройки`:

- side dialog width `min(22rem, 100vw)`;
- Debug block:
  - explanation for `HH_HARVEST_DEBUG`;
  - button `Debug`;
- destructive block:
  - explanation for `Очистить базу данных`;
  - button `Очистить базу данных`;
  - confirmation is required in JS.

### Toasts

Dynamic toast host is created by `app.js`.

- position: bottom center;
- role: `status`;
- variants: neutral, good, bad;
- approximate lifetime: 2.6s;
- transition: 0.25s;
- shadow: `0 8px 28px rgba(0, 0, 0, 0.45)`;
- `Needs verification`: exact stacking behavior with multiple toasts should be checked in browser.

### Empty, loading and error states

Observed states:

- list empty: `Пусто.`;
- collect hint exists as panel lead and status/log hint;
- profile loading row: `Загрузка…`;
- profile error row: `Ошибка: ...`;
- apply log loading: `Загрузка…`;
- apply log missing file message;
- apply log error: `Ошибка: ...`;
- generic `.err` class is used for error message surfaces.

## Information Architecture

### Navigation model

JobRadar uses one-page navigation. The top-level IA is a pipeline:

1. `Сбор вакансий` - create or extend the queue.
2. `На проверке` - inspect scored vacancies and produce decisions.
3. `Подходят` - approved candidates ready for browser apply.
4. `Отклонённые` - rejected records and reasons.

Secondary navigation/actions:

- `Профиль` - scoring preferences and profile criteria;
- `Настройки` - debug and destructive database reset;
- `Лог отклика hh` - browser apply log.

### Core entities

- Vacancy - one hh.ru vacancy record in queue.
- Queue item status - `pending`, `approved`, `rejected`.
- Score - LLM score, profile score, overall score, publication bonus and model metadata.
- Cover letter draft - one or more generated variants pending approval.
- Approved letter - final text used by browser apply.
- Profile criteria - weighted rules used for profile scoring and bans.
- Harvest run - search/parse/scoring process launched from collect tab.
- Browser apply log - file-backed log for Playwright apply scenario.

### Main scenarios

- Start or stop vacancy collection.
- Review pending vacancies by score, summary, risks, conditions and description.
- Generate cover letter drafts.
- Edit and approve a letter.
- Reject vacancy with reason/comment.
- Launch browser apply for approved vacancy.
- Inspect browser apply log.
- Tune scoring profile and automation rules.
- Clear local data when needed.

## Design Principles

1. Human-in-the-loop first.
   The UI must make it clear that the user controls final decisions: approve, reject, edit letter and launch browser apply.

2. Operational transparency.
   Scores, model info, harvest status, opened URL table, logs and employer instructions should remain visible enough to explain why a vacancy moved through the pipeline.

3. Dense but calm.
   The app is a local professional tool, not a marketing landing page. It should support long review sessions with compact typography, low-glare dark surfaces and predictable controls.

4. Status before decoration.
   Color should primarily communicate status: good, bad, warning, active, disabled, destructive. Avoid adding purely decorative colors that compete with score and status pills.

5. Keep queue context stable.
   Review work happens in cards. Actions should not unexpectedly move or hide important evidence before the user sees the result. Recommended: preserve scroll position after card actions.

6. No invented automation.
   Any Stitch generation should represent existing controls only. New ideas belong in `Recommended` or `Needs design decision`.

## Visual Language

### Overall direction

Dark, utilitarian, data-heavy dashboard with compact cards and soft panel separation.

Keywords:

- local automation console;
- review queue;
- professional dark mode;
- compact forms;
- controlled browser automation;
- readable logs;
- score-driven triage.

### Tone

- Serious, technical, direct.
- Labels are explicit and action-oriented.
- Helper text explains consequences, especially for automation and destructive actions.

### Surfaces

- Page background is near black `#0f1114`.
- Main panels use `#181c22`.
- Nested panels use darker/layered surfaces like `#14181e`.
- Hover surfaces use `#1c2028` and `#1f252d`.
- Cards use dark panels with thin borders and rounded corners.

### Color semantics

- Accent blue `#7cb7ff` - primary interactive/action highlight.
- Good green `#6bcf7f` - approved, active positive state, collection badge.
- Bad red `#f08080` - reject/destructive/error.
- Muted gray `#9aa0a6` - metadata, hints, secondary text.
- Border `#2a3139` - structure and separation.
- Warning text `#c9b88a` - cautionary notes.

## Design Tokens

### Color

Current CSS root tokens:

| Token | Value | Usage |
|---|---:|---|
| `--bg` | `#0f1114` | body background, nested control backgrounds |
| `--panel` | `#181c22` | panels, cards, log button background |
| `--text` | `#e8eaed` | primary text |
| `--muted` | `#9aa0a6` | secondary text, hints, inactive controls |
| `--accent` | `#7cb7ff` | links, primary actions, focus/active accents |
| `--good` | `#6bcf7f` | positive state |
| `--bad` | `#f08080` | negative/destructive state |
| `--border` | `#2a3139` | borders and dividers |

Literal colors currently used or referenced by the UI:

- Active tab/button border: `#3d4a56`.
- Active tab/button bg: `#1a1e25`, `#1c2028`.
- Hover bg: `#1c2028`, `#1f252d`.
- Score bg: `#222831`.
- Nested surface: `#14181e`.
- Warning text: `#c9b88a`.
- Success surfaces: `#2d4a35`, `#2a3828`.
- Danger surface: `#4a2d2d`.
- Publication today: `#1a2a22`, `#2d5a45`.
- Employer instruction surface: `rgba(30, 42, 58, 0.45)`.
- Backdrop: `rgba(0, 0, 0, 0.45)`.
- Soft white overlays: `rgba(255, 255, 255, 0.04)`, `rgba(255, 255, 255, 0.07)`.
- Accent overlay: `rgba(124, 183, 255, 0.08)`, `rgba(124, 183, 255, 0.12)`, `rgba(124, 183, 255, 0.2)`.
- Good border overlay: `rgba(107, 207, 127, 0.5)`.

Recommended:

- Normalize literal colors into semantic tokens:
  - `--surface-nested`;
  - `--surface-hover`;
  - `--surface-active`;
  - `--surface-success`;
  - `--surface-danger`;
  - `--surface-warning`;
  - `--surface-today`;
  - `--shadow-modal`;
  - `--shadow-popover`;
  - `--shadow-toast`.

### Typography

Current CSS:

- Body font: `"Segoe UI", system-ui, sans-serif`.
- Monospace: `ui-monospace, monospace` for logs/code/profile logic.
- Body line-height: `1.45`.
- `h1`: `1.35rem`, weight `600`.
- Settings panel title: `1.15rem`, weight `600`.
- Modal title: around `1.1rem`, weight `600`.
- Card title: around `1.05rem`, weight `600`.
- Body text: approximately `0.88rem` to `0.92rem`.
- Table text: approximately `0.78rem` to `0.82rem`.
- Small labels: approximately `0.72rem` to `0.78rem`.

Recommended:

- Define type roles for Stitch and future CSS:
  - `display/page-title`: `1.35rem / 600`;
  - `section-title`: `1.15rem / 600`;
  - `card-title`: `1.05rem / 600`;
  - `body`: `0.9rem / 400`;
  - `body-small`: `0.82rem / 400`;
  - `caption`: `0.72rem / 400`;
  - `mono-log`: `0.82rem / ui-monospace`.

### Spacing

Current values:

- `.top` padding: `1.25rem 1.5rem 0.5rem`.
- `#list` padding: `1rem clamp(0.75rem, 2vw, 1.5rem) 2rem`.
- Card padding: `1rem 2.25rem 1rem 1.1rem`.
- Settings panel padding: `1rem 1.15rem`.
- Harvest panel padding: `1rem 1.1rem`.
- Tab gap: `0.5rem`.
- Top row gap: `0.75rem`.
- Harvest grid gaps: around `0.32rem` to `1rem`.
- Button padding: commonly `0.35rem 0.75rem`, `0.4rem 0.9rem`, `0.45rem 1rem`.

Recommended:

- Normalize to spacing scale:
  - `--space-1: 0.25rem`;
  - `--space-2: 0.5rem`;
  - `--space-3: 0.75rem`;
  - `--space-4: 1rem`;
  - `--space-5: 1.25rem`;
  - `--space-6: 1.5rem`;
  - `--space-8: 2rem`.

### Radius

Current values:

- Buttons/tabs: `8px`.
- Cards/modals: `12px`.
- Harvest panel: `10px`.
- Smaller panels/tables: `6px` to `8px`.
- Badges/pills: `999px` or `6px`.
- Inline code: `4px`.

Recommended:

- `--radius-sm: 4px`;
- `--radius-md: 6px`;
- `--radius-lg: 8px`;
- `--radius-xl: 10px`;
- `--radius-2xl: 12px`;
- `--radius-pill: 999px`.

### Shadow / Elevation

Current values:

- Settings/profile side panel: `-8px 0 32px rgba(0, 0, 0, 0.35)`.
- Modal: `0 16px 48px rgba(0, 0, 0, 0.5)`.
- Tooltip: `0 8px 24px rgba(0, 0, 0, 0.45)`.
- Toast: `0 8px 28px rgba(0, 0, 0, 0.45)`.

Recommended:

- Use elevation only for overlays, not for every card.
- Keep cards border-led; use shadow for modal, tooltip, toast and side panels.

### Motion

Current values:

- Button transition: `0.18s ease` for background, border, color, box-shadow.
- Toast transition: `0.25s`.
- Tooltip opacity: `0.12s`.

Recommended:

- Keep motion functional and short.
- Avoid large layout animations in the queue; they can make long review work feel unstable.

## Layout/Grid System

### Desktop

Global:

- body uses full viewport width;
- no global max-width;
- header spans full width;
- content list padding uses responsive clamp;
- cards can use wide horizontal space.

Card grid:

- `grid-template-columns: minmax(240px, 1fr) minmax(200px, .38fr) minmax(260px, 1fr)`;
- main column contains score/title/meta/actions;
- middle stack contains conditions and publication date;
- right column contains scrollable description.

Harvest layout:

- max width: `min(100%, 112rem)`;
- main form + automation aside:
  - main form takes flexible width;
  - aside uses `minmax(200px, 17.5rem)`;
- fields use dense CSS grids.

Overlays:

- settings panel width: `min(22rem, 100vw)`;
- profile panel width: `min(52rem, 100vw)`;
- modal width: `min(42rem, 100%)`;
- wide modal width: `min(52rem, 100%)`;
- modal max-height: `min(85vh, 720px)`.

### Tablet

Breakpoints:

- `max-width: 1100px`:
  - card becomes one column;
  - harvest main becomes 2 columns;
  - `>=1101px` card main gets extra right padding.
- `max-width: 960px`:
  - harvest layout becomes one column;
  - automation aside stacks below main harvest fields.
- `max-width: 700px`:
  - pending toolbar fields become full width;
  - buttons use half-width layout.

### Mobile

Breakpoints:

- `max-width: 560px`:
  - harvest main becomes one column.

Expected behavior:

- cards become vertically stacked;
- side panels take full viewport width;
- modals use full available width;
- long descriptions/logs remain scrollable.

Needs verification:

- actual touch target sizes on small screens;
- whether card actions wrap without overlap;
- whether modal body scroll is comfortable on mobile.

## UI Components

### Button

Purpose:

- Execute primary or secondary actions: start harvest, stop harvest, save preferences, generate letter, approve, reject, refresh logs.

Anatomy:

- text label;
- optional status class (`ok`, `bad`);
- border;
- dark or tinted background.

Variants:

- default `.btn`;
- positive `.btn.ok`;
- destructive/negative `.btn.bad`;
- block `.btn-block`;
- harvest start `.btn-harvest-start`;
- harvest stop `.btn-harvest-stop`;
- log button `.btn-log-apply`;
- draft/action buttons.

States:

- default;
- hover;
- disabled;
- hidden;
- active/toggled for Debug via `.is-on` on debug button.

Rules:

- Use explicit verbs: `Сохранить`, `Запустить`, `Отклик в браузере`.
- Destructive actions must use `bad` styling and confirmation.
- Long-running actions should disable the button while request is active.

Do not:

- Use the same visual priority for destructive and neutral actions.
- Put unlabeled destructive icon-only actions outside clear context.

### Icon Button

Purpose:

- Compact global actions and card utility actions.

Anatomy:

- button container;
- SVG icon or text glyph;
- `title` and `aria-label`.

Variants:

- top header profile icon;
- top header settings icon;
- card refresh icon;
- modal close `×`;
- card dismiss `×`.

States:

- default;
- hover;
- disabled;
- hidden.

Rules:

- Always include `aria-label`.
- Keep icon-only buttons for repeated or globally recognizable actions.

Do not:

- Use icon-only buttons for rare or high-risk actions without text nearby.

### Input

Purpose:

- Numeric configuration for harvest, score thresholds, work hours and variant count.

Anatomy:

- label;
- input;
- optional title tooltip;
- min/max/step attributes.

Variants:

- number input;
- small number input inside profile table;
- hidden/conditional fields.

States:

- default;
- focused;
- disabled;
- hidden;
- invalid browser-native state.

Rules:

- Keep label text explicit and include units where needed, for example `мс`, `0-100`, `0-23`.
- Use min/max/step for bounded values.

Do not:

- Rely only on placeholder for meaning.

### Textarea

Purpose:

- Edit cover letter draft and enter rejection reason.

Anatomy:

- label or placeholder;
- multiline text box.

Variants:

- modal letter editor, rows `12`;
- card rejection reason, rows `2`.

States:

- default;
- focused;
- disabled during save/approve/decline;
- empty.

Rules:

- Use larger editor in modal for letter text.
- Use compact textarea on card for reason/comment.

Do not:

- Hide user edits after changing variant without saving. Current modal syncs textarea into selected variant in JS.

### Select

Purpose:

- Choose harvest mode, remote type, automation scope, profile logic sign.

Anatomy:

- label;
- select;
- options.

Variants:

- `HH_KEYWORDS_LOGIC`;
- `HH_REMOTE_TYPE`;
- `coverLetterScope`;
- profile table select.

States:

- default;
- focused;
- hidden conditional state.

Rules:

- Use stable option labels in Russian, with underlying technical values preserved.
- Hide conditional selects until relevant.

Do not:

- Present a scope option if the matching automation mode cannot use it.

### Checkbox / Toggle

Purpose:

- Enable work hours, auto reject, auto draft, profile criteria, bans and Debug.

Anatomy:

- checkbox input;
- label text;
- optional explanatory title.

Variants:

- standard checkbox in forms;
- profile table checkbox;
- Debug button behaves like a toggle with `aria-pressed`, not a checkbox visually.

States:

- checked;
- unchecked;
- disabled;
- hidden.

Rules:

- Explain automation consequences in adjacent label or title.
- Use `aria-pressed` for button toggles.

Do not:

- Use a toggle for irreversible action.

### Badge / Status Pill

Purpose:

- Show score, counts, harvest status, tags and extracted employer instruction markers.

Anatomy:

- compact inline container;
- text/number;
- rounded background/border.

Variants:

- tab counter `.tab-count`;
- score pill `.score`;
- harvest badge;
- tags;
- employer apply badges.

States:

- neutral;
- good;
- bad;
- warning;
- active.

Rules:

- Keep badge text short.
- Use color semantically.

Do not:

- Make long explanations into badges; use tooltip/details/panel.

### Card

Purpose:

- Represent one vacancy and all review actions/evidence.

Anatomy:

- dismiss;
- score/title/meta;
- summary/risks/tags;
- employer instructions;
- action row;
- conditions panel;
- publication panel;
- description panel.

Variants:

- pending;
- approved;
- rejected.

States:

- normal;
- action loading via disabled controls;
- missing conditions/description/published data;
- today publication highlighted;
- dismissed/removed from list after action.

Rules:

- Keep decision controls near evidence.
- Preserve score and title visibility in the main column.
- Put long vacancy description in scrollable panel.

Do not:

- Mix pending and approved actions in the same visible toolbar.

### Table / List

Purpose:

- Dense structured data: harvest opened URLs and profile criteria.

Anatomy:

- header row;
- body rows;
- compact cells;
- horizontal overflow wrapper when needed.

Variants:

- `Список открытых ссылок`;
- profile criteria table;
- vacancy card list in `#list` as a card list, not a table.

States:

- empty;
- loading;
- error;
- overflow scroll.

Rules:

- Keep column labels terse.
- Use monospace for code-like logic values.

Do not:

- Use table layout for rich vacancy cards; cards need multiple evidence panels.

### Empty State

Purpose:

- Communicate no data without adding noise.

Current text:

- `Пусто.`;
- modal draft empty: `Нет вариантов.`;
- card missing data:
  - `Нет данных - нажмите «обновить»...`;
  - `Нет текста описания - обновите с hh.ru.`;

States:

- queue empty;
- no draft variants;
- missing parsed data.

Rules:

- Keep empty copy short.
- When recovery is possible, name the next action.

Do not:

- Use celebratory empty states in this operational tool.

### Loading State

Purpose:

- Show request in progress.

Current examples:

- profile table row `Загрузка…`;
- apply log `Загрузка…`;
- buttons disabled while async operation runs.

Recommended:

- Add consistent inline loading text for card-level actions: `Генерируем...`, `Сохраняем...`, `Обновляем...`.

Do not:

- Use skeleton loaders for logs or dense tables unless there is a real delay worth masking.

### Error State

Purpose:

- Show failed API or file/log load.

Current examples:

- `.err` message surface;
- profile row `Ошибка: ...`;
- apply log `Ошибка: ...`;
- API helper adds hint when response is non-JSON or dashboard is not running.

Rules:

- Preserve the actual error text.
- Add a short recovery hint when known.

Do not:

- Replace technical errors with vague "something went wrong"; this is a local debugging-oriented tool.

### Modal / Dialog

Purpose:

- Focused secondary task without leaving the queue.

Anatomy:

- backdrop;
- dialog;
- header;
- title;
- close button;
- body;
- optional action row.

Variants:

- draft modal;
- apply log modal wide;
- approved letter modal.

States:

- open;
- closed/hidden;
- loading;
- empty;
- error.

Rules:

- Use modal for detailed text editing or log inspection.
- Keep close button consistent.
- Preserve keyboard Escape handling.

Do not:

- Put long multi-step settings forms in modals; current side panels are better for persistent settings.

### Toast / Notification

Purpose:

- Short feedback after actions.

Anatomy:

- bottom-center host;
- toast item;
- text;
- variant class.

Variants:

- neutral;
- good;
- bad.

States:

- entering visible;
- visible;
- hiding.

Rules:

- Use for non-blocking confirmation.
- Keep message one sentence.

Do not:

- Use toast as the only place for critical errors that need follow-up.

### Tabs

Purpose:

- Top-level queue navigation and mode switch.

Anatomy:

- tab button;
- label;
- count pill.

Variants:

- collect tab uses `data-tab="collect"`;
- status tabs use `data-status`.

States:

- active;
- hover;
- inactive.

Rules:

- Counts should reflect current data.
- Active tab must clearly indicate the current mode/status.

Do not:

- Add nested tabs inside cards; use sections/details instead.

### Filters

Purpose:

- Configure review automation on pending queue.

Current filter surface:

- `#review-pending-panel` with target score, auto reject, auto draft, variant count, save and run.

States:

- visible only on pending tab;
- conditional variant count visible only when auto draft mode requires it.

Rules:

- Treat this as automation control, not simple visual filtering.
- Keep fixed mode note visible because it explains batch scope.

Do not:

- Label it as search/filter if it mutates queue state without clear warning.

### Search

Status: Not present.

There is no free-text search field in the current UI.

Recommended:

- Add vacancy search only if long queue review becomes painful. Suggested scope: title, company, search query, tags. Mark as client-side filter unless backed by API.

### Log Viewer

Purpose:

- Inspect browser apply log without leaving dashboard.

Anatomy:

- modal title;
- file path;
- refresh button;
- `pre` text area;
- missing-file message;
- auto-refresh timer.

States:

- loading;
- file missing;
- loaded;
- error.

Rules:

- Use monospace.
- Keep line wrapping/scrolling readable.

Do not:

- Render log as cards; plain chronological text is correct here.

### Progress / Automation Status

Purpose:

- Communicate harvest and automation execution.

Current surfaces:

- `Идёт сбор вакансий…` badge;
- `Старт поиска` / `Остановить поиск`;
- harvest stats for queued/opened URLs;
- opened URL table with outcome;
- pending batch `Запустить`;
- toasts after save/action.

Recommended:

- Add a compact run status line with last event and timestamp if harvest log already provides it.

Needs design decision:

- Whether batch review should show per-card progress in the pending panel or only mutate cards as results return.

### Action Toolbar

Purpose:

- Group context-specific actions.

Current toolbars:

- top header actions;
- tab bar;
- pending card action row;
- pending reject action block;
- modal draft action row;
- apply log toolbar;
- harvest actions;
- pending review toolbar.

Rules:

- Keep destructive action at the end or visually separated.
- Hide actions that do not apply to current status.
- Disable actions that require missing prerequisites.

Do not:

- Show `Отклик в браузере` as enabled before approved letter exists.

### Form Section

Purpose:

- Group related settings and explain consequences.

Current sections:

- harvest keyword logic;
- harvest placement/work-hours;
- harvest limits and pauses;
- collect automation;
- pending automation;
- profile criteria table;
- settings debug and clear database blocks.

Rules:

- Use title + short lead + controls.
- Put units in labels.
- Keep helper text close to controls with side effects.

Do not:

- Split one logical setting across distant panels unless it is intentionally shared, as with review automation.

### Page Header

Purpose:

- Brand, global state and global actions.

Anatomy:

- title `JobRadar`;
- harvest badge;
- profile/settings icon buttons;
- log button;
- tabs below.

States:

- normal;
- harvest running badge visible;
- active tab changes.

Rules:

- Keep header compact.
- Do not add large marketing copy above the queue.

Needs verification:

- Screenshot/title mismatch between `JobRadar` in code and "Очередь вакансий" in README screenshot should be checked in browser or updated screenshots.

## Pages And States

### Global Dashboard Shell

Purpose:

- Provide a single local control center for collecting, reviewing and applying to hh.ru vacancies.

Primary user goal:

- Move vacancies through the pipeline with enough context to make decisions confidently.

Entry points:

- `npm run dashboard`;
- browser URL `http://127.0.0.1:3849` or auto-selected port when configured.

Layout structure:

- sticky-like top visual zone in `.top` (not confirmed sticky);
- top row with title/actions;
- tabs;
- optional mode panel;
- main `#list`.

Blocks/containers:

- header;
- tabs;
- collect panel;
- pending automation panel;
- list/card container;
- overlays.

Main components:

- Page Header;
- Tabs;
- Card;
- Toast;
- Modal/Dialog;
- Side Panel.

User actions:

- switch tab;
- open profile;
- open settings;
- open apply log;
- act on cards.

Data displayed:

- queue counts;
- harvest running state;
- queue cards by status.

Empty/loading/error states:

- list empty: `Пусто.`;
- panel and log loading states as described above;
- `.err` for errors.

Responsive behavior:

- header wraps actions;
- tabs wrap;
- cards collapse to one column below 1100px.

Stitch generation notes:

- Generate as a dark data dashboard with a top control bar and tabbed pipeline.
- Do not generate separate routes/pages.
- Keep all content within one local app shell.

### Tab: Сбор вакансий

Purpose:

- Start and monitor harvest runs, configure per-run search parameters and automation rules for new vacancies.

Primary user goal:

- Launch controlled collection from hh.ru and see what was opened/queued.

Entry points:

- top tab `Сбор вакансий`;
- `viewMode = 'collect'`.

Layout structure:

- full-width harvest panel;
- main grid of form fields;
- right aside for automation;
- stats section below;
- details/table for opened URLs.

Blocks/containers:

- lead text;
- keyword logic section;
- placement/work-hours section;
- limits and pauses section;
- harvest actions;
- automation aside;
- stats and opened URLs table.

Main components:

- Form Section;
- Input;
- Select;
- Checkbox;
- Button;
- Progress / Automation Status;
- Table/List.

User actions:

- choose keyword logic;
- set cycles or keyword count;
- choose remote type;
- enable work hours;
- set limits and delays;
- toggle Debug through settings;
- start search;
- stop search;
- save automation preferences.

Data displayed:

- queued unique links;
- opened unique URLs;
- harvest meta/log hint;
- opened URL table with action outcome.

Empty/loading/error states:

- opened links table can be empty;
- harvest running badge appears globally;
- errors appear through `.err` and toasts.

Responsive behavior:

- 2-column harvest main below 1100px;
- 1-column harvest layout below 960px;
- 1-column fields below 560px.

Stitch generation notes:

- Emphasize dense operational form layout.
- Keep automation aside visually related but distinct.
- Show the opened URLs details/table as collapsible section.

### Tab: На проверке

Purpose:

- Review scored pending vacancies and decide whether to draft/approve/reject.

Primary user goal:

- Triage the queue and produce approved letters or rejection decisions.

Entry points:

- top tab `На проверке`;
- default status `pending`.

Layout structure:

- pending automation/filter panel below tabs;
- list of pending vacancy cards.

Blocks/containers:

- `Фильтр вакансий` panel;
- fixed mode note;
- pending review toolbar;
- card list.

Main components:

- Filters;
- Card;
- Score badge/tooltip;
- Button;
- Textarea;
- Modal/Dialog.

User actions:

- adjust target score;
- save automation settings;
- run pending batch;
- refresh vacancy text and score;
- create cover letter;
- open draft;
- approve draft;
- reject vacancy with reason;
- dismiss card from queue.

Data displayed:

- score and score parts;
- model info;
- title/company/salary/search query;
- summary/risks/tags;
- employer instructions;
- conditions;
- publication date;
- description.

Empty/loading/error states:

- empty list: `Пусто.`;
- missing conditions/date/description messages inside card;
- draft modal empty: `Нет вариантов.`;
- API errors may use alert/toast.

Responsive behavior:

- card collapses to one column below 1100px;
- pending toolbar fields full-width and buttons half-width below 700px.

Stitch generation notes:

- Use card grid with evidence panels.
- Show pending action toolbar in main card column.
- Hide browser apply action for pending state.

### Tab: Подходят

Purpose:

- Show approved vacancies ready for browser apply.

Primary user goal:

- Launch browser apply or inspect approved letter before acting.

Entry points:

- top tab `Подходят`;
- `currentStatus = 'approved'`.

Layout structure:

- card list without pending automation panel;
- each card has non-pending action row.

Blocks/containers:

- approved vacancy cards;
- browser apply row;
- approved letter modal.

Main components:

- Card;
- Button;
- Modal/Dialog;
- Toast;
- Log Viewer.

User actions:

- click `Отклик в браузере`;
- open `Письмо`;
- copy approved letter;
- inspect apply log from header;
- dismiss card.

Data displayed:

- same vacancy evidence as pending cards;
- approved letter status/actions;
- done reason/comment if present.

Empty/loading/error states:

- empty list: `Пусто.`;
- browser apply disabled if no approved letter exists;
- log modal handles missing log file.

Responsive behavior:

- same card responsiveness as pending.

Stitch generation notes:

- Show `Отклик в браузере` as the primary action only when approved letter exists.
- Include secondary `Письмо` action.

### Tab: Отклонённые

Purpose:

- Show rejected vacancies and retain the reason/comment trail.

Primary user goal:

- Audit why vacancies were rejected and optionally inspect details.

Entry points:

- top tab `Отклонённые`;
- `currentStatus = 'rejected'`.

Layout structure:

- card list;
- no pending automation panel.

Blocks/containers:

- rejected vacancy cards;
- reason/comment display.

Main components:

- Card;
- Badge/Status Pill;
- Button disabled state when no approved letter.

User actions:

- inspect rejected card;
- dismiss card;
- possibly open browser apply row if non-pending and approved letter exists, though rejected state usually has no approved letter.

Data displayed:

- same vacancy evidence;
- rejection reason/comment.

Empty/loading/error states:

- empty list: `Пусто.`;
- disabled browser apply when no approved letter.

Responsive behavior:

- same card responsiveness as pending.

Stitch generation notes:

- Do not make rejected state visually alarming everywhere.
- Use muted/danger accents for reason, not a full red card.

### Modal: Черновик письма

Purpose:

- Review, edit, save, approve or decline generated cover letter variants.

Primary user goal:

- Turn an LLM-generated draft into an approved letter.

Entry points:

- pending card `Черновик письма`;
- after generation when draft exists.

Layout structure:

- modal header;
- vacancy title;
- variants radio group;
- letter textarea;
- action row.

Blocks/containers:

- variant selector;
- letter editor;
- save/approve/decline actions.

Main components:

- Modal/Dialog;
- Radio controls;
- Textarea;
- Button.

User actions:

- switch variant;
- edit text;
- save edits;
- approve;
- decline.

Data displayed:

- vacancy title or URL;
- letter variants;
- edited text.

Empty/loading/error states:

- `Нет вариантов.`;
- buttons disabled during async actions;
- errors may be shown via alert.

Responsive behavior:

- modal width `min(42rem, 100%)`;
- max height `min(85vh, 720px)`;
- body should scroll if content exceeds viewport.

Stitch generation notes:

- Make textarea the dominant element.
- Keep action row compact and clear: save neutral, approve green, decline red.

### Modal: Лог «Отклик в браузере»

Purpose:

- Inspect Playwright browser apply log from `data/hh-apply-chat.log`.

Primary user goal:

- Understand what browser apply did or why it failed.

Entry points:

- header button `Лог отклика hh`.

Layout structure:

- wide modal;
- path/hint paragraph;
- refresh toolbar;
- `pre` log content.

Blocks/containers:

- file path;
- terminal hint;
- refresh button;
- log viewer.

Main components:

- Modal/Dialog;
- Log Viewer;
- Button.

User actions:

- refresh log manually;
- close modal.

Data displayed:

- log file path;
- latest log contents;
- missing-file message.

Empty/loading/error states:

- `Загрузка…`;
- file missing message;
- `Ошибка: ...`.

Responsive behavior:

- wide modal width `min(52rem, 100%)`;
- log content should scroll.

Stitch generation notes:

- Use monospace pre area.
- Do not over-design log lines into cards.

### Modal: Утверждённое письмо

Purpose:

- Read and copy the final approved cover letter.

Primary user goal:

- Verify the exact letter text before or during browser apply.

Entry points:

- approved card button `Письмо`.

Layout structure:

- modal header;
- vacancy title/url;
- preformatted letter;
- copy action.

Blocks/containers:

- letter text;
- copy action row.

Main components:

- Modal/Dialog;
- Button;
- Log-like `pre` text block.

User actions:

- copy approved letter;
- close modal.

Data displayed:

- approved letter text.

Empty/loading/error states:

- not explicitly shown in HTML; text can be empty if data missing. Recommended: show `Письмо пустое` if this state occurs.

Responsive behavior:

- modal width `min(42rem, 100%)`;
- pre block should scroll/wrap as needed.

Stitch generation notes:

- Keep it read-only.
- Make copy action positive but not more prominent than browser apply.

### Side Panel: Профиль соискателя

Purpose:

- Configure weighted profile criteria used by scoring and bans.

Primary user goal:

- Tune how vacancy fit is calculated.

Entry points:

- header icon button "Профиль".

Layout structure:

- right side panel;
- title/header;
- explanatory lead;
- sum line;
- editable criteria table;
- full-width save button.

Blocks/containers:

- panel header;
- criteria explanation;
- table wrapper;
- save action.

Main components:

- Side Modal/Dialog;
- Table/List;
- Checkbox;
- Input;
- Select;
- Button.

User actions:

- enable/disable criteria;
- edit value;
- edit weight;
- choose logic sign;
- toggle Ban;
- save to `config/preferences.json`.

Data displayed:

- criteria rows;
- sum of enabled weights.

Empty/loading/error states:

- loading row `Загрузка…`;
- error row `Ошибка: ...`.

Responsive behavior:

- width `min(52rem, 100vw)`;
- table wrapper has horizontal overflow.

Stitch generation notes:

- Treat it as advanced settings.
- Keep table dense and readable.

### Side Panel: Настройки

Purpose:

- Provide debug toggle and destructive database reset.

Primary user goal:

- Enable harvest debug or clear local data deliberately.

Entry points:

- header icon button "Настройки".

Layout structure:

- right side panel;
- title/header;
- debug explanation and button;
- clear database explanation and destructive button.

Blocks/containers:

- Debug block;
- Clear database block.

Main components:

- Side Modal/Dialog;
- Button;
- Form Section.

User actions:

- toggle Debug;
- clear database after confirmation.

Data displayed:

- path `data/harvest-debug.log`;
- env flag `HH_HARVEST_DEBUG=1`;
- list of data affected by clear action.

Empty/loading/error states:

- clear button disabled during request;
- errors appear through toast/alert path in JS.

Responsive behavior:

- width `min(22rem, 100vw)`.

Stitch generation notes:

- Make destructive action visually separated and red.
- Do not add extra settings that do not exist.

## Key User Flows

### Просмотр очереди

1. User opens dashboard.
2. Default tab is `На проверке`.
3. UI loads queue and counts.
4. User scans cards by score, title, company, salary, summary, risks and tags.
5. User opens score tooltip/model info if more evidence is needed.

Needs verification:

- Exact initial loading visual before queue response.

### Сбор вакансий

1. User opens `Сбор вакансий`.
2. User sets keyword logic, remote type, limits and pauses.
3. Optional: user opens `Настройки` and enables Debug.
4. User configures `Автоматизация отклика`.
5. User clicks `Старт поиска`.
6. Header shows `Идёт сбор вакансий…`.
7. Stats and opened URL table update.
8. User can click `Остановить поиск`.

Recommended:

- Show last updated timestamp in harvest stats if available.

### Генерация черновика

1. User reviews a pending card.
2. User clicks `Создать сопроводительное`.
3. Backend generates one or more variants.
4. Card reveals `Черновик письма`.
5. User opens draft modal.

Needs verification:

- Exact loading text/spinner during generation.

### Редактирование и утверждение

1. User opens `Черновик письма`.
2. User chooses a variant.
3. User edits textarea.
4. User clicks `Сохранить правки` if needed.
5. User clicks `Подходит`.
6. Vacancy moves to approved state.
7. Approved queue shows `Отклик в браузере` and `Письмо`.

### Отклонение

1. User enters reason/comment in pending card textarea.
2. User clicks `Не подходит`.
3. Vacancy moves to rejected state.
4. Rejected tab shows the card with reason/comment.

Alternative:

1. User opens draft modal.
2. User clicks `Отклонить`.
3. Draft is declined and card state updates.

### Отклик в браузере

1. User opens `Подходят`.
2. User checks approved letter through `Письмо`.
3. User clicks `Отклик в браузере`.
4. Playwright scenario opens browser and proceeds with saved session.
5. User remains responsible for final review/send step.
6. User opens `Лог отклика hh` for progress/errors.

Needs verification:

- Exact browser apply status feedback on card after clicking the button.

### Лог

1. User clicks `Лог отклика hh`.
2. Modal opens.
3. UI shows path `data/hh-apply-chat.log`.
4. UI loads log or missing-file message.
5. Modal refreshes automatically every 2.5s.
6. User can click `Обновить`.

### Профиль

1. User clicks profile icon.
2. Side panel loads criteria.
3. Table shows loading row, then editable rows.
4. User edits enabled flags, values, weights, signs and Ban.
5. Sum line updates.
6. User clicks `Сохранить в config/preferences.json`.
7. Toast confirms save.

### Настройки

1. User clicks settings icon.
2. Side panel opens.
3. User can toggle Debug for next harvest.
4. User can click `Очистить базу данных`.
5. JS confirmation protects destructive reset.
6. Request clears queue/log/support files but not `config/preferences.json`.

### Ошибки

Common UI error patterns:

- API response non-JSON or 404: helper adds hint to run dashboard and open correct URL.
- Profile load fails: table row `Ошибка: ...`.
- Apply log load fails: pre text `Ошибка: ...`.
- Async modal actions may use `alert(e.message)`.

Recommended:

- Replace remaining blocking `alert` paths with consistent toast + inline error where the user can retry.

## Design Improvement Backlog

All items below are proposals. They are not present in current UI unless explicitly stated.

### Recommended

- Normalize literal colors into semantic CSS tokens while preserving the current dark visual language.
- Add a compact search/filter field for long queues: title, company, search query, tags. Current status: Search is Not present.
- Add an inline action progress label for expensive operations: cover letter generation, refresh vacancy, pending batch run and browser apply.
- Preserve scroll position and show a small toast when a card changes status, so review flow stays stable.
- Add "last updated" timestamp to harvest status and apply log modal if backend exposes it.
- Replace `alert(e.message)` in modal action failures with inline error text plus bad toast.
- Add a confirmation summary before running pending batch if both auto reject and auto draft are enabled.
- Improve mobile action wrapping for cards after browser verification.
- Add visual distinction for "draft exists" versus "approved letter exists" in card status pills.
- Add empty state copy per tab:
  - pending: "Нет вакансий на проверке.";
  - approved: "Нет утверждённых откликов.";
  - rejected: "Нет отклонённых вакансий.";
  Current UI uses generic `Пусто.`.

### Needs design decision

- Whether the app should support light theme. Current CSS is dark-only.
- Whether pending batch automation should show per-card progress in a side status panel or only update cards in place.
- Whether score tooltip should become a persistent expandable score breakdown on mobile.
- Whether rejected cards should expose a "restore to pending" action. Not present today.
- Whether destructive database reset needs a typed confirmation phrase instead of native confirm.
- Whether `JobRadar` or "Очередь вакансий" should be the primary page title in UI and screenshots.

### Needs verification

- Browser-rendered spacing and wrapping for the pending toolbar at `max-width: 700px`.
- Tooltip clamp behavior with long score explanations near viewport edges.
- Actual small-screen usability of modals and side panels.
- Current screenshot parity with `index.html`, especially header title.
- Toast stacking when several async actions complete close together.
- Whether `Отклик в браузере` appears on rejected cards in all non-pending cases or only when approved letter data exists.

## Stitch Prompting Guide

### Product description prompt

Use this when introducing the product to Stitch:

```text
Design a dark local web dashboard for JobRadar, a Node.js + Playwright tool for managing an hh.ru job application pipeline. The app collects vacancies, scores them with LLM/profile criteria, shows a review queue, generates cover letter drafts, lets the user manually approve or reject each vacancy, and launches a browser-based apply step. The product is human-in-the-loop: the user controls final decisions and final sending.
```

### General visual direction prompt

```text
Create a compact professional dark-mode automation dashboard. Use near-black background #0f1114, panel surface #181c22, primary text #e8eaed, muted text #9aa0a6, accent blue #7cb7ff, good green #6bcf7f, bad red #f08080 and border #2a3139. The style should feel like an operational review console: dense forms, evidence-rich cards, clear status pills, readable logs, minimal decoration, thin borders and rounded 8-12px corners.
```

### Dashboard prompt

```text
Generate a single-page dashboard shell for JobRadar. Header: title "JobRadar", running badge "Идёт сбор вакансий…", icon buttons for profile and settings, button "Лог отклика hh". Below it, tabs with counters: "Сбор вакансий", "На проверке", "Подходят", "Отклонённые". The default content is a queue of vacancy cards for "На проверке" plus a compact automation panel "Фильтр вакансий" with target score, auto reject checkbox, auto draft checkbox, variant count, "Сохранить" and "Запустить". Do not create sidebar navigation or multiple pages.
```

### Collect tab prompt

```text
Design the "Сбор вакансий" tab as a dense harvest control panel. Include fields for keyword logic with options loop/cycles/keywords, cycles count, keyword count, remote type, work hours checkbox with start/end hour, per-keyword limit, session limit, min/max open delay, min/max search jitter, min/max post-load jitter, buttons "Старт поиска" and "Остановить поиск". Add a right aside "Автоматизация отклика" with target score, auto reject, auto cover letter, conditional scope select, variant count and save button. Add stats for unique queued links and opened cards, plus a details table "Список открытых ссылок" with columns "Ссылка", "Название", "Дата/время", "Действие".
```

### Vacancy cards prompt

```text
Design vacancy review cards in a 3-column desktop grid: main evidence/actions, middle stack, description. Main column: dismiss x, score pill with tooltip affordance, score parts "LLM · Профиль · Итог", model info "i", title link, meta line with company/salary/search query, summary, "Нюансы:" risks, tags, employer instructions panel, pending actions with refresh icon, "Создать сопроводительное", "Черновик письма", "Подходит", rejection textarea and "Не подходит". Middle stack: panels "Условия работы" and "Дата публикации". Right column: scrollable "Описание вакансии". Collapse to one column below 1100px.
```

### Modal prompt

```text
Design dark modals for JobRadar. Draft modal title "Черновик письма": vacancy title, radio list of variants, large textarea, actions "Сохранить правки", "Подходит", "Отклонить". Apply log modal title "Лог «Отклик в браузере»": path data/hh-apply-chat.log, refresh button, monospace pre log area, wide modal. Approved letter modal title "Утверждённое письмо": vacancy title, read-only pre text and "Копировать". Use backdrop rgba(0,0,0,.45), modal shadow 0 16px 48px rgba(0,0,0,.5), radius 12px.
```

### Tables/lists prompt

```text
Use compact dark tables with thin #2a3139 borders, 0.78-0.82rem text, muted headers and horizontal overflow wrappers. Profile criteria table columns: "Вкл", "Логика", "Название", "Значение", "Вес", "±", "Ban". Harvest URL table columns: "Ссылка", "Название", "Дата/время", "Действие". Vacancy queue itself should be a card list, not a table.
```

### Dark/light theme prompt

Current implementation is dark-only.

```text
Generate the primary design in dark theme only. Use #0f1114 page background and #181c22 panels. If showing a light theme exploration, label it "Recommended" or "Needs design decision" and do not present it as existing UI.
```

### Token list for Stitch

```text
Colors:
--bg #0f1114
--panel #181c22
--text #e8eaed
--muted #9aa0a6
--accent #7cb7ff
--good #6bcf7f
--bad #f08080
--border #2a3139

Literal supporting colors:
#14181e nested surface
#1c2028 hover surface
#1f252d alternate hover surface
#222831 score background
#c9b88a warning text
#2d4a35 success surface
#2a3828 muted success surface
#4a2d2d danger surface
#1a2a22 publication today surface
#2d5a45 publication today border/accent
rgba(30,42,58,.45) employer instruction surface
rgba(0,0,0,.45) backdrop

Typography:
body "Segoe UI", system-ui, sans-serif
mono ui-monospace, monospace
h1 1.35rem weight 600
section title 1.15rem weight 600
modal title 1.1rem weight 600
card title 1.05rem weight 600
body 0.88-0.92rem
table 0.78-0.82rem

Radius:
buttons/tabs 8px
cards/modals 12px
panels 8-10px
badges 999px or 6px

Shadows:
side panel -8px 0 32px rgba(0,0,0,.35)
modal 0 16px 48px rgba(0,0,0,.5)
tooltip 0 8px 24px rgba(0,0,0,.45)
toast 0 8px 28px rgba(0,0,0,.45)

Motion:
button transitions 0.18s ease
toast transition 0.25s
tooltip opacity 0.12s
```

### Stitch prohibitions

- Do not invent routes, pages or a marketing homepage.
- Do not add search as existing UI; mark it `Recommended` if shown.
- Do not add restore/retry/bulk actions unless marked `Recommended` or `Needs design decision`.
- Do not remove human approval from the flow.
- Do not make browser apply look like one-click final submission.
- Do not replace logs with decorative cards.
- Do not show light theme as current implementation.
- Do not make unused implementation classes like `view-switch` or `.letter-*` primary components. They can be mentioned only as implementation notes.
- Do not claim browser verification was completed. Mark uncertain runtime behavior as `Needs verification`.
