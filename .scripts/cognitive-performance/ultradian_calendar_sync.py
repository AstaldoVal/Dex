#!/usr/bin/env python3
"""Create Apple Calendar slots for ultradian rhythm (peaks + troughs) from ultradian-rhythm-config.json."""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import zoneinfo

DAY_KEYS = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEEP_WORK_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "deep-work")
OSA_ONE = os.path.join(DEEP_WORK_DIR, "deep_work_calendar_one.applescript")


def resolve_day_slots(sched: dict, key: str) -> list:
    raw = sched.get(key, [])
    if isinstance(raw, str):
        raw = sched.get(raw, [])
    if not isinstance(raw, list):
        return []
    return [s for s in raw if s.get("enabled", True)]


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    cfg_path = os.path.join(root, "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json")
    log_path = os.path.join(root, "System/logs/ultradian-calendar-sync.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)

    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    cal_name = cfg.get("calendar_name", "") or ""
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    note_marker = cfg.get("note_marker") or "[DEX_RHYTHM]"
    sched = cfg.get("weekday_slots", {})
    now = dt.datetime.now(tz)
    today = now.date()

    errors = 0
    slots = 0

    for i in range(days):
        d = today + dt.timedelta(days=i)
        key = DAY_KEYS[d.weekday()]
        for slot in resolve_day_slots(sched, key):
            start_s = slot.get("start", "")
            end_s = slot.get("end", "")
            label = slot.get("label") or slot.get("kind") or "Слот"
            kind = slot.get("kind") or "peak"
            if not start_s or not end_s:
                continue
            sh0, sm0 = map(int, start_s.split(":"))
            eh0, em0 = map(int, end_s.split(":"))
            start_dt = dt.datetime.combine(d, dt.time(sh0, sm0), tzinfo=tz)
            end_dt = dt.datetime.combine(d, dt.time(eh0, em0), tzinfo=tz)
            if end_dt <= start_dt:
                continue

            sl = start_dt.astimezone()
            el = end_dt.astimezone()
            title = f"{label} {marker}"
            note = (
                f"{note_marker} kind={kind} date={d.isoformat()} "
                f"{start_s}-{end_s} {cfg.get('timezone') or 'Europe/Lisbon'}"
            )

            args = [
                cal_name,
                title,
                note,
                str(sl.year),
                str(sl.month),
                str(sl.day),
                str(sl.hour),
                str(sl.minute),
                str(el.hour),
                str(el.minute),
            ]
            slots += 1
            try:
                r = subprocess.run(
                    ["osascript", OSA_ONE] + args,
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
            except subprocess.TimeoutExpired:
                errors += 1
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(f"fail {d.isoformat()} {title}: timeout\n")
                continue
            if r.returncode != 0:
                errors += 1
                err = (r.stderr or r.stdout or "").strip()
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(f"fail {d.isoformat()} {title}: {err}\n")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} horizon_days={days} scheduled_slots={slots} errors={errors}\n")

    print(json.dumps({"horizon_days": days, "scheduled_slots": slots, "errors": errors}))
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
