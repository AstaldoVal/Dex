#!/usr/bin/env python3
"""
Create a Google Doc with a feature comparison table for Only Stories US research.
Uses the same OAuth credentials as core/mcp/google_drive_server.py (Drive + Docs scopes).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Repo root = parent of .scripts
REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
]


def _credentials_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if p:
        return Path(p).expanduser()
    return REPO / "credentials.json"


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


def collect_cell_insert_indices(doc: dict) -> list[int]:
    """Row-major order: first cell of each row left-to-right.

    insertText index must be inside an existing paragraph; use the paragraph
    startIndex (not startIndex+1) for empty cells (see Docs API errors).
    """
    out: list[int] = []
    for el in doc.get("body", {}).get("content", []):
        if "table" not in el:
            continue
        for row in el["table"].get("tableRows", []):
            for cell in row.get("tableCells", []):
                for piece in cell.get("content", []):
                    if "paragraph" in piece:
                        out.append(piece["startIndex"])
                        break
    return out


def main() -> int:
    from googleapiclient.discovery import build

    if not _credentials_path().exists():
        print(
            json.dumps(
                {
                    "success": False,
                    "error": (
                        f"No Google OAuth client JSON at {_credentials_path()}. "
                        "Set GOOGLE_DRIVE_CREDENTIALS_PATH or add credentials.json at repo root, "
                        "then re-run (browser opens once for consent)."
                    ),
                },
                indent=2,
            )
        )
        return 1

    creds, err = get_credentials()
    if err:
        print(json.dumps({"success": False, "error": err}, indent=2))
        return 1

    docs = build("docs", "v1", credentials=creds)
    drive = build("drive", "v3", credentials=creds)

    title = "Only Stories - US feature comparison matrix (from 03_US_Competitive_Research_Report)"

    # Table: 7 rows x 11 columns; same labels for same product family (see 03_US_Feature_Matrix.tsv)
    rows_n, cols_n = 7, 11
    table_data = [
        [
            "Dimension",
            "Only Stories",
            "ReelShort",
            "DramaBox",
            "MiniShorts",
            "FlickReels",
            "DramaShorts",
            "Episode",
            "Romance Club",
            "OnlyFans / Fansly",
            "Adult VOD (e.g. PH Premium)",
        ],
        [
            "Story format",
            "Vertical drama shorts; cliffhanger loop (intent)",
            "Vertical drama shorts; catalog binge",
            "Vertical drama shorts; catalog binge",
            "Vertical drama shorts; catalog binge",
            "Vertical drama shorts; catalog binge",
            "Vertical drama shorts; catalog binge",
            "Interactive story; currency gates progress",
            "Interactive story; currency gates progress",
            "Creator feed; not serial cliffhanger",
            "VOD library; browse and play",
        ],
        [
            "First paywall",
            "Paid story step or subscription (intent)",
            "Subscription; catalog access",
            "Subscription; catalog access",
            "Subscription; catalog access",
            "Subscription; catalog access",
            "Subscription; catalog access",
            "Currency unlocks next content",
            "Currency unlocks next content",
            "Creator subscription; PPV or tips",
            "Premium subscription",
        ],
        [
            "Revenue model",
            "Subscription + story gates (intent)",
            "Subscription (App Store)",
            "Subscription (App Store)",
            "Subscription (App Store)",
            "Subscription (App Store)",
            "Subscription (App Store)",
            "IAP currency + packs",
            "IAP currency + packs",
            "Creator sub + PPV + tips",
            "Premium subscription",
        ],
        [
            "Dual-version same story (SFW vs NSFW full)",
            "Yes",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
        ],
        [
            "Step gating + redirect + continuity restore",
            "Yes",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
        ],
        [
            "Adult money stack",
            "Sub + locks + tips (intent)",
            "Coins + subscription",
            "Coins + subscription",
            "Coins + subscription",
            "Coins + subscription",
            "Coins + subscription",
            "IAP currency",
            "IAP currency",
            "Sub + PPV + tips",
            "Premium + add-ons",
        ],
    ]

    create = docs.documents().create(body={"title": title}).execute()
    doc_id = create.get("documentId")
    if not doc_id:
        print(json.dumps({"success": False, "error": "No documentId"}, indent=2))
        return 1

    docs.documents().batchUpdate(
        documentId=doc_id,
        body={
            "requests": [
                {
                    "insertTable": {
                        "rows": rows_n,
                        "columns": cols_n,
                        "location": {"index": 1},
                    }
                }
            ]
        },
    ).execute()

    doc = docs.documents().get(documentId=doc_id).execute()
    indices = collect_cell_insert_indices(doc)
    expected = rows_n * cols_n
    if len(indices) != expected:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Cell index mismatch: got {len(indices)}, expected {expected}",
                    "documentId": doc_id,
                },
                indent=2,
            )
        )
        return 1

    flat = [table_data[r][c] for r in range(rows_n) for c in range(cols_n)]
    pairs = sorted(zip(indices, flat), key=lambda x: x[0], reverse=True)
    requests = [
        {"insertText": {"location": {"index": idx}, "text": text}} for idx, text in pairs
    ]
    docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()

    meta = drive.files().get(fileId=doc_id, fields="id, name, webViewLink").execute()
    print(
        json.dumps(
            {
                "success": True,
                "file_id": meta.get("id"),
                "name": meta.get("name"),
                "webViewLink": meta.get("webViewLink"),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
