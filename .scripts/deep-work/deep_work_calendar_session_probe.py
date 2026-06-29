#!/usr/bin/env python3
"""Return JSON: whether Calendar has an active Deep Work event matching title (for Session URL)."""
from __future__ import annotations

import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OSA = os.path.join(SCRIPT_DIR, "deep_work_calendar_session_probe.applescript")


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    cfg_path = os.path.join(root, "System", "Deep_Work", "deep-work-config.json")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    sync = cfg.get("session_mac_sync") or {}
    cal = cfg.get("calendar_name") or ""
    title = sync.get("calendar_event_title") or "Deep Work [DEX]"
    try:
        r = subprocess.run(
            ["osascript", OSA, cal, title],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        print(json.dumps({"active": False, "error": "osascript_timeout"}))
        return 0
    line = (r.stdout or "").strip().split("\n")[0] if (r.stdout or "").strip() else ""
    if not line.startswith("ACTIVE|"):
        print(json.dumps({"active": False, "raw": line[:200] if line else ""}))
        return 0
    parts = line.split("|", 3)
    if len(parts) < 4:
        print(json.dumps({"active": False, "error": "bad_line"}))
        return 0
    _, dur_s, fp, desc = parts[0], parts[1], parts[2], parts[3]
    try:
        dur_m = max(1, int(float(dur_s)) // 60)
    except ValueError:
        dur_m = 25
    desc = (desc or "").replace("\r", " ").replace("\n", " ").strip()
    print(
        json.dumps(
            {
                "active": True,
                "duration_mins": dur_m,
                "notes": desc if desc else f"[DEX_DEEPWORK] calendar {fp}",
                "fingerprint": fp,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
