#!/usr/bin/env python3
"""
Загружает на Google Drive только офисные файлы пакета презентацій:

  <родитель, по умолчанию root>/2. Banda Presentations Bundle/
    (цілі для .docx / .xlsx — **лише явно задані** через env або legacy-режим; див. README пакета)

Куди саме потрапляють docx/xlsx (пріоритет):
  1. `BANDA_PRESENTATIONS_DOCX_FOLDER_ID` / `BANDA_PRESENTATIONS_XLSX_FOLDER_ID` — якщо непорожні,
     файли створюються/оновлюються безпосередньо в цих теках Drive (`parents` у API). Ланцюжок
     `ensure_drive_folder` для батьків docx/xlsx у bundle не викликається.
  2. Інакше `BANDA_PRESENTATIONS_DOCX_FOLDER_NAME` / `BANDA_PRESENTATIONS_XLSX_FOLDER_NAME` —
     прямі дочірні теки кореня bundle на Drive з **точною** назвою (після перейменування в UI).
  3. **Legacy (opt-in):** якщо для типу немає ні id, ні name, але ввімкнено
     `BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS=1` або прапор `--legacy-auto-office-folders`,
     тоді як раніше: `BANDA_PRESENTATIONS_OFFICE_PARENT` (default `_synced-office-from-repo`),
     всередині `docx/` та `xlsx/`. **Без legacy** скрипт **не** створює `_synced-office-from-repo` і
     завершиться з помилкою, якщо для непорожнього набору docx/xlsx не задано явну ціль.

Ім'я батьківської теки для office-sync (лише для legacy-режиму 3): `BANDA_PRESENTATIONS_OFFICE_PARENT`.

Прапор **`--skip-docx-xlsx`**: не заливати docx/xlsx з офісних тек. Лишаються дерево media та контентні ноти **`Obsidian/**/*.md`** (якщо не **`--skip-obsidian-notes-drive`**). Метадані vault на Drive за замовчуванням не заливаються.

Додатково дзеркалить на Drive дерево `Municipal pitch decks (Drafts)/` (pdf, pptx, txt) —
підпапки зберігають назви, як локально (наприклад «Pitch deck основна презентація»).
Це дерево лишається безпосередньо під коренем bundle на Drive (без зміни батьківських цілей docx/xlsx).
Прапор **`--skip-media-decks`**: не дзеркалити `Municipal pitch decks (Drafts)/`.

**Markdown-ноти `Obsidian/` (з великої літери, поруч з офісними/медіа-файлами, як у Board):** за замовчуванням
**заливаються** на Drive з повним шляхом від кореня bundle (`**/Obsidian/**/*.md`), окрім системних імен
(`README.md`, `CHANGELOG.md`, `AGENTS.md`, `00-Index.md` у будь-якій глибині). Перед заливкою media/vault/нот:
**дублікати** `*.md` поруч з текою `Obsidian/`, якщо той самий файл уже є всередині `Obsidian/` (як у Board),
і **застаріла** пряма дочірня тека `Obsidian/` у корені bundle на Drive, якщо локально в корені bundle її вже немає.
Перед синком викликається та сама локальна генерація індексів і `.board-card.md`, що й для Board
(див. `generate_board_obsidian_cards_and_drive_upload.py`).
Прапор **`--skip-obsidian-notes-drive`** вимикає заливку цих `.md` на Drive (генерація локально все одно виконується).

**Метадані vault (крапка-obsidian) / корінь README:** за замовчуванням **не** заливаються
(ні `.obsidian/`, ні `00-Index.md`, ні `README.md` у корінь bundle). Рідкий legacy-режим:
прапор **`--upload-vault-meta-to-drive`** увімкне дзеркало `.obsidian/**` без
`workspace*.json` + `00-Index.md` + `README.md`. Прапор **`--skip-obsidian-vault`** залишено як
синонім «не заливати метадані» (за замовчуванням і так вимкнено).

Не заливає з офісних коренів: .txt, .md, README (лише плоскі docx/xlsx у цих теках).
Локальні папки з **тими самими назвами, що на Drive:** `New Primary Slide decks (Drafts)/` (docx),
`Secondary Slide decks (Drafts)/` (xlsx). Скрипт їх не створює і не перейменовує.

Запуск з кореня репозиторію:
  python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py

Переменные окружения:
  GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH
  BANDA_PRESENTATIONS_BUNDLE, BANDA_PRESENTATIONS_DRIVE_PARENT_ID
  BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS (=1 щоб дозволити режим 3)
  BANDA_PRESENTATIONS_OFFICE_PARENT (optional; default `_synced-office-from-repo`; тільки legacy)
  BANDA_PRESENTATIONS_DOCX_FOLDER_ID, BANDA_PRESENTATIONS_XLSX_FOLDER_ID (режим 1)
  BANDA_PRESENTATIONS_DOCX_FOLDER_NAME, BANDA_PRESENTATIONS_XLSX_FOLDER_NAME (режим 2)
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_board_obsidian_cards_and_drive_upload import (  # noqa: E402
    _find_child_folder_id,
    _find_file_id,
    build_drive_files_index,
    drive_service,
    generate_local,
    trash_duplicate_root_md_next_to_obsidian_on_drive,
    trash_stale_obsidian_folder_at_drive_root_if_missing_locally,
)

DEFAULT_BUNDLE = (
    REPO / "04-Projects" / "Banda" / "banda-drive-import" / "2. Banda Presentations Bundle"
)
REPORT_PATH = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "Presentations_bundle_drive_upload_report.json"

# Must match Google Drive child folder names under the bundle root (see bundle README).
SOURCE_SUBDIRS = (
    "New Primary Slide decks (Drafts)",
    "Secondary Slide decks (Drafts)",
)
OFFICE_SYNC_FOLDER_NAME = "_synced-office-from-repo"
ENV_DOCX_FOLDER_ID = "BANDA_PRESENTATIONS_DOCX_FOLDER_ID"
ENV_XLSX_FOLDER_ID = "BANDA_PRESENTATIONS_XLSX_FOLDER_ID"
ENV_DOCX_FOLDER_NAME = "BANDA_PRESENTATIONS_DOCX_FOLDER_NAME"
ENV_XLSX_FOLDER_NAME = "BANDA_PRESENTATIONS_XLSX_FOLDER_NAME"
LEGACY_AUTO_OFFICE_ENV = "BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS"
MEDIA_LOCAL_ROOT = "Municipal pitch decks (Drafts)"
MEDIA_SUFFIXES = frozenset({".pdf", ".pptx", ".txt"})
OBSIDIAN_DIR = ".obsidian"
# Локальні нотатки (не мета vault): тек `Obsidian/` з великої літери.
OBSIDIAN_NOTES_ROOT = "Obsidian"
OBSIDIAN_NOTES_MD_SKIP_LOWER = frozenset({"readme.md", "changelog.md", "agents.md", "00-index.md"})
OBSIDIAN_SKIP_FILENAMES = frozenset({"workspace.json", "workspace-mobile.json"})
# Лише для --upload-vault-meta-to-drive (не за замовчуванням на Drive).
VAULT_AUX_ROOT_FILES = ("00-Index.md", "README.md")
RESUMABLE_MIN_BYTES = 5 * 1024 * 1024


def ensure_drive_folder(service, parent_id: str, name: str) -> str:
    found = _find_child_folder_id(service, parent_id, name)
    if found:
        return found
    meta = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    created = service.files().create(body=meta, fields="id").execute()
    return created["id"]


def guess_mimetype(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


def collect_with_unique_names(bundle_root: Path, suffix: str) -> list[tuple[Path, str]]:
    """(локальний шлях, ім'я на Drive). Унікальність імен на Drive при колізіях."""
    items: list[tuple[Path, str]] = []
    seen: set[str] = set()
    for sub in SOURCE_SUBDIRS:
        d = bundle_root / sub
        if not d.is_dir():
            continue
        for f in sorted(d.rglob(f"*{suffix}")):
            if not f.is_file():
                continue
            if f.suffix.lower() != suffix:
                continue
            candidate = f.name
            if candidate in seen:
                candidate = f"{sub}__{f.name}"
            n = 1
            stem = f.stem
            while candidate in seen:
                candidate = f"{stem}_{n}{suffix}"
                n += 1
            seen.add(candidate)
            items.append((f, candidate))
    return items


def get_office_sync_parent_name() -> str:
    """Drive folder under bundle root that holds flat docx/ and xlsx/ only."""
    raw = os.environ.get("BANDA_PRESENTATIONS_OFFICE_PARENT", "").strip()
    return raw if raw else OFFICE_SYNC_FOLDER_NAME


def legacy_auto_office_folders_enabled(cli_flag: bool) -> bool:
    """Opt-in: auto-create _synced-office-from-repo (or OFFICE_PARENT) / docx / xlsx."""
    if cli_flag:
        return True
    v = os.environ.get(LEGACY_AUTO_OFFICE_ENV, "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _office_target_plan(kind: str, office_parent_name: str) -> dict:
    """Dry-run / звіт без виклику Drive API."""
    if kind == "docx":
        id_env, name_env = ENV_DOCX_FOLDER_ID, ENV_DOCX_FOLDER_NAME
        default_leaf = "docx"
    else:
        id_env, name_env = ENV_XLSX_FOLDER_ID, ENV_XLSX_FOLDER_NAME
        default_leaf = "xlsx"
    fid = os.environ.get(id_env, "").strip()
    if fid:
        return {"mode": "folder_id_env", "env": id_env, "folder_id": fid}
    fname = os.environ.get(name_env, "").strip()
    if fname:
        return {"mode": "folder_name_env", "env": name_env, "folder_name": fname}
    return {
        "mode": "default_nested",
        "path": f"{office_parent_name}/{default_leaf}",
        "office_parent_name": office_parent_name,
    }


def resolve_office_upload_folder(
    service,
    bundle_folder_id: str,
    *,
    kind: str,
    office_parent_name: str,
    get_office_sync_id,
    allow_legacy_nested: bool,
) -> tuple[str, dict]:
    """Повертає (parent_id для upload, метадані). get_office_sync_id — lazy ensure для legacy nested."""
    if kind == "docx":
        id_env, name_env = ENV_DOCX_FOLDER_ID, ENV_DOCX_FOLDER_NAME
        default_leaf = "docx"
    elif kind == "xlsx":
        id_env, name_env = ENV_XLSX_FOLDER_ID, ENV_XLSX_FOLDER_NAME
        default_leaf = "xlsx"
    else:
        raise ValueError(f"kind must be docx or xlsx, got {kind!r}")

    folder_id_raw = os.environ.get(id_env, "").strip()
    if folder_id_raw:
        return folder_id_raw, {
            "mode": "folder_id_env",
            "env": id_env,
            "folder_id": folder_id_raw,
        }

    name_raw = os.environ.get(name_env, "").strip()
    if name_raw:
        found = _find_child_folder_id(service, bundle_folder_id, name_raw)
        if not found:
            raise ValueError(
                f"{name_env}={name_raw!r}: no direct child folder under bundle "
                f"(id {bundle_folder_id}). Use exact Drive folder title or set {id_env}."
            )
        return found, {
            "mode": "folder_name_env",
            "env": name_env,
            "folder_name": name_raw,
            "folder_id": found,
        }

    if not allow_legacy_nested:
        raise ValueError(
            f"Drive target for {kind} is not set: define {id_env} or {name_env} "
            f"(see `04-Projects/Banda/banda-drive-import/2. Banda Presentations Bundle/README.md`). "
            f"Refusing to create `{office_parent_name}/` on Drive. "
            f"For the old auto-folder behaviour set {LEGACY_AUTO_OFFICE_ENV}=1 or pass "
            "--legacy-auto-office-folders. For Obsidian-only sync use --skip-docx-xlsx."
        )

    sync_id = get_office_sync_id()
    nested_id = ensure_drive_folder(service, sync_id, default_leaf)
    return nested_id, {
        "mode": "default_nested",
        "path": f"{office_parent_name}/{default_leaf}",
        "folder_id": nested_id,
        "office_sync_parent_folder_id": sync_id,
    }


def ensure_drive_path_segments(service, start_id: str, segments: tuple[str, ...]) -> str:
    pid = start_id
    for name in segments:
        pid = ensure_drive_folder(service, pid, name)
    return pid


def upload_one_resumable_aware(
    service, bundle_root: Path, local_path: Path, parent_id: str, drive_name: str
) -> dict:
    """Оновлення або створення файлу; resumable для великих об'єктів (>5 МБ)."""
    from googleapiclient.http import MediaFileUpload

    mime = guess_mimetype(local_path)
    resumable = local_path.stat().st_size >= RESUMABLE_MIN_BYTES
    media = MediaFileUpload(str(local_path), mimetype=mime, resumable=resumable)
    rel = local_path.relative_to(bundle_root)
    existing = _find_file_id(service, parent_id, drive_name)
    if existing:
        request = service.files().update(fileId=existing, media_body=media, fields="id")
    else:
        body = {"name": drive_name, "parents": [parent_id]}
        request = service.files().create(body=body, media_body=media, fields="id")

    if resumable:
        response = None
        while response is None:
            _, response = request.next_chunk()
        fid = response["id"]
    else:
        resp = request.execute()
        fid = resp["id"]
    action = "updated" if existing else "created"
    return {"path": rel.as_posix(), "action": action, "id": fid, "drive_name": drive_name}


def upload_one(service, bundle_root: Path, local_path: Path, parent_id: str, drive_name: str) -> dict:
    from googleapiclient.http import MediaFileUpload

    mime = guess_mimetype(local_path)
    media = MediaFileUpload(str(local_path), mimetype=mime, resumable=False)
    body = {"name": drive_name, "parents": [parent_id]}
    rel = local_path.relative_to(bundle_root)
    existing = _find_file_id(service, parent_id, drive_name)
    if existing:
        service.files().update(fileId=existing, media_body=media, fields="id").execute()
        return {"path": rel.as_posix(), "action": "updated", "id": existing, "drive_name": drive_name}
    out = service.files().create(body=body, media_body=media, fields="id").execute()
    return {"path": rel.as_posix(), "action": "created", "id": out["id"], "drive_name": drive_name}


def upload_docx_xlsx_only(
    service, bundle_root: Path, drive_parent_id: str, *, allow_legacy_nested: bool
) -> dict:
    bundle_folder_id = ensure_drive_folder(service, drive_parent_id, bundle_root.name)
    office_parent_name = get_office_sync_parent_name()
    office_sync_id: str | None = None

    def get_office_sync_id() -> str:
        nonlocal office_sync_id
        if office_sync_id is None:
            office_sync_id = ensure_drive_folder(service, bundle_folder_id, office_parent_name)
        return office_sync_id

    docx_items = collect_with_unique_names(bundle_root, ".docx")
    xlsx_items = collect_with_unique_names(bundle_root, ".xlsx")

    docx_parent: str | None = None
    docx_meta: dict
    if docx_items:
        docx_parent, docx_meta = resolve_office_upload_folder(
            service,
            bundle_folder_id,
            kind="docx",
            office_parent_name=office_parent_name,
            get_office_sync_id=get_office_sync_id,
            allow_legacy_nested=allow_legacy_nested,
        )
    else:
        docx_meta = {"mode": "skipped", "reason": "no local .docx under source dirs"}

    xlsx_parent: str | None = None
    xlsx_meta: dict
    if xlsx_items:
        xlsx_parent, xlsx_meta = resolve_office_upload_folder(
            service,
            bundle_folder_id,
            kind="xlsx",
            office_parent_name=office_parent_name,
            get_office_sync_id=get_office_sync_id,
            allow_legacy_nested=allow_legacy_nested,
        )
    else:
        xlsx_meta = {"mode": "skipped", "reason": "no local .xlsx under source dirs"}

    uploaded: list[dict] = []
    errors: list[str] = []

    if docx_parent is not None:
        for local_path, drive_name in docx_items:
            try:
                uploaded.append(upload_one(service, bundle_root, local_path, docx_parent, drive_name))
            except Exception as exc:
                errors.append(f"{local_path}: {exc}")

    if xlsx_parent is not None:
        for local_path, drive_name in xlsx_items:
            try:
                uploaded.append(upload_one(service, bundle_root, local_path, xlsx_parent, drive_name))
            except Exception as exc:
                errors.append(f"{local_path}: {exc}")

    return {
        "drive_bundle_folder_id": bundle_folder_id,
        "office_sync_parent_name": office_parent_name,
        "office_sync_parent_folder_id": office_sync_id,
        "office_docx_target": docx_meta,
        "office_xlsx_target": xlsx_meta,
        "docx_folder_id": docx_parent,
        "xlsx_folder_id": xlsx_parent,
        "uploaded": uploaded,
        "errors": errors,
    }


def collect_media_files(bundle_root: Path) -> list[Path]:
    root = bundle_root / MEDIA_LOCAL_ROOT
    if not root.is_dir():
        return []
    out: list[Path] = []
    for f in sorted(root.rglob("*")):
        if not f.is_file():
            continue
        if f.suffix.lower() not in MEDIA_SUFFIXES:
            continue
        out.append(f)
    return out


def collect_obsidian_vault_aux_files(bundle_root: Path, enabled: bool) -> list[Path]:
    """Якщо enabled=False (за замовчуванням), порожньо: на Drive лише контент, без .obsidian/README."""
    if not enabled:
        return []
    out: list[Path] = []
    obs = bundle_root / OBSIDIAN_DIR
    if obs.is_dir():
        for f in sorted(obs.rglob("*")):
            if not f.is_file():
                continue
            if f.name in OBSIDIAN_SKIP_FILENAMES:
                continue
            out.append(f)
    for name in VAULT_AUX_ROOT_FILES:
        p = bundle_root / name
        if p.is_file():
            out.append(p)
    return out


def upload_media_decks_tree(service, bundle_root: Path, bundle_folder_id: str) -> dict:
    """Дзеркалить `Municipal pitch decks (Drafts)/**` під коренем bundle на Drive."""
    uploaded: list[dict] = []
    errors: list[str] = []
    for local_path in collect_media_files(bundle_root):
        rel = local_path.relative_to(bundle_root)
        parent_segments = tuple(rel.parent.parts)
        try:
            parent_id = ensure_drive_path_segments(service, bundle_folder_id, parent_segments)
            uploaded.append(
                upload_one_resumable_aware(service, bundle_root, local_path, parent_id, local_path.name)
            )
        except Exception as exc:
            errors.append(f"{rel.as_posix()}: {exc}")
    return {"media_uploaded": uploaded, "media_errors": errors}


def upload_obsidian_vault_aux_tree(service, bundle_root: Path, bundle_folder_id: str) -> dict:
    """Дзеркалить `.obsidian/**`, `00-Index.md`, `README.md` під коренем bundle на Drive."""
    uploaded: list[dict] = []
    errors: list[str] = []
    for local_path in collect_obsidian_vault_aux_files(bundle_root, True):
        rel = local_path.relative_to(bundle_root)
        parent_segments = tuple(rel.parent.parts)
        try:
            parent_id = ensure_drive_path_segments(service, bundle_folder_id, parent_segments)
            uploaded.append(
                upload_one_resumable_aware(service, bundle_root, local_path, parent_id, local_path.name)
            )
        except Exception as exc:
            errors.append(f"{rel.as_posix()}: {exc}")
    return {"obsidian_vault_aux_uploaded": uploaded, "obsidian_vault_aux_errors": errors}


def collect_obsidian_notes_markdown(bundle_root: Path) -> list[Path]:
    """Усі `.md`, у шляху яких є сегмент `Obsidian/` (як у Board), без системних імен."""
    out: list[Path] = []
    for p in sorted(bundle_root.rglob("*.md")):
        if ".obsidian" in p.parts:
            continue
        if not p.is_file():
            continue
        try:
            rel = p.relative_to(bundle_root)
        except ValueError:
            continue
        if OBSIDIAN_NOTES_ROOT not in rel.parts:
            continue
        if p.name.lower() in OBSIDIAN_NOTES_MD_SKIP_LOWER:
            continue
        out.append(p)
    return out


def upload_obsidian_notes_tree(service, bundle_root: Path, bundle_folder_id: str) -> dict:
    """Дзеркалить `**/Obsidian/**/*.md` під коренем bundle на Drive (повний відносний шлях)."""
    uploaded: list[dict] = []
    errors: list[str] = []
    paths = collect_obsidian_notes_markdown(bundle_root)
    if not paths:
        return {
            "obsidian_notes_uploaded": [],
            "obsidian_notes_errors": [],
            "skipped": True,
            "reason": f"no {OBSIDIAN_NOTES_ROOT}/** under bundle",
        }
    for local_path in paths:
        rel = local_path.relative_to(bundle_root)
        parent_segments = tuple(rel.parent.parts)
        try:
            parent_id = ensure_drive_path_segments(service, bundle_folder_id, parent_segments)
            uploaded.append(upload_one(service, bundle_root, local_path, parent_id, local_path.name))
        except Exception as exc:
            errors.append(f"{rel.as_posix()}: {exc}")
    return {"obsidian_notes_uploaded": uploaded, "obsidian_notes_errors": errors}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--bundle",
        type=Path,
        default=Path(os.environ.get("BANDA_PRESENTATIONS_BUNDLE", DEFAULT_BUNDLE)),
    )
    ap.add_argument(
        "--drive-parent-id",
        default=os.environ.get("BANDA_PRESENTATIONS_DRIVE_PARENT_ID", "root"),
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="лише план/лічильники, без запису на Drive (діагностика; після змін структури не замінює повний синк)",
    )
    ap.add_argument(
        "--skip-media-decks",
        action="store_true",
        help="не заливати дерево Municipal pitch decks (Drafts)/ (pdf, pptx, txt)",
    )
    ap.add_argument(
        "--upload-vault-meta-to-drive",
        action="store_true",
        help="рідко: залити .obsidian/, 00-Index.md, README.md у корінь bundle (системні для Drive; за замовчуванням вимкнено)",
    )
    ap.add_argument(
        "--skip-obsidian-vault",
        action="store_true",
        help="застаріло: не заливати метадані vault (те саме, що й за замовчуванням; якщо разом з --upload-vault-meta-to-drive — upload вимикається)",
    )
    ap.add_argument(
        "--skip-obsidian-notes-drive",
        action="store_true",
        help=f"не заливати контентні .md з теки {OBSIDIAN_NOTES_ROOT}/ на Drive (за замовчуванням вони заливаються з ієрархією)",
    )
    ap.add_argument(
        "--skip-docx-xlsx",
        action="store_true",
        help="не заливати .docx/.xlsx з New Primary… / Secondary… (локальні теки з тими ж назвами, що на Drive)",
    )
    ap.add_argument(
        "--legacy-auto-office-folders",
        action="store_true",
        help=(
            "дозволити автостворення docx/xlsx під _synced-office-from-repo (або BANDA_PRESENTATIONS_OFFICE_PARENT), "
            "якщо не задано *_FOLDER_ID / *_FOLDER_NAME"
        ),
    )
    args = ap.parse_args()

    bundle_root = args.bundle.resolve()
    if not bundle_root.is_dir():
        print(f"Bundle folder not found: {bundle_root}", file=sys.stderr)
        return 1

    root_index_label = os.environ.get(
        "BANDA_PRESENTATIONS_BOARD_INDEX_ROOT_LABEL", "Presentations bundle"
    )
    drive_files_for_cards: dict | None = None
    if not args.dry_run:
        try:
            svc_index = drive_service()
            bundle_folder_for_index = ensure_drive_folder(svc_index, args.drive_parent_id, bundle_root.name)
            drive_files_for_cards = build_drive_files_index(svc_index, bundle_folder_for_index)
            print(
                f"Drive index for cards: {len(drive_files_for_cards)} files under «{bundle_root.name}»",
                file=sys.stderr,
            )
        except Exception as exc:
            print(
                f"Warning: could not build Drive file index for Obsidian cards, wikilink fallback: {exc}",
                file=sys.stderr,
            )
            drive_files_for_cards = None

    n_cards, n_indices, n_legacy_board = generate_local(
        bundle_root,
        drive_files_for_cards,
        root_index_label=root_index_label,
    )
    print(
        f"Board-style Obsidian: {n_cards} board-cards, {n_indices} indices "
        f"(legacy local cleanup: {n_legacy_board})",
        file=sys.stderr,
    )

    docx_list = collect_with_unique_names(bundle_root, ".docx")
    xlsx_list = collect_with_unique_names(bundle_root, ".xlsx")
    media_list = collect_media_files(bundle_root)
    upload_vault_meta = bool(args.upload_vault_meta_to_drive) and not bool(args.skip_obsidian_vault)
    obsidian_aux_list = collect_obsidian_vault_aux_files(bundle_root, upload_vault_meta)
    obsidian_notes_list = collect_obsidian_notes_markdown(bundle_root)
    office_parent_name = get_office_sync_parent_name()
    legacy = legacy_auto_office_folders_enabled(args.legacy_auto_office_folders)
    docx_plan = _office_target_plan("docx", office_parent_name)
    xlsx_plan = _office_target_plan("xlsx", office_parent_name)

    if not args.skip_docx_xlsx:
        if docx_list and docx_plan.get("mode") == "default_nested" and not legacy:
            print(
                "Refusing sync: local .docx exist but no BANDA_PRESENTATIONS_DOCX_FOLDER_ID / "
                "BANDA_PRESENTATIONS_DOCX_FOLDER_NAME (see bundle README). "
                f"Set targets, or use --legacy-auto-office-folders / {LEGACY_AUTO_OFFICE_ENV}=1, "
                "or --skip-docx-xlsx for media + Obsidian notes only.",
                file=sys.stderr,
            )
            return 1
        if xlsx_list and xlsx_plan.get("mode") == "default_nested" and not legacy:
            print(
                "Refusing sync: local .xlsx exist but no BANDA_PRESENTATIONS_XLSX_FOLDER_ID / "
                "BANDA_PRESENTATIONS_XLSX_FOLDER_NAME (see bundle README). "
                f"Set targets, or use --legacy-auto-office-folders / {LEGACY_AUTO_OFFICE_ENV}=1, "
                "or --skip-docx-xlsx for media + Obsidian notes only.",
                file=sys.stderr,
            )
            return 1

    media_note = (
        f"{len(media_list)} media files under {MEDIA_LOCAL_ROOT}/"
        if not args.skip_media_decks
        else f"media decks skipped (--skip-media-decks); {len(media_list)} local files ignored for Drive"
    )
    obs_note = (
        f"{len(obsidian_aux_list)} vault meta files for Drive (--upload-vault-meta-to-drive)"
        if upload_vault_meta
        else "vault meta (.obsidian, 00-Index, README) not uploaded to Drive (content-only default)"
    )
    obs_notes_note = (
        f"{len(obsidian_notes_list)} content .md under **/{OBSIDIAN_NOTES_ROOT}/** → Drive (full path from bundle)"
        if not args.skip_obsidian_notes_drive
        else f"Obsidian content notes skipped (--skip-obsidian-notes-drive); {len(obsidian_notes_list)} local files not uploaded"
    )
    office_note = (
        "docx/xlsx skipped (--skip-docx-xlsx)"
        if args.skip_docx_xlsx
        else (
            f"legacy auto office folders: {legacy}"
            if legacy
            else "docx/xlsx: explicit Drive targets only (no _synced-office-from-repo unless legacy)"
        )
    )
    print(
        f"Would sync: {len(docx_list)} docx, {len(xlsx_list)} xlsx (sources: {SOURCE_SUBDIRS}); "
        f"docx target: {docx_plan}; xlsx target: {xlsx_plan}; "
        f"{office_note}; {media_note}; {obs_note}; {obs_notes_note}",
        file=sys.stderr,
    )

    report: dict = {
        "bundle_root": str(bundle_root),
        "presentations_root_index_label": root_index_label,
        "board_style_local": {
            "cards": n_cards,
            "indices": n_indices,
            "legacy_index_removed_local": n_legacy_board,
            "drive_files_indexed_for_cards": len(drive_files_for_cards) if drive_files_for_cards else 0,
        },
        "drive_parent_id": args.drive_parent_id,
        "office_sync_parent_name": office_parent_name,
        "office_docx_target_plan": docx_plan,
        "office_xlsx_target_plan": xlsx_plan,
        "office_target_precedence": (
            "folder_id_env > folder_name_env > legacy_nested (BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS "
            "or --legacy-auto-office-folders)"
        ),
        "legacy_auto_office_folders": legacy,
        "skip_docx_xlsx": args.skip_docx_xlsx,
        "docx_count": len(docx_list),
        "xlsx_count": len(xlsx_list),
        "media_local_count": len(media_list),
        "skip_media_decks": args.skip_media_decks,
        "obsidian_vault_aux_local_count": len(obsidian_aux_list),
        "obsidian_notes_md_local_count": len(obsidian_notes_list),
        "upload_vault_meta_to_drive": upload_vault_meta,
        "skip_obsidian_vault_legacy_flag": args.skip_obsidian_vault,
        "skip_obsidian_notes_drive": args.skip_obsidian_notes_drive,
        "dry_run": args.dry_run,
        "policy": (
            "Drive docx/xlsx: BANDA_PRESENTATIONS_*_FOLDER_ID or *_FOLDER_NAME; "
            "legacy nested path only if BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS=1 or "
            "--legacy-auto-office-folders; "
            "--skip-docx-xlsx skips office uploads. "
            + (
                f"mirrored tree {MEDIA_LOCAL_ROOT}/ (pdf, pptx, txt) at bundle root"
                if not args.skip_media_decks
                else f"no media mirror (--skip-media-decks); {MEDIA_LOCAL_ROOT}/ only local"
            )
            + "; "
            + (
                f"mirrored {OBSIDIAN_DIR}/ + vault root notes (00-Index.md, README.md) at bundle root (--upload-vault-meta-to-drive)"
                if upload_vault_meta
                else "no vault meta on Drive (default: content-only)"
            )
            + "; "
            + (
                f"mirrored **/{OBSIDIAN_NOTES_ROOT}/**/*.md preserving full path from bundle root "
                "(skip basenames: README, CHANGELOG, AGENTS, 00-Index)"
                if not args.skip_obsidian_notes_drive
                else f"no Obsidian md mirror (--skip-obsidian-notes-drive)"
            )
        ),
    }

    if args.dry_run:
        report["upload"] = {"skipped": True}
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Report: {REPORT_PATH}")
        return 0

    try:
        svc = drive_service()
        if args.skip_docx_xlsx:
            bundle_folder_id = ensure_drive_folder(svc, args.drive_parent_id, bundle_root.name)
            up = {
                "drive_bundle_folder_id": bundle_folder_id,
                "office_sync_parent_name": office_parent_name,
                "office_sync_parent_folder_id": None,
                "office_docx_target": {"mode": "skipped", "reason": "--skip-docx-xlsx"},
                "office_xlsx_target": {"mode": "skipped", "reason": "--skip-docx-xlsx"},
                "docx_folder_id": None,
                "xlsx_folder_id": None,
                "uploaded": [],
                "errors": [],
            }
        else:
            up = upload_docx_xlsx_only(
                svc, bundle_root, args.drive_parent_id, allow_legacy_nested=legacy
            )
        report.update(up)
        dup_trashed = trash_duplicate_root_md_next_to_obsidian_on_drive(
            svc, up["drive_bundle_folder_id"]
        )
        report["drive_duplicate_root_md_trashed"] = dup_trashed
        if dup_trashed:
            print(
                f"Drive bundle: trashed {len(dup_trashed)} duplicate .md next to Obsidian/ folders",
                file=sys.stderr,
            )
        stale_root_obs = trash_stale_obsidian_folder_at_drive_root_if_missing_locally(
            svc,
            up["drive_bundle_folder_id"],
            bundle_root,
            obsidian_folder_name=OBSIDIAN_NOTES_ROOT,
        )
        report["drive_stale_root_obsidian_folder_trashed"] = stale_root_obs
        if stale_root_obs:
            print(
                "Drive bundle: trashed stale root Obsidian/ folder "
                f"(no local {OBSIDIAN_NOTES_ROOT}/): id={stale_root_obs.get('id')}",
                file=sys.stderr,
            )
        if args.skip_media_decks:
            media_up = {"media_uploaded": [], "media_errors": [], "skipped": True}
            report["media_uploaded"] = []
            report["media_errors"] = []
        else:
            media_up = upload_media_decks_tree(svc, bundle_root, up["drive_bundle_folder_id"])
            report["media_uploaded"] = media_up["media_uploaded"]
            report["media_errors"] = media_up["media_errors"]
        if not upload_vault_meta:
            obs_up = {"obsidian_vault_aux_uploaded": [], "obsidian_vault_aux_errors": [], "skipped": True}
            report["obsidian_vault_aux_uploaded"] = []
            report["obsidian_vault_aux_errors"] = []
        else:
            obs_up = upload_obsidian_vault_aux_tree(svc, bundle_root, up["drive_bundle_folder_id"])
            report["obsidian_vault_aux_uploaded"] = obs_up["obsidian_vault_aux_uploaded"]
            report["obsidian_vault_aux_errors"] = obs_up["obsidian_vault_aux_errors"]
        if args.skip_obsidian_notes_drive:
            notes_up = {
                "obsidian_notes_uploaded": [],
                "obsidian_notes_errors": [],
                "skipped": True,
                "reason": "--skip-obsidian-notes-drive",
            }
            report["obsidian_notes_uploaded"] = []
            report["obsidian_notes_errors"] = []
        else:
            notes_up = upload_obsidian_notes_tree(svc, bundle_root, up["drive_bundle_folder_id"])
            report["obsidian_notes_uploaded"] = notes_up["obsidian_notes_uploaded"]
            report["obsidian_notes_errors"] = notes_up["obsidian_notes_errors"]
        print(
            f"Drive folder id: {up['drive_bundle_folder_id']}; "
            + (
                "docx/xlsx skipped (--skip-docx-xlsx)"
                if args.skip_docx_xlsx
                else (
                    f"synced {len(up['uploaded'])} docx/xlsx, errors={len(up['errors'])}"
                )
            )
            + "; "
            + (
                "media decks skipped"
                if args.skip_media_decks
                else (
                    f"media {len(media_up['media_uploaded'])}, "
                    f"media_errors={len(media_up['media_errors'])}"
                )
            )
            + "; "
            + (
                "vault meta skipped (content-only)"
                if not upload_vault_meta
                else (
                    f"obsidian_aux {len(obs_up['obsidian_vault_aux_uploaded'])}, "
                    f"obsidian_aux_errors={len(obs_up['obsidian_vault_aux_errors'])}"
                )
            )
            + "; "
            + (
                "Obsidian content notes skipped"
                if args.skip_obsidian_notes_drive
                else (
                    f"obsidian_notes {len(notes_up['obsidian_notes_uploaded'])}, "
                    f"obsidian_notes_errors={len(notes_up['obsidian_notes_errors'])}"
                )
            ),
            file=sys.stderr,
        )
        for e in up["errors"][:20]:
            print(f"  ERR {e}", file=sys.stderr)
        for e in (media_up.get("media_errors") or [])[:20]:
            print(f"  MEDIA_ERR {e}", file=sys.stderr)
        for e in (obs_up.get("obsidian_vault_aux_errors") or [])[:20]:
            print(f"  OBSIDIAN_AUX_ERR {e}", file=sys.stderr)
        for e in (notes_up.get("obsidian_notes_errors") or [])[:20]:
            print(f"  OBSIDIAN_NOTES_ERR {e}", file=sys.stderr)
    except Exception as exc:
        report["upload"] = {"fatal": str(exc)}
        print(f"Drive upload failed: {exc}", file=sys.stderr)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {REPORT_PATH}")
    errs = list(report.get("errors") or [])
    errs.extend(report.get("media_errors") or [])
    errs.extend(report.get("obsidian_vault_aux_errors") or [])
    errs.extend(report.get("obsidian_notes_errors") or [])
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
