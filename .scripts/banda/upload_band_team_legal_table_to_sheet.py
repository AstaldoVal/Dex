#!/usr/bin/env python3
"""
Upload «Питання 1. Повна таблиця команди» from BANDA_Team_Legal_Analysis.pdf
into a new tab on a Google Spreadsheet (work account: use
Credentials/google-work/google_sheets_token.json with spreadsheets scope).

Prerequisite if write fails with 403 / invalid_grant:
  PYTHONUNBUFFERED=1 python3 -u .scripts/banda/oauth_google_sheets_work_token.py

Env (optional):
  GOOGLE_SHEETS_LEGAL_TEAM_SPREADSHEET_ID — default: LEG-A1 tracker id from user link
  GOOGLE_DRIVE_CREDENTIALS_PATH / GOOGLE_DRIVE_TOKEN_PATH — same as other banda scripts
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

DEFAULT_SPREADSHEET_ID = "1ub-dQlmHjLtoqTv1yL_vtSb3T30CC5-RYMseCshCmjw"
NEW_SHEET_TITLE = "Питання 1 — повна таблиця команди"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

HEADERS = [
    "ПІБ (укр.)",
    "ПІБ (англ.)",
    "Посада",
    "Тип",
    "Місто/країна",
    "Статус",
]

SOURCE_NOTE = (
    "Джерело: PDF BANDA_Team_Legal_Analysis — блок «Питання 1. Повна таблиця команди» "
    "(Електронна таблиця співробітників.xlsx + NDA, 38+ осіб)."
)

ROWS: list[list[str]] = [
    ["Лобанов Павло", "Lobanov Pavel", "Founder", "Board", "—", "Активний"],
    ["Тураєв Кирило", "Turaiev Kyrylo", "CEO", "Board", "Україна", "Активний"],
    ["Римарук Олена", "Rymaruk Olena", "CFO", "Board", "Україна", "Активний"],
    ["Гриневич Алекс", "Grynevych Alex", "CBDO", "Board", "—", "Активний"],
    ["Скиба Юрій", "Skyba Yurii", "CTO", "Співробітник", "Стрий, Львів. обл.", "Активний"],
    ["Тутов Гліб", "Tutov Hlib", "CPO", "Співробітник", "Україна", "Активний"],
    ["Толмачов Микита", "Tolmachov Mykyta", "CMO", "Співробітник", "Київ", "Активний"],
    ["Маслова Олена", "Maslova Olena", "HR", "Співробітник", "Черкаси / Краків", "Активний"],
    ["Савченко Людмила", "Savchenko Liudmyla", "Recruiter", "Співробітник", "Кіровоградська обл.", "Активний"],
    ["Сіромаха Юлія", "Siromakha Yuliia", "Operation Manager", "Співробітник", "Дніпро", "Активний"],
    ["Бак Володимир", "Bak Volodymyr", "Product Manager", "Співробітник", "Львів", "Активний"],
    ["Пономарчук Андрій", "Ponomarchuk Andrii", "Business Analyst", "Співробітник", "Кременчук", "Активний"],
    ["Іванов Дмитро", "Ivanov Dmytro", "Software Developer", "Співробітник", "Київ", "Активний"],
    ["Тамащук Ян", "Tamashchuk Yan", "Software Developer", "Співробітник", "Одеська обл.", "Активний"],
    ["Деяк Василь", "Deiak Vasyl", "Developer", "Співробітник", "Закарпаття", "Активний"],
    ["Зерман Карім", "Zerman Karim", "Developer", "Співробітник", "Луганськ обл.", "Активний"],
    ["Зотова Софія", "Zotova Sofiia", "Delivery Manager", "Співробітник", "Харків", "Активний"],
    ["Зінченко Ілля", "Zinchenko Ilya", "Designer (UI/UX)", "Співробітник", "Київ", "Активний"],
    ["Дядьков Давид", "Diadkov Davyd", "IT Infrastructure", "Співробітник", "Запоріжжя", "Активний"],
    ["Надоля Антон", "Nadolia Anton", "IT Infrastructure", "Співробітник", "Дніпро", "Активний"],
    ["Карлін Олександр", "Karlin Oleksandr", "CQO", "Співробітник", "Лісабон, Португалія", "Активний"],
    ["Сидорова Галина", "Sydorova Halyna", "Marketing Manager", "Співробітник", "Івано-Франківськ", "Активний"],
    ["Манаєнко Артем", "Manaienko Artem", "Mobile CTO", "Консультант", "Краматорськ", "Активний"],
    ["Каплій Сергій", "Kaplii Serhii", "DevOps", "Консультант", "Дніпропетровська обл.", "Активний"],
    ["Тимченко Олексій", "Tymchenko Oleksii", "UI/UX Designer", "Консультант", "Київ", "Активний"],
    ["Шаповал Анастасія", "Shapoval Anastasiia", "UI/UX Designer", "Консультант", "Черкаси", "Активний"],
    ["Гаврилюк Марія", "Havryluik Mariia", "UI/UX Designer", "Консультант", "Черкаси", "Активний"],
    ["Вишневецька Марина", "Vyshnyvetska Maryna", "AI", "Консультант", "Харків", "Активний"],
    ["Олійник Дмитро", "Oliinyk Dmytro", "Blockchain/Web3", "Консультант", "Кривий Ріг", "Пауза"],
    ["Бойченко Владислав", "Boichenko Vladyslav", "Blockchain/Web3", "Консультант", "Фонтанка, Одеська обл.", "Активний"],
    ["Педієв Володимир", "Pediev Volodymyr", "App Store Publishing", "Консультант", "Одеса", "Активний"],
    ["Малишкін Володимир", "Malyshkin Volodymyr", "Аудитор токеноміки", "Консультант", "Харків", "Пауза"],
    ["Романов Михайло", "Romanov Mykhailo", "(з NDA, роль не зазначена)", "Консультант", "Київ", "Активний"],
    ["Красюк Олександр", "Krasiuk Oleksandr", "Motion Designer", "External", "Вінниця", "Активний"],
    ["Колінко Єлизавета", "Kolinko Yelyzaveta", "Designer", "External", "Херсонська обл.", "Активний"],
    ["Кадема Вікторія", "Kadema Viktoriia", "Designer", "External", "Київ", "Активний"],
    ["Шутько Вадим", "Shutko Vadym", "Project Manager", "Співробітник", "Хмельницький", "Звільнений 10.03.2026"],
    ["Зеленков Антон", "Zelenkov Anton", "Blockchain/Web3", "Консультант", "Харків", "Звільнений 17.03.2026"],
]

NOTE_ROW = [
    "Примітка (з PDF): всі учасники — громадяни України, крім Карліна О. "
    "(проживає в Португалії, паспорт UA). Тімліди: CTO (Dev), CPO (Product), CMO (Marketing), Mobile CTO (Mobile).",
    "",
    "",
    "",
    "",
    "",
]


def credentials_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if p:
        return Path(p).expanduser()
    return REPO / "Credentials" / "google-work" / "credentials.json"


def token_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if p:
        return Path(p).expanduser()
    return REPO / "Credentials" / "google-work" / "google_sheets_token.json"


def get_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds_path = credentials_path()
    tok_path = token_path()
    if not creds_path.exists():
        raise FileNotFoundError(f"Missing OAuth client: {creds_path}")
    if not tok_path.exists():
        raise FileNotFoundError(
            f"Missing token {tok_path}. Run: PYTHONUNBUFFERED=1 python3 -u "
            f"{REPO / '.scripts' / 'banda' / 'oauth_google_sheets_work_token.py'}"
        )
    creds = Credentials.from_authorized_user_file(str(tok_path), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0, open_browser=True)
        tok_path.parent.mkdir(parents=True, exist_ok=True)
        tok_path.write_text(creds.to_json(), encoding="utf-8")
    return creds


def print_tsv() -> int:
    import csv
    import io

    buf = io.StringIO()
    w = csv.writer(buf, delimiter="\t")
    w.writerow(HEADERS)
    w.writerows(ROWS)
    sys.stdout.write(buf.getvalue())
    return 0


def main() -> int:
    from googleapiclient.discovery import build

    if "--print-tsv" in sys.argv:
        return print_tsv()

    spreadsheet_id = os.environ.get("GOOGLE_SHEETS_LEGAL_TEAM_SPREADSHEET_ID", "").strip() or DEFAULT_SPREADSHEET_ID

    creds = get_credentials()
    sheets = build("sheets", "v4", credentials=creds)

    meta = sheets.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets.properties").execute()
    if NEW_SHEET_TITLE in {s["properties"]["title"] for s in meta.get("sheets", [])}:
        sid = next(
            s["properties"]["sheetId"]
            for s in meta["sheets"]
            if s["properties"]["title"] == NEW_SHEET_TITLE
        )
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"deleteSheet": {"sheetId": sid}}]},
        ).execute()

    add = sheets.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": NEW_SHEET_TITLE}}}]},
    ).execute()
    new_sheet_id = add["replies"][0]["addSheet"]["properties"]["sheetId"]

    values = [[SOURCE_NOTE], [], HEADERS, *ROWS, [], NOTE_ROW]

    sheets.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{NEW_SHEET_TITLE}'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": values},
    ).execute()

    print(f"OK: sheet tab={NEW_SHEET_TITLE!r} sheetId={new_sheet_id} rows={len(ROWS)}")
    print(f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit#gid={new_sheet_id}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print(
            "If OAuth refresh failed: run\n"
            "  PYTHONUNBUFFERED=1 python3 -u .scripts/banda/oauth_google_sheets_work_token.py\n"
            "then re-run this script.",
            file=sys.stderr,
        )
        raise SystemExit(1)
