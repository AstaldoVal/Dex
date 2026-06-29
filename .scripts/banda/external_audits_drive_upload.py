#!/usr/bin/env python3
"""
Загружает содержимое `3. External_Audits` на Google Drive: одна папка с тем же именем.
В корне Drive-папки: .docx и .xlsx из локального корня пакета.
Дерево **`Obsidian/**/*.md`** заливається з тією ж ієрархією під текою `Obsidian/` на Drive
(системні імена README.md, CHANGELOG.md, AGENTS.md, 00-Index.md на будь-якій глибині пропускаються).
Перед заливкою: дублікати `*.md` поруч з `Obsidian/` (як у Board) і застаріла коренева тека `Obsidian/` на Drive,
якщо локально в корені пакета її немає (Drive має відповідати локалці).

Родитель по умолчанию — корень «Мой диск» (как у `2. Banda Presentations Bundle`).

Запуск из корня репозитория:
  python3 .scripts/banda/external_audits_drive_upload.py

Переменные окружения: GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH,
  BANDA_EXTERNAL_AUDITS_DIR, BANDA_EXTERNAL_AUDITS_DRIVE_PARENT_ID
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

from generate_board_obsidian_cards_and_drive_upload import (  # noqa: E402
    _find_file_id,
    drive_service,
    trash_duplicate_root_md_next_to_obsidian_on_drive,
    trash_stale_obsidian_folder_at_drive_root_if_missing_locally,
)

from presentations_bundle_index_and_drive_upload import (  # noqa: E402
    ensure_drive_folder,
    ensure_drive_path_segments,
    guess_mimetype,
)

DEFAULT_LOCAL = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "3. External_Audits"
REPORT_PATH = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "External_Audits_drive_upload_report.json"

ALLOWED_SUFFIXES = {".docx", ".xlsx", ".md"}
OBSIDIAN_NOTES_DIR = "Obsidian"
# На Drive для External Audits — лише контентні .md (індекси, картки), без README/репо-мети.
SKIP_MD_BASENAMES_LOWER = frozenset(
    {
        "readme.md",
        "changelog.md",
        "agents.md",
        "00-index.md",
    }
)


def collect_files(local_root: Path) -> list[Path]:
    """Корінь: .docx/.xlsx. Markdown: рекурсивно з `Obsidian/**/*.md` (без системних імен)."""
    out: list[Path] = []
    for p in sorted(local_root.iterdir()):
        if not p.is_file():
            continue
        suf = p.suffix.lower()
        if suf in (".docx", ".xlsx"):
            out.append(p)
    obsidian = local_root / OBSIDIAN_NOTES_DIR
    if obsidian.is_dir():
        for p in sorted(obsidian.rglob("*.md")):
            if not p.is_file():
                continue
            if p.name.lower() in SKIP_MD_BASENAMES_LOWER:
                continue
            out.append(p)
    return sorted(out, key=lambda x: (x.parent != local_root, str(x.relative_to(local_root)), x.name.lower()))


def upload_one(service, local_path: Path, parent_id: str) -> dict:
    from googleapiclient.http import MediaFileUpload

    name = local_path.name
    mime = guess_mimetype(local_path)
    if local_path.suffix.lower() == ".md":
        mime = "text/markdown"
    media = MediaFileUpload(str(local_path), mimetype=mime, resumable=False)
    body = {"name": name, "parents": [parent_id]}
    existing = _find_file_id(service, parent_id, name)
    if existing:
        service.files().update(fileId=existing, media_body=media, fields="id").execute()
        return {"path": name, "action": "updated", "id": existing}
    out = service.files().create(body=body, media_body=media, fields="id").execute()
    return {"path": name, "action": "created", "id": out["id"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--local-dir",
        type=Path,
        default=Path(os.environ.get("BANDA_EXTERNAL_AUDITS_DIR", DEFAULT_LOCAL)),
    )
    ap.add_argument(
        "--drive-parent-id",
        default=os.environ.get("BANDA_EXTERNAL_AUDITS_DRIVE_PARENT_ID", "root"),
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="list files only, no Drive writes (debug; after structure changes does not replace full sync)",
    )
    args = ap.parse_args()

    local_root = args.local_dir.resolve()
    if not local_root.is_dir():
        print(f"Folder not found: {local_root}", file=sys.stderr)
        return 1

    files = collect_files(local_root)
    report: dict = {
        "local_root": str(local_root),
        "drive_parent_id": args.drive_parent_id,
        "file_count": len(files),
        "dry_run": args.dry_run,
        "policy": "Drive folder: flat .docx/.xlsx at root + Obsidian/**/*.md mirrored under Obsidian/ on Drive",
    }

    print(f"Files to sync: {len(files)} under {local_root.name}")

    if args.dry_run:
        report["files"] = [p.relative_to(local_root).as_posix() for p in files]
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Report: {REPORT_PATH}")
        return 0

    try:
        svc = drive_service()
        folder_id = ensure_drive_folder(svc, args.drive_parent_id, local_root.name)
        dup_trashed = trash_duplicate_root_md_next_to_obsidian_on_drive(svc, folder_id)
        report["drive_duplicate_root_md_trashed"] = dup_trashed
        stale_root_obs = trash_stale_obsidian_folder_at_drive_root_if_missing_locally(
            svc, folder_id, local_root, obsidian_folder_name=OBSIDIAN_NOTES_DIR
        )
        report["drive_stale_root_obsidian_folder_trashed"] = stale_root_obs
        uploaded: list[dict] = []
        errors: list[str] = []
        obsidian_root = local_root / OBSIDIAN_NOTES_DIR
        for p in files:
            try:
                if p.parent == local_root:
                    parent_id = folder_id
                else:
                    rel_under = p.relative_to(obsidian_root)
                    segments = (OBSIDIAN_NOTES_DIR,) + tuple(rel_under.parent.parts)
                    parent_id = ensure_drive_path_segments(svc, folder_id, segments)
                uploaded.append(upload_one(svc, p, parent_id))
            except Exception as exc:
                errors.append(f"{p.relative_to(local_root).as_posix()}: {exc}")
        report["drive_folder_id"] = folder_id
        report["uploaded"] = uploaded
        report["errors"] = errors
        print(f"Drive folder id: {folder_id}; synced {len(uploaded)}, errors={len(errors)}")
        for e in errors[:20]:
            print(f"  ERR {e}", file=sys.stderr)
    except Exception as exc:
        report["fatal"] = str(exc)
        print(f"Drive upload failed: {exc}", file=sys.stderr)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {REPORT_PATH}")
    return 1 if report.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
