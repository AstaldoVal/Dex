#!/usr/bin/env python3
"""
Daily export: Granola meetings for one calendar day → vault markdown.

Combines api.granola.ai document data (notes) with local Granola cache (transcripts).
Scheduled for 21:00 via LaunchAgent; safe to run manually.

Examples:
  python .scripts/meeting-intel/granola_daily_to_vault.py
  python .scripts/meeting-intel/granola_daily_to_vault.py --day yesterday
  python .scripts/meeting-intel/granola_daily_to_vault.py --date 2026-04-18
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Set

# Repo root on path
_REPO = Path(__file__).resolve().parents[2]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

os.environ.setdefault("VAULT_PATH", str(_REPO))

from core.mcp.granola_server import (  # noqa: E402
    convert_api_doc_to_meeting_info,
    extract_meeting_info_from_cache,
    fetch_from_api,
    read_granola_cache,
)

OUT_ROOT = "05-Areas/Meetings/Granola"
LOG_REL = ".scripts/logs/granola-daily-vault.log"


def _log(msg: str) -> None:
    line = f"[{datetime.now().astimezone().isoformat(timespec='seconds')}] {msg}"
    print(line)
    log_path = _REPO / LOG_REL
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def _slugify(text: str, max_len: int = 72) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "meeting").lower()).strip("-")
    return (s or "meeting")[:max_len].strip("-")


def _utc_iso_to_local_date(iso: str) -> date | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone().date()
    except ValueError:
        return None


def fetch_all_docs_api() -> List[Dict[str, Any]]:
    """Paginate /v2/get-documents (up to ~2000 docs)."""
    out: List[Dict[str, Any]] = []
    offset = 0
    page = 0
    while page < 40:
        resp = fetch_from_api(
            "/v2/get-documents",
            {
                "limit": 100,
                "offset": offset,
                "include_last_viewed_panel": True,
            },
        )
        if not resp or "docs" not in resp:
            break
        docs = resp["docs"]
        if not docs:
            break
        out.extend(docs)
        if len(docs) < 100:
            break
        offset += 100
        page += 1
    return out


def _transcript_from_cache(cache: Optional[Dict[str, Any]], meeting_id: str) -> str:
    if not cache:
        return ""
    entries = cache.get("transcripts", {}).get(meeting_id) or []
    if not entries:
        return ""
    parts = [
        t.get("text", "")
        for t in sorted(entries, key=lambda x: x.get("start_timestamp", ""))
    ]
    return " ".join(p for p in parts if p).strip()


def collect_meetings_for_day(target: date) -> Dict[str, Dict[str, Any]]:
    """meeting_id -> {title, date_str, notes, transcript, participants, sources}."""
    target_str = target.isoformat()
    by_id: Dict[str, Dict[str, Any]] = {}
    cache = read_granola_cache()

    docs = fetch_all_docs_api()
    for doc in docs:
        mid = doc.get("id") or ""
        if not mid:
            continue
        created = doc.get("created_at") or ""
        d = _utc_iso_to_local_date(created)
        if d != target:
            continue
        info = convert_api_doc_to_meeting_info(doc)
        tcache = _transcript_from_cache(cache, mid)
        by_id[mid] = {
            "title": info.get("title") or "Untitled Meeting",
            "date_str": target_str,
            "notes": info.get("notes") or "",
            "transcript": tcache,
            "participants": info.get("participants") or [],
            "created_at": created,
            "sources": {"api"},
        }

    if cache:
        for mid, doc in cache.get("documents", {}).items():
            if doc.get("type") != "meeting" or doc.get("deleted_at"):
                continue
            created = doc.get("created_at") or ""
            d = _utc_iso_to_local_date(created)
            if d != target:
                continue
            if mid in by_id:
                tr = _transcript_from_cache(cache, mid)
                if tr and not by_id[mid].get("transcript"):
                    by_id[mid]["transcript"] = tr
                by_id[mid]["sources"].add("cache")
                continue
            transcripts_map = cache.get("transcripts") or {}
            info = extract_meeting_info_from_cache(doc, transcripts_map, mid)
            tr = _transcript_from_cache(cache, mid)
            by_id[mid] = {
                "title": info.get("title") or "Untitled Meeting",
                "date_str": target_str,
                "notes": info.get("notes") or "",
                "transcript": tr,
                "participants": info.get("participants") or [],
                "created_at": created,
                "sources": {"cache"},
            }

    return by_id


def render_markdown(mid: str, row: Dict[str, Any], exported_at: str) -> str:
    title_esc = row["title"].replace('"', '\\"')
    parts = row.get("participants") or []
    plines: List[str] = []
    for p in parts:
        if isinstance(p, dict):
            nm = p.get("name") or p.get("email") or ""
            em = p.get("email") or ""
            plines.append(f"- {nm}" + (f" ({em})" if em else ""))
        else:
            plines.append(f"- {p}")

    notes = row.get("notes") or ""
    tr = row.get("transcript") or ""
    src = ",".join(sorted(row.get("sources") or {"unknown"}))

    return f"""---
date: {row["date_str"]}
type: granola-daily-export
source: granola
granola_id: {mid}
title: "{title_esc}"
exported_at: {exported_at}
data_sources: {src}
---

# {row["title"]}

- **Date:** {row["date_str"]}
- **Granola ID:** `{mid}`
- **Exported:** {exported_at}

## Participants

{chr(10).join(plines) if plines else "_None listed_"}

## Notes (Granola)

{notes if notes.strip() else "_No notes in document._"}

## Transcript

{tr if tr.strip() else "_No transcript in local cache for this meeting. Open Granola on this Mac so cache-v*.json syncs, or use a paid plan if Granola gates raw transcript API._"}

---
*Dex Granola daily vault export*
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Granola meetings for one day to vault markdown.")
    parser.add_argument(
        "--day",
        choices=("today", "yesterday"),
        default="today",
        help="Calendar day relative to local time (default: today — for 21:00 end-of-day capture).",
    )
    parser.add_argument("--date", dest="explicit_date", help="Fixed calendar day YYYY-MM-DD (overrides --day).")
    args = parser.parse_args()

    if args.explicit_date:
        target = date.fromisoformat(args.explicit_date)
    else:
        now = datetime.now().astimezone().date()
        target = now if args.day == "today" else now - timedelta(days=1)

    vault = Path(os.environ.get("VAULT_PATH", str(_REPO)))
    out_dir = vault / OUT_ROOT / target.isoformat()

    exported_at = datetime.now().astimezone().isoformat(timespec="seconds")
    _log(f"Granola daily export: target_date={target.isoformat()} -> {OUT_ROOT}/{target.isoformat()}/")

    meetings = collect_meetings_for_day(target)
    if not meetings:
        _log("No meetings found for this day (API + cache). Nothing written.")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)

    used_slugs: Set[str] = set()
    for mid, row in sorted(meetings.items(), key=lambda x: x[1].get("created_at") or ""):
        base = _slugify(row["title"])
        slug = base
        suf = 0
        while slug in used_slugs:
            suf += 1
            slug = f"{base}-{mid[:8]}-{suf}"
        used_slugs.add(slug)

        path = out_dir / f"{slug}.md"
        path.write_text(render_markdown(mid, row, exported_at), encoding="utf-8")
        _log(f"Wrote {path.relative_to(vault)} ({len(row.get('transcript') or '')} transcript chars)")

    _log(f"Done: {len(meetings)} meeting file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
