#!/usr/bin/env python3
"""
Перелік (dry-run) або видалення у кошику файлів/папок, які не є «контентом»
для трьох дерев Banda на Google Drive: 1. Board, 2. Banda Presentations Bundle, 3. External_Audits.

Перевіряє **лише прямих дітей** кожного кореня (не рекурсивно).

Запуск з кореня репозиторію:
  python3 .scripts/banda/audit_banda_drive_meta_artifacts.py
  python3 .scripts/banda/audit_banda_drive_meta_artifacts.py --apply

Якщо для папки на кшталк **`.obsidian`** у корені Board API повертає **403 appNotAuthorizedToChild**,
видаліть теку вручну в інтерфейсі Drive (OAuth `drive.file` не дає прав на всі дочірні файли).

ID коренів: env `BANDA_DRIVE_BOARD_ROOT_ID`, `BANDA_PRESENTATIONS_DRIVE_BUNDLE_FOLDER_ID`
(або `drive_bundle_folder_id` з `Presentations_bundle_drive_upload_report.json`),
`BANDA_EXTERNAL_AUDITS_DRIVE_FOLDER_ID` (або `drive_folder_id` з `External_Audits_drive_upload_report.json`).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_board_obsidian_cards_and_drive_upload import drive_service  # noqa: E402

DEFAULT_BOARD_ID = "1YtMDH8jaCxQlk5vKiQT7mnm4fVEUrBzx"
REPORT_BUNDLE = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "Presentations_bundle_drive_upload_report.json"
REPORT_EXT = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "External_Audits_drive_upload_report.json"

META_FILE_NAMES_LOWER = frozenset(
    {
        "readme.md",
        "changelog.md",
        "agents.md",
        "00-index.md",
        ".gitignore",
        "package.json",
        "package-lock.json",
    }
)
META_FOLDER_NAMES = frozenset({".obsidian", ".cursor", ".git", "node_modules", ".scripts"})


def load_json_id(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    v = data.get(key)
    return v if isinstance(v, str) and v.strip() else None


def list_children(service, parent_id: str) -> list[dict]:
    out: list[dict] = []
    tok = None
    while True:
        kw: dict = {
            "q": f"'{parent_id}' in parents and trashed = false",
            "spaces": "drive",
            "fields": "nextPageToken, files(id, name, mimeType)",
            "pageSize": 200,
        }
        if tok:
            kw["pageToken"] = tok
        resp = service.files().list(**kw).execute()
        out.extend(resp.get("files") or [])
        tok = resp.get("nextPageToken")
        if not tok:
            break
    return out


def is_meta_hit(f: dict) -> bool:
    name = (f.get("name") or "").strip()
    mid = f.get("mimeType") or ""
    nl = name.lower()
    if mid == "application/vnd.google-apps.folder" and name in META_FOLDER_NAMES:
        return True
    if mid != "application/vnd.google-apps.folder" and nl in META_FILE_NAMES_LOWER:
        return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="перемістити знайдене в кошик Drive")
    args = ap.parse_args()

    board_id = os.environ.get("BANDA_DRIVE_BOARD_ROOT_ID") or DEFAULT_BOARD_ID
    bundle_id = os.environ.get("BANDA_PRESENTATIONS_DRIVE_BUNDLE_FOLDER_ID") or load_json_id(
        REPORT_BUNDLE, "drive_bundle_folder_id"
    )
    ext_id = os.environ.get("BANDA_EXTERNAL_AUDITS_DRIVE_FOLDER_ID") or load_json_id(REPORT_EXT, "drive_folder_id")

    roots: list[tuple[str, str]] = [("1. Board", board_id)]
    if bundle_id:
        roots.append(("2. Banda Presentations Bundle", bundle_id))
    else:
        print(f"Пропуск bundle: немає drive_bundle_folder_id у {REPORT_BUNDLE}", file=sys.stderr)
    if ext_id:
        roots.append(("3. External_Audits", ext_id))
    else:
        print(f"Пропуск External Audits: немає drive_folder_id у {REPORT_EXT}", file=sys.stderr)

    svc = drive_service()
    total = 0
    for label, pid in roots:
        children = list_children(svc, pid)
        hits = [f for f in children if is_meta_hit(f)]
        if not hits:
            print(f"{label} ({pid}): немає збігів серед прямих дітей.")
            continue
        print(f"{label} ({pid}): знайдено {len(hits)} об'єкт(ів):")
        for f in hits:
            total += 1
            name = f.get("name")
            mid = f.get("mimeType")
            fid = f.get("id")
            if args.apply:
                svc.files().update(fileId=fid, body={"trashed": True}).execute()
                print(f"  trashed: {name} ({mid}) id={fid}")
            else:
                print(f"  would trash: {name} ({mid}) id={fid}")
    if not args.apply and total:
        print(f"\nDry-run: {total} об'єкт(ів). Повторіть з --apply для кошика.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
