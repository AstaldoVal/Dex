#!/usr/bin/env python3
"""Day counter for Human Garage 28 Day Life Reset (Brain Protocol)."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

EVENT_ID = "human-garage-28"
STATE_REL = Path("05-Areas/Cognitive_Performance/human-garage-28-reset-state.json")
LOG_REL = Path("05-Areas/Cognitive_Performance/human-garage-28-reset-log.md")


def state_path(root: Path) -> Path:
    return root / STATE_REL


def load_state(root: Path) -> dict | None:
    path = state_path(root)
    if not path.is_file():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def total_days(state: dict | None) -> int:
    if not state:
        return 28
    return int(state.get("total_days") or 28)


def day_number(root: Path, day: dt.date) -> int | None:
    state = load_state(root)
    if not state or not state.get("start_date"):
        return None
    start = dt.date.fromisoformat(str(state["start_date"]))
    n = (day - start).days + 1
    cap = total_days(state)
    if n < 1 or n > cap:
        return None
    return n


def title_with_day(base_title: str, n: int, *, cap: int = 28) -> str:
    base = (base_title or "28 Day Life Reset").strip()
    suffix = " (Human Garage)"
    if base.endswith(suffix):
        core = base[: -len(suffix)].strip()
        return f"{core} — день {n}/{cap}{suffix}"
    return f"{base} — день {n}/{cap}"


def display_title(root: Path, ev: dict, day: dt.date) -> str:
    base = str(ev.get("title") or "28 Day Life Reset (Human Garage)")
    if str(ev.get("id") or "") != EVENT_ID:
        return base
    n = day_number(root, day)
    if n is None:
        return base
    return title_with_day(base, n, cap=total_days(load_state(root)))


def description_with_day(root: Path, ev: dict, day: dt.date) -> str:
    raw = str(ev.get("description") or "").strip()
    if str(ev.get("id") or "") != EVENT_ID:
        return raw
    n = day_number(root, day)
    if n is None:
        return raw
    cap = total_days(load_state(root))
    lines = [f"☐ День {n} из {cap} (28 Day Life Reset)"]
    if raw:
        lines.extend(raw.splitlines())
    return "\n".join(lines)


def append_log_day(root: Path, day: dt.date, *, note: str = "") -> None:
    n = day_number(root, day)
    if n is None:
        return
    path = root / LOG_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    header = f"## {day.isoformat()} — день {n}/28\n\n"
    body = f"- Статус: старт зафиксирован в `{STATE_REL.as_posix()}`.\n"
    if note.strip():
        body += f"- Заметка: {note.strip()}\n"
    body += "\n---\n\n"
    if path.is_file() and header.strip() in path.read_text(encoding="utf-8"):
        return
    if not path.is_file():
        intro = (
            "# Human Garage · 28 Day Life Reset — лог\n\n"
            f"Старт: {load_state(root).get('start_date') if load_state(root) else day.isoformat()}\n\n"
        )
        path.write_text(intro + header + body, encoding="utf-8")
    else:
        with open(path, "a", encoding="utf-8") as f:
            f.write(header + body)
