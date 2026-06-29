#!/usr/bin/env python3
"""
Download all non-trashed files from a Google Drive folder into a local directory.

Uses the same OAuth paths as core/mcp/google_drive_server.py (personal credentials + token).

Для папок на **общих дисках** (Shared drives): `files().list` / `files().get` вызываются с
`supportsAllDrives=True` и `includeItemsFromAllDrives=True` (иначе возможен 404).

Native Google types are exported:
  spreadsheet -> .xlsx
  document -> .docx
  presentation -> .pptx

Regular files use files().get_media.

Usage (from repo root):
  VAULT_PATH=$(pwd) python3 .scripts/banda_drive_folder_download.py \\
    --folder-id FOLDER_ID --output-dir path/to/out
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from core.credentials_paths import default_personal_credentials_json, default_personal_drive_token

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
]

EXPORT_SUFFIX = {
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".docx",
    ),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".pptx",
    ),
}


def _credentials_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    return Path(p).expanduser() if p else default_personal_credentials_json()


def _token_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    return Path(p).expanduser() if p else default_personal_drive_token()


def get_credentials():
    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        return None, f"Missing credentials JSON: {creds_path}"
    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception as e:
            return None, f"Could not load token {token_path}: {e}"
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                creds = None
                err_refresh = str(e)
            else:
                err_refresh = None
        else:
            err_refresh = None
        if not creds:
            try:
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                msg = f"OAuth failed: {e}"
                if err_refresh:
                    msg += f" (refresh had failed: {err_refresh})"
                return None, msg
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return creds, None


def safe_name(name: str) -> str:
    name = (name or "").strip() or "unnamed"
    # Windows-forbidden + control chars (must use \x00-\x1f, not \\x00 or the class breaks)
    name = re.sub(r'[<>:"/\\\\|?*\x00-\x1f]', "_", name)
    return name[:200] if len(name) > 200 else name


def list_children(service, folder_id: str):
    page_token = None
    while True:
        q = f"'{folder_id}' in parents and trashed = false"
        resp = (
            service.files()
            .list(
                q=q,
                pageSize=100,
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        for f in resp.get("files", []):
            yield f
        page_token = resp.get("nextPageToken")
        if not page_token:
            break


def download_file(service, meta: dict, out_dir: Path) -> Path:
    fid = meta["id"]
    name = meta["name"]
    mime = meta.get("mimeType") or ""

    if mime == "application/vnd.google-apps.folder":
        sub = out_dir / safe_name(name)
        sub.mkdir(parents=True, exist_ok=True)
        for child in list_children(service, fid):
            download_file(service, child, sub)
        return sub

    if mime in EXPORT_SUFFIX:
        export_mime, ext = EXPORT_SUFFIX[mime]
        base = safe_name(Path(name).stem) + ext
        out_path = out_dir / base
        raw = service.files().export(fileId=fid, mimeType=export_mime).execute()
        if isinstance(raw, str):
            raw = raw.encode("utf-8")
        out_path.write_bytes(raw)
        return out_path

    # Binary / uploaded
    meta_full = (
        service.files()
        .get(fileId=fid, fields="id, name, mimeType, size", supportsAllDrives=True)
        .execute()
    )
    size = int(meta_full.get("size") or 0)
    if size > 40 * 1024 * 1024:
        raise RuntimeError(f"Skip large file {name!r} ({size} bytes)")
    buf = io.BytesIO()
    request = service.files().get_media(fileId=fid)
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    raw = buf.getvalue()
    base = safe_name(name)
    if not Path(base).suffix:
        if "spreadsheet" in mime:
            base += ".xlsx"
        elif "pdf" in mime:
            base += ".pdf"
    out_path = out_dir / base
    out_path.write_bytes(raw)
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder-id", required=True)
    ap.add_argument("--output-dir", required=True, type=Path)
    args = ap.parse_args()

    creds, err = get_credentials()
    if err:
        print("ERROR:", err, file=sys.stderr)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    try:
        (
            service.files()
            .get(fileId=args.folder_id, fields="id, name, mimeType", supportsAllDrives=True)
            .execute()
        )
    except HttpError as e:
        print("ERROR: cannot open folder:", e, file=sys.stderr)
        return 1

    saved = []
    for f in list_children(service, args.folder_id):
        try:
            path = download_file(service, f, args.output_dir)
            saved.append(str(path))
            print("OK", path)
        except Exception as e:
            print("FAIL", f.get("name"), e, file=sys.stderr)
    print("Total:", len(saved))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
