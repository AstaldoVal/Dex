#!/usr/bin/env python3
"""Compare planned ultradian peaks (config) with Session session_start/end (plan vs fact)."""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import zoneinfo
from pathlib import Path

DAY_KEYS = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}


def resolve_day_slots(sched: dict, key: str) -> list:
    raw = sched.get(key, [])
    if isinstance(raw, str):
        raw = sched.get(raw, [])
    if not isinstance(raw, list):
        return []
    return [s for s in raw if s.get("enabled", True) and s.get("kind", "peak") == "peak"]


def parse_ts(s: str, tz: zoneinfo.ZoneInfo) -> dt.datetime | None:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(tz)
        return dt.datetime.fromisoformat(s).astimezone(tz)
    except ValueError:
        return None


def load_session_intervals(log_path: Path, tz: zoneinfo.ZoneInfo) -> list[tuple[dt.datetime, dt.datetime, dict]]:
    if not log_path.is_file():
        return []
    starts: dict[str, dt.datetime] = {}
    intervals: list[tuple[dt.datetime, dt.datetime, dict]] = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        ev = row.get("event")
        ts = parse_ts(row.get("ts", ""), tz)
        if not ts:
            continue
        sid = row.get("session_id") or row.get("ts")
        if ev == "session_start":
            starts[sid] = ts
        elif ev in ("session_end", "stop_working"):
            st = starts.pop(sid, None)
            if st and ts > st:
                intervals.append((st, ts, row))
    return intervals


def overlap_mins(a0: dt.datetime, a1: dt.datetime, b0: dt.datetime, b1: dt.datetime) -> int:
    start = max(a0, b0)
    end = min(a1, b1)
    if end <= start:
        return 0
    return int((end - start).total_seconds() // 60)


def planned_peaks_for_day(cfg: dict, day: dt.date, tz: zoneinfo.ZoneInfo) -> list[dict]:
    template = cfg.get("day_template")
    if template:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from ultradian_slot_generator import generate_day_slots

        peaks = []
        for slot in generate_day_slots(template):
            if slot.get("kind") != "peak":
                continue
            start_s, end_s = slot.get("start", ""), slot.get("end", "")
            sh, sm = map(int, start_s.split(":"))
            eh, em = map(int, end_s.split(":"))
            start = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=tz)
            end = dt.datetime.combine(day, dt.time(eh, em), tzinfo=tz)
            if end <= start:
                continue
            label = slot.get("label") or "Пик"
            peaks.append(
                {
                    "title": f"{label} {cfg.get('title_marker', '[DEX-RHYTHM]')}",
                    "start": start,
                    "end": end,
                }
            )
        return peaks

    sched = cfg.get("weekday_slots", {})
    key = DAY_KEYS[day.weekday()]
    peaks = []
    for slot in resolve_day_slots(sched, key):
        start_s, end_s = slot.get("start", ""), slot.get("end", "")
        if not start_s or not end_s:
            continue
        sh, sm = map(int, start_s.split(":"))
        eh, em = map(int, end_s.split(":"))
        start = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=tz)
        end = dt.datetime.combine(day, dt.time(eh, em), tzinfo=tz)
        if end <= start:
            continue
        label = slot.get("label") or "Пик"
        peaks.append({"title": f"{label} {cfg.get('title_marker', '[DEX-RHYTHM]')}", "start": start, "end": end})
    return peaks


def classify_peak(
    peak: dict, intervals: list[tuple[dt.datetime, dt.datetime, dict]]
) -> dict:
    p0, p1 = peak["start"], peak["end"]
    planned_m = int((p1 - p0).total_seconds() // 60)
    best = None
    best_overlap = 0
    for s0, s1, _meta in intervals:
        ov = overlap_mins(p0, p1, s0, s1)
        if ov > best_overlap:
            best_overlap = ov
            best = (s0, s1)
    if best is None or best_overlap < 5:
        status = "пропуск"
        detail = "Session в окне пика не было (перекрытие меньше 5 мин)"
    elif best_overlap >= planned_m * 0.5:
        status = "совпало"
        detail = (
            f"Session {best[0].strftime('%H:%M')}–{best[1].strftime('%H:%M')}, "
            f"перекрытие {best_overlap} мин из {planned_m}"
        )
    else:
        status = "частично"
        detail = (
            f"Session {best[0].strftime('%H:%M')}–{best[1].strftime('%H:%M')}, "
            f"перекрытие {best_overlap} мин из {planned_m}"
        )
    return {
        "title": peak["title"],
        "planned": f"{p0.strftime('%H:%M')}–{p1.strftime('%H:%M')}",
        "status": status,
        "detail": detail,
    }


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    cfg_path = root / "05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"
    session_log = root / "System/Pomodoro/session-events.jsonl"
    out_dir = root / "05-Areas/Cognitive_Performance/rhythm-reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    tz = zoneinfo.ZoneInfo(cfg.get("timezone") or "Europe/Lisbon")
    cal_name = cfg.get("google_calendar_summary") or cfg.get("calendar_app_name") or ""

    today = dt.datetime.now(tz).date()
    intervals = load_session_intervals(session_log, tz)

    lines = [
        "# Ultradian: план vs факт",
        "",
        f"Период: последние {days} дн. (до {today.isoformat()}).",
        f"План: слоты из `ultradian-rhythm-config.json` (те же, что в Календаре `{cal_name}`).",
        f"Факт: `System/Pomodoro/session-events.jsonl`.",
        "",
    ]

    stats: dict[str, int] = {}

    for i in range(days - 1, -1, -1):
        d = today - dt.timedelta(days=i)
        peaks = planned_peaks_for_day(cfg, d, tz)
        if not peaks:
            continue
        lines.append(f"## {d.isoformat()}")
        for peak in peaks:
            row = classify_peak(peak, intervals)
            stats[row["status"]] = stats.get(row["status"], 0) + 1
            lines.append(
                f"- **{row['title']}** ({row['planned']}): **{row['status']}** — {row['detail']}"
            )
        lines.append("")

    lines.extend(
        [
            "## Сводка",
            "",
            f"- Совпало: {stats.get('совпало', 0)}",
            f"- Частично: {stats.get('частично', 0)}",
            f"- Пропуск: {stats.get('пропуск', 0)}",
            "",
            "Если много **пропуск** на одном и том же пике — подстрой `day_template` в конфиге и снова `npm run cognitive:ultradian-calendar-sync`.",
        ]
    )

    report_path = out_dir / f"{today.isoformat()}.md"
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {"report": str(report_path.relative_to(root)), "stats": stats},
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
