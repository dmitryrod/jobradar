---
name: firecrawl-mcp
description: Firecrawl MCP (поиск по вебу, скрейп, карта сайта, краул, агент, извлечение). Use when gathering live web pages, comparing public sources, or extracting content from URLs — not for library/SDK docs (use user-context7).
---

# Firecrawl MCP

Официальный сервер **firecrawl-mcp** в Cursor обычно отображается как **`user-firecrawl-mcp`** (см. список доступных MCP в сессии). **API-ключ Firecrawl не коммитить** — только в настройках MCP / переменных окружения хоста Cursor.

## Каноническая роль в репозитории

- **Веб:** актуальные страницы, поиск по сети, скрейп известного URL, обход раздела сайта, структурированное извлечение с страниц.
- **Не дублировать** MCP **`user-context7`**: документация библиотек, SDK, актуальный синтаксис API фреймворков — сначала **context7**, Firecrawl — для продуктовых сайтов, блогов, changelog в вебе, сравнения публичных источников.
- **Субагент `researcher`** использует этот скилл при задачах исследования с вебом; **`worker`** не подменяет полноценный ресёрч без запроса. **MCP не заменяет** `Task` — инструменты вызывает тот агент, которому делегировали.

## Эскалация (узкий → широкий)

1. **Нет конкретного URL** — `firecrawl_search` (поиск и при необходимости углубление в выдачу).
2. **Есть URL, одна страница** — `firecrawl_scrape` (markdown / json / links / screenshot по схеме дескриптора).
3. **Большой сайт, нужна подстраница** — `firecrawl_map` (параметр поиска по URL при необходимости), затем scrape найденного URL.
4. **Много страниц раздела** — `firecrawl_crawl` (лимиты, include-paths); статус — `firecrawl_check_crawl_status` при асинхронном job.
5. **Сложная многостраничная выборка структурированных данных** — `firecrawl_agent` (+ `firecrawl_agent_status` при ожидании).
6. **Извлечение по схеме / специализированный pipeline** — `firecrawl_extract` по описанию инструмента.
7. **Нужен клик, форма, сессия после загрузки** — инструменты `firecrawl_browser_*` (создание сессии, execute и т.д.); читать схему, не гадать аргументы.

Не вызывать тяжёлый crawl/agent без необходимости — расход кредитов и контекста.

## Вызов из Cursor

Перед первым вызовом прочитай JSON-схему нужного инструмента в каталоге MCP descriptors (если доступен): `mcps/user-firecrawl-mcp/tools/<tool>.json`.

Используй **`call_mcp_tool`** с **`server`**: **`user-firecrawl-mcp`** (или имя из списка MCP в сессии). **`toolName`** — из таблицы ниже (имя файла без `.json`).

## Инструменты (toolName)

| toolName | Назначение |
|----------|------------|
| `firecrawl_scrape` | Одна страница: markdown, html, json с промптом/schema, links, screenshot, branding. |
| `firecrawl_search` | Поиск по вебу; опционально обогащение результатов. |
| `firecrawl_map` | Список URL сайта; фильтрация по смыслу. |
| `firecrawl_crawl` | Массовый обход; асинхронные job — см. check status. |
| `firecrawl_check_crawl_status` | Статус задания crawl. |
| `firecrawl_extract` | Извлечение по заданным правилам (см. дескриптор). |
| `firecrawl_agent` | AI-агент по сложным сайтам. |
| `firecrawl_agent_status` | Статус agent job. |
| `firecrawl_browser_create` | Создать браузерную сессию. |
| `firecrawl_browser_execute` | Действия в сессии. |
| `firecrawl_browser_list` | Список сессий. |
| `firecrawl_browser_delete` | Закрыть/удалить сессию. |

## Ограничения

- Ошибки квоты/ключа — зафиксировать пользователю; не подставлять выдуманные страницы.
- Длинные crawl/agent — не считать мгновенными; при job ID — опрашивать status по дескриптору.
- Крупные ответы не раздувают ответ целиком в чат без необходимости — выдержки и ссылки на URL.

## См. также

- Карта сценариев: [`.cursor/docs/agent-intent-map.csv`](../../docs/agent-intent-map.csv) (строка `research`, колонка `mcp`).
- Делегирование субагентов: [`.cursor/docs/CREATING_ASSETS.md`](../../docs/CREATING_ASSETS.md) (инструмент `Task`).
