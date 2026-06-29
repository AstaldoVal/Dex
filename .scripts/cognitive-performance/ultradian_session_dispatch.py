#!/usr/bin/env python3
"""Screen lock probe + remaining slot minutes for ultradian Session sync."""
from __future__ import annotations

import datetime as dt
import re
import subprocess
import sys
import zoneinfo


def is_screen_locked() -> bool:
    """Best-effort without AppleScript (avoids recurring macOS TCC prompts from launchd)."""
    try:
        if subprocess.run(["pgrep", "-x", "ScreenSaverEngine"], capture_output=True).returncode == 0:
            return True
    except OSError:
        pass
    try:
        if subprocess.run(["pgrep", "-x", "lockout"], capture_output=True).returncode == 0:
            return True
    except OSError:
        pass
    return False


_FP_RE = re.compile(
    r"^(?P<start>.+?)\s*\^\^\s*(?P<end>.+)$",
    re.DOTALL,
)


def _parse_apple_date(s: str) -> dt.datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in (
        "%A, %d %B %Y at %H:%M:%S",
        "%A, %B %d, %Y at %H:%M:%S",
    ):
        try:
            return dt.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def remaining_slot_minutes(fingerprint: str, tz_name: str = "Europe/Lisbon") -> int | None:
    m = _FP_RE.match(fingerprint or "")
    if not m:
        return None
    tz = zoneinfo.ZoneInfo(tz_name)
    start = _parse_apple_date(m.group("start"))
    end = _parse_apple_date(m.group("end"))
    if not start or not end:
        return None
    start = start.replace(tzinfo=tz)
    end = end.replace(tzinfo=tz)
    now = dt.datetime.now(tz)
    if now >= end:
        return 0
    if now <= start:
        return max(1, int((end - start).total_seconds() // 60))
    return max(1, int((end - now).total_seconds() // 60))


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "locked":
        print("1" if is_screen_locked() else "0")
        return 0
    if cmd == "remaining":
        fp = sys.argv[2] if len(sys.argv) > 2 else ""
        tz = sys.argv[3] if len(sys.argv) > 3 else "Europe/Lisbon"
        rem = remaining_slot_minutes(fp, tz)
        print(rem if rem is not None else "")
        return 0
    print("usage: ultradian_session_dispatch.py locked|remaining <fp> [tz]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
