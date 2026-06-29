#!/usr/bin/env python3
"""
List Shared Drives (Team Drives) the current Google account has access to.

Read-only. Uses Drive API drives().list() — does NOT touch files/folders.

Auth: reuses OAuth credentials from Credentials/<profile>/ (default: google-work).
Same pattern as core/mcp/google_drive_server.py.

Usage (from repo root):
  VAULT_PATH=$(pwd) python3 .scripts/list_shared_drives.py
  VAULT_PATH=$(pwd) python3 .scripts/list_shared_drives.py --profile google-work
  VAULT_PATH=$(pwd) python3 .scripts/list_shared_drives.py --profile personal --format json

Output:
  Default (table): name | id | created | hidden
  --format json   : full JSON list to stdout
  --format csv    : CSV to stdout
"""
from __future__ import annotations

import argparse
import json
import os
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

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
]


def _profile_dir(profile: str) -> Path:
    return _REPO / "Credentials" / profile


def _credentials_path(profile: str) -> Path:
    return _profile_dir(profile) / "credentials.json"


def _token_path(profile: str) -> Path:
    return _profile_dir(profile) / "google_drive_token.json"


def _get_credentials(profile: str):
    creds_path = _credentials_path(profile)
    token_path = _token_path(profile)
    if not creds_path.exists():
        raise SystemExit(
            f"Credentials JSON not found: {creds_path}. "
            "Place OAuth 2.0 Desktop client JSON there or pass --profile."
        )
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return creds


def list_shared_drives(profile: str, use_admin: bool = False) -> list[dict]:
    creds = _get_credentials(profile)
    svc = build("drive", "v3", credentials=creds)
    out: list[dict] = []
    page_token = None
    while True:
        kwargs = {
            "pageSize": 100,
            "fields": "nextPageToken, drives(id,name,createdTime,hidden,colorRgb)",
        }
        if use_admin:
            kwargs["useDomainAdminAccess"] = True
        if page_token:
            kwargs["pageToken"] = page_token
        resp = svc.drives().list(**kwargs).execute()
        for d in (resp.get("drives") or []):
            out.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "createdTime": d.get("createdTime"),
                "hidden": bool(d.get("hidden")),
                "colorRgb": d.get("colorRgb"),
            })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--profile", default="google-work", help="Credentials profile under Credentials/ (default: google-work)")
    ap.add_argument("--format", choices=["table", "json", "csv"], default="table")
    ap.add_argument("--use-admin", action="store_true", help="useDomainAdminAccess=true (Workspace admin only)")
    args = ap.parse_args()

    try:
        drives = list_shared_drives(args.profile, use_admin=args.use_admin)
    except HttpError as e:
        print(f"Drive API error: {e}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(drives, indent=2, ensure_ascii=False))
        return 0
    if args.format == "csv":
        print("name,id,createdTime,hidden")
        for d in drives:
            name = (d.get("name") or "").replace(",", " ")
            print(f"{name},{d.get('id')},{d.get('createdTime')},{d.get('hidden')}")
        return 0

    # table
    print(f"{'name':<60}  {'id':<22}  created               hidden")
    print(f"{'-'*60}  {'-'*22}  {'-'*20}  ------")
    for d in drives:
        name = (d.get("name") or "")[:58]
        print(f"{name:<60}  {d.get('id'):<22}  {d.get('createdTime'):<20}  {d.get('hidden')}")
    print(f"\nTotal: {len(drives)} Shared Drives")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
