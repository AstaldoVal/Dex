#!/usr/bin/env python3
"""
Consolidate existing Dex Granola exports for a date range into transcript-first markdown.

Reads 05-Areas/Meetings/Granola and 00-Inbox/Meetings (Granola-* and date folders).
Does not call Granola API — use granola_export_range.py when API/cache is available.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]
FRONT_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
GRANOLA_ID_RE = re.compile(r"granola_id:\s*[`\"]?([0-9a-f-]{36})[`\"]?", re.I)


def parse_frontmatter(text: str) -> Tuple[Dict[str, str], str]:
    m = FRONT_RE.match(text)
    if not m:
        return {}, text
    fm: Dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        fm[k.strip()] = v.strip().strip('"')
    return fm, text[m.end() :]


def extract_section(body: str, name: str) -> str:
    pat = rf"^## {re.escape(name)}\s*\n(.*?)(?=^## |\Z)"
    m = re.search(pat, body, re.MULTILINE | re.DOTALL)
    if not m:
        return ""
    content = m.group(1).strip()
    if content.startswith("_No transcript") or content.startswith("_No notes"):
        return ""
    if content.startswith("```") and content.strip() == "````":
        return ""
    return content


def slugify(title: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\u0400-\u04ff]+", "-", (title or "meeting").lower()).strip("-")
    return (s or "meeting")[:72]


def parse_file(path: Path) -> Optional[Dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)
    gid = fm.get("granola_id") or ""
    if not gid:
        m = GRANOLA_ID_RE.search(text)
        gid = m.group(1) if m else ""
    title = fm.get("title") or fm.get("granola_title") or ""
    if not title:
        h = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
        title = h.group(1).strip() if h else path.stem
    date_str = fm.get("date") or fm.get("granola_created_at", "")[:10]
    if not date_str:
        dm = re.search(r"/(\d{4}-\d{2}-\d{2})/", str(path))
        if dm:
            date_str = dm.group(1)
        else:
            dm = re.match(r"(\d{4}-\d{2}-\d{2})--", path.name)
            if dm:
                date_str = dm.group(1)
    transcript = extract_section(body, "Transcript") or extract_section(
        body, "Transcript (from Granola cache)"
    )
    summary = (
        extract_section(body, "Summary (Granola notes)")
        or extract_section(body, "Notes (Granola)")
        or extract_section(body, "Granola notes")
        or extract_section(body, "Summary")
    )
    if not summary.strip():
        # drop processed template boilerplate
        if "## Summary" not in body and body.strip():
            summary = body.strip()
    participants = extract_section(body, "Participants")
    return {
        "granola_id": gid,
        "title": title,
        "date": date_str,
        "transcript": transcript,
        "summary": summary,
        "participants": participants,
        "source_path": str(path),
        "priority": 0,
    }


def collect_sources(vault: Path, start: date, end: date) -> Dict[str, Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}

    def add(row: Dict[str, Any], priority: int) -> None:
        gid = row.get("granola_id") or f"no-id-{row['date']}-{slugify(row['title'])}"
        try:
            d = date.fromisoformat((row.get("date") or "")[:10])
        except ValueError:
            return
        if not (start <= d <= end):
            return
        row["date"] = d.isoformat()
        existing = by_id.get(gid)
        if not existing or priority > existing["priority"]:
            by_id[gid] = {**row, "priority": priority}
        elif existing and priority == existing["priority"]:
            if len(row.get("transcript") or "") > len(existing.get("transcript") or ""):
                existing["transcript"] = row["transcript"]
            if len(row.get("summary") or "") > len(existing.get("summary") or ""):
                existing["summary"] = row["summary"]

    areas = vault / "05-Areas" / "Meetings" / "Granola"
    if areas.is_dir():
        for p in areas.rglob("*.md"):
            row = parse_file(p)
            if row:
                add(row, 3)

    inbox = vault / "00-Inbox" / "Meetings"
    for p in inbox.glob("Granola-2026-*/*.md"):
        if p.name.startswith("_"):
            continue
        row = parse_file(p)
        if row:
            add(row, 2)

    for p in inbox.glob("2026-*/*.md"):
        row = parse_file(p)
        if row:
            add(row, 1)

    return by_id


def render(row: Dict[str, Any], fetched_at: str) -> str:
    title = row["title"]
    gid = row.get("granola_id") or ""
    lines = [
        "---\n",
        f'granola_id: "{gid}"\n' if gid else "",
        f'title: "{title.replace(chr(34), chr(92)+chr(34))}"\n',
        f"date: {row['date']}\n",
        "source: dex-consolidation\n",
        f"fetched_at: {fetched_at}\n",
        f"has_transcript: {json.dumps(bool((row.get('transcript') or '').strip()))}\n",
        f"has_summary: {json.dumps(bool((row.get('summary') or '').strip()))}\n",
        f"source_paths: {json.dumps(row.get('source_path', ''))}\n",
        "---\n\n",
        f"# {title}\n\n",
        f"- **Date:** {row['date']}\n",
    ]
    if gid:
        lines.append(f"- **Granola ID:** `{gid}`\n")
    lines.append(f"- **Fetched:** {fetched_at}\n\n")
    lines.append("## Attendees\n\n")
    lines.append((row.get("participants") or "_None listed_").strip() + "\n\n")
    lines.append("## Transcript\n\n")
    tr = (row.get("transcript") or "").strip()
    if tr:
        lines.append(tr + "\n\n")
    else:
        lines.append(
            "_No original transcript available in vault sources. "
            "Re-run export after Granola API re-auth or official API key._\n\n"
        )
    sm = (row.get("summary") or "").strip()
    if sm:
        lines.append("## Summary (Granola notes)\n\n")
        lines.append(sm + "\n\n")
    lines.append("---\n*Dex consolidated Granola export (transcript-first)*\n")
    return "".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", required=True)
    ap.add_argument("--to", dest="date_to", required=True)
    ap.add_argument("--vault", type=Path, default=REPO)
    args = ap.parse_args()
    start = date.fromisoformat(args.date_from)
    end = date.fromisoformat(args.date_to)
    vault = args.vault.resolve()
    fetched_at = datetime.now().astimezone().replace(microsecond=0).isoformat()

    rows = collect_sources(vault, start, end)
    stats = {
        "found": len(rows),
        "with_transcript": 0,
        "notes_only": 0,
        "written": 0,
        "paths": [],
    }

    for gid, row in sorted(rows.items(), key=lambda x: x[1].get("date", "")):
        ym = row["date"][:7]
        out_dir = vault / "00-Inbox" / "Meetings" / f"Granola-{ym}"
        out_dir.mkdir(parents=True, exist_ok=True)
        slug = slugify(row["title"])
        fname = f"{row['date']}--{slug}--{(gid or slug)[:8]}.md"
        path = out_dir / fname
        path.write_text(render(row, fetched_at), encoding="utf-8")
        rel = str(path.relative_to(vault))
        stats["written"] += 1
        stats["paths"].append(rel)
        if (row.get("transcript") or "").strip():
            stats["with_transcript"] += 1
        elif (row.get("summary") or "").strip():
            stats["notes_only"] += 1

    out_json = vault / "System" / f"Granola_consolidation_{args.date_from}_to_{args.date_to}.json"
    out_json.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
