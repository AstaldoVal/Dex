#!/usr/bin/env python3
"""
Sync ultradian slots to a dedicated Google Calendar «DEX-RHYTHM» (not personal primary).

Creates calendar if missing (distinct color), fills 08:00–23:00 peak/trough grid per day,
optional cleanup of mistaken events on primary calendar.

Default (--auto): keep horizon_weeks ahead; extend when fewer than extend_when_below_days remain.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import zoneinfo
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(ROOT / "core" / "mcp"))

from googleapiclient.errors import HttpError  # noqa: E402
from google_calendar_server import _service  # noqa: E402
from ultradian_slot_generator import generate_day_slots  # noqa: E402


def load_cfg(root: Path) -> dict:
    p = root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_cfg(root: Path, cfg: dict) -> None:
    p = root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    with open(p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def gcal_sync_settings(cfg: dict) -> dict[str, Any]:
    gs = cfg.get("google_calendar_sync") or {}
    return {
        "horizon_weeks": int(gs.get("horizon_weeks", 8)),
        "extend_when_below_days": int(gs.get("extend_when_below_days", 21)),
        "auto_extend_enabled": bool(gs.get("auto_extend_enabled", True)),
        "maintenance_days": int(gs.get("maintenance_days", 7)),
        "cleanup_primary": bool(gs.get("cleanup_primary", True)),
    }


def ensure_dex_rhythm_calendar(service, cfg: dict) -> str:
    cal_id = cfg.get("google_calendar_id")
    summary = cfg.get("google_calendar_summary") or "DEX-RHYTHM"
    if cal_id:
        return cal_id

    items = service.calendarList().list().execute().get("items") or []
    for c in items:
        if (c.get("summary") or "").strip() == summary:
            cfg["google_calendar_id"] = c.get("id")
            return c.get("id")

    body = {"summary": summary, "timeZone": cfg.get("timezone") or "Europe/Lisbon"}
    created = service.calendars().insert(body=body).execute()
    cal_id = created["id"]

    list_body = {
        "id": cal_id,
        "backgroundColor": cfg.get("calendar_color_background") or "#33b679",
        "foregroundColor": cfg.get("calendar_color_foreground") or "#ffffff",
        "selected": True,
    }
    service.calendarList().insert(body=list_body).execute()
    cfg["google_calendar_id"] = cal_id
    return cal_id


def _event_start_date(ev: dict, tz: str) -> dt.date | None:
    start = ev.get("start") or {}
    raw = start.get("dateTime") or start.get("date") or ""
    if not raw:
        return None
    try:
        if "T" in raw:
            parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return parsed.astimezone(zoneinfo.ZoneInfo(tz)).date()
        return dt.date.fromisoformat(raw[:10])
    except ValueError:
        return None


def furthest_covered_date(service, cal_id: str, marker: str, tz: str, today: dt.date) -> dt.date | None:
    """Latest local date with any DEX-RHYTHM marker event."""
    z = zoneinfo.ZoneInfo(tz)
    time_min = dt.datetime.combine(today, dt.time.min, tzinfo=z).isoformat()
    time_max = dt.datetime.combine(today + dt.timedelta(days=400), dt.time.min, tzinfo=z).isoformat()
    furthest: dt.date | None = None
    page_token: str | None = None
    while True:
        res = gcal_call(
            lambda pt=page_token: service.events()
            .list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                q=marker,
                maxResults=2500,
                pageToken=pt,
            )
            .execute()
        )
        for ev in res.get("items") or []:
            summary = ev.get("summary") or ""
            if marker not in summary:
                continue
            d = _event_start_date(ev, tz)
            if d and (furthest is None or d > furthest):
                furthest = d
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    return furthest


def resolve_horizon_days(
    cfg: dict,
    service,
    cal_id: str,
    tz: str,
    today: dt.date,
    *,
    explicit_days: int | None,
    auto: bool,
) -> tuple[int, dict[str, Any]]:
    settings = gcal_sync_settings(cfg)
    target_days = settings["horizon_weeks"] * 7
    target_end = today + dt.timedelta(days=target_days)

    if explicit_days is not None and not auto:
        return explicit_days, {
            "mode": "explicit",
            "horizon_weeks": settings["horizon_weeks"],
            "target_end": target_end.isoformat(),
        }

    furthest = furthest_covered_date(service, cal_id, cfg.get("title_marker") or "[DEX-RHYTHM]", tz, today)
    meta: dict[str, Any] = {
        "mode": "auto",
        "horizon_weeks": settings["horizon_weeks"],
        "target_end": target_end.isoformat(),
        "furthest_covered": furthest.isoformat() if furthest else None,
    }

    if furthest is None:
        meta["reason"] = "initial_fill"
        return target_days, meta

    remaining = (furthest - today).days
    meta["remaining_days"] = remaining

    if settings["auto_extend_enabled"] and furthest < target_end:
        meta["reason"] = "extend_horizon"
        meta["days_short_of_target"] = (target_end - furthest).days
        return target_days, meta

    if settings["auto_extend_enabled"] and remaining < settings["extend_when_below_days"]:
        meta["reason"] = "extend_horizon"
        return target_days, meta

    meta["reason"] = "maintenance"
    return min(settings["maintenance_days"], target_days), meta


def gcal_call(fn, retries: int = 5):
    for attempt in range(retries):
        try:
            return fn()
        except HttpError as e:
            if e.resp.status in (403, 429) and attempt < retries - 1:
                time.sleep(min(30, 2 ** attempt))
                continue
            raise


def event_exists(service, cal_id: str, day: dt.date, title: str, start_hm: str, tz: str) -> bool:
    time_min = dt.datetime.combine(day, dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)).isoformat()
    time_max = dt.datetime.combine(
        day + dt.timedelta(days=1), dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)
    ).isoformat()
    res = gcal_call(
        lambda: service.events()
        .list(
            calendarId=cal_id,
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            q=title,
        )
        .execute()
    )
    sh, sm = map(int, start_hm.split(":"))
    for ev in res.get("items") or []:
        if (ev.get("summary") or "").strip() != title:
            continue
        start = ev.get("start", {}).get("dateTime") or ""
        if start and f"T{sh:02d}:{sm:02d}" in start:
            return True
    return False


def day_slot_keys(service, cal_id: str, day: dt.date, marker: str, tz: str) -> set[str]:
    """Existing slots on one day: 'title|HH:MM'. One API list per day."""
    z = zoneinfo.ZoneInfo(tz)
    time_min = dt.datetime.combine(day, dt.time.min, tzinfo=z).isoformat()
    time_max = dt.datetime.combine(day + dt.timedelta(days=1), dt.time.min, tzinfo=z).isoformat()
    res = gcal_call(
        lambda: service.events()
        .list(
            calendarId=cal_id,
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            q=marker,
            maxResults=250,
        )
        .execute()
    )
    keys: set[str] = set()
    for ev in res.get("items") or []:
        summary = (ev.get("summary") or "").strip()
        if marker not in summary:
            continue
        start = ev.get("start", {}).get("dateTime") or ""
        if "T" in start:
            hm = start.split("T", 1)[1][:5]
            keys.add(f"{summary}|{hm}")
    return keys


def day_is_complete(existing: set[str], slots: list[dict], marker: str) -> bool:
    for slot in slots:
        title = f"{slot['label']} {marker}"
        if f"{title}|{slot['start']}" not in existing:
            return False
    return True


def sync_start_offset(
    today: dt.date,
    furthest: dt.date | None,
    days: int,
    service,
    cal_id: str,
    marker: str,
    tz: str,
    slots: list[dict],
    mode: str,
) -> int:
    """Skip leading days that already have a full grid (extend/maintenance)."""
    if furthest is None or mode == "initial_fill":
        return 0
    if mode == "extend_horizon":
        # Re-check from last covered day (partial day possible).
        start = max(0, (furthest - today).days)
        return min(start, days - 1) if days else 0
    # maintenance: only scan maintenance window from today
    return 0


def create_event(
    service,
    cal_id: str,
    day: dt.date,
    slot: dict,
    cfg: dict,
    tz: str,
) -> None:
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    note_marker = cfg.get("note_marker") or "[DEX_RHYTHM]"
    template = cfg.get("day_template") or {}
    title = f"{slot['label']} {marker}"
    sh, sm = map(int, slot["start"].split(":"))
    eh, em = map(int, slot["end"].split(":"))
    z = zoneinfo.ZoneInfo(tz)
    start_dt = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=z)
    end_dt = dt.datetime.combine(day, dt.time(eh, em), tzinfo=z)
    color = (
        template.get("peak_event_color_id", "6")
        if slot.get("kind") == "peak"
        else template.get("trough_event_color_id", "8")
    )
    transparency = (
        template.get("peak_transparency", "transparent")
        if slot.get("kind") == "peak"
        else template.get("trough_transparency", "transparent")
    )
    reminders = (
        template.get("peak_reminders", {"useDefault": False, "overrides": []})
        if slot.get("kind") == "peak"
        else {"useDefault": False, "overrides": []}
    )
    body = {
        "summary": title,
        "description": (
            f"{note_marker} kind={slot.get('kind')} date={day.isoformat()} "
            f"{slot['start']}-{slot['end']} {tz}"
        ),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz},
        "colorId": str(color),
        "transparency": transparency,
        "reminders": reminders,
    }
    gcal_call(lambda: service.events().insert(calendarId=cal_id, body=body).execute())


def cleanup_primary(service, cfg: dict, days: int, tz: str) -> int:
    if not gcal_sync_settings(cfg)["cleanup_primary"]:
        return 0
    primary = cfg.get("cleanup_primary_calendar_id") or "primary"
    patterns = cfg.get("cleanup_title_patterns") or ["[DEX-RHYTHM]", "Deep Work [DEX]"]
    today = dt.datetime.now(zoneinfo.ZoneInfo(tz)).date()
    deleted = 0
    for i in range(days):
        d = today + dt.timedelta(days=i)
        time_min = dt.datetime.combine(d, dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)).isoformat()
        time_max = dt.datetime.combine(
            d + dt.timedelta(days=1), dt.time.min, tzinfo=zoneinfo.ZoneInfo(tz)
        ).isoformat()
        res = (
            service.events()
            .list(calendarId=primary, timeMin=time_min, timeMax=time_max, singleEvents=True)
            .execute()
        )
        for ev in res.get("items") or []:
            summary = ev.get("summary") or ""
            if not any(p in summary for p in patterns):
                continue
            eid = ev.get("id")
            if eid:
                service.events().delete(calendarId=primary, eventId=eid).execute()
                deleted += 1
    return deleted


def parse_cli(argv: list[str]) -> tuple[Path, bool, int | None, bool]:
    args = [a for a in argv if a]
    root = Path.cwd()
    auto = True
    explicit_days: int | None = None
    do_cleanup = True
    positional: list[str] = []
    for a in args:
        if a == "--auto":
            auto = True
        elif a == "--no-auto":
            auto = False
        elif a == "--no-cleanup-primary":
            do_cleanup = False
        elif a.isdigit():
            explicit_days = int(a)
            auto = False
        elif not a.startswith("-"):
            positional.append(a)
    if positional:
        root = Path(positional[0])
    if len(positional) > 1 and positional[1].isdigit():
        explicit_days = int(positional[1])
        auto = False
    return root, auto, explicit_days, do_cleanup


def main() -> int:
    root, auto, explicit_days, do_cleanup = parse_cli(sys.argv[1:])
    if explicit_days is None and not auto:
        explicit_days = 7

    cfg = load_cfg(root)
    tz = cfg.get("timezone") or "Europe/Lisbon"
    template = cfg.get("day_template") or {}
    log_path = root / "System/logs/ultradian-google-calendar-sync.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    service = _service()
    cal_id = ensure_dex_rhythm_calendar(service, cfg)
    save_cfg(root, cfg)

    today = dt.datetime.now(zoneinfo.ZoneInfo(tz)).date()
    days, horizon_meta = resolve_horizon_days(
        cfg, service, cal_id, tz, today, explicit_days=explicit_days, auto=auto
    )

    slots_per_day = generate_day_slots(template)
    marker = cfg.get("title_marker") or "[DEX-RHYTHM]"
    created = 0
    skipped = 0
    errors = 0

    furthest_before: dt.date | None = None
    if horizon_meta.get("furthest_covered"):
        furthest_before = dt.date.fromisoformat(horizon_meta["furthest_covered"])

    start_i = sync_start_offset(
        today,
        furthest_before,
        days,
        service,
        cal_id,
        marker,
        tz,
        slots_per_day,
        horizon_meta.get("reason") or "initial_fill",
    )

    for i in range(start_i, days):
        d = today + dt.timedelta(days=i)
        if template.get("enabled_all_weekdays", True) is False:
            continue
        try:
            existing = day_slot_keys(service, cal_id, d, marker, tz)
        except Exception as e:
            errors += len(slots_per_day)
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(f"fail list {d.isoformat()}: {e}\n")
            continue
        if day_is_complete(existing, slots_per_day, marker):
            skipped += len(slots_per_day)
            continue
        for slot in slots_per_day:
            title = f"{slot['label']} {marker}"
            key = f"{title}|{slot['start']}"
            if key in existing:
                skipped += 1
                continue
            try:
                create_event(service, cal_id, d, slot, cfg, tz)
                created += 1
                time.sleep(0.12)
            except Exception as e:
                errors += 1
                with open(log_path, "a", encoding="utf-8") as log:
                    log.write(f"fail {d.isoformat()} {title}: {e}\n")

    removed = 0
    if do_cleanup:
        try:
            removed = cleanup_primary(service, cfg, min(days, 14), tz)
        except Exception as e:
            errors += 1
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(f"cleanup fail: {e}\n")

    furthest_after = furthest_covered_date(
        service, cal_id, cfg.get("title_marker") or "[DEX-RHYTHM]", tz, today
    )

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = {
        "calendar_id": cal_id,
        "calendar_summary": cfg.get("google_calendar_summary"),
        "horizon_days": days,
        "horizon_meta": horizon_meta,
        "sync_start_day_offset": start_i,
        "furthest_covered_after": furthest_after.isoformat() if furthest_after else None,
        "slots_per_day": len(slots_per_day),
        "created": created,
        "skipped_existing": skipped,
        "removed_from_primary": removed,
        "errors": errors,
    }
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{stamp} {json.dumps(report, ensure_ascii=False)}\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
