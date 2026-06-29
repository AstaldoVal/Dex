#!/usr/bin/env python3
"""
Trash a Google Drive folder by path under a known root (folder names only).

Example (from repo root):
  python3 .scripts/banda/drive_trash_folder_by_path.py \\
    --root-id 1YtMDH8jaCxQlk5vKiQT7mnm4fVEUrBzx \\
    --path "02_Tokenomics/Audit/Past Audits"

Uses the same credentials/token as generate_board_obsidian_cards_and_drive_upload.py
(GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / ".scripts" / "banda"))

import generate_board_obsidian_cards_and_drive_upload as board  # noqa: E402


def find_child_folder_id(service, parent_id: str, name: str) -> str | None:
    from googleapiclient.errors import HttpError

    safe = name.replace("'", "\\'")
    q = (
        f"name = '{safe}' and '{parent_id}' in parents and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    try:
        resp = (
            service.files()
            .list(q=q, spaces="drive", fields="files(id,name)", pageSize=10)
            .execute()
        )
    except HttpError as e:
        print(f"Drive API error listing under {parent_id!r}: {e}", file=sys.stderr)
        raise
    files = resp.get("files", [])
    if not files:
        return None
    if len(files) > 1:
        print(f"Warning: multiple folders named {name!r} under {parent_id}, using first", file=sys.stderr)
    return files[0]["id"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root-id", required=True, help="Drive folder id (Board export root)")
    ap.add_argument(
        "--path",
        required=True,
        help="Slash-separated folder names from root, e.g. 02_Tokenomics/Audit/Past Audits",
    )
    ap.add_argument("--dry-run", action="store_true", help="Print ids only, do not trash")
    args = ap.parse_args()
    parts = [p for p in args.path.strip("/").split("/") if p]
    if not parts:
        print("Empty --path", file=sys.stderr)
        return 2

    svc = board.drive_service()
    cur = args.root_id
    trail = [args.root_id]
    for name in parts[:-1]:
        nxt = find_child_folder_id(svc, cur, name)
        if not nxt:
            print(f"Not found: folder {name!r} under id {cur}", file=sys.stderr)
            return 1
        cur = nxt
        trail.append(cur)

    target_name = parts[-1]
    target_id = find_child_folder_id(svc, cur, target_name)
    if not target_id:
        print(f"Not found: folder {target_name!r} under id {cur} (parent path ok)", file=sys.stderr)
        return 1

    print(f"Resolved: {' / '.join(parts)} -> {target_id}", file=sys.stderr)
    if args.dry_run:
        print("Dry run: not trashing.", file=sys.stderr)
        return 0

    svc.files().update(fileId=target_id, body={"trashed": True}).execute()
    print(f"Trashed folder id {target_id} ({target_name})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
