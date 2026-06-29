#!/usr/bin/env python3
"""Daily Google Calendar instances for Human Garage 28 Day Reset (numbered titles)."""
from __future__ import annotations

import datetime as dt
import zoneinfo
from typing import Any

from brain_human_garage_reset import (
    EVENT_ID,
    day_number,
    description_with_day,
    display_title,
    load_state,
    total_days,
)
from brain_todoist_lib import slot_datetimes


def _daily_marker(note_marker: str, day: dt.date) -> str:
    return f"{note_marker} id={EVENT_ID} date={day.isoformat()}"


def list_human_garage_instances(service, cal_id: str, note_marker: str) -> list[dict]:
    needle = f"{note_marker} id={EVENT_ID} date="
    res = (
        service.events()
        .list(calendarId=cal_id, q=note_marker, singleEvents=True, maxResults=250)
        .execute()
    )
    out = []
    for ev in res.get("items") or []:
        desc = ev.get("description") or ""
        if needle in desc:
            out.append(ev)
    return out


def delete_recurring_human_garage_series(service, cal_id: str, note_marker: str) -> bool:
    """Remove weekly recurring series (legacy) for human-garage-28."""
    needle = f"{note_marker} id={EVENT_ID}"
    res = (
        service.events()
        .list(calendarId=cal_id, q=note_marker, singleEvents=False, maxResults=250)
        .execute()
    )
    deleted = False
    for ev in res.get("items") or []:
        desc = ev.get("description") or ""
        if needle not in desc or " date=" in desc:
            continue
        if ev.get("recurrence"):
            service.events().delete(calendarId=cal_id, eventId=ev["id"]).execute()
            deleted = True
    return deleted


def build_daily_body(
    ev: dict,
    cfg: dict,
    root,
    day: dt.date,
    tz: str,
) -> dict[str, Any]:
    note_marker = cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    title_marker = cfg.get("title_marker") or "[BRAIN]"
    start_dt, end_dt = slot_datetimes(day, ev, tz)
    title = f"{display_title(root, ev, day)} {title_marker}".strip()
    desc_lines = [
        description_with_day(root, ev, day),
        _daily_marker(note_marker, day),
    ]
    from brain_google_calendar_sync import reminders_for_bundle

    return {
        "summary": title,
        "description": "\n".join(line for line in desc_lines if line),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": tz},
        "colorId": str(cfg.get("event_color_id", "5")),
        "transparency": cfg.get("transparency", "opaque"),
        "reminders": reminders_for_bundle(cfg, ev.get("bundle")),
    }


def sync_human_garage_daily(
    service,
    cal_id: str,
    cfg: dict,
    root,
    *,
    horizon_days: int,
) -> dict[str, int | bool]:
    state = load_state(root)
    if not state or not state.get("start_date"):
        return {"skipped": True, "reason": "no_state"}

    ev = next((e for e in (cfg.get("events") or []) if e.get("id") == EVENT_ID), None)
    if not ev:
        return {"skipped": True, "reason": "no_event_config"}

    tz = cfg.get("timezone") or "Europe/Lisbon"
    z = zoneinfo.ZoneInfo(tz)
    today = dt.datetime.now(z).date()
    start = dt.date.fromisoformat(str(state["start_date"]))
    cap = total_days(state)
    end_program = start + dt.timedelta(days=cap - 1)
    horizon_end = today + dt.timedelta(days=max(1, horizon_days) - 1)
    last_day = min(end_program, horizon_end)

    note_marker = cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    removed_recurring = delete_recurring_human_garage_series(service, cal_id, note_marker)
    existing = {(_daily_marker(note_marker, _day_from_desc(ev))): ev for ev in list_human_garage_instances(service, cal_id, note_marker) if _day_from_desc(ev)}

    created = 0
    updated = 0
    skipped = 0

    d = max(today, start)
    while d <= last_day:
        if day_number(root, d) is None:
            d += dt.timedelta(days=1)
            continue
        body = build_daily_body(ev, cfg, root, d, tz)
        marker = _daily_marker(note_marker, d)
        inst = existing.get(marker)
        if inst:
            patch = {k: body[k] for k in ("summary", "description", "start", "end", "reminders")}
            if any(inst.get(k) != patch.get(k) for k in patch):
                service.events().patch(calendarId=cal_id, eventId=inst["id"], body=patch).execute()
                updated += 1
            else:
                skipped += 1
        else:
            service.events().insert(calendarId=cal_id, body=body).execute()
            created += 1
        d += dt.timedelta(days=1)

    return {
        "removed_recurring": removed_recurring,
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


def _day_from_desc(ev: dict) -> dt.date | None:
    for line in (ev.get("description") or "").splitlines():
        if " date=" in line and "id=human-garage-28" in line:
            part = line.split(" date=", 1)[1].strip()
            try:
                return dt.date.fromisoformat(part.split()[0])
            except ValueError:
                return None
    return None
