#!/usr/bin/env python3
"""Generate ultradian peak/trough slots for one day (08:00–23:00 by default)."""
from __future__ import annotations

import datetime as dt
from typing import Any


def _t(h: int, m: int = 0) -> dt.time:
    return dt.time(h, m)


def _fmt(t: dt.time) -> str:
    return t.strftime("%H:%M")


def _add(t: dt.time, minutes: int) -> dt.time:
    base = dt.datetime.combine(dt.date(2000, 1, 1), t)
    return (base + dt.timedelta(minutes=minutes)).time()


def _le(a: dt.time, b: dt.time) -> bool:
    return dt.datetime.combine(dt.date(2000, 1, 1), a) <= dt.datetime.combine(
        dt.date(2000, 1, 1), b
    )


def generate_day_slots(template: dict[str, Any]) -> list[dict[str, Any]]:
    sh, sm = map(int, (template.get("day_start") or "08:00").split(":"))
    eh, em = map(int, (template.get("day_end") or "23:00").split(":"))
    day_end = _t(eh, em)
    warmup = int(template.get("warmup_minutes", 15))
    peak_m = int(template.get("peak_minutes", 90))
    trough_m = int(template.get("trough_minutes", 20))
    lunch_start_s = template.get("extended_lunch_start")
    lunch_m = int(template.get("extended_lunch_minutes", 0))
    lunch_start = None
    if lunch_start_s:
        lh, lm = map(int, lunch_start_s.split(":"))
        lunch_start = _t(lh, lm)

    cursor = _t(sh, sm)
    out: list[dict[str, Any]] = []
    peak_n = 0
    trough_n = 0
    lunch_done = False

    if warmup > 0:
        w_end = _add(cursor, warmup)
        if _le(w_end, day_end):
            out.append(
                {
                    "kind": "trough",
                    "label": "Разогрев",
                    "start": _fmt(cursor),
                    "end": _fmt(w_end),
                    "enabled": True,
                }
            )
            cursor = w_end

    while _le(cursor, day_end):
        peak_end = _add(cursor, peak_m)
        if not _le(peak_end, day_end):
            if cursor < day_end:
                out.append(
                    {
                        "kind": "trough",
                        "label": "Спад",
                        "start": _fmt(cursor),
                        "end": _fmt(day_end),
                        "enabled": True,
                    }
                )
            break

        peak_n += 1
        out.append(
            {
                "kind": "peak",
                "label": f"Пик {peak_n}",
                "start": _fmt(cursor),
                "end": _fmt(peak_end),
                "enabled": True,
            }
        )
        cursor = peak_end
        if cursor >= day_end:
            break

        if (
            lunch_start
            and lunch_m > 0
            and not lunch_done
            and _le(lunch_start, cursor)
        ):
            lunch_end = _add(lunch_start, lunch_m)
            if _le(lunch_end, day_end):
                out.append(
                    {
                        "kind": "trough",
                        "label": "Обед",
                        "start": _fmt(lunch_start),
                        "end": _fmt(lunch_end),
                        "enabled": True,
                    }
                )
                cursor = lunch_end
                lunch_done = True
                continue

        trough_end = _add(cursor, trough_m)
        if not _le(trough_end, day_end):
            if cursor < day_end:
                out.append(
                    {
                        "kind": "trough",
                        "label": "Спад",
                        "start": _fmt(cursor),
                        "end": _fmt(day_end),
                        "enabled": True,
                    }
                )
            break

        trough_n += 1
        out.append(
            {
                "kind": "trough",
                "label": f"Провал {trough_n}",
                "start": _fmt(cursor),
                "end": _fmt(trough_end),
                "enabled": True,
            }
        )
        cursor = trough_end

    return out
