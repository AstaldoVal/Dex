#!/usr/bin/env python3
"""
Створює або оновлює вкладки Armada / 8085 у Google Spreadsheet «BANDA Final Audit Tracker».

Листи:
  - Q_and_A_Armada8085
  - Documents_prep_Armada8085
  - Armada8085_Dashboard

Змінні середовища (опційно): GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH
Потрібні scopes: drive.file + spreadsheets (як у інших скриптах з Sheets API).

Запуск з кореня репозиторію:
  python3 .scripts/banda/armada8085_tracker_sheets_setup.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

SPREADSHEET_ID = os.environ.get(
    "BANDA_FINAL_AUDIT_TRACKER_SHEET_ID",
    "1p2cqkLq1AFDHzwPD7wXfYRrbCU9fAmR3Itykphvxd1k",
)

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

QA_SHEET = "Q_and_A_Armada8085"
DOC_SHEET = "Documents_prep_Armada8085"
DASH_SHEET = "Armada8085_Dashboard"

QA_HEADERS = [
    [
        "ID",
        "Дата в чаті",
        "Питання",
        "Відповідь (коротко)",
        "Посилання на повну відповідь",
        "Статус",
        "Власник наступного кроку",
        "Наступний крок",
        "Дедлайн",
        "Зв'язані документи",
        "Підтвердження закриття",
        "Ескалація в Findings",
    ]
]

DOC_HEADERS = [
    [
        "ID",
        "Назва артефакту",
        "Тип",
        "Посилання Drive / шлях",
        "Версія / дата",
        "Статус підготовки",
        "Залежності від Q&A",
        "Примітки",
    ]
]


def credentials_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if p:
        return Path(p).expanduser()
    return REPO / "Credentials" / "personal" / "credentials.json"


def token_path() -> Path:
    p = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if p:
        return Path(p).expanduser()
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
            granted = set(creds.scopes or [])
            if not set(SCOPES).issubset(granted):
                creds = None
        except Exception as exc:
            print(f"Warning: could not load token: {exc}", file=sys.stderr)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        tok_path.parent.mkdir(parents=True, exist_ok=True)
        tok_path.write_text(creds.to_json(), encoding="utf-8")

    return creds


def sheets_service():
    from googleapiclient.discovery import build

    return build("sheets", "v4", credentials=get_credentials(), cache_discovery=False)


def sheet_title_to_id(meta: dict, title: str) -> int | None:
    for s in meta.get("sheets", []):
        props = s.get("properties", {})
        if props.get("title") == title:
            return props.get("sheetId")
    return None


def ensure_sheet(service, spreadsheet_id: str, title: str) -> int:
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sid = sheet_title_to_id(meta, title)
    if sid is not None:
        return sid
    body = {
        "requests": [
            {
                "addSheet": {
                    "properties": {
                        "title": title,
                        "gridProperties": {"frozenRowCount": 1},
                    }
                }
            }
        ]
    }
    out = service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body=body).execute()
    return out["replies"][0]["addSheet"]["properties"]["sheetId"]


def write_range(service, spreadsheet_id: str, range_a1: str, values: list[list[str]]) -> None:
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_a1,
        valueInputOption="USER_ENTERED",
        body={"values": values},
    ).execute()


def build_dashboard_rows(qa_sheet_title: str, doc_sheet_title: str) -> list[list[str]]:
    """Формулі посилаються на колонку F (Статус) у QA та F (Статус підготовки) у документах."""
    return [
        ["Зведення Armada / 8085 (Telegram + юридичні матеріали)", ""],
        [
            "Відкритих питань (статуси: Відкрито, В процесі, Блокер)",
            f'=COUNTIFS({qa_sheet_title}!F:F,"Відкрито")+COUNTIFS({qa_sheet_title}!F:F,"В процесі")+COUNTIFS({qa_sheet_title}!F:F,"Блокер")',
        ],
        [
            "Документів у роботі (Чернетка або На узгодженні)",
            f'=COUNTIFS({doc_sheet_title}!F:F,"Чернетка")+COUNTIFS({doc_sheet_title}!F:F,"На узгодженні")',
        ],
        ["", ""],
        [
            "Критерій «усі питання закриті»: перший рядок вище = 0 і немає порожнього статусу у заповнених рядках QA.",
            "",
        ],
        ["Листи даних:", f"'{qa_sheet_title}' | '{doc_sheet_title}'"],
        ["", ""],
        [
            "Імпорт з Telegram",
            "Перенесіть пари питання (Павло) та відповідь (Ілля) з чату Armada / 8085; один рядок = один цикл. Довгі відповіді — резюме в колонці D, повний текст — колонка E або окремий Google Doc + посилання.",
        ],
    ]


def seed_placeholder_rows(service, spreadsheet_id: str) -> None:
    """Один шаблонний рядок для QA та документів, якщо таблиця порожня під даними."""
    qa_cell = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{QA_SHEET}'!A2")
        .execute()
    )
    if not qa_cell.get("values"):
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{QA_SHEET}'!A2:L2",
            valueInputOption="USER_ENTERED",
            body={
                "values": [
                    [
                        "ARM-Q000",
                        "",
                        "Шаблон: замініть рядками з чату Telegram Armada / 8085 (Павло → Ілля)",
                        "",
                        "",
                        "Не актуально",
                        "",
                        "Видалити цей рядок після переносу реальних пар питання-відповідь",
                        "",
                        "",
                        "",
                        "Ні",
                    ]
                ]
            },
        ).execute()
        print("Seeded QA placeholder row 2", file=sys.stderr)

    doc_cell = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{DOC_SHEET}'!A2")
        .execute()
    )
    if not doc_cell.get("values"):
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{DOC_SHEET}'!A2:H2",
            valueInputOption="USER_ENTERED",
            body={
                "values": [
                    [
                        "ARM-D000",
                        "Шаблон: договір / додатки / перелік ключових моментів з чату",
                        "Інше",
                        "",
                        "",
                        "Чернетка",
                        "",
                        "Видалити після додавання реальних файлів і посилань на Drive",
                    ]
                ]
            },
        ).execute()
        print("Seeded Documents placeholder row 2", file=sys.stderr)


def maybe_append_summary_block(service, spreadsheet_id: str) -> None:
    """Додає блок посилань у лист Summary, якщо ще немає маркера ARMADA8085_BLOCK."""
    marker = "ARMADA8085_TRACKER_BLOCK"
    try:
        resp = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range="Summary!A1:A200")
            .execute()
        )
        rows = resp.get("values") or []
        flat = "\n".join(r[0] for r in rows if r)
        if marker in flat:
            return
    except Exception as exc:
        print(f"Summary read skipped: {exc}", file=sys.stderr)
        return

    block = [
        [marker],
        ["Armada / 8085 — детальний Q&A та документи"],
        ["Листи у цій таблиці:", "Q_and_A_Armada8085 | Documents_prep_Armada8085 | Armada8085_Dashboard"],
        [
            "Правило",
            "Не дублювати кожне питання у Findings; ескалація лише для матеріальних ризиків аудиту — колонка «Ескалація в Findings».",
        ],
    ]
    start = len(rows) + 1
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"Summary!A{start}",
        valueInputOption="USER_ENTERED",
        body={"values": block},
    ).execute()
    print(f"Appended Summary block at row {start}", file=sys.stderr)


def main() -> int:
    svc = sheets_service()
    sid = SPREADSHEET_ID

    ensure_sheet(svc, sid, QA_SHEET)
    ensure_sheet(svc, sid, DOC_SHEET)
    ensure_sheet(svc, sid, DASH_SHEET)

    write_range(svc, sid, f"'{QA_SHEET}'!A1", QA_HEADERS)
    write_range(svc, sid, f"'{DOC_SHEET}'!A1", DOC_HEADERS)

    dash_rows = build_dashboard_rows(QA_SHEET, DOC_SHEET)
    write_range(svc, sid, f"'{DASH_SHEET}'!A1", dash_rows)

    seed_placeholder_rows(svc, sid)

    maybe_append_summary_block(svc, sid)

    url = f"https://docs.google.com/spreadsheets/d/{sid}/edit"
    print(f"OK: {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
