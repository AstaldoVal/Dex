#!/usr/bin/env python3
"""
Create or update a multi-tab Google Spreadsheet: Only Stories MVP decomposition (Glorium-style layout).

Sheets (mirrors BIMerge estimate structure):
  - Discovery phase estimate
  - MVP phase 1 estimate (starts with Auth: registration, login, forgot password, OAuth Google/Apple/Facebook; then Module / Feature / …)
  - Scope coverage (status per area)
  - Modules rollup (placeholder hours)
  - High-level structure (10 blocks)
  - Roadmap phases

Auth: same as create_feature_matrix_google_sheet.py (Credentials/personal/ + google_drive_token.json).
Env:
  ONLY_STORIES_DECOMPOSITION_SHEET_ID  — optional; else google_decomposition_sheet_id.txt in SafeNSafe
  ONLY_STORIES_DECOMPOSITION_SHEET_ID_FILE — override path to id file

First run: creates spreadsheet, writes id file.
Next runs: clears known ranges and rewrites content (same sheet id).
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

DEFAULT_ID_FILE = (
    REPO / "04-Projects/Only_Stories_Adult/SafeNSafe" / "google_decomposition_sheet_id.txt"
)

SHEET_TITLES = [
    "Discovery phase estimate",
    "MVP phase 1 estimate",
    "Scope coverage",
    "Modules rollup",
    "High-level structure",
    "Roadmap phases",
]


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


def read_sheet_id() -> str | None:
    env = os.environ.get("ONLY_STORIES_DECOMPOSITION_SHEET_ID", "").strip()
    if env:
        return env
    id_file = Path(os.environ.get("ONLY_STORIES_DECOMPOSITION_SHEET_ID_FILE", str(DEFAULT_ID_FILE))).expanduser()
    if id_file.is_file():
        for line in id_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                if re.match(r"^[a-zA-Z0-9_-]+$", line):
                    return line
    return None


def write_sheet_id(sheet_id: str) -> None:
    DEFAULT_ID_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_ID_FILE.write_text(sheet_id.strip() + "\n", encoding="utf-8")


def a1(sheet_title: str, cell_range: str) -> str:
    if any(c in sheet_title for c in ("'",)) or not sheet_title:
        escaped = sheet_title.replace("'", "''")
        return f"'{escaped}'!{cell_range}"
    return f"{sheet_title}!{cell_range}"


def build_discovery_rows() -> list[list[str]]:
    today = date.today().isoformat()
    return [
        ["Project estimate"],
        ["Prepared for:", "(set in sheet)"],
        ["Project Name:", "Only Stories / Not Only Stories — MVP"],
        ["Source:", "Pitch deck + 02_Product_Architecture_Decomposition_And_Roadmap.md"],
        ["Date:", today],
        [],
        [
            "Deliverables (Phase 0 scope):",
            "Product spec (dual-version + gating); redirect contract (token + state); compliance architecture; monetization plan SFW vs NSFW",
        ],
        ["Timeline (working):", "~10 months core iteration (upper bound); mid-May business-plan gate for Phase 0"],
        [],
        ["Role", "Estimate h", "Rate $/h", "Subtotal $"],
        ["Product / Solution", "TBD", "TBD", "TBD"],
        ["BA / PO", "TBD", "TBD", "TBD"],
        ["PM", "TBD", "TBD", "TBD"],
        ["Architect", "TBD", "TBD", "TBD"],
        ["UI/UX", "TBD", "TBD", "TBD"],
        [],
        ["Grand total $", "TBD"],
        [],
        [
            "Note:",
            "Hours/rates are placeholders until a formal estimate. Structure follows Glorium BIMerge-style decomposition sheets.",
        ],
    ]


def build_mvp_rows() -> list[list[str]]:
    hdr = [
        "Module",
        "Feature",
        "Description",
        "Backend opt h",
        "Backend real h",
        "Frontend opt h",
        "Frontend real h",
        "Mobile opt h",
        "Mobile real h",
        "Surface",
        "Comments",
    ]
    T = ["TBD"] * 6
    rows: list[list[str]] = [
        hdr,
        [
            "0 Auth & identity",
            "Registration (sign up)",
            "Screens; field validation; email+password path; optional magic link if in scope; consent/ToS hooks; session after success",
            *T,
            "SFW",
            "MVP entry; same identity later for NSFW property",
        ],
        [
            "0 Auth & identity",
            "Login (sign in)",
            "Screens; credential submit; session/token; locked account; error states",
            *T,
            "SFW",
            "",
        ],
        [
            "0 Auth & identity",
            "Forgot password",
            "Request reset; deliver link/code; verify token; set new password; optional logout other devices",
            *T,
            "SFW",
            "Recovery flow end-to-end",
        ],
        [
            "0 Auth & identity",
            "OAuth — Google",
            "Sign in with Google; client SDK + backend token validation; account create/link",
            *T,
            "Both",
            "Minimum social provider set",
        ],
        [
            "0 Auth & identity",
            "OAuth — Apple",
            "Sign in with Apple; nonce/state; backend; account create/link",
            *T,
            "Both",
            "Required on iOS when other third-party sign-in exists",
        ],
        [
            "0 Auth & identity",
            "OAuth — Facebook",
            "Facebook Login; app config; limited token use; backend; account create/link",
            *T,
            "Both",
            "Review Meta app settings + store policies for adult-adjacent product",
        ],
        [
            "0",
            "Cross-cutting",
            "Localization; analytics baseline; environment config",
            *T,
            "Both",
            "Deck: English-first",
        ],
        [
            "1.0 Story system",
            "Micro-series catalog",
            "Series / season / episode browse; metadata",
            *T,
            "Both",
            "Epic 1",
        ],
        ["1.0 Story system", "Seasons grouping", "Seasons under series", *T, "Both", "Epic 1"],
        [
            "1.0 Story system",
            "Episode + progress model",
            "Playback state, last step",
            *T,
            "Both",
            "Epic 1",
        ],
        [
            "1.0 Story system",
            "Unlock / next-step rules",
            "Consumption state machine; cliffhanger pacing hooks",
            *T,
            "Both",
            "Epic 1",
        ],
        [
            "2.0 Dual-version pipeline",
            "SFW variant",
            "Plot-driven cut; no explicit assets in SFW delivery",
            *T,
            "SFW",
            "Epic 2",
        ],
        [
            "2.0 Dual-version pipeline",
            "NSFW variant",
            "Full episodes on NSFW platform",
            *T,
            "NSFW",
            "Epic 2",
        ],
        [
            "2.0 Dual-version pipeline",
            "Variant mapping",
            "Episode(SFW) <-> Episode(NSFW) continuity ids",
            *T,
            "Both",
            "Epic 2",
        ],
        [
            "2.0 Dual-version pipeline",
            "Extra layers",
            "BTS, exclusive scenes, tease clips, model extras — mapping per variant",
            *T,
            "Both",
            "Epic 2",
        ],
        [
            "3.0 SFW product",
            "Catalog + playback",
            "SFW-only assets; series/season/episode UX",
            *T,
            "SFW",
            "Epic 3",
        ],
        [
            "3.0 SFW product",
            "Progress + bookmarks",
            "Resume; saved positions",
            *T,
            "SFW",
            "Epic 3",
        ],
        ["3.0 SFW product", "Notifications filters", "What user is alerted about", *T, "SFW", "Epic 3"],
        [
            "3.0 SFW product",
            "Bonus library",
            "Photos, BTS, tease (SFW-safe)",
            *T,
            "SFW",
            "Epic 3",
        ],
        [
            "3.0 SFW product",
            "Commerce UI",
            "Subscription / catalog access; coins for unlocks, tips, extras; per-episode unlocks to discuss",
            *T,
            "SFW",
            "Epic 3 + monetization",
        ],
        [
            "3.0 SFW product",
            "Gating analytics",
            "time-to-unlock, step completion, redirect conversion",
            *T,
            "SFW",
            "Epic 3",
        ],
        [
            "4.0 NSFW product",
            "Full episode playback",
            "Uncensored episodes on single NSFW platform",
            *T,
            "NSFW",
            "Epic 4",
        ],
        [
            "4.0 NSFW product",
            "Access control",
            "Age gating; session/device policy",
            *T,
            "NSFW",
            "Epic 4",
        ],
        [
            "4.0 NSFW product",
            "Monetization flows",
            "Subscription; PPV; purchases; tips",
            *T,
            "NSFW",
            "Epic 4",
        ],
        [
            "5.0 Routing + continuity",
            "Gating engine",
            "Step-based + content-type gating; server-authoritative",
            *T,
            "Both",
            "Epic 5",
        ],
        [
            "5.0 Routing + continuity",
            "Redirect token",
            "Short-lived signed token: story + variant + next step",
            *T,
            "Both",
            "Architecture",
        ],
        [
            "5.0 Routing + continuity",
            "Smart redirect UX",
            "SFW opens NSFW property; fallback paywall if blocked",
            *T,
            "Both",
            "Epic 5",
        ],
        [
            "5.0 Routing + continuity",
            "State continuity",
            "Progress maps SFW -> NSFW position",
            *T,
            "Both",
            "Epic 5",
        ],
        [
            "6.0 Monetization system",
            "Entitlements + ledger",
            "Purchases; coins; mapping to content steps",
            *T,
            "Both",
            "Epic 6",
        ],
        [
            "6.0 Monetization system",
            "Attribution",
            "Revenue by billing surface; campaign tracking",
            *T,
            "Both",
            "Epic 6",
        ],
        [
            "7.0 Social + growth",
            "Teasers / cuts / first episodes",
            "Publishing workflow",
            *T,
            "Growth",
            "Epic 7",
        ],
        [
            "7.0 Social + growth",
            "Telegram + exclusives",
            "Distribution beyond core NSFW platform",
            *T,
            "Growth",
            "Epic 7",
        ],
        [
            "8.0 White-label",
            "Studio tenant model",
            "Branding; content ownership; onboarding artifacts",
            *T,
            "Platform",
            "Epic 8",
        ],
        [
            "9.0 Platform + compliance",
            "Separate SFW / NSFW properties",
            "Domains; no mixed NSFW in SFW",
            *T,
            "Platform",
            "Architecture",
        ],
        [
            "9.0 Platform + compliance",
            "Security + observability",
            "Token validation; rate limits; funnel metrics",
            *T,
            "Platform",
            "Guardrails doc",
        ],
    ]
    return rows


def build_scope_rows() -> list[list[str]]:
    return [
        ["Area", "Status", "Notes"],
        ["Auth: registration, login, forgot password, OAuth Google/Apple/Facebook", "Planned", "MVP first; unified identity for SFW app + NSFW property"],
        ["Story system + catalog", "Planned", "Epic 1"],
        ["Dual-version pipeline", "Planned", "Epic 2"],
        ["SFW app / PWA experience", "Planned", "Epic 3"],
        ["NSFW web (single platform)", "Planned", "Epic 4"],
        ["SFW -> NSFW routing", "Planned", "Epic 5 + backend"],
        ["Monetization end-to-end", "Planned", "Epic 6"],
        ["Social + Telegram distribution", "Optional depth", "Epic 7"],
        ["White-label / franchise", "Later / optional", "Epic 8"],
        [],
        ["Assumptions", "", ""],
        [
            "Hours in MVP sheet are TBD until estimation workshop.",
            "",
            "",
        ],
    ]


def build_rollup_rows() -> list[list[str]]:
    return [
        ["Module", "Optimistic h", "Realistic h", "Optimistic $", "Realistic $"],
        ["0. Auth & identity", "TBD", "TBD", "TBD", "TBD"],
        ["1. Story system", "TBD", "TBD", "TBD", "TBD"],
        ["2. Dual-version pipeline", "TBD", "TBD", "TBD", "TBD"],
        ["3. SFW product", "TBD", "TBD", "TBD", "TBD"],
        ["4. NSFW product", "TBD", "TBD", "TBD", "TBD"],
        ["5. Routing + continuity", "TBD", "TBD", "TBD", "TBD"],
        ["6. Monetization", "TBD", "TBD", "TBD", "TBD"],
        ["7. Social + growth", "TBD", "TBD", "TBD", "TBD"],
        ["8. White-label", "TBD", "TBD", "TBD", "TBD"],
        ["9. Platform + compliance", "TBD", "TBD", "TBD", "TBD"],
        [],
        ["Roll up by role (when estimated)", "", "", "", ""],
        ["Backend", "TBD", "TBD", "TBD", "TBD"],
        ["Frontend", "TBD", "TBD", "TBD", "TBD"],
        ["Mobile", "TBD", "TBD", "TBD", "TBD"],
        ["QA", "TBD", "TBD", "TBD", "TBD"],
        ["BA", "TBD", "TBD", "TBD", "TBD"],
        ["PM", "TBD", "TBD", "TBD", "TBD"],
    ]


def build_high_level_rows() -> list[list[str]]:
    return [
        ["#", "Block", "Scope tag", "Summary"],
        [
            "1",
            "Strategy + product frame",
            "Both",
            "Micro-series; SFW+NSFW versions; funnel traffic -> money",
        ],
        ["2", "Audience + promise", "Both", "Core demo; emotional payoff in NSFW variant"],
        ["3", "Content + catalog model", "Both", "Series/season/episode; SFW<->NSFW mapping"],
        ["4", "SFW product", "SFW", "Catalog, playback, progress, bonus lib, commerce UI"],
        ["5", "NSFW product", "NSFW", "Single platform; full episodes; access; monetization"],
        ["6", "SFW -> NSFW bridge", "Both", "Gating; redirect token; continuity"],
        ["7", "Monetization + attribution", "Both", "SFW + NSFW lines; ads/affiliate billing surface"],
        ["8", "Growth + distribution", "Growth", "Social; Telegram; exclusives"],
        ["9", "Platform + compliance", "Platform", "Split properties; server gating; observability"],
        ["10", "Delivery horizon", "Both", "Phases 0-2; ~10 month bound"],
    ]


def build_roadmap_rows() -> list[list[str]]:
    return [
        ["Phase", "Horizon", "Focus"],
        [
            "Phase 0",
            "Through mid-May (business plan)",
            "Product spec; gating; redirect contract; SFW PWA vs NSFW web; monetization plan",
        ],
        [
            "Phase 1",
            "Months 1-3",
            "MVP SFW: catalog, SFW playback, progress, basic gating analytics",
        ],
        [
            "Phase 2",
            "Months 3-6",
            "Gating + NSFW web MVP; redirect token; resume NSFW at correct step",
        ],
        ["Phase 3+", "Months 6-10", "Scale, monetization depth, distribution — per roadmap doc"],
    ]


def pad_rows(values: list[list[str]], width: int) -> list[list[str]]:
    out = []
    for r in values:
        row = list(r)
        while len(row) < width:
            row.append("")
        out.append(row[:width])
    return out


def ensure_sheets(sheets_api, spreadsheet_id: str) -> None:
    meta = sheets_api.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets.properties").execute()
    existing = {s["properties"]["title"] for s in (meta.get("sheets") or [])}
    requests = []
    for title in SHEET_TITLES:
        if title not in existing:
            requests.append(
                {
                    "addSheet": {
                        "properties": {
                            "title": title,
                            "gridProperties": {"frozenRowCount": 1},
                        }
                    }
                }
            )
    if requests:
        sheets_api.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": requests},
        ).execute()


def push_all_values(sheets_api, spreadsheet_id: str) -> None:
    data_map = {
        "Discovery phase estimate": build_discovery_rows(),
        "MVP phase 1 estimate": build_mvp_rows(),
        "Scope coverage": build_scope_rows(),
        "Modules rollup": build_rollup_rows(),
        "High-level structure": build_high_level_rows(),
        "Roadmap phases": build_roadmap_rows(),
    }
    data = []
    for title, values in data_map.items():
        if not values:
            continue
        ncols = max(len(r) for r in values)
        padded = pad_rows(values, ncols)
        nrows = len(padded)

        def col_letter(n: int) -> str:
            s = ""
            while n:
                n, r = divmod(n - 1, 26)
                s = chr(65 + r) + s
            return s

        end = f"{col_letter(ncols)}{nrows}"
        data.append({"range": a1(title, f"A1:{end}"), "values": padded})

    sheets_api.spreadsheets().values().batchClear(
        spreadsheetId=spreadsheet_id,
        body={"ranges": [a1(t, "A1:Z2000") for t in SHEET_TITLES]},
    ).execute()

    sheets_api.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "USER_ENTERED", "data": data},
    ).execute()


def main() -> int:
    from googleapiclient.discovery import build

    if not _credentials_path().exists():
        print(json.dumps({"success": False, "error": f"Missing {_credentials_path()}"}, indent=2))
        return 1

    creds, err = get_credentials()
    if err:
        print(json.dumps({"success": False, "error": err}, indent=2))
        return 1

    sheets = build("sheets", "v4", credentials=creds)
    drive = build("drive", "v3", credentials=creds)

    sheet_id = read_sheet_id()
    title = "Only Stories / Not Only Stories — MVP decomposition (estimate)"

    if not sheet_id:
        created = (
            sheets.spreadsheets()
            .create(
                body={
                    "properties": {"title": title},
                    "sheets": [
                        {"properties": {"title": t, "gridProperties": {"frozenRowCount": 1}}}
                        for t in SHEET_TITLES
                    ],
                }
            )
            .execute()
        )
        sheet_id = created.get("spreadsheetId")
        if not sheet_id:
            print(json.dumps({"success": False, "error": "create returned no id"}, indent=2))
            return 1
        write_sheet_id(sheet_id)
        action = "created"
    else:
        ensure_sheets(sheets, sheet_id)
        meta = drive.files().get(fileId=sheet_id, fields="name, webViewLink").execute()
        if meta.get("name") != title:
            try:
                drive.files().update(fileId=sheet_id, body={"name": title}).execute()
            except Exception:
                pass
        action = "updated"

    push_all_values(sheets, sheet_id)

    meta = drive.files().get(fileId=sheet_id, fields="id, name, webViewLink").execute()
    web = meta.get("webViewLink") or f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
    print(
        json.dumps(
            {
                "success": True,
                "action": action,
                "file_id": sheet_id,
                "webViewLink": web,
                "id_file": str(DEFAULT_ID_FILE),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
