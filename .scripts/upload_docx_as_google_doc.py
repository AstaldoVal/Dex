#!/usr/bin/env python3
"""Upload a local .docx to Google Drive as a native Google Doc (import conversion)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
if str(_REPO / "core") not in sys.path:
    sys.path.insert(0, str(_REPO / "core"))

from credentials_paths import default_personal_credentials_json, default_personal_drive_token  # noqa: E402

from google.auth.transport.requests import Request  # noqa: E402
from google.oauth2.credentials import Credentials  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402
from googleapiclient.http import MediaFileUpload  # noqa: E402

# Same scopes as core/mcp/google_drive_server.py (Drive + Docs).
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
]


def _load_creds():
    creds_path = default_personal_credentials_json()
    token_path = default_personal_drive_token()
    if not creds_path.exists():
        raise SystemExit(f"Missing OAuth client JSON: {creds_path}")
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise SystemExit("Drive token missing or invalid; open Cursor MCP google-drive once to OAuth.")
    return creds


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("docx", type=Path, help="Path to .docx")
    ap.add_argument("--title", default="", help="Google Doc title (default: stem of docx)")
    args = ap.parse_args()
    docx: Path = args.docx.resolve()
    if not docx.is_file() or docx.suffix.lower() != ".docx":
        raise SystemExit("Need an existing .docx file")
    title = (args.title or docx.stem).strip()

    creds = _load_creds()
    drive = build("drive", "v3", credentials=creds)

    body = {
        "name": title,
        "mimeType": "application/vnd.google-apps.document",
    }
    media = MediaFileUpload(
        str(docx),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        resumable=docx.stat().st_size > 5 * 1024 * 1024,
    )
    created = (
        drive.files()
        .create(body=body, media_body=media, fields="id,name,mimeType,webViewLink", supportsAllDrives=True)
        .execute()
    )
    print(json.dumps({"success": True, **created}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
