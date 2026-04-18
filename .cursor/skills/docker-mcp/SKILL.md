---
name: docker-mcp
description: MCP-сервер для Docker (ckreiling/mcp-server-docker) — контейнеры, образы, volumes, сети, логи/stats. Use when the user wants Cursor to drive local or remote Docker via MCP tools.
---

# Docker MCP (`mcp-server-docker`)

Репозиторий: [ckreiling/mcp-server-docker](https://github.com/ckreiling/mcp-server-docker) (Python, PyPI-пакет `mcp-server-docker`, запуск через **`uvx mcp-server-docker`**).

## Что даёт сборке `.cursor/`

- **Инструменты MCP** вместо ручных команд: список/создание/запуск/остановка контейнеров, образы (`pull`/`build`/…), volumes, networks, логи и stats как resources.
- **Промпт `docker_compose`**: сценарий plan → apply для compose-подобных задач на естественном языке (см. README апстрима).
- **Удалённый Docker**: через `DOCKER_HOST`, в т.ч. `ssh://user@host` ([документация Docker SDK `from_env`](https://docker-py.readthedocs.io/)).

Это **не** замена скиллам проекта (`git-helper`, деплой в `app/docs`) — только доступ агента к Docker API там, где ты явно включил MCP.

## Риски (из README апстрима)

- **Не передавать секреты** в контейнеры через чат с LLM — всё, что ушло модели, считается скомпрометированным.
- Docker **не песочница**: агент с доступом к сокету может влиять на хост; пересматривай создаваемые контейнеры.
- **`--privileged` / cap-add** в этом сервере не поддерживаются по соображениям безопасности.

## Подключение в Cursor

1. Установи **`uv`** (или используй образ из репо — см. README апстрима).
2. Слей фрагмент из [`.cursor/mcp.docker.example.json`](../../mcp.docker.example.json) в пользовательский **`%USERPROFILE%\.cursor\mcp.json`** в ключ `mcpServers` (один общий объект с остальными серверами).
3. Перезапусти Cursor / перезагрузи MCP. Проверка: `docker ps` в терминале и доступность инструментов сервера в списке MCP.

Имя сервера в конфиге лучше оставить **`mcp-server-docker`** или согласовать с тем, как Cursor показывает его в UI (иногда префикс `user-`).

## Когда не включать

Локальная разработка без Docker; CI-only; политика безопасности запрещает сокет Docker ассистенту.
