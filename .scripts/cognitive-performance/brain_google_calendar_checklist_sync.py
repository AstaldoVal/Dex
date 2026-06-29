#!/usr/bin/env python3
"""Google Calendar daily checklist for Brain Protocol (Slidepad / GCal web)."""
from __future__ import annotations

import datetime as dt
import json
import sys
import zoneinfo
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(ROOT / "core" / "mcp"))
sys.path.insert(0, str(SCRIPT_DIR))

from google_calendar_server import _service  # noqa: E402

from brain_todoist_lib import (  # noqa: E402
    events_for_date,
    load_brain_cfg,
    repo_root,
    slot_datetimes,
)


def load_cfg(root: Path) -> dict:
    return load_brain_cfg(root)


def save_cfg(root: Path, cfg: dict) -> None:
    p = root / "05-Areas/Cognitive_Performance/brain-protocol-config.json"
    with open(p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def checklist_cfg(brain_cfg: dict) -> dict:
    gcal = dict(brain_cfg.get("google_checklist") or {})
    gcal.setdefault("enabled", True)
    gcal.setdefault("calendar_summary", "Brain Checklist")
    gcal.setdefault("checklist_note_marker", "[BRAIN_CHECKLIST]")
    gcal.setdefault("title_marker", "☐ [BRAIN]")
    gcal.setdefault("done_title_marker", "✓ [BRAIN]")
    gcal.setdefault("calendar_color_background", "#4986e7")
    gcal.setdefault("calendar_color_foreground", "#1d1d1d")
    gcal.setdefault("event_color_id", "7")
    gcal.setdefault("transparency", "opaque")
    return gcal


def ensure_checklist_calendar(service, brain_cfg: dict, gcfg: dict) -> str:
    cal_id = gcfg.get("google_calendar_id")
    summary = gcfg.get("calendar_summary") or "Brain Checklist"
    if cal_id:
        return cal_id

    items = service.calendarList().list().execute().get("items") or []
    for c in items:
        if (c.get("summary") or "").strip() == summary:
            gcfg["google_calendar_id"] = c.get("id")
            brain_cfg["google_checklist"] = gcfg
            return c.get("id")

    tz = brain_cfg.get("timezone") or "Europe/Lisbon"
    body = {"summary": summary, "timeZone": tz}
    created = service.calendars().insert(body=body).execute()
    cal_id = created["id"]
    list_body = {
        "id": cal_id,
        "backgroundColor": gcfg.get("calendar_color_background") or "#4986e7",
        "foregroundColor": gcfg.get("calendar_color_foreground") or "#1d1d1d",
        "selected": True,
    }
    service.calendarList().insert(body=list_body).execute()
    gcfg["google_calendar_id"] = cal_id
    brain_cfg["google_checklist"] = gcfg
    return cal_id


def marker_line(event_id: str, day: str, note_marker: str, todoist_task_id: str | None = None) -> str:
    parts = [f"{note_marker} id={event_id} date={day}"]
    if todoist_task_id:
        parts.append(f"todoist_task_id={todoist_task_id}")
    return " ".join(parts)


def list_day_events(service, cal_id: str, day: dt.date, tz_name: str) -> list[dict]:
    tz = zoneinfo.ZoneInfo(tz_name)
    start = dt.datetime.combine(day, dt.time.min, tzinfo=tz)
    end = start + dt.timedelta(days=1)
    res = (
        service.events()
        .list(
            calendarId=cal_id,
            timeMin=start.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            maxResults=100,
        )
        .execute()
    )
    return list(res.get("items") or [])


def find_checklist_event(
    events: list[dict], *, event_id: str, day: str, note_marker: str
) -> dict | None:
    needle = f"id={event_id} date={day}"
    for ev in events:
        desc = ev.get("description") or ""
        if note_marker in desc and needle in desc:
            return ev
    return None


def base_title(ev: dict) -> str:
    return (ev.get("title") or "Brain").strip()


def event_title(ev: dict, gcfg: dict, *, done: bool) -> str:
    marker = gcfg.get("done_title_marker") if done else gcfg.get("title_marker")
    marker = marker or ("✓ [BRAIN]" if done else "☐ [BRAIN]")
    return f"{base_title(ev)} {marker}".strip()


def apply_done_to_summary(summary: str, gcfg: dict, done: bool) -> str:
    todo_m = (gcfg.get("title_marker") or "☐ [BRAIN]").strip()
    done_m = (gcfg.get("done_title_marker") or "✓ [BRAIN]").strip()
    if done:
        if todo_m in summary:
            return summary.replace(todo_m, done_m, 1)
        if done_m not in summary:
            return f"{summary} {done_m}".strip()
        return summary
    if done_m in summary:
        return summary.replace(done_m, todo_m, 1)
    return summary


def build_event_body(
    ev: dict,
    *,
    day: dt.date,
    brain_cfg: dict,
    gcfg: dict,
    done: bool,
    todoist_task_id: str | None,
) -> dict[str, Any]:
    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    note_marker = gcfg.get("checklist_note_marker") or "[BRAIN_CHECKLIST]"
    start, end = slot_datetimes(day, ev, tz_name)

    desc_lines = []
    if ev.get("description"):
        desc_lines.append(str(ev["description"]).strip())
    desc_lines.append(marker_line(ev.get("id") or "", day.isoformat(), note_marker, todoist_task_id))

    return {
        "summary": event_title(ev, gcfg, done=done),
        "description": "\n\n".join(desc_lines),
        "start": {"dateTime": start.isoformat(), "timeZone": tz_name},
        "end": {"dateTime": end.isoformat(), "timeZone": tz_name},
        "colorId": str(gcfg.get("event_color_id", "7")),
        "transparency": gcfg.get("transparency", "opaque"),
        "reminders": {"useDefault": False, "overrides": []},
    }


def create_checklist_event(service, cal_id: str, body: dict) -> dict:
    return service.events().insert(calendarId=cal_id, body=body).execute()


def update_checklist_event(service, cal_id: str, event_id: str, body: dict) -> dict:
    return service.events().update(calendarId=cal_id, eventId=event_id, body=body).execute()


def slidepad_url(brain_cfg: dict) -> str:
    """Day view URL with DEX-RHYTHM + Brain Protocol + Brain Checklist (for Slidepad)."""
    ultradian_path = ROOT / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    ids: list[str] = []
    if ultradian_path.is_file():
        u = json.loads(ultradian_path.read_text(encoding="utf-8"))
        uid = u.get("google_calendar_id")
        if uid:
            ids.append(uid.replace("@", "%40"))
    for key in ("google_calendar_id",):
        bid = brain_cfg.get(key)
        if bid:
            ids.append(bid.replace("@", "%40"))
    gcfg = brain_cfg.get("google_checklist") or {}
    cid = gcfg.get("google_calendar_id")
    if cid:
        ids.append(cid.replace("@", "%40"))
    if not ids:
        return "https://calendar.google.com/calendar/u/0/r/day"
    query = "&".join(f"cid={c}" for c in ids)
    return f"https://calendar.google.com/calendar/u/0/r/day?{query}"


def sync_google_checklist(
    root: Path,
    *,
    day: dt.date | None = None,
    dry: bool = False,
    done_map: dict[str, bool] | None = None,
    todoist_ids: dict[str, str] | None = None,
) -> dict[str, Any]:
    brain_cfg = load_cfg(root)
    gcfg = checklist_cfg(brain_cfg)
    if not gcfg.get("enabled", True):
        return {"skipped": True, "reason": "google_checklist disabled"}

    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    if day is None:
        day = dt.datetime.now(zoneinfo.ZoneInfo(tz_name)).date()

    note_marker = gcfg.get("checklist_note_marker") or "[BRAIN_CHECKLIST]"
    day_events = events_for_date(brain_cfg, day)
    done_map = done_map or {}
    todoist_ids = todoist_ids or {}

    if dry:
        return {
            "dry_run": True,
            "date": day.isoformat(),
            "calendar_summary": gcfg.get("calendar_summary"),
            "tasks": [
                {
                    "id": ev.get("id"),
                    "title": event_title(ev, gcfg, done=done_map.get(ev.get("id") or "", False)),
                    "start": ev.get("start"),
                }
                for ev in day_events
            ],
            "slidepad_url": slidepad_url(brain_cfg),
        }

    service = _service()
    cal_id = ensure_checklist_calendar(service, brain_cfg, gcfg)
    save_cfg(root, brain_cfg)

    existing = list_day_events(service, cal_id, day, tz_name)
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for ev in day_events:
        eid = ev.get("id") or ""
        done = bool(done_map.get(eid, False))
        found = find_checklist_event(existing, event_id=eid, day=day.isoformat(), note_marker=note_marker)
        body = build_event_body(
            ev,
            day=day,
            brain_cfg=brain_cfg,
            gcfg=gcfg,
            done=done,
            todoist_task_id=todoist_ids.get(eid),
        )
        try:
            if found:
                merged = {**found, **body}
                merged["summary"] = event_title(ev, gcfg, done=done)
                update_checklist_event(service, cal_id, found["id"], merged)
                updated += 1
            else:
                create_checklist_event(service, cal_id, body)
                created += 1
        except Exception as exc:
            errors.append(f"{eid}: {exc}")

    url = slidepad_url(brain_cfg)
    url_path = root / "System/state/brain-slidepad-calendar-url.txt"
    url_path.parent.mkdir(parents=True, exist_ok=True)
    url_path.write_text(url + "\n", encoding="utf-8")

    report = {
        "date": day.isoformat(),
        "calendar_summary": gcfg.get("calendar_summary"),
        "calendar_id": cal_id,
        "planned": len(day_events),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "slidepad_url": url,
        "slidepad_url_file": str(url_path.relative_to(root)),
    }

    log_path = root / "System/logs/brain-gcal-checklist-sync.log"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} {json.dumps(report, ensure_ascii=False)}\n")

    return report


def main() -> int:
    root = repo_root()
    dry = "--dry-run" in sys.argv
    report = sync_google_checklist(root, dry=dry)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report.get("errors"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
