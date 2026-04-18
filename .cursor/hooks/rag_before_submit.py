#!/usr/bin/env python3
"""Hook `beforeSubmitPrompt`: при /norissk + триггер-фразе — поиск RAG и active_memory.md."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_CURSOR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_CURSOR / "memory"))

from engine import prompt_requests_rag_memory, write_active_memory  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        print(json.dumps({"continue": True}))
        return 0

    prompt = ""
    if isinstance(data, dict):
        prompt = str(data.get("prompt", "") or "")

    out: dict[str, object] = {"continue": True}
    if not prompt_requests_rag_memory(prompt):
        print(json.dumps(out))
        return 0

    try:
        write_active_memory(prompt, top_k=5)
    except Exception as e:
        print(f"rag_before_submit: {e}", file=sys.stderr)

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
