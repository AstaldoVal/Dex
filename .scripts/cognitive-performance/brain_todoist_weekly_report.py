#!/usr/bin/env python3
"""Weekly Brain Protocol miss/completion report from completion log."""
from __future__ import annotations

import datetime as dt
import json
import sys
import zoneinfo
from collections import Counter, defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from brain_todoist_lib import (  # noqa: E402
    events_for_date,
    load_brain_cfg,
    load_completion_log,
    repo_root,
)


def parse_end_day(argv: list[str], tz_name: str) -> dt.date:
    for i, arg in enumerate(argv):
        if arg == "--end" and i + 1 < len(argv):
            return dt.date.fromisoformat(argv[i + 1])
    return dt.datetime.now(zoneinfo.ZoneInfo(tz_name)).date()


def main() -> int:
    root = repo_root()
    brain_cfg = load_brain_cfg(root)
    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    end = parse_end_day(sys.argv, tz_name)
    days = 7
    for i, arg in enumerate(sys.argv):
        if arg == "--days" and i + 1 < len(sys.argv):
            days = max(1, int(sys.argv[i + 1]))
    start = end - dt.timedelta(days=days - 1)

    titles = {
        str(ev.get("id") or ""): str(ev.get("title") or ev.get("id") or "")
        for ev in brain_cfg.get("events") or []
    }

    planned_by_event: Counter[str] = Counter()
    for offset in range(days):
        day = start + dt.timedelta(days=offset)
        for ev in events_for_date(brain_cfg, day, for_todoist=True):
            planned_by_event[str(ev.get("id") or "")] += 1

    completed_by_event: Counter[str] = Counter()
    missed_by_event: Counter[str] = Counter()
    missed_days: dict[str, list[str]] = defaultdict(list)

    for row in load_completion_log(root):
        day_str = row.get("date") or ""
        try:
            day = dt.date.fromisoformat(day_str)
        except ValueError:
            continue
        if day < start or day > end:
            continue
        eid = str(row.get("event_id") or "")
        status = str(row.get("status") or "")
        if not eid or eid.startswith("_"):
            continue
        if status == "completed":
            completed_by_event[eid] += 1
        elif status == "missed":
            missed_by_event[eid] += 1
            missed_days[eid].append(day_str)

    rows = []
    for eid, planned in planned_by_event.items():
        completed = completed_by_event.get(eid, 0)
        missed = missed_by_event.get(eid, 0)
        rows.append(
            {
                "event_id": eid,
                "title": titles.get(eid, eid),
                "planned_days": planned,
                "completed": completed,
                "missed": missed,
                "miss_rate": round(missed / planned, 2) if planned else 0.0,
                "missed_on": sorted(missed_days.get(eid, [])),
            }
        )
    rows.sort(key=lambda r: (-r["missed"], -r["miss_rate"], r["title"]))

    total_planned = sum(planned_by_event.values())
    total_completed = sum(completed_by_event.values())
    total_missed = sum(missed_by_event.values())

    report = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "total_planned": total_planned,
        "total_completed": total_completed,
        "total_missed": total_missed,
        "items": rows,
    }

    out_path = root / "05-Areas/Cognitive_Performance/brain-weekly-report.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if "--json" in sys.argv:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"Brain Protocol {start.isoformat()} — {end.isoformat()}")
    print(f"Выполнено: {total_completed}/{total_planned} · пропусков: {total_missed}")
    if rows:
        print("\nЧаще всего пропускалось:")
        for row in rows[:8]:
            if row["missed"]:
                print(
                    f"  · {row['title']}: {row['missed']}/{row['planned_days']} "
                    f"({int(row['miss_rate'] * 100)}%)"
                )
    print(f"\nJSON: {out_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
