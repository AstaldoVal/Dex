#!/usr/bin/env python3
"""Remove legacy Deep Work [DEX] events from personal calendar (Apple + Google primary)."""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import zoneinfo
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OSA = SCRIPT_DIR / "deep_work_calendar_cleanup.applescript"
LEGACY_TITLE = "Deep Work [DEX]"


def load_deep_work_cfg(root: Path) -> dict:
    path = root / "System/Deep_Work/deep-work-config.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cleanup_apple_calendar(cal_name: str, title: str, days: int, tz_name: str) -> dict:
    if not OSA.is_file():
        return {"apple_deleted": 0, "apple_error": "missing applescript"}
    tz = zoneinfo.ZoneInfo(tz_name)
    today = dt.datetime.now(tz).date()
    deleted = 0
    errors: list[str] = []
    for i in range(days):
        d = today + dt.timedelta(days=i)
        try:
            r = subprocess.run(
                [
                    "osascript",
                    str(OSA),
                    cal_name,
                    title,
                    str(d.year),
                    str(d.month),
                    str(d.day),
                ],
                capture_output=True,
                text=True,
                timeout=45,
            )
        except subprocess.TimeoutExpired:
            errors.append(f"{d.isoformat()}: timeout")
            continue
        line = (r.stdout or "").strip().split("\n")[-1]
        if line.startswith("DELETED|"):
            deleted += int(line.split("|", 1)[1])
        elif line.startswith("ERR|"):
            return {"apple_deleted": deleted, "apple_error": line[4:300]}
        elif r.returncode != 0:
            errors.append((r.stderr or line or "fail")[:120])
    out: dict = {"apple_deleted": deleted}
    if errors:
        out["apple_warnings"] = errors[:5]
    return out


def cleanup_google_primary(root: Path, title: str, days: int) -> dict:
    try:
        sys.path.insert(0, str(root / ".scripts/cognitive-performance"))
        from ultradian_google_calendar_sync import cleanup_primary, load_cfg, _service  # noqa: PLC0415
    except Exception as e:
        return {"google_deleted": 0, "google_error": str(e)[:300]}

    cfg = load_cfg(root)
    tz = cfg.get("timezone") or "Europe/Lisbon"
    cfg = dict(cfg)
    cfg["cleanup_title_patterns"] = [title]
    try:
        service = _service()
        deleted = cleanup_primary(service, cfg, days, tz)
        return {"google_deleted": deleted}
    except Exception as e:
        return {"google_deleted": 0, "google_error": str(e)[:300]}


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    argv = sys.argv[2:]
    google_only = "--google-only" in argv
    apple_only = "--apple-only" in argv
    days = 90
    for a in argv:
        if a.isdigit():
            days = int(a)

    dw = load_deep_work_cfg(root)
    cal_name = dw.get("calendar_name") or "r.matsukatov@gmail.com"
    sync = dw.get("session_mac_sync") or {}
    title = sync.get("calendar_event_title") or LEGACY_TITLE
    tz_name = dw.get("timezone") or "Europe/Lisbon"

    result = {
        "calendar_name": cal_name,
        "title": title,
        "horizon_days": days,
        "at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    if not apple_only:
        result.update(cleanup_google_primary(root, title, days))
    if not google_only:
        result.update(cleanup_apple_calendar(cal_name, title, days, tz_name))

    log_path = root / "System/logs/deep-work-calendar-cleanup.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(json.dumps(result, ensure_ascii=False) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
