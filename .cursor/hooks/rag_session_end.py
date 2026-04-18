#!/usr/bin/env python3
"""Hook `sessionEnd`: индексирует новые/изменённые транскрипты в ChromaDB."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_CURSOR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_CURSOR / "memory"))

from engine import ingest_all_new_or_changed_transcripts  # noqa: E402


def main() -> int:
    try:
        _ = sys.stdin.read()
    except OSError:
        pass
    try:
        result = ingest_all_new_or_changed_transcripts()
        # stderr — не мешает Cursor; при отладке видно объём индексации
        print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
    except Exception as e:
        print(f"rag_session_end: {e}", file=sys.stderr)
        return 0  # fail open — не ломаем закрытие сессии
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
