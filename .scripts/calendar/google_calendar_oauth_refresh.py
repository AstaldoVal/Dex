#!/usr/bin/env python3
"""
Refresh Google Calendar OAuth for Dex (same client as core/mcp/google_calendar_server.py).

1. With --reset: delete saved token (typical fix for invalid_grant), then open browser for consent.
2. With --list-range START END: after valid credentials, print primary calendar events (JSON).

Run from repo root. Requires credentials.json (or GOOGLE_CALENDAR_CREDENTIALS_PATH).

Examples:
  uv run python .scripts/calendar/google_calendar_oauth_refresh.py --reset
  uv run python .scripts/calendar/google_calendar_oauth_refresh.py --list-range 2026-03-01 2026-05-01
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
os.environ.setdefault("VAULT_PATH", str(REPO))

from googleapiclient.discovery import build  # noqa: E402

from core.mcp import google_calendar_server as gcs  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Google Calendar OAuth refresh + optional event list")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Delete google_calendar_token.json before auth (use after invalid_grant)",
    )
    p.add_argument(
        "--list-range",
        nargs=2,
        metavar=("START", "END"),
        help="List primary calendar events between YYYY-MM-DD (inclusive start, exclusive end day boundary as API)",
    )
    args = p.parse_args()

    token_path = gcs._token_path()  # noqa: SLF001
    if args.reset and token_path.exists():
        token_path.unlink()
        print(f"Removed: {token_path}", file=sys.stderr)

    creds, err = gcs.get_credentials()
    if err:
        print(err, file=sys.stderr)
        sys.exit(1)

    if not args.list_range:
        print("OK: Calendar credentials ready.", file=sys.stderr)
        print(f"Token file: {token_path}", file=sys.stderr)
        return

    start, end = args.list_range
    service = build("calendar", "v3", credentials=creds)
    # END is exclusive (API-style): e.g. 2026-03-01 .. 2026-05-01 = March through April.
    time_min = f"{start}T00:00:00Z"
    time_max = f"{end}T00:00:00Z"
    ev = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
        )
        .execute()
    )
    items = ev.get("items") or []
    out = []
    for e in items:
        summ = e.get("summary") or "(no title)"
        st = e.get("start", {})
        start_s = st.get("dateTime") or st.get("date") or ""
        out.append(
            {
                "title": summ,
                "start": start_s,
                "location": e.get("location") or "",
            }
        )
    print(json.dumps({"events": out, "count": len(out)}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
