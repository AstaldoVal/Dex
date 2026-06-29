#!/usr/bin/env python3
"""
Eval / gate: на Google Drive під коренем «2. Banda Presentations Bundle» не має бути
активної (не в кошику) теки з іменем legacy office-parent — за замовчуванням
`_synced-office-from-repo` (або `BANDA_PRESENTATIONS_OFFICE_PARENT`).

Призначення: після ручного видалення зайвої теки на Drive переконатися, що вона
зникла; у CI — `python3 …/eval_…py` або `npm run banda:presentations-bundle:eval-no-synced-folder`.

Exit codes:
  0 — теки немає (trashed не враховуємо: `trashed = false`).
  1 — теку знайдено або не вдалося визначити bundle folder id.
  2 — помилка Drive API / credentials.

Змінні середовища (як у presentations_bundle_index_and_drive_upload.py):
  GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH
  BANDA_PRESENTATIONS_BUNDLE — локальний шлях до bundle (для імені теки на Drive)
  BANDA_PRESENTATIONS_DRIVE_PARENT_ID — батько bundle на Drive (default: root)
  BANDA_PRESENTATIONS_OFFICE_PARENT — яке ім’я шукати замість `_synced-office-from-repo`
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
    _find_child_folder_id,
    drive_service,
)
from presentations_bundle_index_and_drive_upload import (  # noqa: E402
    DEFAULT_BUNDLE,
    REPORT_PATH,
    get_office_sync_parent_name,
)


def resolve_bundle_folder_id(
    service,
    *,
    bundle_root: Path,
    drive_parent_id: str,
    report_path: Path,
    bundle_folder_id_cli: str | None,
) -> str:
    if bundle_folder_id_cli:
        return bundle_folder_id_cli.strip()
    if report_path.is_file():
        try:
            data = json.loads(report_path.read_text(encoding="utf-8"))
            bid = data.get("drive_bundle_folder_id")
            if isinstance(bid, str) and bid.strip():
                return bid.strip()
        except (json.JSONDecodeError, OSError):
            pass
    bid = _find_child_folder_id(service, drive_parent_id, bundle_root.name)
    if not bid:
        raise RuntimeError(
            f"Не знайдено теку bundle {bundle_root.name!r} під parent {drive_parent_id!r}. "
            "Запустіть синк bundle хоча б раз або передайте --bundle-folder-id."
        )
    return bid


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Перевірка: на Drive немає legacy office-parent теки під коренем presentations bundle."
    )
    ap.add_argument(
        "--bundle-folder-id",
        default=None,
        help="id кореневої теки bundle на Drive (інакше зі звіту або пошук за іменем)",
    )
    ap.add_argument(
        "--drive-parent-id",
        default=os.environ.get("BANDA_PRESENTATIONS_DRIVE_PARENT_ID", "root"),
        help="батько bundle (default: env BANDA_PRESENTATIONS_DRIVE_PARENT_ID або root)",
    )
    ap.add_argument(
        "--bundle-root",
        type=Path,
        default=Path(os.environ.get("BANDA_PRESENTATIONS_BUNDLE", str(DEFAULT_BUNDLE))).resolve(),
        help="локальний шлях до bundle (лише для імені теки на Drive)",
    )
    ap.add_argument(
        "--report",
        type=Path,
        default=REPORT_PATH,
        help="шлях до Presentations_bundle_drive_upload_report.json",
    )
    ap.add_argument("--quiet", action="store_true", help="лише exit code, без stdout при успіху")
    args = ap.parse_args()

    office_name = get_office_sync_parent_name()

    try:
        svc = drive_service()
        bundle_id = resolve_bundle_folder_id(
            svc,
            bundle_root=args.bundle_root,
            drive_parent_id=args.drive_parent_id,
            report_path=args.report,
            bundle_folder_id_cli=args.bundle_folder_id,
        )
        found = _find_child_folder_id(svc, bundle_id, office_name)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Drive / credentials: {exc}", file=sys.stderr)
        return 2

    if found:
        print(
            f"FAIL: під bundle (id {bundle_id}) все ще є активна тека «{office_name}» (id {found}). "
            "Видаліть її в інтерфейсі Drive (корзина) або через API, потім повторіть eval.",
            file=sys.stderr,
        )
        return 1

    if not args.quiet:
        print(
            f"OK: активної теки «{office_name}» під bundle id {bundle_id} на Drive немає "
            f"(перевірено ім’я bundle: {args.bundle_root.name!r})."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
