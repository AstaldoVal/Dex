#!/usr/bin/env python3
"""Create/update Google Spreadsheet: Mia childcare schedule (guardians + Mia-only tabs)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ID_FILE = REPO / "05-Areas" / "Cognitive_Performance" / "mia-childcare-google-sheet-id.txt"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

SHEET_GUARDIANS = "Опекуны"
SHEET_MIA = "Мия"

SPREADSHEET_TITLE = "Мия — расписание опекунов (Оэйраш, до 30.06.2026)"


def credentials_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get(
        "GOOGLE_CALENDAR_CREDENTIALS_PATH"
    )
    if path:
        return Path(path).expanduser()
    return REPO / "Credentials" / "personal" / "credentials.json"


def token_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return credentials_path().parent / "google_drive_token.json"


def get_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds_path = credentials_path()
    tok_path = token_path()
    if not creds_path.exists():
        raise FileNotFoundError(f"Missing Google OAuth credentials: {creds_path}")

    creds = None
    if tok_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(tok_path), SCOPES)
        except Exception as exc:
            print(f"Warning: could not load token: {exc}", file=sys.stderr)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        tok_path.parent.mkdir(parents=True, exist_ok=True)
        tok_path.write_text(creds.to_json(), encoding="utf-8")

    return creds


def guardians_rows() -> list[list[str]]:
    return [
        ["Оэйраш · до 30.06.2026 · personal Google Sheet"],
        [],
        ["День", "Мия (кратко)", "Бабушка", "Roman", "Катя", "Катя (ч)"],
        [
            "Пн",
            "Садик; бассейн ~17:30–18:15",
            "9:30–10:30 садик",
            "16:45 выезд → бассейн → передача 18:15–19:00 → 19:00+ работа",
            "19:00–22:00 с Мией (дом / прогулка)",
            "3",
        ],
        [
            "Вт",
            "Садик; Art Home ~17:20–20:00",
            "9:30–10:30 · ~20:30–22:00 с Мией",
            "~17:00 выезд → 17:20 забор → Art Home → 20:00 забор → ~20:30 дом → передача бабушке",
            "— (Мила 17:00–21:00)",
            "0",
        ],
        [
            "Ср",
            "Садик; 18:00–22:00 с бабушкой",
            "9:30–10:30 · 18:00–22:00 с Мией",
            "17:45 забор → передача ~18:00 → 18:00+ работа",
            "— (Art Home 12:00–20:00)",
            "0",
        ],
        [
            "Чт",
            "Садик; бассейн ~17:30–18:15",
            "9:30–10:30 · ~19:00–22:00 с Мией",
            "16:45 выезд → бассейн → передача ~19:00 бабушке → 19:00+ работа",
            "— (Мила 17:00–21:00)",
            "0",
        ],
        [
            "Пт",
            "Садик; вечер с Катей",
            "9:30–10:30 садик",
            "17:00+ работа / релиз",
            "~17:00 забор → с Мией до 22:00 (дом / прогулка)",
            "5",
        ],
        [
            "Сб",
            "Art Home 11:00–14:00 · 15:00–18:00 Катя · 18:00–22:00 бабушка",
            "18:00–22:00 с Мией",
            "10:30–11:00 отвоз → 14:00–15:00 забор и домой",
            "15:00–18:00 с Мией",
            "3",
        ],
        [
            "Вс",
            "Рисование 11:00–15:00 · 16:00–19:00 бабушка · 19:00–22:00 если Катя",
            "16:00–19:00 с Мией",
            "10:30–11:00 отвоз → ~15:00–16:00 забор и домой",
            "Art Home до 17:00 → по желанию 19:00–22:00",
            "0–3*",
        ],
        ["Total", "", "~20 ч/нед", "", "", "~11 · ~14*"],
        [],
        ["* Вс: Катя 19:00–22:00 только если согласится (+3 ч)."],
        ["Бабушка ~20 ч/нед: утро пн–пт ~5 · вт ~1,5 · ср 4 · чт 3 · сб 4 · вс 3"],
        ["Блокеры Катя: вт, чт — Мила 17:00–21:00 · ср — Art Home 12:00–20:00 · вс — Art Home 12:00–17:00"],
        ["Июнь: 20.06 Festa · 22.06 piano 18:00 (пн) · 27.06 ballet 10:30"],
    ]


def mia_rows() -> list[list[str]]:
    return [
        ["Мия — только она · Оэйраш · до 30.06.2026"],
        [],
        ["День", "Время", "Где / с кем", "Примечание"],
        ["Пн", "9:30–10:30", "Садик", "Бабушка отвоз"],
        ["Пн", "~10:30–16:45", "Садик", ""],
        ["Пн", "~16:45–18:15", "Roman", "Забор, дорога, бассейн"],
        ["Пн", "18:15–19:00", "Roman", "Дом, передача"],
        ["Пн", "19:00–22:00", "Катя", "Дом / прогулка"],
        ["Вт", "9:30–10:30", "Садик", "Бабушка отвоз"],
        ["Вт", "~10:30–17:20", "Садик", ""],
        ["Вт", "~17:00–20:30", "Roman", "Art Home ~17:20–20:00, забор, дом"],
        ["Вт", "~20:30–22:00", "Бабушка", ""],
        ["Ср", "9:30–10:30", "Садик", "Бабушка отвоз"],
        ["Ср", "~10:30–17:45", "Садик", ""],
        ["Ср", "17:45–18:00", "Roman", "Забор → передача"],
        ["Ср", "18:00–22:00", "Бабушка", ""],
        ["Чт", "9:30–10:30", "Садик", "Бабушка отвоз"],
        ["Чт", "~10:30–16:45", "Садик", ""],
        ["Чт", "~16:45–19:00", "Roman", "Забор, бассейн, передача"],
        ["Чт", "19:00–22:00", "Бабушка", ""],
        ["Пт", "9:30–10:30", "Садик", "Бабушка отвоз"],
        ["Пт", "~10:30–17:00", "Садик", ""],
        ["Пт", "~17:00–22:00", "Катя", "Забор + вечер"],
        ["Сб", "10:30–11:00", "Roman → Art Home", "Отвоз"],
        ["Сб", "11:00–14:00", "Art Home", ""],
        ["Сб", "14:00–15:00", "Roman", "Забор, дом"],
        ["Сб", "15:00–18:00", "Катя", ""],
        ["Сб", "18:00–22:00", "Бабушка", ""],
        ["Вс", "10:30–11:00", "Roman → рисование", "Отвоз"],
        ["Вс", "11:00–15:00", "Рисование", ""],
        ["Вс", "~15:00–16:00", "Roman", "Забор, дом ~16:00"],
        ["Вс", "16:00–19:00", "Бабушка", ""],
        ["Вс", "19:00–22:00", "Катя или семья", "Катя по желанию; иначе Roman/бабушка"],
        [],
        ["Не геп: сб/вс ~8:00–10:30 — Roman или бабушка (семья)."],
        ["Единственная дыра: вс 19:00–22:00, если Катя не приедет."],
    ]


def read_sheet_id() -> str | None:
    env = os.environ.get("MIA_CHILDCARE_SHEET_ID", "").strip()
    if env:
        return env
    if ID_FILE.exists():
        text = ID_FILE.read_text(encoding="utf-8").strip()
        return text or None
    return None


def write_sheet_id(sheet_id: str) -> None:
    ID_FILE.parent.mkdir(parents=True, exist_ok=True)
    ID_FILE.write_text(f"{sheet_id}\n", encoding="utf-8")


def make_services():
    from googleapiclient.discovery import build

    creds = get_credentials()
    return build("sheets", "v4", credentials=creds), build("drive", "v3", credentials=creds)


def create_spreadsheet(sheets_service) -> str:
    body = {
        "properties": {"title": SPREADSHEET_TITLE, "locale": "ru_RU"},
        "sheets": [
            {"properties": {"title": SHEET_GUARDIANS, "index": 0}},
            {"properties": {"title": SHEET_MIA, "index": 1}},
        ],
    }
    created = sheets_service.spreadsheets().create(body=body, fields="spreadsheetId").execute()
    return created["spreadsheetId"]


def sheet_id_by_title(sheets_service, spreadsheet_id: str, title: str) -> int:
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("title") == title:
            return int(props["sheetId"])
    raise KeyError(title)


def format_spreadsheet(sheets_service, spreadsheet_id: str) -> None:
    guardians_id = sheet_id_by_title(sheets_service, spreadsheet_id, SHEET_GUARDIANS)
    mia_id = sheet_id_by_title(sheets_service, spreadsheet_id, SHEET_MIA)
    requests = [
        {
            "updateSheetProperties": {
                "properties": {"sheetId": guardians_id, "gridProperties": {"frozenRowCount": 3}},
                "fields": "gridProperties.frozenRowCount",
            }
        },
        {
            "updateSheetProperties": {
                "properties": {"sheetId": mia_id, "gridProperties": {"frozenRowCount": 3}},
                "fields": "gridProperties.frozenRowCount",
            }
        },
        {
            "repeatCell": {
                "range": {
                    "sheetId": guardians_id,
                    "startRowIndex": 2,
                    "endRowIndex": 3,
                    "startColumnIndex": 0,
                    "endColumnIndex": 6,
                },
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
                    }
                },
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }
        },
        {
            "repeatCell": {
                "range": {
                    "sheetId": mia_id,
                    "startRowIndex": 2,
                    "endRowIndex": 3,
                    "startColumnIndex": 0,
                    "endColumnIndex": 4,
                },
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
                    }
                },
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }
        },
        {
            "autoResizeDimensions": {
                "dimensions": {"sheetId": guardians_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 6}
            }
        },
        {
            "autoResizeDimensions": {
                "dimensions": {"sheetId": mia_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 4}
            }
        },
    ]
    sheets_service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()


def upload_values(sheets_service, spreadsheet_id: str) -> None:
    data = [
        {"range": f"'{SHEET_GUARDIANS}'!A1", "values": guardians_rows()},
        {"range": f"'{SHEET_MIA}'!A1", "values": mia_rows()},
    ]
    sheets_service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "RAW", "data": data},
    ).execute()


def main() -> int:
    sheets_service, _drive = make_services()
    sheet_id = read_sheet_id()
    if not sheet_id:
        sheet_id = create_spreadsheet(sheets_service)
        write_sheet_id(sheet_id)
    else:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=sheet_id,
            body={
                "requests": [
                    {
                        "updateSpreadsheetProperties": {
                            "properties": {"title": SPREADSHEET_TITLE},
                            "fields": "title",
                        }
                    }
                ]
            },
        ).execute()

    upload_values(sheets_service, sheet_id)
    format_spreadsheet(sheets_service, sheet_id)

    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
    print(json.dumps({"ok": True, "spreadsheetId": sheet_id, "url": url}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
