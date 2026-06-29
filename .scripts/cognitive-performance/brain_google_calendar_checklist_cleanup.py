#!/usr/bin/env python3
"""Remove Brain Checklist duplicate events from Google Calendar."""
from __future__ import annotations

import datetime as dt
import json
import sys
import zoneinfo
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(ROOT / "core" / "mcp"))
sys.path.insert(0, str(SCRIPT_DIR))

from google_calendar_server import _service  # noqa: E402
from brain_todoist_lib import load_brain_cfg, repo_root  # noqa: E402


def main() -> int:
    root = repo_root()
    cfg = load_brain_cfg(root)
    gcfg = cfg.get("google_checklist") or {}
    cal_id = gcfg.get("google_calendar_id")
    if not cal_id:
        print(json.dumps({"skipped": True, "reason": "no google_checklist calendar id"}, ensure_ascii=False))
        return 0

    marker = gcfg.get("checklist_note_marker") or "[BRAIN_CHECKLIST]"
    tz_name = cfg.get("timezone") or "Europe/Lisbon"
    tz = zoneinfo.ZoneInfo(tz_name)
    today = dt.datetime.now(tz).date()
    start = dt.datetime.combine(today, dt.time.min, tzinfo=tz)
    end = start + dt.timedelta(days=1)

    service = _service()
    deleted = 0
    page_token = None
    while True:
        res = service.events().list(
            calendarId=cal_id,
            timeMin=start.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            maxResults=100,
            pageToken=page_token,
        ).execute()
        for ev in res.get("items") or []:
            if marker in (ev.get("description") or ""):
                service.events().delete(calendarId=cal_id, eventId=ev["id"]).execute()
                deleted += 1
        page_token = res.get("nextPageToken")
        if not page_token:
            break

    report = {"date": today.isoformat(), "calendar_id": cal_id, "deleted": deleted}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
