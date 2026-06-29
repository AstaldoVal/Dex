#!/usr/bin/env python3
"""Salvage meetings + transcripts from Granola cache-v4.json.tmp (partial/corrupt JSON)."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

CACHE_TMP = Path.home() / "Library/Application Support/Granola/cache-v4.json.tmp"
UUID_RE = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def load_raw() -> str:
    if not CACHE_TMP.is_file():
        raise FileNotFoundError(CACHE_TMP)
    return CACHE_TMP.read_text(encoding="utf-8", errors="replace")


def extract_documents(text: str) -> Dict[str, Dict[str, Any]]:
    """Parse meeting documents from corrupt cache via regex."""
    docs: Dict[str, Dict[str, Any]] = {}
    # Each meeting doc chunk: id then title/created_at nearby
    for m in re.finditer(
        rf'"({UUID_RE})"\s*:\s*\{{[^{{}}]*?"type"\s*:\s*"meeting"',
        text,
    ):
        doc_id = m.group(1)
        start = m.start()
        chunk = text[start : start + 8000]
        title_m = re.search(r'"title"\s*:\s*"((?:\\.|[^"\\])*)"', chunk)
        created_m = re.search(r'"created_at"\s*:\s*"([^"]+)"', chunk)
        notes_m = re.search(r'"notes_markdown"\s*:\s*"((?:\\.|[^"\\])*)"', chunk)
        title = json.loads(f'"{title_m.group(1)}"') if title_m else "Untitled"
        notes = json.loads(f'"{notes_m.group(1)}"') if notes_m and notes_m.group(1) else ""
        docs[doc_id] = {
            "id": doc_id,
            "title": title,
            "created_at": created_m.group(1) if created_m else "",
            "notes_markdown": notes,
        }
    return docs


def extract_transcripts(text: str) -> Dict[str, str]:
    """Map document_id -> flattened transcript from transcripts object."""
    t_start = text.find('"transcripts"')
    if t_start < 0:
        return {}
    # transcripts block until next top-level state key
    sub = text[t_start : t_start + 500000]
    out: Dict[str, List[Tuple[str, str]]] = {}
    for m in re.finditer(
        rf'"({UUID_RE})"\s*:\s*\[(.*?)\]\s*,\s*"(?:{UUID_RE}|events|documents)"',
        sub,
        re.DOTALL,
    ):
        doc_id = m.group(1)
        arr_body = m.group(2)
        for seg in re.finditer(
            r'\{[^{}]*?"text"\s*:\s*"((?:\\.|[^"\\])*)"[^{}]*?"start_timestamp"\s*:\s*"([^"]*)"',
            arr_body,
        ):
            txt = json.loads(f'"{seg.group(1)}"')
            ts = seg.group(2)
            out.setdefault(doc_id, []).append((ts, txt))
    flat: Dict[str, str] = {}
    for doc_id, segs in out.items():
        segs.sort(key=lambda x: x[0])
        flat[doc_id] = "\n\n".join(t for _, t in segs if t)
    return flat


def meetings_in_range(
    docs: Dict[str, Dict[str, Any]],
    transcripts: Dict[str, str],
    start: date,
    end: date,
) -> List[Dict[str, Any]]:
    rows = []
    for doc_id, doc in docs.items():
        created = doc.get("created_at") or ""
        if not created:
            continue
        try:
            d = datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone().date()
        except ValueError:
            continue
        if not (start <= d <= end):
            continue
        rows.append(
            {
                **doc,
                "date": d.isoformat(),
                "transcript": transcripts.get(doc_id, ""),
            }
        )
    rows.sort(key=lambda r: r.get("created_at") or "")
    return rows


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", required=True)
    ap.add_argument("--to", dest="date_to", required=True)
    args = ap.parse_args()
    start = date.fromisoformat(args.date_from)
    end = date.fromisoformat(args.date_to)

    text = load_raw()
    docs = extract_documents(text)
    transcripts = extract_transcripts(text)
    rows = meetings_in_range(docs, transcripts, start, end)
    print(
        json.dumps(
            {
                "documents_found": len(docs),
                "transcript_ids": len(transcripts),
                "in_range": len(rows),
                "with_transcript": sum(1 for r in rows if r.get("transcript")),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
