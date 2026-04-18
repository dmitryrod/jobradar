"""Fallback-хранилище: SQLite FTS5 (без нативных зависимостей), если ChromaDB недоступен."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any

_CONN: sqlite3.Connection | None = None


def get_sqlite_path(memory_dir: Path) -> Path:
    return memory_dir / "rag_fts.sqlite"


def get_connection(memory_dir: Path) -> sqlite3.Connection:
    """Публичное подключение к SQLite FTS (один процесс — один conn)."""
    return _connect(get_sqlite_path(memory_dir))


def _connect(db_path: Path) -> sqlite3.Connection:
    global _CONN
    if _CONN is not None:
        return _CONN
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
          source_file UNINDEXED,
          chunk_index UNINDEXED,
          chunk_text,
          tokenize='unicode61'
        );
        """
    )
    conn.commit()
    _CONN = conn
    return conn


def delete_by_source(conn: sqlite3.Connection, source_key: str) -> None:
    conn.execute("DELETE FROM chunks WHERE source_file = ?", (source_key,))
    conn.commit()


def insert_chunks(
    conn: sqlite3.Connection,
    source_key: str,
    chunks: list[str],
) -> int:
    delete_by_source(conn, source_key)
    for i, text in enumerate(chunks):
        conn.execute(
            "INSERT INTO chunks(source_file, chunk_index, chunk_text) VALUES (?, ?, ?)",
            (source_key, i, text),
        )
    conn.commit()
    return len(chunks)


def _fts5_match_query(q: str) -> str | None:
    """Строит безопасный FTS5 MATCH из произвольной строки."""
    q = (q or "").strip()
    if not q:
        return None
    words = re.findall(r"[^\s]+", q)
    if not words:
        return None
    parts: list[str] = []
    for w in words[:16]:
        w_esc = w.replace('"', '""')
        parts.append(f'"{w_esc}"')
    return " AND ".join(parts)


def search_chunks(
    conn: sqlite3.Connection, query: str, top_k: int
) -> list[dict[str, Any]]:
    mq = _fts5_match_query(query)
    if not mq:
        return []
    try:
        cur = conn.execute(
            """
            SELECT source_file, chunk_index, chunk_text,
                   bm25(chunks) AS rank
            FROM chunks
            WHERE chunks MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (mq, top_k),
        )
    except sqlite3.OperationalError:
        return []

    out: list[dict[str, Any]] = []
    for row in cur.fetchall():
        meta = {
            "source_file": row["source_file"],
            "chunk_index": row["chunk_index"],
            "basename": Path(str(row["source_file"])).name,
        }
        out.append(
            {
                "document": row["chunk_text"],
                "metadata": meta,
                "distance": float(row["rank"]) if row["rank"] is not None else None,
            }
        )
    return out
