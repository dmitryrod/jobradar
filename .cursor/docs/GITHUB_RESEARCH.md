# Поиск проектов на GitHub для автоматизации Cursor

Каноническое описание: **как искать похожие репозитории** и какие **ориентиры** уже отмечены для темы оркестрации агентов, MCP и скиллов. Скилл агента: [`.cursor/skills/github-researcher/SKILL.md`](../skills/github-researcher/SKILL.md).

## Настройка MCP GitHub

1. Установите [Personal Access Token](https://github.com/settings/tokens) (read-only достаточно для публичных репо; при работе с приватными — расширьте scope).
2. В Cursor добавьте сервер по образцу [`.cursor/mcp.github.example.json`](../mcp.github.example.json): слейте фрагмент `mcpServers.github` в пользовательский `%USERPROFILE%\.cursor\mcp.json` (или проектный, если поддерживается).
3. Заполните `GITHUB_PERSONAL_ACCESS_TOKEN` в env сервера в UI Cursor или замените пустую строку в конфиге локально (**не коммитить** токен).

Если `npx` на Windows даёт сбои, см. обходные пути в документации пакета `@modelcontextprotocol/server-github` (глобальная установка, `cmd /c`).

## Запасной путь без GitHub MCP

Используйте **`user-firecrawl-mcp`**: `firecrawl_search` с `site:github.com` и затем `firecrawl_scrape` для README. Детали: [`.cursor/skills/firecrawl-mcp/SKILL.md`](../skills/firecrawl-mcp/SKILL.md).

## Найденные ориентиры (оркестрация Cursor / агенты / MCP)

Исследование (веб-поиск по GitHub, не исчерпывающий список). Перед внедрением проверяйте лицензию, активность и актуальность API.

| Репозиторий | Кратко |
|-------------|--------|
| [MichaelTwito/agent-collab-mcp](https://github.com/michaeltwito/agent-collab-mcp) | MCP для мультиагентной коллаборации (в т.ч. Cursor + Claude Code), стратегии вроде architect-builder / writer-reviewer. |
| [madebyaris/agent-orchestration](https://github.com/madebyaris/agent-orchestration) | Координация агентов: общая память, очереди задач, блокировки ресурсов. |
| [thsunkid/orchestrate-cursor-agent-mcp](https://github.com/thsunkid/orchestrate-cursor-agent-mcp) | MCP для запуска `cursor-agent` как фонового субагента с двусторонней связью. |
| [griffinwork40/cursor-agent-mcp](https://github.com/griffinwork40/cursor-agent-mcp) | Набор инструментов для управления агентами Cursor через MCP. |
| [bryantbrock/cursor-background-agents-mcp](https://github.com/bryantbrock/cursor-background-agents-mcp) | Оркестрация по issue → PR через Background Agents API. |

Дополнительно по экосистеме скиллов (паттерны, не обязательно Cursor-only):

| Репозиторий | Кратко |
|-------------|--------|
| [yu-iskw/coding-agent-skills](https://github.com/yu-iskw/coding-agent-skills) | Коллекция skill-файлов для coding-агентов. |
| [openclaw/skills](https://github.com/openclaw/skills) | Набор скиллов (в т.ч. вокруг Cursor agent). |

## Связь с локальной RAG-памятью проекта

История **ваших** чатов и выжимка по триггеру — в [`.cursor/docs/PROJECT_RAG_MEMORY.md`](PROJECT_RAG_MEMORY.md). Поиск **внешних** репозиториев на GitHub этим документом не заменяется; вместе они закрывают «похожие проекты в OSS» и «похожие прошлые переписки в проекте».

## Обновление карты намерений

Сценарий «исследуй на GitHub» отражён в [`.cursor/docs/agent-intent-map.csv`](agent-intent-map.csv) (строка `research`): скилл **`github-researcher`**, MCP **`github`** при наличии.
