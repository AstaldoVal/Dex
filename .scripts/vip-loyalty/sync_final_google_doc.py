#!/usr/bin/env python3
"""
Append the VIP unit economics note to the final Google Doc.

The script is idempotent: if the appendix already exists, it replaces that
section instead of appending a duplicate.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

DOC_ID = "1zE_V-hSzDe2uojRzehyjo2X3GYJabCkFsE3r6qK0EfY"
DOC_URL = f"https://docs.google.com/document/d/{DOC_ID}/edit?tab=t.0"
SHEET_URL = "https://docs.google.com/spreadsheets/d/1kt0XCMAiAEywLMNIlehPdGV98UWh-glqiDjNB0kdwv0/edit?usp=drivesdk"

REPO = Path(__file__).resolve().parents[2]
PROJECT_DIR = REPO / "04-Projects" / "VIP_Loyalty_Test_Assignment"
UNIT_ECONOMICS_MD = PROJECT_DIR / "02_unit_economics.md"

APPENDIX_TITLE = "Приложение. Юнит-экономика VIP v1"
RELATED_ARTIFACTS_TITLE = "16) Связанные артефакты"

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]


def credentials_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
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
            granted = set(creds.scopes or [])
            if not set(SCOPES).issubset(granted):
                creds = None
        except Exception as exc:
            print(f"Warning: could not load existing token: {exc}", file=sys.stderr)

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


def strip_frontmatter(text: str) -> str:
    text = text.replace("\r\n", "\n")
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            text = text[end + len("\n---\n") :]
    lines = []
    for line in text.splitlines():
        if line.startswith("Graph links:"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def markdown_to_doc_text(markdown: str) -> str:
    markdown = strip_frontmatter(markdown)
    output: list[str] = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if line == "# Юнит-экономика VIP v1":
            continue
        if line.startswith("## "):
            output.append("")
            output.append(line[3:].strip())
            continue
        if line.startswith("### "):
            output.append("")
            output.append(line[4:].strip())
            continue

        line = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
        line = line.replace("`", "")
        line = line.replace("→", "->")
        output.append(line)

    while output and output[0] == "":
        output.pop(0)
    return "\n".join(output).strip()


def collect_text_with_indexes(doc: dict) -> tuple[str, list[int]]:
    text_parts: list[str] = []
    doc_indexes: list[int] = []

    for element in doc.get("body", {}).get("content", []):
        paragraph = element.get("paragraph")
        if not paragraph:
            continue
        for piece in paragraph.get("elements", []):
            text_run = piece.get("textRun")
            if not text_run:
                continue
            content = text_run.get("content", "")
            start = piece.get("startIndex")
            if start is None:
                continue
            text_parts.append(content)
            doc_indexes.extend(start + offset for offset in range(len(content)))

    return "".join(text_parts), doc_indexes


def find_text_start_index(doc: dict, needle: str) -> int | None:
    text, indexes = collect_text_with_indexes(doc)
    position = text.find(needle)
    if position == -1 or position >= len(indexes):
        return None
    return indexes[position]


def find_paragraph_start_before(doc: dict, index: int) -> int:
    best = index
    for element in doc.get("body", {}).get("content", []):
        paragraph = element.get("paragraph")
        if not paragraph:
            continue
        start = element.get("startIndex")
        end = element.get("endIndex")
        if start is not None and end is not None and start <= index < end:
            best = start
            break
    return best


def end_index(doc: dict) -> int:
    return doc["body"]["content"][-1]["endIndex"]


def main() -> int:
    from googleapiclient.discovery import build

    creds = get_credentials()
    docs = build("docs", "v1", credentials=creds)

    markdown = UNIT_ECONOMICS_MD.read_text(encoding="utf-8")
    appendix_body = markdown_to_doc_text(markdown)
    related_artifacts_text = (
        f"\n\n{RELATED_ARTIFACTS_TITLE}\n"
        f"- Основной итоговый документ: {DOC_URL}\n"
        f"- Расчёт экономики в Google Spreadsheet: {SHEET_URL}\n"
        "- Данные, сущности, интеграции: 03_data_logic.md\n"
        "- Прототип экранов (wireframe): 04_lowfi_prototype.md\n"
        "- Вопросы, которые нужно закрыть до go-live: 05_open_questions.md\n"
    )
    appendix_text = f"{related_artifacts_text}\n\n{APPENDIX_TITLE}\n\n{appendix_body}\n"

    doc = docs.documents().get(documentId=DOC_ID).execute()
    start = find_text_start_index(doc, RELATED_ARTIFACTS_TITLE)
    if start is None:
        start = find_text_start_index(doc, APPENDIX_TITLE)
    delete_start = find_paragraph_start_before(doc, start) if start is not None else None
    insert_at = delete_start if delete_start is not None else end_index(doc) - 1
    insert_end = insert_at + len(appendix_text)

    requests = []
    requests.append(
        {
            "replaceAllText": {
                "containsText": {
                    "text": "02_unit_economics.md",
                    "matchCase": True,
                },
                "replaceText": f"раздел «{APPENDIX_TITLE}»",
            }
        }
    )
    if delete_start is not None:
        requests.append(
            {
                "deleteContentRange": {
                    "range": {
                        "startIndex": delete_start,
                        "endIndex": end_index(doc) - 1,
                    }
                }
            }
        )
    requests.append({"insertText": {"location": {"index": insert_at}, "text": appendix_text}})
    requests.append(
        {
            "deleteParagraphBullets": {
                "range": {
                    "startIndex": insert_at,
                    "endIndex": insert_end,
                }
            }
        }
    )
    requests.append(
        {
            "updateParagraphStyle": {
                "range": {
                    "startIndex": insert_at,
                    "endIndex": insert_end,
                },
                "paragraphStyle": {"namedStyleType": "NORMAL_TEXT"},
                "fields": "namedStyleType",
            }
        }
    )

    docs.documents().batchUpdate(documentId=DOC_ID, body={"requests": requests}).execute()

    print(f"Updated Google Doc: {DOC_URL}")
    print(f"Linked spreadsheet: {SHEET_URL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
