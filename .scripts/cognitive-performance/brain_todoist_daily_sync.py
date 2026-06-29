#!/usr/bin/env python3
"""
Create today's Brain Protocol checklist tasks in Todoist (idempotent).

Reads 05-Areas/Cognitive_Performance/brain-protocol-config.json, filters events for
today's weekday, creates tasks with due time + duration (for Google Calendar sync).
"""
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
    build_task_payload,
    close_task,
    create_task,
    ensure_project,
    events_for_date,
    find_task_for_event,
    is_task_done,
    list_completed_tasks,
    list_project_tasks,
    load_brain_cfg,
    load_todoist_cfg,
    repo_root,
    resolve_api_token,
    resolve_event_task_state,
    retime_tasks_to_date_only,
    retime_tasks_to_timed,
    rollover_stale_tasks,
    skip_todoist,
    update_task,
    write_daily_markdown,
)

from brain_google_calendar_checklist_sync import sync_google_checklist  # noqa: E402
from brain_checklist_lib import write_slidepad_urls  # noqa: E402


def _row_title(root: Path, ev: dict, day: dt.date) -> str:
    try:
        from brain_human_garage_reset import display_title

        return display_title(root, ev, day)
    except Exception:
        return str(ev.get("title") or "")


def main() -> int:
    root = repo_root()
    dry = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    brain_cfg = load_brain_cfg(root)
    todoist_cfg = load_todoist_cfg(root, brain_cfg)
    if not todoist_cfg.get("enabled", True):
        print(json.dumps({"skipped": True, "reason": "todoist disabled in config"}, ensure_ascii=False))
        return 0

    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    today = dt.datetime.now(zoneinfo.ZoneInfo(tz_name)).date()
    day_events = events_for_date(brain_cfg, today, for_todoist=True)
    calendar_only_today = [
        ev for ev in events_for_date(brain_cfg, today) if skip_todoist(ev, brain_cfg)
    ]

    if dry:
        preview = [
            {
                "id": ev.get("id"),
                "title": ev.get("title"),
                "start": ev.get("start"),
                "duration_minutes": ev.get("duration_minutes"),
            }
            for ev in day_events
        ]
        gcal_preview = sync_google_checklist(root, day=today, dry=True)
        print(
            json.dumps(
                {"dry_run": True, "date": today.isoformat(), "tasks": preview, "google_calendar": gcal_preview},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    log_path = root / "System/logs/brain-todoist-sync.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        token = resolve_api_token(root, todoist_cfg)
    except TodoistError as e:
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        msg = str(e)
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(f"{stamp} skip: {msg}\n")
        print(json.dumps({"error": msg, "needs_token": True}, ensure_ascii=False, indent=2))
        return 2

    project_name = (todoist_cfg.get("project_name") or "Brain Protocol").strip()
    note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"

    project_id = ensure_project(token, project_name)
    existing = list_project_tasks(token, project_id)
    completed_items = list_completed_tasks(token, project_id)
    title_marker = brain_cfg.get("title_marker") or "[BRAIN]"

    rollover_report = rollover_stale_tasks(
        token,
        root,
        tasks=existing,
        today=today,
        brain_cfg=brain_cfg,
        completed_items=completed_items,
        note_marker=note_marker,
        title_marker=title_marker,
        tz_name=tz_name,
    )
    if rollover_report.get("closed_missed") or rollover_report.get("deleted_recurring"):
        existing = list_project_tasks(token, project_id)

    mode = (todoist_cfg.get("calendar_mode") or "date_only").strip().lower()
    retimed = 0
    if mode == "date_only":
        retimed = retime_tasks_to_date_only(
            token, existing, day=today.isoformat(), note_marker=note_marker
        )
    elif mode == "timed":
        retimed = retime_tasks_to_timed(
            token,
            existing,
            brain_cfg=brain_cfg,
            todoist_cfg=todoist_cfg,
            note_marker=note_marker,
        )
    if retimed:
        existing = list_project_tasks(token, project_id)

    created = 0
    skipped = 0
    closed_dupes = 0
    closed_calendar_only = 0
    errors: list[str] = []
    md_rows: list[dict] = []

    for ev in calendar_only_today:
        eid = ev.get("id") or ""
        active, done_today = resolve_event_task_state(
            existing,
            completed_items,
            ev,
            day=today,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        if active and not is_task_done(active) and not done_today:
            try:
                close_task(token, str(active["id"]))
                closed_calendar_only += 1
                existing = [t for t in existing if str(t.get("id")) != str(active["id"])]
            except TodoistError as exc:
                errors.append(f"close_calendar_only {eid}: {exc}")

    for ev in day_events:
        eid = ev.get("id") or ""
        active, done_today = resolve_event_task_state(
            existing,
            completed_items,
            ev,
            day=today,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        if active and done_today and not is_task_done(active):
            try:
                close_task(token, str(active["id"]))
                closed_dupes += 1
                existing = [t for t in existing if str(t.get("id")) != str(active["id"])]
                active = None
            except TodoistError as exc:
                errors.append(f"close_dupe {eid}: {exc}")

        if (active or done_today) and not force:
            skipped += 1
            if eid == "human-garage-28" and active:
                try:
                    from brain_human_garage_reset import display_title

                    want = f"{display_title(root, ev, today)} {title_marker}".strip()
                    if (active.get("content") or "").strip() != want:
                        update_task(token, str(active["id"]), {"content": want})
                except Exception:
                    pass
            md_rows.append(
                {
                    "event_id": eid,
                    "title": _row_title(root, ev, today),
                    "start": ev.get("start"),
                    "done": done_today or (is_task_done(active) if active else False),
                }
            )
            continue
        try:
            body = build_task_payload(
                ev, day=today, brain_cfg=brain_cfg, todoist_cfg=todoist_cfg, project_id=project_id
            )
            task = create_task(token, body)
            created += 1
            existing.append(task)
            md_rows.append(
                {
                    "event_id": eid,
                    "title": _row_title(root, ev, today),
                    "start": ev.get("start"),
                    "done": False,
                }
            )
        except TodoistError as exc:
            errors.append(f"{eid}: {exc}")

    md_path = write_daily_markdown(root, day=today, rows=md_rows)

    try:
        from brain_human_garage_reset import append_log_day

        append_log_day(root, today)
    except Exception:
        pass

    done_map: dict[str, bool] = {}
    todoist_ids: dict[str, str] = {}
    for ev in day_events:
        eid = ev.get("id") or ""
        active, done_today = resolve_event_task_state(
            existing,
            completed_items,
            ev,
            day=today,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        if active:
            done_map[eid] = done_today or is_task_done(active)
            if active.get("id"):
                todoist_ids[eid] = str(active["id"])
        else:
            done_map[eid] = done_today

    gcal_report: dict = {}
    brain_cfg = load_brain_cfg(root)
    gcal_enabled = (brain_cfg.get("google_checklist") or {}).get("enabled", False)
    if gcal_enabled:
        try:
            gcal_report = sync_google_checklist(
                root, day=today, done_map=done_map, todoist_ids=todoist_ids
            )
        except Exception as exc:
            errors.append(f"google_calendar: {exc}")
    write_slidepad_urls(root)

    state_path = root / "System/state/brain-todoist-daily.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "date": today.isoformat(),
        "project_id": project_id,
        "project_name": project_name,
        "created": created,
        "skipped": skipped,
        "closed_duplicates": closed_dupes,
        "closed_calendar_only": closed_calendar_only,
        "rollover": rollover_report,
        "errors": errors,
        "markdown": str(md_path.relative_to(root)),
        "google_calendar": gcal_report,
        "synced_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} {json.dumps(state, ensure_ascii=False)}\n")

    report = {
        "date": today.isoformat(),
        "project_name": project_name,
        "project_id": project_id,
        "planned": len(day_events),
        "created": created,
        "skipped_existing": skipped,
        "closed_duplicates": closed_dupes,
        "closed_calendar_only": closed_calendar_only,
        "rollover": rollover_report,
        "retimed": retimed,
        "calendar_mode": mode,
        "errors": errors,
        "markdown": state["markdown"],
        "google_calendar": gcal_report,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
