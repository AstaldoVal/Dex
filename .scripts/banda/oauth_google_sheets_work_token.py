#!/usr/bin/env python3
"""One-shot OAuth for Google Sheets + drive.file (work Credentials/google-work)."""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CREDS = REPO / "Credentials" / "google-work" / "credentials.json"
OUT = REPO / "Credentials" / "google-work" / "google_sheets_token.json"
SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]


def main() -> int:
    from google_auth_oauthlib.flow import InstalledAppFlow

    if not CREDS.exists():
        print(f"Missing {CREDS}", file=sys.stderr)
        return 1
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDS), SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(creds.to_json(), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
