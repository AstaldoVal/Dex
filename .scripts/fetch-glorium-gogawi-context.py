#!/usr/bin/env python3
"""
Fetch all Gogawi/EBET/BetConstruct context from Glorium Gmail (roman.matsukatov@gloriumtech.com).
On first run opens browser for OAuth; token is saved to Credentials/google-glorium/gmail_token.json.
Output: 00-Inbox/Job_Search/gogawi-ebet-context-from-glorium-mail.md (or path from --out).
"""
import os
import sys
import json
import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

def main():
    parser = argparse.ArgumentParser(description="Fetch Gogawi/EBET context from Glorium Gmail")
    parser.add_argument("--out", default=None, help="Output markdown file path (default: 00-Inbox/Job_Search/gogawi-ebet-context-from-glorium-mail.md)")
    parser.add_argument("--max", type=int, default=100, help="Max messages per query (default 100)")
    args = parser.parse_args()

    # Set Glorium Gmail env before importing gmail_server
    os.environ["VAULT_PATH"] = str(REPO_ROOT)
    os.environ["GMAIL_CREDENTIALS_PATH"] = str(REPO_ROOT / "Credentials" / "personal" / "credentials.json")
    os.environ["GMAIL_TOKEN_PATH"] = str(REPO_ROOT / "Credentials" / "google-glorium" / "gmail_token.json")

    sys.path.insert(0, str(REPO_ROOT))
    from core.mcp.gmail_server import _service, format_message

    service = _service()
    out_path = Path(args.out) if args.out else REPO_ROOT / "00-Inbox" / "Job_Search" / "gogawi-ebet-context-from-glorium-mail.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    queries = [
        "Gogawi",
        "EBET",
        "BetConstruct",
        "gogawi.com",
        "esportsbook",
    ]
    seen_ids = set()
    all_messages = []

    for q in queries:
        try:
            result = service.users().messages().list(
                userId="me",
                maxResults=args.max,
                q=q
            ).execute()
        except Exception as e:
            print(f"Query '{q}' failed: {e}", file=sys.stderr)
            continue
        for msg in result.get("messages", []):
            mid = msg["id"]
            if mid in seen_ids:
                continue
            seen_ids.add(mid)
            try:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=mid,
                    format="full"
                ).execute()
                all_messages.append(format_message(msg_data))
            except Exception as e:
                print(f"Get message {mid} failed: {e}", file=sys.stderr)

    # Sort by date (newest first when possible)
    def msg_date(m):
        d = m.get("date") or ""
        return d

    all_messages.sort(key=msg_date, reverse=True)

    lines = [
        "# Gogawi / EBET (BetConstruct) — контекст из почты Glorium",
        "",
        f"Источник: roman.matsukatov@gloriumtech.com. Выгружено писем: {len(all_messages)}.",
        "",
        "---",
        "",
    ]

    for m in all_messages:
        subj = (m.get("subject") or "").replace("\n", " ")
        from_ = (m.get("from") or "").replace("\n", " ")
        to_ = (m.get("to") or "").replace("\n", " ")
        date = m.get("date") or ""
        body = (m.get("body") or "").strip()
        snippet = (m.get("snippet") or "").replace("\n", " ")
        lines.append(f"## {subj}")
        lines.append("")
        lines.append(f"- **From:** {from_}")
        lines.append(f"- **To:** {to_}")
        lines.append(f"- **Date:** {date}")
        lines.append("")
        if body:
            lines.append(body[:15000] + ("…" if len(body) > 15000 else ""))
        else:
            lines.append(snippet)
        lines.append("")
        lines.append("---")
        lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(all_messages)} messages to {out_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
