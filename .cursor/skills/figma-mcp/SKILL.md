---
name: figma-mcp
description: Official Figma remote MCP — design context, variables, screenshots, Code Connect. Use when implementing or documenting UI from Figma files with the designer agent.
---

# Figma MCP (официальный remote)

Сервер: **`https://mcp.figma.com/mcp`** (Streamable HTTP). Документация и инструменты: [Figma MCP Server](https://developers.figma.com/docs/figma-mcp-server/), гайд репозитория [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide).

**Аутентификация:** для официального remote-сервера Figma описывает **OAuth** (в Cursor: подключить сервер → **Connect** → вход в браузере → разрешить доступ). Токен после этого хранит клиент; **вставлять Personal Access Token вручную в `mcp.json` для `mcp.figma.com` официально не требуется** и может не поддерживаться (см. [Remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)).

## Подключение в Cursor (код для `mcp.json`)

Добавь в **пользовательский** файл (часто `%USERPROFILE%\.cursor\mcp.json` или настройки Cursor → MCP) объект **`figma`** рядом с остальными серверами:

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

Если уже есть `stitch`, `supabase` и т.д. — **слей в один** `mcpServers`, не дублируя корень:

```json
{
  "mcpServers": {
    "stitch": { "url": "https://stitch.googleapis.com/mcp", "headers": { "X-Goog-Api-Key": "..." } },
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

Рекомендуемый способ от Figma для Cursor: команда в чате агента **`/add-plugin figma`** или [deep link установки MCP](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/#cursor) — после установки нажми **Connect** у сервера Figma и пройди OAuth.

### Вариант с заголовком (только если у тебя есть Bearer-токен)

Некоторые сборки Cursor позволяют передать токен явно (например сессионный после OAuth или экспериментальный PAT). **Не коммить** реальные значения.

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Если сервер отвечает `401`, используй только штатный **OAuth через Connect** в UI Cursor. PAT из [Figma Settings → Security](https://www.figma.com/developers/api#access-tokens) предназначен в первую очередь для **REST API**, не для всех сценариев MCP.

Шаблон без секретов в репозитории: [`.cursor/mcp.figma.example.json`](../../mcp.figma.example.json).

## Имя сервера в сессии

Вызовы: **`call_mcp_tool`** с `server`: **`figma`** (как в `mcp.json`). В логах MCP может отображаться как **`user-figma`** — смотри список доступных серверов в Cursor.

## Рабочий поток (кратко)

1. Пользователь копирует ссылку на **frame/component** в Figma (в URL есть `node-id=…`).
2. Агент вызывает инструменты по задаче; для больших файлов сначала **`get_metadata`**, затем точечно **`get_design_context`**.
3. Для визуальной опоры — **`get_screenshot`**.
4. Токены/стили выборки — **`get_variable_defs`**.
5. Код по дизайну переводишь в стек проекта (у нас часто Jinja/HTML, не обязательно React из ответа).

## Основные toolName (имена уточняй в дескрипторах MCP)

| Инструмент | Назначение |
|------------|------------|
| `get_design_context` | Контекст выбранного узла (часто React+Tailwind как стартовая точка). |
| `get_metadata` | Облегчённое XML-дерево узлов для больших файлов. |
| `get_screenshot` | Скрин выбранного узла. |
| `get_variable_defs` | Переменные и стили (цвета, отступы, типографика). |
| `get_code_connect_map` / связанные | Связка узлов Figma с кодом (Code Connect). |
| `whoami` | Проверка авторизованного пользователя (remote). |
| `use_figma` / `search_design_system` | Расширенные сценарии (зависят от плана и флагов Figma). |

Лимиты: на бесплатных/View местах возможны жёсткие лимиты вызовов в месяц; Dev/Full seat — лимиты как у Tier 1 REST API. См. гайд на GitHub.

## Связь с агентом **designer**

- **designer** читает этот скилл и вызывает Figma MCP для макетов, спеков и токенов.
- Реализация кода в **`app/`** — после handoff на **worker**, если задача не «только документация».

## Ограничения

- Секреты не хранить в репозитории; `mcp.json` с ключами — только локально и в `.gitignore` при необходимости.
- Не подменять официальный поток OAuth «выдуманным» ключом без проверки ответа сервера.
