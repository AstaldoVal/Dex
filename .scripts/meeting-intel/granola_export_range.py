#!/usr/bin/env python3
"""
Export Granola meetings for a date range to Dex vault markdown.
Primary body: full transcript from API (v1/get-document-transcript).
Secondary: Granola notes/summary from last_viewed_panel (ProseMirror → Markdown).

Usage:
  python3 .scripts/meeting-intel/granola_export_range.py --from 2026-04-22 --to 2026-05-22
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_REPO = Path(__file__).resolve().parents[2]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from core.mcp.granola_server import (  # noqa: E402
    convert_api_doc_to_meeting_info,
    convert_prosemirror_to_markdown,
    fetch_from_api,
    get_api_access_token,
)

GRANOLA_CREDS = Path.home() / "Library/Application Support/Granola/supabase.json"
API_BASE = "https://api.granola.ai"


def refresh_access_token() -> str:
    """Refresh WorkOS token and persist rotated refresh_token to supabase.json."""
    import base64
    import requests

    data = json.loads(GRANOLA_CREDS.read_text(encoding="utf-8"))
    wt = json.loads(data.get("workos_tokens", "{}"))
    access = wt.get("access_token")
    if not access:
        raise RuntimeError("No access_token in supabase.json")

    payload_b64 = access.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    pl = json.loads(base64.urlsafe_b64decode(payload_b64))
    client_id = pl.get("client_id")
    refresh = wt.get("refresh_token")
    if not client_id or not refresh:
        raise RuntimeError("Missing client_id or refresh_token")

    resp = requests.post(
        "https://api.workos.com/user_management/authenticate",
        json={
            "client_id": client_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token refresh failed: {resp.status_code} {resp.text[:300]}")

    tokens = resp.json()
    wt["access_token"] = tokens["access_token"]
    wt["refresh_token"] = tokens["refresh_token"]
    wt["expires_in"] = tokens.get("expires_in", wt.get("expires_in"))
    wt["obtained_at"] = int(time.time() * 1000)
    data["workos_tokens"] = json.dumps(wt)
    GRANOLA_CREDS.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return tokens["access_token"]


def ensure_token() -> bool:
    """Return True if a valid unofficial API token is available."""
    token = get_api_access_token()
    if not token:
        return False
    import base64

    payload_b64 = token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    pl = json.loads(base64.urlsafe_b64decode(payload_b64))
    if pl.get("exp", 0) < time.time() + 60:
        try:
            refresh_access_token()
            return True
        except RuntimeError:
            return False
    return True


def fetch_public_api_notes(start: date, end: date) -> List[Dict[str, Any]]:
    """Official Granola public API (GRANOLA_API_KEY=grn_...)."""
    import os
    import requests

    api_key = os.environ.get("GRANOLA_API_KEY", "").strip()
    if not api_key:
        return []
    created_after = datetime.combine(start, datetime.min.time()).astimezone().isoformat()
    headers = {"Authorization": f"Bearer {api_key}"}
    notes: List[Dict[str, Any]] = []
    cursor: Optional[str] = None
    for _ in range(50):
        params: Dict[str, Any] = {"created_after": created_after, "limit": 100}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(
            "https://public-api.granola.ai/v1/notes",
            headers=headers,
            params=params,
            timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"public-api list notes {r.status_code}: {r.text[:300]}")
        data = r.json()
        batch = data.get("notes") or []
        for n in batch:
            created = (n.get("created_at") or n.get("createdAt") or "")[:10]
            try:
                d = date.fromisoformat(created)
            except ValueError:
                continue
            if start <= d <= end:
                notes.append(n)
        if not data.get("hasMore"):
            break
        cursor = data.get("cursor")
        if not cursor:
            break
    return notes


def fetch_public_note_detail(note_id: str) -> Dict[str, Any]:
    import os
    import requests

    api_key = os.environ.get("GRANOLA_API_KEY", "").strip()
    r = requests.get(
        f"https://public-api.granola.ai/v1/notes/{note_id}",
        headers={"Authorization": f"Bearer {api_key}"},
        params={"include": "transcript"},
        timeout=30,
    )
    if r.status_code != 200:
        return {}
    return r.json()


def fetch_all_documents() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    offset = 0
    for _ in range(50):
        resp = fetch_from_api(
            "/v2/get-documents",
            {"limit": 100, "offset": offset, "include_last_viewed_panel": True},
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
    return out


def fetch_transcript(document_id: str) -> Tuple[str, str]:
    """Returns (transcript_text, status) where status is ok|404|error."""
    resp = fetch_from_api("/v1/get-document-transcript", {"document_id": document_id})
    if resp is None:
        return "", "error"
    if isinstance(resp, list):
        if not resp:
            return "", "empty"
        lines = []
        for seg in resp:
            if not isinstance(seg, dict):
                continue
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            src = seg.get("source") or ""
            ts = seg.get("start_timestamp") or ""
            prefix = f"[{ts}]" if ts else ""
            if src:
                prefix = f"[{src} {ts}]".strip() if ts else f"[{src}]"
            lines.append(f"{prefix} {text}".strip())
        return "\n\n".join(lines), "ok"
    if isinstance(resp, dict) and resp.get("message"):
        msg = str(resp.get("message", "")).lower()
        if "not found" in msg or resp.get("status") == 404:
            return "", "404"
    return "", "error"


def notes_from_doc(doc: Dict[str, Any]) -> str:
    panel = doc.get("last_viewed_panel")
    if panel and isinstance(panel, dict):
        content = panel.get("content")
        if content and isinstance(content, dict):
            md = convert_prosemirror_to_markdown(content)
            if md.strip():
                return md.strip()
    info = convert_api_doc_to_meeting_info(doc)
    return (info.get("notes") or "").strip()


def slugify(title: str, max_len: int = 72) -> str:
    s = (title or "meeting").lower()
    s = re.sub(r"[^a-z0-9\u0400-\u04ff]+", "-", s, flags=re.I)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s or "meeting")[:max_len]


def local_date_from_iso(iso: str) -> Optional[date]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone().date()
    except ValueError:
        return None


def render_markdown(
    doc: Dict[str, Any],
    transcript: str,
    summary: str,
    fetched_at: str,
    transcript_status: str,
) -> str:
    mid = doc.get("id", "")
    title = (doc.get("title") or "Untitled Meeting").strip()
    created = doc.get("created_at") or ""
    d = local_date_from_iso(created)
    date_str = d.isoformat() if d else ""

    info = convert_api_doc_to_meeting_info(doc)
    participants = info.get("participants") or []
    plines: List[str] = []
    for p in participants:
        if isinstance(p, dict):
            nm = p.get("name") or p.get("email") or ""
            em = p.get("email") or ""
            plines.append(f"- {nm}" + (f" ({em})" if em else ""))
        else:
            plines.append(f"- {p}")

    title_esc = title.replace('"', '\\"')
    fm = {
        "granola_id": mid,
        "title": title_esc,
        "date": date_str,
        "granola_created_at": created,
        "source": "granola-api",
        "fetched_at": fetched_at,
        "transcript_status": transcript_status,
        "has_summary": bool(summary.strip()),
    }
    lines = ["---\n"]
    for k, v in fm.items():
        if v is None or v == "":
            continue
        lines.append(f'{k}: {json.dumps(v, ensure_ascii=False)}\n')
    lines.append("---\n\n")
    lines.append(f"# {title}\n\n")
    lines.append(f"- **Date:** {date_str}\n")
    lines.append(f"- **Granola ID:** `{mid}`\n")
    lines.append(f"- **Fetched:** {fetched_at}\n\n")
    lines.append("## Attendees\n\n")
    lines.append("\n".join(plines) if plines else "_None listed_\n")
    lines.append("\n\n## Transcript\n\n")
    if transcript.strip():
        lines.append(transcript.strip())
        lines.append("\n\n")
    else:
        lines.append(
            f"_No transcript available ({transcript_status}). "
            "Granola may not have recorded this meeting or transcript is not on your plan._\n\n"
        )
    if summary.strip():
        lines.append("## Summary (Granola notes)\n\n")
        lines.append(summary.strip())
        lines.append("\n\n")
    lines.append("---\n*Dex Granola range export — transcript primary*\n")
    return "".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", required=True, help="YYYY-MM-DD inclusive")
    ap.add_argument("--to", dest="date_to", required=True, help="YYYY-MM-DD inclusive")
    ap.add_argument("--vault", type=Path, default=_REPO)
    args = ap.parse_args()

    start = date.fromisoformat(args.date_from)
    end = date.fromisoformat(args.date_to)
    vault = args.vault.expanduser().resolve()
    fetched_at = datetime.now().astimezone().replace(microsecond=0).isoformat()

    ensure_token()

    all_docs = fetch_all_documents()
    in_range: List[Dict[str, Any]] = []
    for doc in all_docs:
        d = local_date_from_iso(doc.get("created_at") or "")
        if d and start <= d <= end:
            in_range.append(doc)

    stats = {
        "found_in_range": len(in_range),
        "saved_with_transcript": 0,
        "saved_notes_only": 0,
        "skipped_no_content": 0,
        "transcript_404": 0,
        "transcript_errors": 0,
        "files": [],
    }

    by_month: Dict[str, List[Dict[str, Any]]] = {}
    for doc in in_range:
        d = local_date_from_iso(doc.get("created_at") or "")
        ym = d.strftime("%Y-%m") if d else "unknown"
        by_month.setdefault(ym, []).append(doc)

    for ym, docs in sorted(by_month.items()):
        out_root = vault / "00-Inbox" / "Meetings" / f"Granola-{ym}"
        out_root.mkdir(parents=True, exist_ok=True)
        for doc in sorted(docs, key=lambda x: x.get("created_at") or ""):
            mid = doc.get("id") or ""
            title = (doc.get("title") or "Untitled").strip()
            d = local_date_from_iso(doc.get("created_at") or "")
            day_key = d.isoformat() if d else "unknown"
            summary = notes_from_doc(doc)
            transcript, tstatus = fetch_transcript(mid)

            if tstatus == "404":
                stats["transcript_404"] += 1
            elif tstatus == "error":
                stats["transcript_errors"] += 1

            if not transcript.strip() and not summary.strip():
                stats["skipped_no_content"] += 1
                stats["files"].append(
                    {
                        "file": None,
                        "title": title,
                        "date": day_key,
                        "reason": "no_transcript_no_summary",
                        "granola_id": mid,
                    }
                )
                continue

            slug = slugify(title)
            fname = f"{day_key}--{slug}--{mid[:8]}.md"
            fpath = out_root / fname
            fpath.write_text(
                render_markdown(doc, transcript, summary, fetched_at, tstatus),
                encoding="utf-8",
            )
            rel = str(fpath.relative_to(vault))
            if transcript.strip():
                stats["saved_with_transcript"] += 1
            else:
                stats["saved_notes_only"] += 1
            stats["files"].append(
                {
                    "file": rel,
                    "title": title,
                    "date": day_key,
                    "transcript_chars": len(transcript),
                    "summary_chars": len(summary),
                    "transcript_status": tstatus,
                    "granola_id": mid,
                }
            )

        index_path = out_root / "_INDEX.md"
        month_rows = [f for f in stats["files"] if f.get("file") and f["file"].startswith(f"00-Inbox/Meetings/Granola-{ym}")]
        idx_lines = [
            f"# Granola export {ym} (range {start} – {end})\n\n",
            f"- Fetched at: {fetched_at}\n",
            f"- Source: Granola API (`/v2/get-documents`, `/v1/get-document-transcript`)\n",
            f"- Meetings in range: {len(docs)}\n\n",
            "## Files\n\n",
        ]
        for row in sorted(month_rows, key=lambda r: r.get("date", "")):
            tc = row.get("transcript_chars", 0)
            flag = "transcript" if tc else "notes-only"
            idx_lines.append(f"- **{row['date']}** — {row['title']} ({flag}) → `{row['file']}`\n")
        index_path.write_text("".join(idx_lines), encoding="utf-8")

    summary_path = vault / "System" / f"Granola_export_{args.date_from}_to_{args.date_to}.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(stats, indent=2, ensure_ascii=False))
    print(f"\nSummary written: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
