#!/usr/bin/env python3
"""
Session pomodoro MCP — read tail of System/Pomodoro/session-events.jsonl and append outcome_note lines.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Session Pomodoro")


def vault_root() -> Path:
    return Path(os.environ.get("VAULT_PATH", os.getcwd())).resolve()


def log_path() -> Path:
    override = os.environ.get("DEX_SESSION_EVENTS_LOG")
    if override:
        return Path(override).expanduser().resolve()
    return vault_root() / "System" / "Pomodoro" / "session-events.jsonl"


@mcp.tool()
async def session_pomodoro_log_path() -> str:
    """Absolute path to session-events.jsonl (respects DEX_SESSION_EVENTS_LOG if set)."""
    return str(log_path())


@mcp.tool()
async def session_pomodoro_recent(limit: int = 30) -> str:
    """
    Return the last N non-empty lines of session-events.jsonl as a JSON array of objects.
    Malformed lines are returned as {"_raw": "..."} .
    """
    path = log_path()
    if not path.exists():
        return json.dumps([], ensure_ascii=False)

    lines = path.read_text(encoding="utf-8").splitlines()
    tail = [ln for ln in lines if ln.strip()][-max(1, min(limit, 200)) :]
    out: list[object] = []
    for ln in tail:
        try:
            out.append(json.loads(ln))
        except json.JSONDecodeError:
            out.append({"_raw": ln})
    return json.dumps(out, ensure_ascii=False, indent=2)


@mcp.tool()
async def session_pomodoro_append_outcome_note(text: str) -> str:
    """
    Append one JSON line with event outcome_note (append-only log). Use after a session ends.
    """
    note = (text or "").strip()
    if not note:
        return "Error: empty text"

    row = {
        "event": "outcome_note",
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "cursor",
        "text": note,
    }
    path = log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return f"appended outcome_note to {path}"


if __name__ == "__main__":
    mcp.run()
