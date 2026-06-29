#!/usr/bin/env python3
"""
Sync brain protocol slots to Google Calendar «Brain Protocol».

Bright, opaque events with selective reminders — separate from muted DEX-RHYTHM ultradian grid.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import zoneinfo
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(ROOT / "core" / "mcp"))

from google_calendar_server import _service  # noqa: E402

WEEKDAY_TO_BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def load_cfg(root: Path) -> dict:
    p = root / "05-Areas/Cognitive_Performance/brain-protocol-config.json"
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_cfg(root: Path, cfg: dict) -> None:
    p = root / "05-Areas/Cognitive_Performance/brain-protocol-config.json"
    with open(p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def ensure_brain_calendar(service, cfg: dict) -> str:
    cal_id = cfg.get("google_calendar_id")
    summary = cfg.get("google_calendar_summary") or "Brain Protocol"
    if cal_id:
        return cal_id

    items = service.calendarList().list().execute().get("items") or []
    for c in items:
        if (c.get("summary") or "").strip() == summary:
            cfg["google_calendar_id"] = c.get("id")
            return c.get("id")

    body = {"summary": summary, "timeZone": cfg.get("timezone") or "Europe/Lisbon"}
    created = service.calendars().insert(body=body).execute()
    cal_id = created["id"]

    list_body = {
        "id": cal_id,
        "backgroundColor": cfg.get("calendar_color_background") or "#ff7537",
        "foregroundColor": cfg.get("calendar_color_foreground") or "#1d1d1d",
        "selected": True,
    }
    service.calendarList().insert(body=list_body).execute()
    cfg["google_calendar_id"] = cal_id
    return cal_id


def reminders_for_bundle(cfg: dict, bundle: str | None) -> dict:
    if not bundle:
        return {"useDefault": False, "overrides": []}
    bundles = cfg.get("reminder_bundles") or {}
    spec = bundles.get(bundle)
    if not spec:
        return {"useDefault": False, "overrides": []}
    minutes = int(spec.get("minutes_before", 5))
    return {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": minutes}],
    }


def list_brain_series(service, cal_id: str, note_marker: str) -> list[dict]:
    res = (
        service.events()
        .list(calendarId=cal_id, q=note_marker, singleEvents=False, maxResults=250)
        .execute()
    )
    return list(res.get("items") or [])


def config_id_from_series(ev: dict, note_marker: str) -> str | None:
    needle = f"{note_marker} id="
    for line in (ev.get("description") or "").splitlines():
        if line.startswith(needle):
            return line[len(needle) :].strip() or None
    return None


def series_exists(service, cal_id: str, event_id: str, note_marker: str) -> bool:
    needle = f"{note_marker} id={event_id}"
    for ev in list_brain_series(service, cal_id, note_marker):
        if needle in (ev.get("description") or ""):
            return True
    return False


def cleanup_stale_series(service, cal_id: str, cfg: dict) -> list[str]:
    note_marker = cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    active_ids = {str(ev.get("id") or "") for ev in cfg.get("events") or []}
    removed: list[str] = []
    for ev in list_brain_series(service, cal_id, note_marker):
        config_id = config_id_from_series(ev, note_marker)
        if not config_id or config_id in active_ids:
            continue
        service.events().delete(calendarId=cal_id, eventId=ev["id"]).execute()
        removed.append(config_id)
    return removed


def build_recurring_body(ev: dict, cfg: dict, tz: str) -> tuple[dict, dt.date]:
    marker = cfg.get("title_marker") or "[BRAIN]"
    note_marker = cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    title = f"{ev['title']} {marker}"
    sh, sm = map(int, ev["start"].split(":"))
    duration = int(ev.get("duration_minutes", 30))
    eh = sh + (sm + duration) // 60
    em = (sm + duration) % 60
    z = zoneinfo.ZoneInfo(tz)
    today = dt.datetime.now(z).date()
    weekdays = ev.get("weekdays") or list(range(7))
    anchor = today
    for i in range(8):
        d = today + dt.timedelta(days=i)
        if d.weekday() in weekdays:
            anchor = d
            break
    start_dt = dt.datetime.combine(anchor, dt.time(sh, sm), tzinfo=z)
    end_dt = dt.datetime.combine(anchor, dt.time(eh % 24, em), tzinfo=z)
    byday = ",".join(WEEKDAY_TO_BYDAY[w] for w in sorted(weekdays))
    desc_lines = [ev.get("description") or "", f"{note_marker} id={ev.get('id')}"]
    body = {
        "summary": title,
        "description": "\n".join(line for line in desc_lines if line),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz},
        "colorId": str(cfg.get("event_color_id", "5")),
        "transparency": cfg.get("transparency", "opaque"),
        "reminders": reminders_for_bundle(cfg, ev.get("bundle")),
        "recurrence": [f"RRULE:FREQ=WEEKLY;BYDAY={byday}"],
    }
    return body, anchor


def find_series(service, cal_id: str, event_id: str, note_marker: str) -> dict | None:
    needle = f"{note_marker} id={event_id}"
    for ev in list_brain_series(service, cal_id, note_marker):
        if needle in (ev.get("description") or ""):
            return ev
    return None


def series_needs_refresh(existing: dict, expected: dict) -> bool:
    for key in ("summary", "description", "start", "end", "reminders"):
        if existing.get(key) != expected.get(key):
            return True
    return False


def refresh_recurring_event(service, cal_id: str, series_id: str, body: dict) -> None:
    patch = {k: body[k] for k in ("summary", "description", "start", "end", "reminders")}
    service.events().patch(calendarId=cal_id, eventId=series_id, body=patch).execute()


def create_recurring_event(service, cal_id: str, ev: dict, cfg: dict, tz: str) -> None:
    body, _anchor = build_recurring_body(ev, cfg, tz)
    service.events().insert(calendarId=cal_id, body=body).execute()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    force = "--force" in sys.argv

    cfg = load_cfg(root)
    tz = cfg.get("timezone") or "Europe/Lisbon"
    log_path = root / "System/logs/brain-google-calendar-sync.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    service = _service()
    cal_id = ensure_brain_calendar(service, cfg)
    save_cfg(root, cfg)

    created = 0
    skipped = 0
    updated = 0
    errors = 0
    removed_stale: list[str] = []

    try:
        removed_stale = cleanup_stale_series(service, cal_id, cfg)
    except Exception as e:
        errors += 1
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(f"cleanup_stale failed: {e}\n")

    for ev in cfg.get("events") or []:
        if (ev.get("id") or "") == "human-garage-28":
            continue
        marker = cfg.get("title_marker") or "[BRAIN]"
        title = f"{ev['title']} {marker}"
        try:
            note_marker = cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
            eid = ev.get("id") or ""
            existing = find_series(service, cal_id, eid, note_marker)
            if existing and not force:
                expected, _anchor = build_recurring_body(ev, cfg, tz)
                if series_needs_refresh(existing, expected):
                    refresh_recurring_event(service, cal_id, existing["id"], expected)
                    updated += 1
                else:
                    skipped += 1
                continue
            if existing and force:
                service.events().delete(calendarId=cal_id, eventId=existing["id"]).execute()
            create_recurring_event(service, cal_id, ev, cfg, tz)
            created += 1
        except Exception as e:
            errors += 1
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(f"fail {ev.get('id')} {title}: {e}\n")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    hg_report: dict = {}
    try:
        from brain_human_garage_calendar_sync import sync_human_garage_daily

        hg_report = sync_human_garage_daily(
            service,
            cal_id,
            cfg,
            root,
            horizon_days=int(cfg.get("horizon_days") or 14),
        )
    except Exception as e:
        errors += 1
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(f"human_garage_daily failed: {e}\n")

    report = {
        "calendar_id": cal_id,
        "calendar_summary": cfg.get("google_calendar_summary"),
        "removed_stale": removed_stale,
        "updated": updated,
        "created": created,
        "skipped_existing": skipped,
        "errors": errors,
        "human_garage_28_reset": hg_report,
    }
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} {json.dumps(report, ensure_ascii=False)}\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
