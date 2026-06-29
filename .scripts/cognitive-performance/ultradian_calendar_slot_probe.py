#!/usr/bin/env python3
"""Active ultradian slot (peak or trough) in Calendar → JSON for Session sync."""
from __future__ import annotations

import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OSA = os.path.join(SCRIPT_DIR, "ultradian_calendar_slot_probe.applescript")


def load_cfg(root: str) -> dict | None:
    cfg_path = os.path.join(root, "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json")
    if not os.path.isfile(cfg_path):
        return None
    with open(cfg_path, encoding="utf-8") as f:
        return json.load(f)


def probe_slot(root: str) -> dict:
    cfg = load_cfg(root)
    if not cfg:
        return {"active": False, "reason": "no_ultradian_config"}

    sync = cfg.get("session_sync") or {}
    cal = sync.get("calendar_name") or cfg.get("calendar_app_name") or cfg.get("google_calendar_summary") or ""
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    peak_prefix = sync.get("peak_title_prefix") or "Пик"
    trough_raw = sync.get("trough_title_prefixes") or ["Провал", "Разогрев", "Обед", "Спад"]
    if isinstance(trough_raw, list):
        trough_csv = ",".join(str(x) for x in trough_raw)
    else:
        trough_csv = str(trough_raw)

    try:
        r = subprocess.run(
            ["osascript", OSA, cal, marker, peak_prefix, trough_csv],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {"active": False, "error": "osascript_timeout"}

    line = (r.stdout or "").strip().split("\n")[-1] if (r.stdout or "").strip() else ""
    if not line.startswith("ACTIVE|"):
        return {"active": False, "raw": line[:200] if line else ""}

    parts = line.split("|", 5)
    if len(parts) < 6:
        return {"active": False, "error": "bad_line", "raw": line[:200]}

    _, kind, dur_s, fp, desc, summary = parts
    try:
        dur_m = max(1, int(float(dur_s)) // 60)
    except ValueError:
        dur_m = 25

    desc = (desc or "").replace("\r", " ").replace("\n", " ").strip()
    summary = (summary or "").replace("\r", " ").replace("\n", " ").strip()
    notes = desc if desc else f"{cfg.get('note_marker', '[DEX_RHYTHM]')} {kind} {summary}".strip()

    return {
        "active": True,
        "kind": kind,
        "duration_mins": dur_m,
        "notes": notes,
        "summary": summary,
        "fingerprint": fp,
    }


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    print(json.dumps(probe_slot(root), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
