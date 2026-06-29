#!/usr/bin/env python3
"""
Update the canonical Google Spreadsheet for the Only Stories US feature matrix (same file ID / URL every time).

- Reads spreadsheet ID from ONLY_STORIES_FEATURE_MATRIX_SHEET_ID or
  04-Projects/Only_Stories_Adult/SafeNSafe/google_feature_matrix_sheet_id.txt
- **Update (existing ID):** Sheets API values (batchClear + update). Falls back to Drive `files.update` + TSV if Sheets fails.
- **Create (no ID yet):** Drive `files.create` + TSV import, then saves ID.

Scopes: `drive.file` + `spreadsheets` (spreadsheets needed for Sheets API path; enable Sheets API in GCP).

Optional: ONLY_STORIES_FEATURE_MATRIX_TSV=/path/to/file.tsv
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

DEFAULT_TSV = (
    REPO
    / "04-Projects/Only_Stories_Adult"
    / "SafeNSafe"
    / "03_US_Feature_Matrix.tsv"
)

SHEET_ID_FILE = (
    REPO
    / "04-Projects/Only_Stories_Adult"
    / "SafeNSafe"
    / "google_feature_matrix_sheet_id.txt"
)


def _credentials_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if p:
        return Path(p).expanduser()
    return REPO / "Credentials" / "personal" / "credentials.json"


def _token_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if p:
        return Path(p).expanduser()
    return _credentials_path().parent / "google_drive_token.json"


def get_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        return None, f"Missing credentials: {creds_path}"
    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception as e:
            print(f"Warning: could not load token: {e}", file=sys.stderr)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            try:
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                return None, f"OAuth failed: {e}"
        token_path.parent.mkdir(parents=True, exist_ok=True)
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return creds, None


def parse_tsv(path: Path) -> list[list[str]]:
    raw = path.read_text(encoding="utf-8")
    rows: list[list[str]] = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        rows.append(line.split("\t"))
    return rows


def read_sheet_id() -> str | None:
    env = os.environ.get("ONLY_STORIES_FEATURE_MATRIX_SHEET_ID", "").strip()
    if env:
        return env
    if SHEET_ID_FILE.is_file():
        text = SHEET_ID_FILE.read_text(encoding="utf-8").strip()
        for line in text.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                if re.match(r"^[a-zA-Z0-9_-]+$", line):
                    return line
    return None


def write_sheet_id(sheet_id: str) -> None:
    SHEET_ID_FILE.parent.mkdir(parents=True, exist_ok=True)
    SHEET_ID_FILE.write_text(sheet_id.strip() + "\n", encoding="utf-8")


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def sheet_a1(sheet_title: str, cell_range: str) -> str:
    """A1 notation with quoting for titles that need it (spaces, quotes)."""
    if any(c in sheet_title for c in ("'", " ")) or not sheet_title:
        escaped = sheet_title.replace("'", "''")
        return f"'{escaped}'!{cell_range}"
    return f"{sheet_title}!{cell_range}"


def first_sheet_title(sheets, spreadsheet_id: str) -> str:
    meta = sheets.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets.properties(title,sheetId)",
    ).execute()
    sheets_list = meta.get("sheets") or []
    if not sheets_list:
        return "Sheet1"
    return sheets_list[0]["properties"].get("title") or "Sheet1"


def update_via_sheets_api(sheets, spreadsheet_id: str, values: list[list[str]]) -> None:
    nrows = len(values)
    ncols = max(len(r) for r in values) if values else 0
    padded = [r + [""] * (ncols - len(r)) for r in values]
    end = f"{col_letter(ncols)}{nrows}"

    title = first_sheet_title(sheets, spreadsheet_id)
    clear_w = max(52, ncols + 5)
    clear_to_row = max(500, nrows + 50)
    clear_rng = sheet_a1(title, f"A1:{col_letter(clear_w)}{clear_to_row}")
    upd_rng = sheet_a1(title, f"A1:{end}")

    sheets.spreadsheets().values().batchClear(
        spreadsheetId=spreadsheet_id,
        body={"ranges": [clear_rng]},
    ).execute()

    sheets.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=upd_rng,
        valueInputOption="USER_ENTERED",
        body={"values": padded},
    ).execute()


def update_via_drive(drive, spreadsheet_id: str, tsv_path: Path, media) -> dict:
    return drive.files().update(
        fileId=spreadsheet_id,
        media_body=media,
        fields="id, name, webViewLink, mimeType",
    ).execute()


def main() -> int:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    if not _credentials_path().exists():
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"No OAuth client JSON at {_credentials_path()}",
                },
                indent=2,
            )
        )
        return 1

    tsv_path = Path(os.environ.get("ONLY_STORIES_FEATURE_MATRIX_TSV", str(DEFAULT_TSV))).expanduser()
    if not tsv_path.is_file():
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"TSV not found: {tsv_path}",
                },
                indent=2,
            )
        )
        return 1

    values = parse_tsv(tsv_path)
    if not values:
        print(json.dumps({"success": False, "error": "TSV is empty"}, indent=2))
        return 1

    creds, err = get_credentials()
    if err:
        print(json.dumps({"success": False, "error": err}, indent=2))
        return 1

    drive = build("drive", "v3", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)

    title = "Only Stories - US feature comparison matrix"
    sheet_id = read_sheet_id()

    media = MediaFileUpload(
        str(tsv_path),
        mimetype="text/tab-separated-values",
        resumable=True,
    )

    update_method = ""

    try:
        if sheet_id:
            try:
                update_via_sheets_api(sheets, sheet_id, values)
                update_method = "sheets_api"
                meta = drive.files().get(
                    fileId=sheet_id,
                    fields="id, name, webViewLink, mimeType",
                ).execute()
            except Exception as sheets_err:
                meta = update_via_drive(drive, sheet_id, tsv_path, media)
                update_method = "drive_fallback"
                sys.stderr.write(f"Sheets API update failed, used Drive: {sheets_err}\n")
            action = "updated"
        else:
            file_metadata = {
                "name": title,
                "mimeType": "application/vnd.google-apps.spreadsheet",
            }
            meta = drive.files().create(
                body=file_metadata,
                media_body=media,
                fields="id, name, webViewLink, mimeType",
            ).execute()
            new_id = meta.get("id")
            if not new_id:
                print(json.dumps({"success": False, "error": "No file id after create"}, indent=2))
                return 1
            write_sheet_id(new_id)
            sheet_id = new_id
            action = "created"
            update_method = "drive_create"
    except Exception as e:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(e),
                    "sheet_id": sheet_id,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 1

    web = meta.get("webViewLink") or f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
    out = {
        "success": True,
        "action": action,
        "file_id": sheet_id,
        "name": meta.get("name"),
        "webViewLink": web,
        "mimeType": meta.get("mimeType"),
        "source_tsv": str(tsv_path),
        "id_file": str(SHEET_ID_FILE),
    }
    if update_method:
        out["update_method"] = update_method
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
