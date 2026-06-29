#!/usr/bin/env python3
"""Create Calendar events for Deep Work [DEX] for upcoming days (schedule from deep-work-config.json)."""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import zoneinfo

DAY_KEYS = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OSA_ONE = os.path.join(SCRIPT_DIR, "deep_work_calendar_one.applescript")


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 21
    cfg_path = os.path.join(root, "System/Deep_Work/deep-work-config.json")
    log_path = os.path.join(root, "System/logs/deep-work-calendar-sync.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)

    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    cal_name = cfg.get("calendar_name", "") or ""
    sched = cfg.get("schedule", {})
    now = dt.datetime.now(tz)
    today = now.date()

    errors = 0
    slots = 0

    for i in range(days):
        d = today + dt.timedelta(days=i)
        key = DAY_KEYS[d.weekday()]
        s = sched.get(key, {})
        if not s.get("enabled"):
            continue
        start_s = s.get("start", "")
        end_s = s.get("end", "")
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
        y, mo, da = sl.year, sl.month, sl.day
        sh, sm = sl.hour, sl.minute
        eh, em = el.hour, el.minute

        note = f"[DEX_DEEPWORK] {d.isoformat()} {start_s}-{end_s} {cfg.get('timezone') or 'Europe/Lisbon'}"
        title = "Deep Work [DEX]"

        args = [
            cal_name,
            title,
            note,
            str(y),
            str(mo),
            str(da),
            str(sh),
            str(sm),
            str(eh),
            str(em),
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
                log.write(
                    f"fail {d.isoformat()} {start_s}-{end_s}: osascript timed out after 180s\n"
                )
            continue
        if r.returncode != 0:
            errors += 1
            err = (r.stderr or r.stdout or "").strip()
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(f"fail {d.isoformat()} {start_s}-{end_s}: {err}\n")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} horizon_days={days} scheduled_slots={slots} osascript_errors={errors}\n")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
