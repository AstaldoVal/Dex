#!/usr/bin/env python3
"""Apply muted/background styling to existing DEX-RHYTHM Google Calendar events."""
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


def load_cfg(root: Path) -> dict:
    with open(root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json", encoding="utf-8") as f:
        return json.load(f)


def event_style(slot_kind: str, template: dict) -> dict:
    if slot_kind == "peak":
        return {
            "colorId": str(template.get("peak_event_color_id", "6")),
            "transparency": template.get("peak_transparency", "transparent"),
            "reminders": template.get("peak_reminders", {"useDefault": False, "overrides": []}),
        }
    return {
        "colorId": str(template.get("trough_event_color_id", "8")),
        "transparency": template.get("trough_transparency", "transparent"),
        "reminders": {"useDefault": False, "overrides": []},
    }


def kind_from_event(summary: str, prefix: str) -> str:
    base = summary.replace(f" {prefix}", "").strip()
    if base.startswith("Пик"):
        return "peak"
    return "trough"


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 14
    cfg = load_cfg(root)
    tz = cfg.get("timezone") or "Europe/Lisbon"
    cal_id = cfg.get("google_calendar_id")
    if not cal_id:
        print(json.dumps({"error": "google_calendar_id missing in config"}))
        return 1

    template = cfg.get("day_template") or {}
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    service = _service()

    # Softer calendar strip — Fantastical paints all events from this calendar with this color
    cal_color_id = str(cfg.get("calendar_color_id") or "19")
    try:
        service.calendarList().patch(
            calendarId=cal_id,
            body={"colorId": cal_color_id},
        ).execute()
    except Exception as e:
        print(json.dumps({"calendar_color_patch_error": str(e)}))

    today = dt.datetime.now(zoneinfo.ZoneInfo(tz)).date()
    time_min = dt.datetime.combine(today, dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)).isoformat()
    time_max = dt.datetime.combine(
        today + dt.timedelta(days=days), dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)
    ).isoformat()

    updated = 0
    page_token = None
    while True:
        res = (
            service.events()
            .list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                maxResults=250,
                pageToken=page_token,
            )
            .execute()
        )
        for ev in res.get("items") or []:
            summary = ev.get("summary") or ""
            if marker not in summary:
                continue
            eid = ev.get("id")
            if not eid:
                continue
            kind = kind_from_event(summary, marker)
            style = event_style(kind, template)
            body = {
                "colorId": style["colorId"],
                "transparency": style["transparency"],
                "reminders": style["reminders"],
            }
            service.events().patch(calendarId=cal_id, eventId=eid, body=body).execute()
            updated += 1
        page_token = res.get("nextPageToken")
        if not page_token:
            break

    print(
        json.dumps(
            {
                "updated_events": updated,
                "calendar_id": cal_id,
                "peak_color_id": template.get("peak_event_color_id"),
                "peak_color_name": template.get("peak_event_color_name", "Tangerine"),
                "trough_color_id": template.get("trough_event_color_id"),
                "trough_color_name": template.get("trough_event_color_name", "Graphite"),
                "transparency": "transparent",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
