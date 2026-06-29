#!/usr/bin/env python3
"""Reconcile Session live state with current DEX-RHYTHM slot (config + calendar)."""
from __future__ import annotations

import datetime as dt
import json
import plistlib
import re
import sys
import zoneinfo
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from ultradian_session_dispatch import is_screen_locked, remaining_slot_minutes  # noqa: E402
from ultradian_slot_generator import generate_day_slots  # noqa: E402

PEAK_LABEL_RE = re.compile(r"(Пик\s*\d+)", re.IGNORECASE)
FOCUS_STATES = frozenset({"session", "pause"})
BREAK_STATES = frozenset({"break", "rest"})
OVERFLOW_STATES = frozenset({"session_end"})


def load_cfg(root: Path) -> dict[str, Any]:
    p = root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    return json.loads(p.read_text(encoding="utf-8"))


def discover_session_plist() -> Path | None:
    home = Path.home()
    gc = home / "Library" / "Group Containers"
    if not gc.is_dir():
        return None
    for name in gc.iterdir():
        if name.name.endswith("group.com.philipyoungg.translucent"):
            p = name / "Library" / "Preferences" / f"{name.name}.plist"
            if p.is_file():
                return p
    legacy = gc / "98JSB2MQB3.group.com.philipyoungg.translucent" / "Library" / "Preferences" / "98JSB2MQB3.group.com.philipyoungg.translucent.plist"
    return legacy if legacy.is_file() else None


def read_running_session() -> dict[str, Any] | None:
    plist_path = discover_session_plist()
    if not plist_path:
        return None
    with plist_path.open("rb") as f:
        data = plistlib.load(f)
    raw = data.get("RunningSession")
    if not raw:
        return None
    if isinstance(raw, bytes):
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None
    if isinstance(raw, dict):
        return raw
    return None


def peak_label(text: str) -> str | None:
    m = PEAK_LABEL_RE.search(text or "")
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip()


def parse_iso(ts: str, tz: zoneinfo.ZoneInfo) -> dt.datetime | None:
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(tz)
        return dt.datetime.fromisoformat(ts).astimezone(tz)
    except ValueError:
        return None


def slot_window(day: dt.date, slot: dict[str, Any], tz: zoneinfo.ZoneInfo) -> tuple[dt.datetime, dt.datetime]:
    sh, sm = map(int, slot["start"].split(":"))
    eh, em = map(int, slot["end"].split(":"))
    start = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=tz)
    end = dt.datetime.combine(day, dt.time(eh, em), tzinfo=tz)
    return start, end


def fingerprint_for_window(start: dt.datetime, end: dt.datetime) -> str:
    return f"{start.strftime('%A, %d %B %Y at %H:%M:%S')}^^{end.strftime('%A, %d %B %Y at %H:%M:%S')}"


def current_slot_from_config(cfg: dict[str, Any], now: dt.datetime) -> dict[str, Any] | None:
    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    now = now.astimezone(tz)
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    note_marker = cfg.get("note_marker") or "[DEX_RHYTHM]"
    template = cfg.get("day_template") or {}
    for slot in generate_day_slots(template):
        start, end = slot_window(now.date(), slot, tz)
        if start <= now < end:
            summary = f"{slot['label']} {marker}"
            return {
                "active": True,
                "kind": slot.get("kind"),
                "label": slot.get("label"),
                "summary": summary,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "duration_mins": max(1, int((end - start).total_seconds() // 60)),
                "notes": f"{note_marker} kind={slot.get('kind')} date={now.date().isoformat()} {slot['start']}-{slot['end']} {tz.key}",
                "fingerprint": fingerprint_for_window(start, end),
            }
    return None


def session_snapshot(raw: dict[str, Any] | None, tz: zoneinfo.ZoneInfo) -> dict[str, Any]:
    if not raw:
        return {"phase": "idle", "title": "", "state": "", "elapsed_min": 0}
    state = (raw.get("state") or "").strip()
    title = (raw.get("title") or "").strip()
    start = parse_iso(raw.get("start_date") or "", tz)
    now = dt.datetime.now(tz)
    elapsed = int((now - start).total_seconds() // 60) if start else 0
    dur_sec = int(raw.get("duration_second") or 0)
    planned_min = max(1, dur_sec // 60) if dur_sec else 0

    if state in BREAK_STATES:
        phase = "break"
    elif state in OVERFLOW_STATES:
        phase = "overflow"
    elif state in FOCUS_STATES:
        phase = "focus"
    elif state == "idle":
        phase = "idle"
    else:
        phase = "idle" if not title and not state else "other"

    return {
        "phase": phase,
        "state": state,
        "title": title,
        "peak_label": peak_label(title),
        "start": start.isoformat() if start else "",
        "elapsed_min": elapsed,
        "planned_min": planned_min,
    }


def delivery_confirmed(session: dict[str, Any], slot_label: str) -> bool:
    if session.get("phase") != "focus":
        return False
    sl = session.get("peak_label") or ""
    title = session.get("title") or ""
    if sl and slot_label and sl == slot_label:
        return True
    if slot_label and slot_label in title:
        return True
    # focus running — started even if title not parsed yet
    return session.get("state") == "session"


def should_skip_peak_start(root: Path, fingerprint: str, session: dict[str, Any], slot_label: str) -> bool:
    """Only skip if Session is actually on the current peak."""
    if delivery_confirmed(session, slot_label):
        return True
    state_path = root / "System/state/ultradian-rhythm-session-state.json"
    if not state_path.is_file():
        return False
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    if data.get("fired_fp") != fingerprint:
        return False
    # Never skip retry when Session is idle/break/wrong peak — delivered flag may be a false positive.
    return False


def decide(cfg: dict[str, Any], slot: dict[str, Any], session: dict[str, Any], root: Path) -> dict[str, Any]:
    sync = cfg.get("session_sync") or {}
    tz_name = cfg.get("timezone") or "Europe/Lisbon"
    kind = slot.get("kind")
    slot_label = slot.get("label") or ""
    fp = slot.get("fingerprint") or ""
    rem = remaining_slot_minutes(fp, tz_name) or slot.get("duration_mins") or 25

    sess_label = session.get("peak_label")
    phase = session.get("phase")
    elapsed = int(session.get("elapsed_min") or 0)
    planned = int(session.get("planned_min") or 0)

    base = {
        "slot_kind": kind,
        "slot_label": slot_label,
        "slot_summary": slot.get("summary") or "",
        "session_phase": phase,
        "session_title": session.get("title") or "",
        "session_peak_label": sess_label or "",
        "elapsed_min": elapsed,
        "duration_mins": rem,
        "fingerprint": fp,
    }

    if kind == "peak" and not sync.get("open_on_peak_start", True):
        return {**base, "action": "noop", "reason": "peak_sync_disabled"}

    if kind == "trough" and not sync.get("open_on_trough_start", True):
        return {**base, "action": "noop", "reason": "trough_sync_disabled"}

    if kind == "peak":
        if should_skip_peak_start(root, fp, session, slot_label):
            return {**base, "action": "noop", "reason": "current_peak_already_running"}
        if phase == "focus" and sess_label == slot_label:
            if planned and elapsed <= planned + 5:
                return {**base, "action": "noop", "reason": "current_peak_focus_in_plan"}
            if elapsed <= rem + 5:
                return {**base, "action": "noop", "reason": "current_peak_focus_in_slot"}
        if phase == "idle" or phase == "other":
            pre = ["abandon"] if (sess_label and sess_label != slot_label) or (session.get("title") and slot_label not in (session.get("title") or "")) else []
            return {**base, "action": "start_peak", "reason": "idle_during_peak", "pre": pre}
        if phase == "break":
            return {**base, "action": "start_peak", "reason": "break_during_peak", "pre": ["abandon"]}
        # overflow, focus on wrong/old peak, or stale long run
        return {
            **base,
            "action": "finish_start_peak",
            "reason": "stale_or_wrong_peak",
            "pre": ["abandon"] if phase == "overflow" else ["finish"],
        }

    # trough
    if phase in ("focus", "overflow"):
        return {
            **base,
            "action": "finish_break",
            "reason": "focus_during_trough",
            "pre": ["abandon"] if phase == "overflow" else ["finish"],
        }
    if phase == "break":
        return {**base, "action": "noop", "reason": "already_on_break"}
    return {**base, "action": "break", "reason": "idle_during_trough"}


def reconcile(root: Path, force: bool = False) -> dict[str, Any]:
    cfg = load_cfg(root)
    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    now = dt.datetime.now(tz)

    slot = current_slot_from_config(cfg, now)
    if not slot:
        return {"active": False, "reason": "no_current_slot", "now": now.isoformat()}

    raw = read_running_session()
    session = session_snapshot(raw, tz)
    decision = decide(cfg, slot, session, root)
    decision["active"] = True
    decision["now"] = now.isoformat()
    decision["force"] = force
    decision["screen_locked"] = is_screen_locked()

    if decision["screen_locked"] and not force:
        decision["action"] = "defer"
        decision["reason"] = "screen_locked"

    return decision


def verify_after_dispatch(root: Path, plan: dict[str, Any], wait_sec: float = 3.0) -> bool:
    import time

    action = plan.get("action") or ""
    if action not in ("start_peak", "finish_start_peak", "break", "finish_break"):
        return True
    time.sleep(wait_sec)
    cfg = load_cfg(root)
    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    session = session_snapshot(read_running_session(), tz)
    kind = plan.get("slot_kind")
    slot_label = plan.get("slot_label") or ""
    if kind == "peak" and action in ("start_peak", "finish_start_peak"):
        return delivery_confirmed(session, slot_label) or session.get("phase") == "focus"
    if kind == "trough" and action in ("break", "finish_break"):
        return session.get("phase") == "break"
    return True


def main() -> int:
    root = Path(sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--root" else (sys.argv[1] if len(sys.argv) > 1 else Path.cwd()))
    if len(sys.argv) > 1 and sys.argv[1] == "verify":
        import os

        root = Path(sys.argv[2] if len(sys.argv) > 2 else Path.cwd())
        plan = json.loads(os.environ.get("PLAN_JSON") or "{}")
        print("1" if verify_after_dispatch(root, plan) else "0")
        return 0
    force = "--force" in sys.argv
    print(json.dumps(reconcile(root, force=force), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
