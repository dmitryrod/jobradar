"""Unit-тесты для `.cursor/memory/engine.py` (без обязательного Chroma при импорте)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# Импорт из .cursor/memory
import sys

_MEM = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_MEM))

from engine import (  # noqa: E402
    chunk_text,
    line_to_transcript_text,
    prompt_requests_rag_memory,
    _slugify_workspace,
)


def test_slugify_windows_style_path() -> None:
    root = Path("d:/WorkProjects/Marketing_Product")
    assert _slugify_workspace(root) == "d-WorkProjects-Marketing_Product"


def test_prompt_trigger_requires_norissk_and_phrase() -> None:
    assert not prompt_requests_rag_memory("hello")
    assert not prompt_requests_rag_memory("/norissk do something")
    assert prompt_requests_rag_memory(
        "/norissk use project RAG memory: plan feature"
    )
    assert prompt_requests_rag_memory(
        "/norissk используй локальную раг память — сделай X"
    )


def test_line_to_transcript_text_text_block() -> None:
    line = json.dumps(
        {
            "role": "user",
            "content": {"type": "text", "text": "fix bug in consumer"},
        }
    )
    obj = json.loads(line)
    t = line_to_transcript_text(obj)
    assert "user" in t.lower() or "[user]" in t
    assert "consumer" in t


def test_chunk_text_splits_long() -> None:
    s = "a" * 3000
    chunks = chunk_text(s, chunk_size=1000, overlap=100)
    assert len(chunks) >= 2
    assert all(len(c) <= 1000 for c in chunks)


def test_search_memory_empty_query() -> None:
    from engine import search_memory

    assert search_memory("") == []
    assert search_memory("   ") == []


def test_sqlite_backend_search_roundtrip(tmp_path) -> None:
    import sqlite_backend

    conn = sqlite_backend.get_connection(tmp_path)
    sqlite_backend.insert_chunks(
        conn, str(tmp_path / "a.jsonl"), ["alpha beta gamma", "other stuff"]
    )
    hits = sqlite_backend.search_chunks(conn, "alpha gamma", top_k=3)
    assert hits
    assert "alpha" in hits[0]["document"]
