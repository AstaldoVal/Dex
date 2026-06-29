#!/usr/bin/env python3
"""
Export Granola meetings from local cache (cache-v6.json preferred) for a calendar month,
write markdown notes into the vault, and correlate with a Google Calendar JSON export.

Calendar JSON format: same as gcal_get_events MCP output:
  {"success": true, "events": [{"title": "...", "start": "YYYY-MM-DD HH:MM", ...}, ...]}

Usage (from repo root):
  python3 .scripts/meeting-intel/granola_export_month.py \\
    --year-month 2026-04 \\
    --calendar-json /path/to/gcal.json \\
    --vault .
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def granola_cache_paths() -> List[Path]:
    home = Path.home()
    base = home / "Library/Application Support/Granola"
    return [
        base / "cache-v6.json",
        base / "cache-v4.json",
        base / "cache-v3.json",
    ]


def load_granola_cache() -> Tuple[Dict[str, Any], Path]:
    for p in granola_cache_paths():
        if p.is_file():
            wrapper = json.loads(p.read_text(encoding="utf-8"))
            c = wrapper.get("cache")
            if isinstance(c, str):
                c = json.loads(c)
            return c, p
    raise FileNotFoundError("No Granola cache found (tried cache-v6/v4/v3.json)")


def parse_doc_datetime(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def month_range(ym: str) -> Tuple[date, date]:
    y, m = ym.split("-")
    y_i, m_i = int(y), int(m)
    start = date(y_i, m_i, 1)
    if m_i == 12:
        end = date(y_i + 1, 1, 1)
    else:
        end = date(y_i, m_i + 1, 1)
    return start, end - timedelta(days=1)


def gce_start(doc: Dict[str, Any]) -> Optional[datetime]:
    gce = doc.get("google_calendar_event") or {}
    if not isinstance(gce, dict):
        return None
    st = gce.get("start") or {}
    if not isinstance(st, dict):
        return None
    dt = st.get("dateTime") or st.get("date")
    if not dt:
        return None
    if "T" not in dt:
        return datetime.fromisoformat(dt).replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(dt.replace("Z", "+00:00"))


def flatten_transcript(transcripts: Any, doc_id: str) -> str:
    entries = transcripts.get(doc_id) or []
    if not isinstance(entries, list):
        return ""
    pieces = []
    for t in sorted(entries, key=lambda x: x.get("start_timestamp") or ""):
        txt = (t or {}).get("text")
        if txt:
            pieces.append(str(txt))
    return " ".join(pieces).replace("\n", " ").strip()


def slugify(title: str, max_len: int = 72) -> str:
    s = title.lower()
    s = re.sub(r"[^a-z0-9\u0400-\u04ff]+", "-", s, flags=re.I)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s or "meeting")[:max_len]


def parse_cal_event_start(s: str) -> datetime:
    """MCP returns 'YYYY-MM-DD HH:MM' without tz; treat as local wall time."""
    return datetime.strptime(s.strip(), "%Y-%m-%d %H:%M").replace(tzinfo=None)


def load_calendar_events(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("events") or [])


def best_calendar_match(
    g_start: Optional[datetime],
    cal_events: List[Dict[str, Any]],
    window_minutes: int = 12,
    preferred_title: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not g_start or not cal_events:
        return None
    # Compare in naive local wall clock: drop tz from g_start for comparison
    g = g_start.replace(tzinfo=None) if g_start.tzinfo else g_start
    candidates: List[Tuple[float, Dict[str, Any]]] = []
    win = timedelta(minutes=window_minutes)
    for ev in cal_events:
        try:
            cs = parse_cal_event_start(ev["start"])
        except Exception:
            continue
        delta = abs((g - cs).total_seconds())
        if delta > win.total_seconds():
            continue
        candidates.append((delta, ev))

    if not candidates:
        return None

    if preferred_title:
        pt = preferred_title.strip()
        for delta, ev in sorted(candidates, key=lambda x: x[0]):
            if (ev.get("title") or "").strip() == pt:
                return ev

    return min(candidates, key=lambda x: x[0])[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year-month", required=True, help="YYYY-MM")
    ap.add_argument("--calendar-json", type=Path, required=True)
    ap.add_argument("--vault", type=Path, default=Path("."))
    ap.add_argument("--window-minutes", type=int, default=12)
    args = ap.parse_args()
    vault = args.vault.expanduser().resolve()

    start_d, end_d = month_range(args.year_month)
    cache, cache_path = load_granola_cache()
    state = cache.get("state") or {}
    documents: Dict[str, Any] = dict(state.get("documents") or {})
    transcripts = dict(state.get("transcripts") or {})

    cal_events = load_calendar_events(args.calendar_json.expanduser().resolve())

    out_root = vault / "00-Inbox" / "Meetings" / f"Granola-{args.year_month}"
    out_root.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, Any]] = []

    for doc_id, doc in documents.items():
        if doc.get("type") != "meeting":
            continue
        if doc.get("deleted_at"):
            continue
        ca = doc.get("created_at")
        if not ca:
            continue
        created = parse_doc_datetime(ca)
        created_local = created.astimezone() if created.tzinfo else created
        if not (start_d <= created_local.date() <= end_d):
            continue

        title = (doc.get("title") or "Untitled").strip()
        g_start = gce_start(doc)
        gce = doc.get("google_calendar_event") if isinstance(doc.get("google_calendar_event"), dict) else {}
        gce_summary = gce.get("summary") if gce else None
        gce_id = gce.get("id") if gce else None

        match = best_calendar_match(
            g_start,
            cal_events,
            window_minutes=args.window_minutes,
            preferred_title=gce_summary,
        )
        cal_title = match.get("title") if match else None
        cal_start = match.get("start") if match else None

        notes_md = (doc.get("notes_markdown") or "").strip()
        trans = flatten_transcript(transcripts, doc_id)

        day_key = (g_start or created_local).strftime("%Y-%m-%d")
        slug = slugify(title)
        fname = f"{day_key}--{slug}--{doc_id[:8]}.md"
        fpath = (out_root / fname).resolve()

        fm = {
            "granola_id": doc_id,
            "granola_title": title,
            "granola_created_at": doc.get("created_at"),
            "source": "granola-local-cache",
            "granola_cache_file": str(cache_path),
            "google_calendar_event_id": gce_id,
            "google_calendar_event_summary": gce_summary,
            "calendar_primary_match_title": cal_title,
            "calendar_primary_match_start": cal_start,
            "exported_at": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        }
        lines = ["---\n"]
        for k, v in fm.items():
            if v is None:
                continue
            if isinstance(v, str) and "\n" in v:
                continue
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}\n")
        lines.append("---\n")

        body = [f"# {title}\n\n"]
        if notes_md:
            body.append("## Granola notes\n\n")
            body.append(notes_md)
            body.append("\n\n")
        if trans:
            body.append("## Transcript (from Granola cache)\n\n")
            body.append(trans)
            body.append("\n")

        fpath.write_text("".join(lines) + "".join(body), encoding="utf-8")

        rows.append(
            {
                "sort_key": (g_start or created_local).isoformat(),
                "granola_title": title,
                "granola_day": day_key,
                "gce_summary": gce_summary,
                "gce_start": g_start.isoformat() if g_start else None,
                "calendar_match_title": cal_title,
                "calendar_match_start": cal_start,
                "titles_differ": bool(cal_title and cal_title.strip() != title.strip()),
                "no_calendar_match": cal_title is None,
                "file": str(fpath.relative_to(vault)),
            }
        )

    rows.sort(key=lambda r: r["sort_key"])

    index_path = out_root.resolve() / "_INDEX.md"
    corr_path = vault / "System" / "Granola_April_2026_calendar_correlation.md"

    lines = [
        f"# Granola export {args.year_month}\n",
        f"- Source cache: `{cache_path}`\n",
        f"- Meetings written: {len(rows)}\n",
        f"- Output folder: `{out_root.resolve().relative_to(vault)}`\n",
        "\n## Sorted list (Granola titles)\n\n",
    ]
    for r in rows:
        lines.append(f"- **{r['granola_day']}** — {r['granola_title']}\n")
        lines.append(f"  - File: `{r['file']}`\n")

    index_path.write_text("".join(lines), encoding="utf-8")

    corr = [
        "# Granola × Google Calendar (primary), April 2026\n",
        "\nGranola titles come from the local Granola cache export. Calendar titles from `gcal_get_events` (primary) for 2026-04-01 … 2026-04-30.\n",
        "\nMatching rule: take `google_calendar_event.start` when present, else note creation time; pick the primary calendar event whose start is within ±12 minutes (same local wall clock as MCP `start` strings).\n",
        "\n## Rows where titles differ (needs rename decision)\n\n",
    ]
    mism = [r for r in rows if r["titles_differ"]]
    if not mism:
        corr.append("- (none in this export window)\n")
    else:
        for r in mism:
            corr.append(f"- **Granola:** {r['granola_title']}\n")
            corr.append(f"  - **Calendar (primary):** {r['calendar_match_title']}\n")
            corr.append(f"  - **Start used for match:** {r['gce_start'] or r['sort_key']}\n")
            corr.append(f"  - **Note file:** `{r['file']}`\n\n")

    corr.append("\n## Rows with no calendar match in ±12 minutes\n\n")
    nom = [r for r in rows if r["no_calendar_match"]]
    if not nom:
        corr.append("- (none)\n")
    else:
        for r in nom:
            corr.append(f"- **Granola:** {r['granola_title']}\n")
            corr.append(f"  - **GCE start (if any):** {r['gce_start'] or '—'}\n")
            corr.append(f"  - **Note file:** `{r['file']}`\n\n")

    corr.append("\n## All meetings (chronological by event/created time)\n\n")
    for r in rows:
        cal = r["calendar_match_title"] or "—"
        flag = "DIFF" if r["titles_differ"] else ("NO_MATCH" if r["no_calendar_match"] else "OK")
        corr.append(f"- [{flag}] **{r['granola_title']}** | calendar: **{cal}** | `{r['file']}`\n")

    corr_path.parent.mkdir(parents=True, exist_ok=True)
    corr_path.write_text("".join(corr), encoding="utf-8")

    print(
        json.dumps(
            {
                "written": len(rows),
                "out": str(out_root.resolve()),
                "index": str(index_path),
                "correlation": str(corr_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
