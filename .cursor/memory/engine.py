"""Локальная RAG-память проекта.

Предпочтительно **ChromaDB** (дефолтные эмбеддинги). Если `chromadb` не
установлена или не собирается (например Windows без MSVC), используется
**SQLite FTS5** — полнотекстовый поиск, без семантики.

Хранит чанки из JSONL-транскриптов Cursor (`agent-transcripts/`) и отдаёт
фрагменты для поиска по запросу.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import sqlite_backend

# Каталог `.cursor/memory/`
_MEMORY_DIR = Path(__file__).resolve().parent

_BACKEND: str | None = None


def get_backend() -> str:
    """`chroma` или `sqlite` (FTS5 fallback)."""
    global _BACKEND
    if _BACKEND is not None:
        return _BACKEND
    try:
        import chromadb  # noqa: F401
        from chromadb.utils import embedding_functions  # noqa: F401
    except Exception:
        _BACKEND = "sqlite"
        return _BACKEND
    _BACKEND = "chroma"
    return _BACKEND


def get_workspace_root() -> Path:
    """Корень workspace (папка с `.cursor/`).

    Returns:
        Path: приоритет: CURSOR_WORKSPACE_ROOT / WORKSPACE_ROOT, иначе родитель
        `.cursor` относительно этого файла (надёжнее, чем cwd).
    """
    for key in ("CURSOR_WORKSPACE_ROOT", "WORKSPACE_ROOT"):
        raw = os.environ.get(key)
        if raw:
            return Path(raw).resolve()
    # <repo>/.cursor/memory/engine.py -> три уровня вверх = корень репо
    return Path(__file__).resolve().parent.parent.parent


def get_chroma_path() -> Path:
    """Путь к персистентному хранилищу Chroma."""
    override = os.environ.get("CURSOR_PROJECT_RAG_CHROMA_PATH")
    if override:
        return Path(override).resolve()
    return _MEMORY_DIR / "chroma_db"


def get_ingest_state_path() -> Path:
    """JSON-состояние индексации (mtime/size по файлам)."""
    return _MEMORY_DIR / ".ingest_state.json"


def get_active_memory_path() -> Path:
    """Файл с выжимкой для агента (генерирует hook)."""
    return get_workspace_root() / ".cursor" / "active_memory.md"


def default_transcripts_dir() -> Path:
    """Каталог `agent-transcripts` Cursor для этого workspace.

    Приоритет:
        1. CURSOR_PROJECT_RAG_TRANSCRIPTS — абсолютный путь к каталогу.
        2. USERPROFILE/.cursor/projects/<slug>/agent-transcripts
           (slug: CURSOR_PROJECT_SLUG или авто из имени папки репозитория).

    Returns:
        Path к каталогу с *.jsonl.
    """
    env = os.environ.get("CURSOR_PROJECT_RAG_TRANSCRIPTS")
    if env:
        return Path(env).resolve()

    profile = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    slug = os.environ.get("CURSOR_PROJECT_SLUG")
    if not slug:
        slug = _slugify_workspace(get_workspace_root())

    if profile:
        return (
            Path(profile)
            / ".cursor"
            / "projects"
            / slug
            / "agent-transcripts"
        ).resolve()

    # Fallback внутри репо (можно положить копии логов вручную)
    return (get_workspace_root() / ".cursor" / "agent-transcripts").resolve()


def _slugify_workspace(root: Path) -> str:
    """Slug каталога ~/.cursor/projects/<slug>/ как у Cursor (пример: d-WorkProjects-MyRepo)."""
    r = root.resolve()
    if r.drive and len(r.parts) >= 2:
        # Windows: d:\\, WorkProjects, MyRepo -> d-WorkProjects-MyRepo
        return "d-" + "-".join(r.parts[1:])
    if len(r.parts) >= 2:
        return "-".join(r.parts[1:]).replace("/", "-")
    return r.name or "workspace"


def _load_json_line(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line:
        return None
    try:
        obj = json.loads(line)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def _text_from_content_block(block: dict[str, Any]) -> str:
    """Извлекает текст из одного content-блока Cursor."""
    btype = block.get("type")
    if btype == "text":
        return str(block.get("text", "")).strip()
    if btype == "thinking":
        t = str(block.get("thinking", "")).strip()
        return f"[thinking] {t}" if t else ""
    if btype == "tool_use":
        name = block.get("name", "tool")
        inp = block.get("input")
        try:
            payload = json.dumps(inp, ensure_ascii=False)[:800]
        except (TypeError, ValueError):
            payload = str(inp)[:800]
        return f"[tool {name}] {payload}"
    if btype == "tool_result":
        return str(block.get("content", "")).strip()
    # неизвестный блок — сериализуем кратко
    try:
        return json.dumps(block, ensure_ascii=False)[:1200]
    except (TypeError, ValueError):
        return str(block)[:1200]


def line_to_transcript_text(obj: dict[str, Any]) -> str:
    """Преобразует одну строку JSONL транскрипта в плоский текст."""
    role = obj.get("role", obj.get("type", "unknown"))
    content = obj.get("content")

    parts: list[str] = []
    if isinstance(content, dict):
        parts.append(_text_from_content_block(content))
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                t = _text_from_content_block(block)
                if t:
                    parts.append(t)
    elif isinstance(content, str):
        parts.append(content.strip())

    body = "\n".join(p for p in parts if p)
    if not body and "text" in obj:
        body = str(obj.get("text", "")).strip()
    if not body:
        return ""

    return f"[{role}]\n{body}"


def chunk_text(text: str, chunk_size: int = 1500, overlap: int = 200) -> list[str]:
    """Режет длинный текст на перекрывающиеся чанки по символам."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def _read_transcript_file(path: Path) -> str:
    """Читает .jsonl и склеивает в один документ для чанкинга."""
    lines_out: list[str] = []
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""

    for line in raw.splitlines():
        obj = _load_json_line(line)
        if not obj:
            # сырой текст
            if line.strip():
                lines_out.append(line.strip())
            continue
        block = line_to_transcript_text(obj)
        if block:
            lines_out.append(block)

    return "\n\n".join(lines_out)


def _get_collection():
    """Возвращает коллекцию Chroma с дефолтной функцией эмбеддингов."""
    import chromadb
    from chromadb.utils import embedding_functions

    chroma_path = get_chroma_path()
    chroma_path.mkdir(parents=True, exist_ok=True)

    ef = embedding_functions.DefaultEmbeddingFunction()
    client = chromadb.PersistentClient(path=str(chroma_path))
    return client.get_or_create_collection(
        name="project_chat_memory",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )


def _file_fingerprint(path: Path) -> dict[str, int]:
    try:
        st = path.stat()
        return {"mtime_ns": int(st.st_mtime_ns), "size": int(st.st_size)}
    except OSError:
        return {"mtime_ns": 0, "size": 0}


def _load_ingest_state() -> dict[str, Any]:
    p = get_ingest_state_path()
    if not p.is_file():
        return {"files": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"files": {}}
    except (json.JSONDecodeError, OSError):
        return {"files": {}}


def _save_ingest_state(state: dict[str, Any]) -> None:
    p = get_ingest_state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")
    tmp.replace(p)


def _stable_chunk_id(source_key: str, chunk_index: int, chunk_text_val: str) -> str:
    h = hashlib.sha256(
        f"{source_key}:{chunk_index}:{chunk_text_val[:200]}".encode("utf-8")
    ).hexdigest()[:32]
    return f"{source_key[:24]}_{chunk_index}_{h}"


def ingest_transcript_file(path: Path, collection: Any | None = None) -> int:
    """Индексирует один JSONL-файл: удаляет старые чанки этого файла, добавляет новые.

    Args:
        path: Путь к .jsonl.
        collection: Опционально готовая коллекция Chroma.

    Returns:
        Число добавленных чанков.
    """
    path = path.resolve()
    if not path.is_file():
        return 0

    full_text = _read_transcript_file(path)
    if not full_text.strip():
        return 0

    source_key = str(path)
    chunks = chunk_text(full_text)
    if not chunks:
        return 0

    if get_backend() == "sqlite":
        conn = sqlite_backend.get_connection(_MEMORY_DIR)
        return sqlite_backend.insert_chunks(conn, source_key, chunks)

    coll = collection or _get_collection()

    # Удаляем прежние чанки с этим source_file
    for where in (
        {"source_file": source_key},
        {"source_file": {"$eq": source_key}},
    ):
        try:
            coll.delete(where=where)
            break
        except Exception:
            continue

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    for i, chunk in enumerate(chunks):
        cid = _stable_chunk_id(source_key, i, chunk)
        ids.append(cid)
        documents.append(chunk)
        metadatas.append(
            {
                "source_file": source_key,
                "chunk_index": i,
                "basename": path.name,
            }
        )

    coll.add(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)


def ingest_all_new_or_changed_transcripts() -> dict[str, Any]:
    """Сканирует каталог транскриптов и индексирует новые/изменённые файлы.

    Returns:
        Словарь с ключами: processed (int), files (list[str]), errors (list[str]).
    """
    d = default_transcripts_dir()
    result: dict[str, Any] = {
        "processed": 0,
        "files": [],
        "errors": [],
        "transcripts_dir": str(d),
        "backend": get_backend(),
    }

    if not d.is_dir():
        result["errors"].append(f"transcripts dir missing: {d}")
        return result

    state = _load_ingest_state()
    files_state: dict[str, Any] = state.setdefault("files", {})
    if not isinstance(files_state, dict):
        files_state = {}
        state["files"] = files_state

    coll = _get_collection() if get_backend() == "chroma" else None

    jsonl_files = sorted(d.glob("*.jsonl"))
    for fp in jsonl_files:
        key = str(fp.resolve())
        fp_print = _file_fingerprint(fp)
        prev = files_state.get(key)
        if isinstance(prev, dict) and prev.get("mtime_ns") == fp_print.get(
            "mtime_ns"
        ) and prev.get("size") == fp_print.get("size"):
            continue

        try:
            n = ingest_transcript_file(fp, collection=coll)
            files_state[key] = fp_print
            result["processed"] += n
            result["files"].append(fp.name)
        except Exception as e:
            result["errors"].append(f"{fp.name}: {e!s}")

    _save_ingest_state(state)
    return result


def search_memory(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Семантический поиск по индексированной памяти.

    Args:
        query: Текст запроса (обычно текущий промпт пользователя).
        top_k: Сколько чанков вернуть.

    Returns:
        Список словарей с ключами document, metadata, distance (если есть).
    """
    q = (query or "").strip()
    if not q:
        return []

    if get_backend() == "sqlite":
        conn = sqlite_backend.get_connection(_MEMORY_DIR)
        return sqlite_backend.search_chunks(conn, q, top_k)

    coll = _get_collection()
    try:
        res = coll.query(query_texts=[q], n_results=top_k, include=["documents", "metadatas", "distances"])
    except Exception:
        return []

    out: list[dict[str, Any]] = []
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    for i, doc in enumerate(docs or []):
        meta = metas[i] if i < len(metas) else {}
        dist = dists[i] if i < len(dists) else None
        out.append(
            {
                "document": doc,
                "metadata": meta or {},
                "distance": dist,
            }
        )
    return out


def format_memory_markdown(query: str, hits: list[dict[str, Any]]) -> str:
    """Форматирует результаты поиска в Markdown для active_memory.md."""
    lines = [
        "# Project RAG memory (auto)",
        "",
        f"Query snapshot: `{query[:500]!s}`",
        "",
        "Используй фрагменты ниже как справочный контекст из прошлых чатов.",
        "",
        f"<!-- RAG backend: {get_backend()} (chroma=семантика, sqlite=FTS5) -->",
        "",
    ]
    if not hits:
        lines.append("_Релевантных фрагментов не найдено (индекс пуст или запрос слишком особенный)._")
        lines.append("")
        return "\n".join(lines)

    for i, h in enumerate(hits, 1):
        meta = h.get("metadata") or {}
        base = meta.get("basename", "?")
        dist = h.get("distance")
        dist_s = f", distance={dist:.4f}" if isinstance(dist, (int, float)) else ""
        lines.append(f"## Hit {i} ({base}{dist_s})")
        lines.append("")
        lines.append(str(h.get("document", "")).strip())
        lines.append("")

    return "\n".join(lines)


def write_active_memory(query: str, top_k: int = 5) -> Path:
    """Выполняет поиск и записывает `.cursor/active_memory.md`."""
    hits = search_memory(query, top_k=top_k)
    md = format_memory_markdown(query, hits)
    out = get_active_memory_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md, encoding="utf-8")
    return out


# --- Триггеры промпта (совпадают с логикой hook) ---
RAG_TRIGGER_EN = re.compile(r"use\s+project\s+RAG\s+memory", re.I)
RAG_TRIGGER_RU = re.compile(
    r"используй\s+локальную\s+раг\s+память", re.I
)


def prompt_requests_rag_memory(prompt: str) -> bool:
    """True если нужно подтянуть RAG по правилам /norissk + фраза."""
    p = (prompt or "").strip()
    pl = p.lower()
    if "/norissk" not in pl:
        return False
    if not RAG_TRIGGER_EN.search(p) and not RAG_TRIGGER_RU.search(p):
        return False
    return True


def main_cli(argv: list[str] | None = None) -> int:
    """Тестовый CLI: `python -m engine ingest | search "query"`."""
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("usage: ingest | search <query>", file=sys.stderr)
        return 2
    if argv[0] == "ingest":
        r = ingest_all_new_or_changed_transcripts()
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return 0 if not r.get("errors") else 1
    if argv[0] == "search" and len(argv) > 1:
        q = " ".join(argv[1:])
        for h in search_memory(q):
            print(json.dumps(h, ensure_ascii=False))
        return 0
    print("usage: ingest | search <query>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main_cli())
