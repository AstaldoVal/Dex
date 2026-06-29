#!/usr/bin/env python3
"""Active ultradian peak in Calendar → JSON for Session start (legacy shape)."""
from __future__ import annotations

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from ultradian_calendar_slot_probe import load_cfg, probe_slot  # noqa: E402


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    cfg = load_cfg(root)
    if not cfg:
        print(json.dumps({"active": False, "reason": "no_ultradian_config"}))
        return 0

    sync = cfg.get("session_sync") or {}
    if not sync.get("open_on_peak_start", True):
        print(json.dumps({"active": False, "reason": "session_sync_disabled"}))
        return 0

    slot = probe_slot(root)
    if not slot.get("active") or slot.get("kind") != "peak":
        out = {"active": False}
        if slot.get("raw"):
            out["raw"] = slot["raw"]
        if slot.get("reason"):
            out["reason"] = slot["reason"]
        print(json.dumps(out, ensure_ascii=False))
        return 0

    print(
        json.dumps(
            {
                "active": True,
                "duration_mins": slot.get("duration_mins", 25),
                "notes": slot.get("notes", ""),
                "fingerprint": slot.get("fingerprint", ""),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
