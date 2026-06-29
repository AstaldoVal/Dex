#!/usr/bin/env python3
"""Report Brain Protocol Todoist completion for today (or --date YYYY-MM-DD)."""
from __future__ import annotations

import datetime as dt
import json
import sys
import zoneinfo
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from brain_todoist_lib import (  # noqa: E402
    TodoistError,
    append_completion_log,
    ensure_project,
    events_for_date,
    list_completed_tasks,
    list_project_tasks,
    load_brain_cfg,
    load_todoist_cfg,
    repo_root,
    resolve_api_token,
    resolve_event_task_state,
    write_daily_markdown,
)

from brain_google_calendar_checklist_sync import sync_google_checklist  # noqa: E402
from brain_checklist_lib import write_slidepad_urls  # noqa: E402


def parse_day(argv: list[str], tz_name: str) -> dt.date:
    for i, arg in enumerate(argv):
        if arg == "--date" and i + 1 < len(argv):
            return dt.date.fromisoformat(argv[i + 1])
    return dt.datetime.now(zoneinfo.ZoneInfo(tz_name)).date()


def main() -> int:
    root = repo_root()
    brain_cfg = load_brain_cfg(root)
    todoist_cfg = load_todoist_cfg(root, brain_cfg)
    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    day = parse_day(sys.argv, tz_name)
    note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    project_name = (todoist_cfg.get("project_name") or "Brain Protocol").strip()

    try:
        token = resolve_api_token(root, todoist_cfg)
    except TodoistError as e:
        print(json.dumps({"error": str(e), "needs_token": True}, ensure_ascii=False, indent=2))
        return 2

    from brain_todoist_lib import list_project_tasks  # noqa: E402

    project_id = ensure_project(token, project_name)
    tasks = list_project_tasks(token, project_id)
    completed_items = list_completed_tasks(token, project_id)
    day_events = events_for_date(brain_cfg, day, for_todoist=True)
    title_marker = brain_cfg.get("title_marker") or "[BRAIN]"

    rows = []
    incomplete = []
    completed = []

    for ev in day_events:
        eid = ev.get("id") or ""
        active, done_today = resolve_event_task_state(
            tasks,
            completed_items,
            ev,
            day=day,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        done = done_today
        if done:
            append_completion_log(
                root,
                {
                    "date": day.isoformat(),
                    "event_id": eid,
                    "status": "completed",
                    "title": ev.get("title") or eid,
                    "task_id": (active or {}).get("id"),
                },
            )
        row = {
            "event_id": eid,
            "title": ev.get("title"),
            "start": ev.get("start"),
            "done": done,
            "todoist_task_id": (active or {}).get("id"),
            "missing_in_todoist": active is None and not done_today,
        }
        rows.append(row)
        if row["missing_in_todoist"]:
            incomplete.append(row)
        elif done:
            completed.append(row)
        else:
            incomplete.append(row)

    md_path = write_daily_markdown(root, day=day, rows=rows)

    done_map = {r["event_id"]: bool(r["done"]) for r in rows if r.get("event_id")}
    todoist_ids = {
        r["event_id"]: str(r["todoist_task_id"])
        for r in rows
        if r.get("todoist_task_id")
    }
    brain_cfg = load_brain_cfg(root)
    if (brain_cfg.get("google_checklist") or {}).get("enabled", False):
        try:
            sync_google_checklist(root, day=day, done_map=done_map, todoist_ids=todoist_ids)
        except Exception:
            pass
    write_slidepad_urls(root)

    total = len(day_events)
    done_count = sum(1 for r in rows if r["done"])
    missing = [r for r in rows if r["missing_in_todoist"]]

    summary_lines = []
    if total:
        summary_lines.append(f"Brain Protocol {day.isoformat()}: {done_count}/{total} выполнено.")
    if missing:
        summary_lines.append(f"Не создано в Todoist: {', '.join(r['title'] or r['event_id'] for r in missing)}.")
    pending = [r for r in rows if not r["done"] and not r["missing_in_todoist"]]
    if pending:
        summary_lines.append(
            "Пропущено (не отмечено): " + ", ".join(r["title"] or r["event_id"] for r in pending) + "."
        )

    report = {
        "date": day.isoformat(),
        "summary": " ".join(summary_lines),
        "total": total,
        "completed": done_count,
        "incomplete": [
            {"event_id": r["event_id"], "title": r["title"], "start": r["start"], "missing": r["missing_in_todoist"]}
            for r in rows
            if not r["done"]
        ],
        "markdown": str(md_path.relative_to(root)),
    }

    human = "--json" not in sys.argv
    if human:
        print(report["summary"])
        if report["incomplete"]:
            print("\nНе сделано:")
            for item in report["incomplete"]:
                flag = " (нет задачи в Todoist — запусти sync)" if item.get("missing") else ""
                print(f"  · {item.get('start', '')} {item.get('title')}{flag}")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
