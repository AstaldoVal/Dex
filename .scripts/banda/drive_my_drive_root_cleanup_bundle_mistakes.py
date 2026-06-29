#!/usr/bin/env python3
"""
Удаляет объекты, оставшиеся от ошибочного прогона загрузки пакета презентаций.

1) По умолчанию — **корень** «Мой диск»: папки 01-from-google-drive, 02-local-docx-8085,
   03-extracted-previews, файл Index 2. Banda Presentations Bundle.md

2) С флагом **--inside-presentations-bundle** — **внутри** папки на Drive
   `2. Banda Presentations Bundle` (id из Presentations_bundle_drive_upload_report.json
   или **BANDA_PRESENTATIONS_DRIVE_BUNDLE_FOLDER_ID**):
   те же три папки + Index … .md + README.md в корне пакета.
   Папки **docx**, **xlsx** и **_synced-office-from-repo** не трогаются.

Исправленный upload больше не создаёт 01/02/03 на Drive; этот скрипт только прибирает хвосты.

По умолчанию только печать (dry-run). Применение: --apply

Дополнительно для корня: точные имена файлов:
  --also-trash-names "README.md,BANDA Final Audit Summary.docx"

Запуск из корня репозитория:
  python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py
  python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --apply
  python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --inside-presentations-bundle --apply
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

# Имена ровно как при ошибочном ensure_path_ids в корне root.
FOLDER_NAMES = frozenset({"01-from-google-drive", "02-local-docx-8085", "03-extracted-previews"})
FILE_NAMES = frozenset({"Index 2. Banda Presentations Bundle.md"})
# Внутри bundle на Drive — системні артефакти (не контент для інвесторів).
BUNDLE_INTERIOR_EXTRA_FILES = frozenset({"README.md", "00-Index.md"})
BUNDLE_INTERIOR_META_FOLDERS = frozenset({".obsidian"})
PROTECTED_BUNDLE_SUBFOLDER_NAMES = frozenset({"docx", "xlsx", "_synced-office-from-repo"})

REPORT_PATH = (
    REPO / "04-Projects" / "Banda" / "banda-drive-import" / "Presentations_bundle_drive_upload_report.json"
)


def parse_extra_names(s: str | None) -> frozenset[str]:
    if not s or not s.strip():
        return frozenset()
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return frozenset(parts)


def list_children(service, parent_id: str) -> list[dict]:
    out = []
    tok = None
    while True:
        kw = dict(
            q=f"'{parent_id}' in parents and trashed = false",
            spaces="drive",
            fields="nextPageToken, files(id, name, mimeType)",
            pageSize=200,
        )
        if tok:
            kw["pageToken"] = tok
        resp = service.files().list(**kw).execute()
        out.extend(resp.get("files") or [])
        tok = resp.get("nextPageToken")
        if not tok:
            break
    return out


def list_root_children(service):
    return list_children(service, "root")


def load_bundle_folder_id() -> str:
    env_id = (os.environ.get("BANDA_PRESENTATIONS_DRIVE_BUNDLE_FOLDER_ID") or "").strip()
    if env_id:
        return env_id
    if not REPORT_PATH.is_file():
        raise FileNotFoundError(f"Нет отчёта с drive_bundle_folder_id: {REPORT_PATH}")
    data = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    fid = data.get("drive_bundle_folder_id")
    if not fid or not isinstance(fid, str):
        raise ValueError(
            f"В отчёте нет drive_bundle_folder_id: {REPORT_PATH}. "
            "Задайте BANDA_PRESENTATIONS_DRIVE_BUNDLE_FOLDER_ID или выполните успешный sync."
        )
    return fid


def collect_bundle_interior_targets(children: list[dict]) -> list[dict]:
    targets = []
    for f in children:
        name = f.get("name") or ""
        mid = f.get("mimeType") or ""
        if name in PROTECTED_BUNDLE_SUBFOLDER_NAMES and mid == "application/vnd.google-apps.folder":
            continue
        if mid == "application/vnd.google-apps.folder" and name in FOLDER_NAMES:
            targets.append(f)
        elif mid == "application/vnd.google-apps.folder" and name in BUNDLE_INTERIOR_META_FOLDERS:
            targets.append(f)
        elif mid != "application/vnd.google-apps.folder" and name in FILE_NAMES:
            targets.append(f)
        elif mid != "application/vnd.google-apps.folder" and name in BUNDLE_INTERIOR_EXTRA_FILES:
            targets.append(f)
    return targets


def trash_item(service, fid: str, apply: bool) -> str:
    if not apply:
        return "dry-run"
    service.files().update(fileId=fid, body={"trashed": True}).execute()
    return "trashed"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="переместить совпадения в корзину Drive")
    ap.add_argument(
        "--also-trash-names",
        default="",
        help="доп. имена файлов в корне (через запятую), только точное совпадение, не папки",
    )
    ap.add_argument(
        "--inside-presentations-bundle",
        action="store_true",
        help="чистить внутри папки 2. Banda Presentations Bundle (id из Presentations_bundle_drive_upload_report.json)",
    )
    args = ap.parse_args()

    extra_files = parse_extra_names(args.also_trash_names)

    svc = drive_service()

    if args.inside_presentations_bundle:
        parent_id = load_bundle_folder_id()
        print(f"Родитель (bundle на Drive): {parent_id}", file=sys.stderr)
        children = list_children(svc, parent_id)
        targets = collect_bundle_interior_targets(children)
        scope = "внутри 2. Banda Presentations Bundle"
    else:
        children = list_root_children(svc)
        targets = []
        for f in children:
            name = f.get("name") or ""
            mid = f.get("mimeType") or ""
            if mid == "application/vnd.google-apps.folder" and name in FOLDER_NAMES:
                targets.append(f)
            elif mid != "application/vnd.google-apps.folder" and name in FILE_NAMES:
                targets.append(f)
            elif mid != "application/vnd.google-apps.folder" and name in extra_files:
                targets.append(f)
        scope = "в корне «Мой диск»"

    if not targets:
        print(f"Нет совпадений {scope} (уже чисто или нет доступа к списку).")
        return 0

    for f in targets:
        act = trash_item(svc, f["id"], args.apply)
        print(f"{act}: {f['name']} ({f['mimeType']}) id={f['id']}")

    if not args.apply:
        print(f"\nЭто был dry-run ({scope}). Повторите с --apply чтобы переместить в корзину.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
