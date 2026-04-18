# Локальная RAG-память проекта (Cursor)

Каноническое описание dev-инструмента под `.cursor/`: индексация истории чатов из `agent-transcripts/` и выдача релевантных фрагментов в `.cursor/active_memory.md` **только** по явному триггеру в промпте.

## Назначение

- **Запись:** при завершении сессии Composer (`sessionEnd`) новые или изменённые JSONL-транскрипты индексируются в локальное хранилище (вся переписка в рамках проекта, по мере появления файлов в каталоге Cursor).
- **Поиск:** при отправке промпта (`beforeSubmitPrompt`) скрипт проверяет текст; если выполнены условия триггера — выполняется поиск по индексу и перезапись `.cursor/active_memory.md`.
- **Использование агентом:** правило [`.cursor/rules/project-rag-memory.mdc`](../rules/project-rag-memory.mdc) подсказывает модели прочитать `active_memory.md` перед ответом, когда сработал триггер.

Продакшен-код в `app/` этим механизмом не затрагивается.

## Триггер (когда заполняется active_memory)

Одновременно:

1. В тексте промпта есть **`/norissk`** (регистр не важен).
2. Есть одна из фраз:
   - **`use project RAG memory`** (англ., регистр не важен), или  
   - **`используй локальную раг память`**.

Фильтрация выполняется **внутри** [`.cursor/hooks/rag_before_submit.py`](../hooks/rag_before_submit.py). В `hooks.json` для `beforeSubmitPrompt` matcher по документации Cursor привязан к значению `UserPromptSubmit`, поэтому regex по тексту промпта в JSON не задаётся — скрипт вызывается на каждую отправку и быстро выходит, если триггер не совпал.

## Хранилище и бэкенды

| Режим | Когда | Где | Поиск |
|--------|--------|-----|--------|
| **ChromaDB** | Установлен пакет `chromadb` и он успешно импортируется | [`.cursor/memory/chroma_db/`](../memory/) (gitignore) | Векторный поиск, `DefaultEmbeddingFunction` |
| **SQLite FTS5** | Иначе (например Windows без MSVC для сборки нативных зависимостей Chroma) | [`.cursor/memory/rag_fts.sqlite`](../memory/) (gitignore) | Полнотекстовый FTS5, без семантики |

Выбор фиксируется при первом вызове `get_backend()` в [`.cursor/memory/engine.py`](../memory/engine.py).

## Состояние и артефакты

| Путь | Назначение |
|------|------------|
| [`.cursor/memory/engine.py`](../memory/engine.py) | Чанкинг, индексация, `search_memory`, `write_active_memory` |
| [`.cursor/memory/sqlite_backend.py`](../memory/sqlite_backend.py) | Таблица FTS5, `MATCH`, `bm25` |
| [`.cursor/memory/.ingest_state.json`](../memory/) | mtime/size по файлам — чтобы не переиндексировать без изменений |
| [`.cursor/active_memory.md`](../active_memory.md) | Выжимка/хиты для агента (генерируется хуком; при необходимости в gitignore) |
| [`.cursor/hooks/rag_session_end.py`](../hooks/rag_session_end.py) | Хук `sessionEnd` → инкрементальная индексация |
| [`.cursor/hooks/rag_before_submit.py`](../hooks/rag_before_submit.py) | Хук `beforeSubmitPrompt` → триггер и `write_active_memory` |
| [`.cursor/memory/requirements.txt`](../memory/requirements.txt) | Опциональный `chromadb` |
| [`.cursor/memory/tests/`](../memory/tests/) | Pytest для `engine` / sqlite |

## Хуки Cursor

Конфигурация: [`.cursor/hooks.json`](../hooks.json).

- **`sessionEnd`:** `python .cursor/hooks/rag_session_end.py`, `timeout` 120 с, `failClosed: false` (ошибка скрипта не блокирует закрытие сессии).
- **`beforeSubmitPrompt`:** `python .cursor/hooks/rag_before_submit.py`, те же `timeout` и `failClosed`.

Скрипты добавляют в `sys.path` каталог `.cursor/memory` и импортируют `engine`.

**Вывод хука:** для `beforeSubmitPrompt` в актуальной [документации Cursor](https://cursor.com/docs/agent/third-party-hooks) в ответе поддерживаются в основном `continue` и `user_message`. Реализация не полагается на недокументированный `agent_message`: контекст передаётся через файл **`.cursor/active_memory.md`**.

## Откуда берутся транскрипты

По умолчанию каталог:

`%USERPROFILE%\.cursor\projects\<slug>\agent-transcripts`

где `<slug>` совпадает с соглашением Cursor для workspace (для пути вида `d:\\WorkProjects\\Marketing_Product` **локальный** `_slugify_workspace` даёт `d-WorkProjects-Marketing_Product`; если фактический slug в `%USERPROFILE%\\.cursor\\projects\\` отличается — задай `CURSOR_PROJECT_SLUG` или `CURSOR_PROJECT_RAG_TRANSCRIPTS`). Логика — `default_transcripts_dir()` и `_slugify_workspace()` в `engine.py`.

Переопределение:

| Переменная | Смысл |
|------------|--------|
| `CURSOR_PROJECT_RAG_TRANSCRIPTS` | Абсолютный путь к каталогу с `*.jsonl` |
| `CURSOR_PROJECT_SLUG` | Альтернативный slug под `.../projects/<slug>/agent-transcripts` |
| `CURSOR_WORKSPACE_ROOT` / `WORKSPACE_ROOT` | Корень workspace (если задан — влияет на пути и `active_memory`) |
| `CURSOR_PROJECT_RAG_CHROMA_PATH` | Переопределить каталог ChromaDB |

## Установка опциональной зависимости

Из корня репозитория:

```text
pip install -r .cursor/memory/requirements.txt
```

Если сборка `chromadb` не удаётся (типично: Windows без MSVC, экзотическая версия Python), движок остаётся на **SQLite FTS5** без дополнительных пакетов.

## Тесты

С корня репозитория (нужен `PYTHONPATH` для `memory`):

```text
set PYTHONPATH=.cursor/memory
python -m pytest .cursor/memory/tests/ -v
```

## Ограничения

- Качество поиска на **SQLite** ниже, чем у Chroma с эмбеддингами (ключевые слова / FTS, не «смысл»).
- Индекс растёт вместе с объёмом транскриптов; чанкинг в `engine.py` ограничивает размер отдельных документов, но не «забывает» старые сессии без отдельной политики retention.
- Секреты в чатах могут попасть в индекс; хранилище локальное, но не коммитьте `chroma_db/`, `rag_fts.sqlite`, `.ingest_state.json` и при необходимости `active_memory.md` (см. `.gitignore`).

## См. также

- [`.cursor/rules/project-rag-memory.mdc`](../rules/project-rag-memory.mdc) — поведение агента при триггере.
- [`.cursor/rules/README.md`](../rules/README.md) — строка в таблице правил.
