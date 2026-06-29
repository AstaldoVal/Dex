#!/usr/bin/env python3
"""Local Brain Protocol checklist for Slidepad (interactive checkboxes)."""
from __future__ import annotations

import datetime as dt
import json
import zoneinfo
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent


def repo_root(start: Path | None = None) -> Path:
    here = (start or SCRIPT_DIR).resolve()
    for parent in [here, *here.parents]:
        if (parent / "package.json").is_file():
            return parent
    raise RuntimeError(f"DEX root not found above {here}")


def load_brain_cfg(root: Path) -> dict:
    path = root / "05-Areas/Cognitive_Performance/brain-protocol-config.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def slidepad_cfg(brain_cfg: dict) -> dict:
    return dict(brain_cfg.get("slidepad") or {})


def state_path(root: Path, day: dt.date) -> Path:
    d = root / "System/state/brain-checklist"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{day.isoformat()}.json"


def load_state(root: Path, day: dt.date) -> dict[str, Any]:
    p = state_path(root, day)
    if not p.is_file():
        return {"date": day.isoformat(), "items": {}}
    data = json.loads(p.read_text(encoding="utf-8"))
    if data.get("date") != day.isoformat():
        return {"date": day.isoformat(), "items": {}}
    data.setdefault("items", {})
    return data


def save_state(root: Path, state: dict[str, Any]) -> None:
    day = dt.date.fromisoformat(str(state["date"]))
    p = state_path(root, day)
    p.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def today_in_tz(brain_cfg: dict) -> dt.date:
    tz = brain_cfg.get("timezone") or "Europe/Lisbon"
    return dt.datetime.now(zoneinfo.ZoneInfo(tz)).date()


def build_today_items(root: Path, day: dt.date | None = None) -> dict[str, Any]:
    from brain_todoist_lib import events_for_date, find_task_for_event, is_task_done, load_todoist_cfg, skip_todoist

    brain_cfg = load_brain_cfg(root)
    if day is None:
        day = today_in_tz(brain_cfg)

    note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    state = load_state(root, day)
    items_state: dict[str, dict] = state.get("items") or {}

    todoist_done: dict[str, bool] = {}
    todoist_ids: dict[str, str] = {}
    todoist_cfg = load_todoist_cfg(root, brain_cfg)
    if todoist_cfg.get("enabled", True):
        try:
            from brain_todoist_lib import ensure_project, list_project_tasks, resolve_api_token

            token = resolve_api_token(root, todoist_cfg)
            project_name = (todoist_cfg.get("project_name") or "Brain Protocol").strip()
            project_id = ensure_project(token, project_name)
            tasks = list_project_tasks(token, project_id)
            for ev in events_for_date(brain_cfg, day, for_todoist=True):
                eid = ev.get("id") or ""
                task = find_task_for_event(tasks, event_id=eid, day=day.isoformat(), note_marker=note_marker)
                if task:
                    todoist_ids[eid] = str(task.get("id") or "")
                    todoist_done[eid] = is_task_done(task)
        except Exception:
            pass

    rows = []
    for ev in events_for_date(brain_cfg, day):
        if skip_todoist(ev, brain_cfg):
            continue
        eid = ev.get("id") or ""
        local = items_state.get(eid) or {}
        done = bool(local.get("done"))
        if todoist_done.get(eid):
            done = True
        rows.append(
            {
                "id": eid,
                "title": ev.get("title") or "",
                "start": ev.get("start") or "",
                "duration_minutes": ev.get("duration_minutes"),
                "description": (ev.get("description") or "").strip(),
                "done": done,
                "done_at": local.get("done_at"),
                "source": local.get("source") or ("todoist" if todoist_done.get(eid) else None),
                "todoist_task_id": todoist_ids.get(eid),
            }
        )

    done_count = sum(1 for r in rows if r["done"])
    return {
        "date": day.isoformat(),
        "timezone": brain_cfg.get("timezone") or "Europe/Lisbon",
        "total": len(rows),
        "done": done_count,
        "items": rows,
    }


def set_item_done(root: Path, event_id: str, done: bool, *, source: str = "slidepad") -> dict[str, Any]:
    brain_cfg = load_brain_cfg(root)
    day = today_in_tz(brain_cfg)
    state = load_state(root, day)
    items = state.setdefault("items", {})
    entry = items.setdefault(event_id, {})
    entry["done"] = done
    entry["source"] = source
    entry["done_at"] = dt.datetime.now(dt.timezone.utc).isoformat() if done else None
    save_state(root, state)

    if done:
        _sync_done_to_todoist(root, event_id, day)
    else:
        _sync_reopen_todoist(root, event_id, day)

    write_daily_markdown_from_state(root, day)
    return build_today_items(root, day)


def _sync_done_to_todoist(root: Path, event_id: str, day: dt.date) -> None:
    try:
        from brain_todoist_lib import (
            ensure_project,
            find_task_for_event,
            list_project_tasks,
            load_brain_cfg,
            load_todoist_cfg,
            resolve_api_token,
        )

        brain_cfg = load_brain_cfg(root)
        todoist_cfg = load_todoist_cfg(root, brain_cfg)
        token = resolve_api_token(root, todoist_cfg)
        note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
        project_id = ensure_project(token, (todoist_cfg.get("project_name") or "Brain Protocol").strip())
        tasks = list_project_tasks(token, project_id)
        task = find_task_for_event(tasks, event_id=event_id, day=day.isoformat(), note_marker=note_marker)
        if not task or task.get("is_completed"):
            return
        task_id = str(task["id"])
        from brain_todoist_lib import api_request

        api_request(token, "POST", f"/tasks/{task_id}/close")
    except Exception:
        pass


def _sync_reopen_todoist(root: Path, event_id: str, day: dt.date) -> None:
    try:
        from brain_todoist_lib import (
            api_request,
            ensure_project,
            find_task_for_event,
            list_project_tasks,
            load_brain_cfg,
            load_todoist_cfg,
            resolve_api_token,
        )

        brain_cfg = load_brain_cfg(root)
        todoist_cfg = load_todoist_cfg(root, brain_cfg)
        token = resolve_api_token(root, todoist_cfg)
        note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
        project_id = ensure_project(token, (todoist_cfg.get("project_name") or "Brain Protocol").strip())
        tasks = list_project_tasks(token, project_id)
        task = find_task_for_event(tasks, event_id=event_id, day=day.isoformat(), note_marker=note_marker)
        if not task or not task.get("is_completed"):
            return
        api_request(token, "POST", f"/tasks/{task['id']}/reopen")
    except Exception:
        pass


def write_daily_markdown_from_state(root: Path, day: dt.date) -> Path:
    from brain_todoist_lib import write_daily_markdown

    payload = build_today_items(root, day)
    rows = [
        {"event_id": r["id"], "title": r["title"], "start": r["start"], "done": r["done"]}
        for r in payload["items"]
    ]
    return write_daily_markdown(root, day=day, rows=rows)


def calendar_slidepad_url(root: Path) -> str:
    """DEX-RHYTHM + Brain Protocol only (no checklist duplicate)."""
    brain_cfg = load_brain_cfg(root)
    ultradian_path = root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    ids: list[str] = []
    if ultradian_path.is_file():
        u = json.loads(ultradian_path.read_text(encoding="utf-8"))
        uid = u.get("google_calendar_id")
        if uid:
            ids.append(uid.replace("@", "%40"))
    bid = brain_cfg.get("google_calendar_id")
    if bid:
        ids.append(bid.replace("@", "%40"))
    if not ids:
        return "https://calendar.google.com/calendar/u/0/r/day"
    return "https://calendar.google.com/calendar/u/0/r/day?" + "&".join(f"cid={c}" for c in ids)


def checklist_slidepad_url(root: Path) -> str:
    cfg = slidepad_cfg(load_brain_cfg(root))
    port = int(cfg.get("checklist_port") or 18765)
    return f"http://127.0.0.1:{port}/"


def write_slidepad_urls(root: Path) -> None:
    cal = calendar_slidepad_url(root)
    chk = checklist_slidepad_url(root)
    state_dir = root / "System/state"
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "brain-slidepad-calendar-url.txt").write_text(cal + "\n", encoding="utf-8")
    (state_dir / "brain-slidepad-checklist-url.txt").write_text(chk + "\n", encoding="utf-8")
    combined = state_dir / "brain-slidepad-urls.md"
    combined.write_text(
        "\n".join(
            [
                "# Slidepad — две панели",
                "",
                "## 1. Календарь (слоты + ритм, без дублей чеклиста)",
                cal,
                "",
                "## 2. Чеклист (галочки здесь)",
                chk,
                "",
            ]
        ),
        encoding="utf-8",
    )
