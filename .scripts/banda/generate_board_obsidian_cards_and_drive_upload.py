#!/usr/bin/env python3
"""
Генерирует карточки Obsidian (.board-card.md) и индекс `Index {имя_папки}.md` в каждой папке
под локальным деревом Board (или другим корнем с тем же контрактом). В карточках и индексах ссылки на офисные файлы —
docx / xlsx / pdf / pptx / txt (прямые дочерние в папке) — голые URL открытия на Google Drive / Docs / Sheets / Презентации (по mime), сопоставление
по дереву имён как на диске. Затем загружает только *.md на Google Drive,
сохраняя структуру папок (корень — существующий export folder id).
Перед загрузкой удаляет с Drive дубликаты: *.md в корне секции, если тот же файл
уже есть в подпапке Obsidian/ (остатки старых выгрузок).

Использование (из корня репозитория):
  04-Projects/Banda/.venv-drive/bin/python .scripts/banda/generate_board_obsidian_cards_and_drive_upload.py

Переменные окружения (опционально):
  GOOGLE_DRIVE_CREDENTIALS_PATH, GOOGLE_DRIVE_TOKEN_PATH
  BANDA_BOARD_ROOT — абсолютный путь к папке Board (по умолчанию .../banda-drive-import/1. Board)
  BANDA_DRIVE_BOARD_ROOT_ID — id папки на Drive (по умолчанию из отчёта export)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_BOARD = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "1. Board"
DEFAULT_DRIVE_ROOT = "1YtMDH8jaCxQlk5vKiQT7mnm4fVEUrBzx"
REPORT_PATH = REPO / "04-Projects" / "Banda" / "banda-drive-import" / "Board_obsidian_cards_upload_report.json"

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
OFFICE_SUFFIXES = {".docx", ".xlsx", ".pdf", ".pptx", ".txt"}
LEGACY_INDEX_NAME = "Индекс Board.md"
# Заметки (.md) в папках, где рядом лежит «сырьё» (docx/xlsx/pdf), чтобы не засорять вид в файловом дереве.
OBSIDIAN_DIR = "Obsidian"


def folder_has_office_files(folder: Path) -> bool:
    """Прямые дочерние office-файлы (без вложенных папок)."""
    try:
        for entry in folder.iterdir():
            if not entry.is_file() or entry.name.startswith("~$"):
                continue
            if entry.suffix.lower() in OFFICE_SUFFIXES:
                return True
    except OSError:
        pass
    return False


def markdown_out_dir(folder: Path) -> Path:
    """Куда писать индекс и .board-card.md для этой секции Board."""
    return folder / OBSIDIAN_DIR if folder_has_office_files(folder) else folder


def collect_board_dirs(board_root: Path) -> set[Path]:
    """Папки секций Board; саму папку Obsidian не считаем отдельной секцией."""
    out: set[Path] = {board_root}
    for p in board_root.rglob("*"):
        if not p.is_dir():
            continue
        if ".obsidian" in p.parts:
            continue
        if p.name == OBSIDIAN_DIR:
            continue
        out.add(p)
    return out


def cleanup_stale_root_markdown(folder: Path, board_root: Path, root_index_label: str = "Board") -> None:
    """Перед переносом в Obsidian/: убрать старые индекс и карточки из корня папки."""
    if not folder_has_office_files(folder):
        return
    idx = folder / index_basename_for_folder(folder, board_root, root_index_label)
    if idx.is_file():
        try:
            idx.unlink()
        except OSError:
            pass
    for p in folder.glob("*.board-card.md"):
        try:
            p.unlink()
        except OSError:
            pass


def index_basename_for_folder(folder: Path, board_root: Path, root_index_label: str = "Board") -> str:
    """Имя файла индекса: корень дерева -> Index {root_index_label}.md, иначе Index <basename папки>.md."""
    folder = folder.resolve()
    board_root = board_root.resolve()
    if folder == board_root:
        return f"Index {root_index_label}.md"
    return f"Index {folder.name}.md"


def index_wikilink_stub(folder: Path, board_root: Path, root_index_label: str = "Board") -> str:
    """Часть пути для [[...]] без расширения (Obsidian)."""
    base = index_basename_for_folder(folder, board_root, root_index_label)
    return base[:-3] if base.endswith(".md") else base


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


def drive_service():
    from googleapiclient.discovery import build

    return build("drive", "v3", credentials=get_credentials(), cache_discovery=False)


def path_tag(rel: Path) -> str:
    """Тег YAML из относительного пути: board-01-strategy-b2g."""
    parts = rel.as_posix().split("/") if rel != Path(".") else []
    slug = "-".join(p.lower().replace(" ", "-").replace("_", "-") for p in parts if p)
    return f"board-{slug}" if slug else "board-root"


def artifact_label(suffix: str) -> str:
    return {
        ".docx": "документ Word (.docx)",
        ".xlsx": "таблица Excel (.xlsx)",
        ".pdf": "PDF",
        ".pptx": "презентация PowerPoint (.pptx)",
        ".txt": "текстовый файл (.txt)",
    }.get(suffix.lower(), "файл")


def human_zone(rel_parent: Path) -> str:
    if rel_parent == Path("."):
        return "корень Board"
    return rel_parent.as_posix().replace("/", " → ")


def drive_open_url(file_id: str, mime_type: str) -> str:
    """Открытие в браузере: нативные Google-типы vs загруженные Office/PDF."""
    if mime_type == "application/vnd.google-apps.document":
        return f"https://docs.google.com/document/d/{file_id}/edit"
    if mime_type == "application/vnd.google-apps.spreadsheet":
        return f"https://docs.google.com/spreadsheets/d/{file_id}/edit"
    if mime_type == "application/vnd.google-apps.presentation":
        return f"https://docs.google.com/presentation/d/{file_id}/edit"
    return f"https://drive.google.com/file/d/{file_id}/view"


def build_drive_files_index(service, root_folder_id: str) -> dict[str, tuple[str, str]]:
    """Относительный путь от корня экспорта (posix) -> (fileId, mimeType). Только не-папки."""
    result: dict[str, tuple[str, str]] = {}

    def walk(parent_id: str, prefix: str) -> None:
        page_token = None
        while True:
            resp = (
                service.files()
                .list(
                    q=f"'{parent_id}' in parents and trashed = false",
                    spaces="drive",
                    fields="nextPageToken, files(id, name, mimeType)",
                    pageSize=100,
                    pageToken=page_token,
                )
                .execute()
            )
            for f in resp.get("files", []):
                fid = f["id"]
                name = f["name"]
                mime = f.get("mimeType") or ""
                rel = f"{prefix}/{name}" if prefix else name
                if mime == "application/vnd.google-apps.folder":
                    walk(fid, rel)
                else:
                    if rel in result:
                        print(f"Warning: duplicate Drive path, keeping last: {rel}", file=sys.stderr)
                    result[rel] = (fid, mime)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    walk(root_folder_id, "")
    return result


def render_card(
    artifact_rel: Path,
    board_root: Path,
    drive_files: dict[str, tuple[str, str]] | None,
    *,
    card_in_obsidian_subfolder: bool,
) -> str:
    """artifact_rel — путь к .docx/.xlsx/.pdf относительно board_root."""
    suffix = artifact_rel.suffix.lower()
    stem = artifact_rel.stem
    parent = artifact_rel.parent
    tag = path_tag(parent)
    zone = human_zone(parent)
    art_type = artifact_label(suffix)
    artifact_filename = artifact_rel.name
    title = stem.replace("_", " ").strip()

    key = artifact_rel.as_posix()
    link_line: str
    if drive_files and key in drive_files:
        fid, mime = drive_files[key]
        link_line = drive_open_url(fid, mime)
    elif drive_files is not None:
        link_line = f"(не найдено на Drive по пути «{key}» — проверьте имена и синхронизацию)"
    else:
        link_line = (
            f"[[../{artifact_filename}]]" if card_in_obsidian_subfolder else f"[[{artifact_filename}]]"
        )

    if link_line.startswith("http"):
        link_block = f"[Документ на Drive]({link_line})"
    else:
        link_block = link_line

    return f"""---
tags:
  - banda
  - board
  - board-card
  - {tag}
artifact: {suffix.lstrip(".")}
---

# {title}

{link_block}

## Метки

- **Тип:** {art_type}
- **Зона:** {zone}{" → Obsidian" if card_in_obsidian_subfolder else ""}
- **Статус:** не задан
- **Аудитория:** не задан

## Заметки

-
"""


def list_board_children(folder: Path, board_root: Path, root_index_label: str = "Board") -> tuple[list[str], list[str]]:
    """Подпапки (имена) и файлы (имена), без мусора Office, без текущего/старого индекса."""
    subdirs: list[str] = []
    files: list[str] = []
    skip_names = {index_basename_for_folder(folder, board_root, root_index_label), LEGACY_INDEX_NAME}
    try:
        for entry in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            name = entry.name
            if name.startswith("~$"):
                continue
            if name.startswith(".") and name != ".obsidian":
                continue
            if entry.is_dir():
                if name == ".obsidian" or name == OBSIDIAN_DIR:
                    continue
                subdirs.append(name)
            elif entry.is_file():
                if name in skip_names:
                    continue
                files.append(name)
    except OSError:
        pass
    return subdirs, files


def render_index(
    folder: Path,
    board_root: Path,
    drive_files: dict[str, tuple[str, str]] | None,
    root_index_label: str = "Board",
) -> str:
    rel = folder.relative_to(board_root) if folder != board_root else Path(".")
    tag = path_tag(rel)
    title_bit = rel.as_posix() if rel != Path(".") else f"{root_index_label} (корень)"

    subdirs, files = list_board_children(folder, board_root, root_index_label)
    parent_split = folder_has_office_files(folder)
    up_prefix = "../" if parent_split else ""

    lines_sub = []
    for sd in subdirs:
        child_dir = folder / sd
        child_stub = index_wikilink_stub(child_dir, board_root, root_index_label)
        child_split = folder_has_office_files(child_dir)
        mid = f"{sd}/{OBSIDIAN_DIR}/" if child_split else f"{sd}/"
        lines_sub.append(f"- [[{up_prefix}{mid}{child_stub}|{sd}]]")

    lines_files = []
    office_names = sorted(
        fn for fn in files if Path(fn).suffix.lower() in OFFICE_SUFFIXES
    )
    for fn in office_names:
        card = f"{Path(fn).stem}.board-card.md"
        art_rel = (folder / fn).relative_to(board_root)
        key = art_rel.as_posix()
        if drive_files and key in drive_files:
            fid, mime = drive_files[key]
            url = drive_open_url(fid, mime)
            lines_files.append(f"- Файл: {url} — карточка: [[{card}|открыть карточку]]")
        elif drive_files is not None:
            lines_files.append(
                f"- Файл: (нет URL Drive для «{key}») — карточка: [[{card}|открыть карточку]]"
            )
        else:
            file_wiki = f"[[../{fn}]]" if parent_split else f"[[{fn}]]"
            lines_files.append(f"- Файл: {file_wiki} — карточка: [[{card}|открыть карточку]]")

    other_md = sorted(
        fn
        for fn in files
        if fn.endswith(".md")
        and Path(fn).suffix.lower() not in OFFICE_SUFFIXES
        and not fn.endswith(".board-card.md")
    )
    for fn in other_md:
        md_wiki = f"[[../{fn}]]" if parent_split else f"[[{fn}]]"
        lines_files.append(f"- {md_wiki}")

    sub_block = "\n".join(lines_sub) if lines_sub else "- (нет подпапок)"
    files_block = "\n".join(lines_files) if lines_files else "- (нет файлов в этой папке)"

    return f"""---
tags:
  - banda
  - board
  - board-index
  - {tag}
---

# Index: {title_bit}

## Подпапки

{sub_block}

## Файлы и карточки

{files_block}
"""


def remove_legacy_index_files_local(board_root: Path) -> int:
    n = 0
    for p in board_root.rglob(LEGACY_INDEX_NAME):
        if ".obsidian" in p.parts:
            continue
        try:
            p.unlink()
            n += 1
        except OSError:
            pass
    return n


def generate_local(
    board_root: Path,
    drive_files: dict[str, tuple[str, str]] | None = None,
    *,
    root_index_label: str = "Board",
) -> tuple[int, int, int]:
    """Возвращает (число карточек, число индексов, сколько удалено локально LEGACY_INDEX). drive_files: relposix -> (id, mime)."""
    n_cards = 0
    n_index = 0

    n_legacy_local = remove_legacy_index_files_local(board_root)

    board_dirs = collect_board_dirs(board_root)

    for folder in sorted(board_dirs, key=lambda x: (len(x.relative_to(board_root).parts), str(x))):
        cleanup_stale_root_markdown(folder, board_root, root_index_label)

    for folder in sorted(board_dirs, key=lambda x: (len(x.relative_to(board_root).parts), str(x))):
        out_dir = markdown_out_dir(folder)
        if out_dir != folder:
            out_dir.mkdir(parents=True, exist_ok=True)
        for entry in folder.iterdir():
            if not entry.is_file():
                continue
            if entry.name.startswith("~$"):
                continue
            suf = entry.suffix.lower()
            if suf not in OFFICE_SUFFIXES:
                continue
            rel = entry.relative_to(board_root)
            split = folder_has_office_files(folder)
            card_path = out_dir / f"{entry.stem}.board-card.md"
            card_path.write_text(
                render_card(
                    rel,
                    board_root,
                    drive_files,
                    card_in_obsidian_subfolder=split,
                ),
                encoding="utf-8",
            )
            n_cards += 1

    for folder in sorted(board_dirs, key=lambda x: (len(x.relative_to(board_root).parts), str(x))):
        out_dir = markdown_out_dir(folder)
        if out_dir != folder:
            out_dir.mkdir(parents=True, exist_ok=True)
        idx = out_dir / index_basename_for_folder(folder, board_root, root_index_label)
        idx.write_text(
            render_index(folder, board_root, drive_files, root_index_label=root_index_label),
            encoding="utf-8",
        )
        n_index += 1

    return n_cards, n_index, n_legacy_local


def parent_rel_key(rel: Path) -> str:
    if rel.parent == Path("."):
        return ""
    return rel.parent.as_posix()


def ensure_path_ids(service, board_root: Path, root_id: str) -> dict[str, str]:
    """rel_posix папки (без завершающего /) -> Drive folder id. '' = root."""
    path_ids: dict[str, str] = {"": root_id}
    all_dirs = sorted(
        {d.relative_to(board_root) for d in board_root.rglob("*") if d.is_dir() and ".obsidian" not in d.parts},
        key=lambda p: (len(p.parts), p.as_posix()),
    )

    for rel in all_dirs:
        if rel == Path("."):
            continue
        pk = parent_rel_key(rel)
        parent_id = path_ids[pk]
        name = rel.name
        found = _find_child_folder_id(service, parent_id, name)
        if found:
            path_ids[rel.as_posix()] = found
        else:
            meta = {
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id],
            }
            created = service.files().create(body=meta, fields="id").execute()
            path_ids[rel.as_posix()] = created["id"]
    return path_ids


def _find_child_folder_id(service, parent_id: str, name: str) -> str | None:
    from googleapiclient.errors import HttpError

    safe = name.replace("'", "\\'")
    q = (
        f"name = '{safe}' and mimeType = 'application/vnd.google-apps.folder' "
        f"and '{parent_id}' in parents and trashed = false"
    )
    try:
        resp = service.files().list(q=q, fields="files(id,name)", pageSize=5).execute()
    except HttpError:
        return None
    files = resp.get("files", [])
    return files[0]["id"] if files else None


def _find_file_id(service, parent_id: str, name: str) -> str | None:
    from googleapiclient.errors import HttpError

    safe = name.replace("'", "\\'")
    q = f"name = '{safe}' and '{parent_id}' in parents and trashed = false"
    try:
        resp = service.files().list(q=q, fields="files(id,name,mimeType)", pageSize=10).execute()
    except HttpError:
        return None
    for f in resp.get("files", []):
        if f.get("mimeType") != "application/vnd.google-apps.folder":
            return f["id"]
    return None


def upload_md_tree(service, board_root: Path, path_ids: dict[str, str]) -> dict:
    from googleapiclient.http import MediaFileUpload

    uploaded = []
    errors: list[str] = []
    for path in sorted(board_root.rglob("*.md")):
        if ".obsidian" in path.parts:
            continue
        rel = path.relative_to(board_root)
        pk = parent_rel_key(rel)
        parent_id = path_ids[pk]
        media = MediaFileUpload(str(path), mimetype="text/markdown", resumable=False)
        body = {"name": rel.name, "parents": [parent_id]}
        try:
            existing = _find_file_id(service, parent_id, rel.name)
            if existing:
                service.files().update(fileId=existing, media_body=media, fields="id").execute()
                uploaded.append({"path": rel.as_posix(), "action": "updated", "id": existing})
            else:
                out = service.files().create(body=body, media_body=media, fields="id").execute()
                uploaded.append({"path": rel.as_posix(), "action": "created", "id": out["id"]})
        except Exception as exc:
            errors.append(f"{rel.as_posix()}: {exc}")
    return {"uploaded": uploaded, "errors": errors}


def _list_drive_children(service, parent_id: str) -> list[dict]:
    """Непосредственные дочерние файлы и папки (не в корзине)."""
    out: list[dict] = []
    page_token = None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{parent_id}' in parents and trashed = false",
                spaces="drive",
                fields="nextPageToken, files(id, name, mimeType)",
                pageSize=100,
                pageToken=page_token,
            )
            .execute()
        )
        out.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return out


def trash_duplicate_root_md_next_to_obsidian_on_drive(service, root_folder_id: str) -> list[dict]:
    """
    В каждой папке на Drive, где есть подпапка Obsidian, отправляет в корзину .md,
    лежащие в этой же папке (рядом с Obsidian), если одноимённый .md есть в Obsidian/.
    Локальная модель: сырьё в корне секции, заметки только в Obsidian/.
    """
    trashed: list[dict] = []

    def visit(folder_id: str) -> None:
        children = _list_drive_children(service, folder_id)
        folders = {c["name"]: c for c in children if c.get("mimeType") == "application/vnd.google-apps.folder"}
        obs = folders.get(OBSIDIAN_DIR)
        if obs:
            obs_children = _list_drive_children(service, obs["id"])
            obs_md_names = {
                c["name"]
                for c in obs_children
                if c.get("mimeType") != "application/vnd.google-apps.folder" and c["name"].endswith(".md")
            }
            for c in children:
                if c.get("mimeType") == "application/vnd.google-apps.folder":
                    continue
                name = c["name"]
                if not name.endswith(".md"):
                    continue
                if name in obs_md_names:
                    service.files().update(fileId=c["id"], body={"trashed": True}).execute()
                    trashed.append({"id": c["id"], "name": name, "parent_folder_id": folder_id})
        for c in folders.values():
            visit(c["id"])

    visit(root_folder_id)
    return trashed


def trash_stale_obsidian_folder_at_drive_root_if_missing_locally(
    service,
    drive_root_folder_id: str,
    local_root: Path,
    obsidian_folder_name: str = OBSIDIAN_DIR,
) -> dict | None:
    """
    Якщо локально немає теки `{local_root}/{obsidian_folder_name}/`, а на Drive під
    `drive_root_folder_id` є пряма дочірня папка з цим ім'ям — відправити її в кошик.
    Залишок старої архітектури: після зміни локального дерева Drive має відповідати репо.
    """
    local_obs = local_root / obsidian_folder_name
    if local_obs.is_dir():
        return None
    obs_id = _find_child_folder_id(service, drive_root_folder_id, obsidian_folder_name)
    if not obs_id:
        return None
    service.files().update(fileId=obs_id, body={"trashed": True}).execute()
    return {
        "id": obs_id,
        "name": obsidian_folder_name,
        "reason": "no matching local folder at bundle/package root",
    }


def trash_legacy_index_board_on_drive(service, root_folder_id: str) -> int:
    """Убирает с Drive устаревшие «Индекс Board.md», чтобы не дублировать с новыми Index *.md."""
    n = 0

    def walk(parent_id: str) -> None:
        nonlocal n
        page_token = None
        while True:
            resp = (
                service.files()
                .list(
                    q=f"'{parent_id}' in parents and trashed = false",
                    spaces="drive",
                    fields="nextPageToken, files(id, name, mimeType)",
                    pageSize=100,
                    pageToken=page_token,
                )
                .execute()
            )
            for f in resp.get("files", []):
                fid = f["id"]
                name = f["name"]
                mime = f.get("mimeType") or ""
                if mime == "application/vnd.google-apps.folder":
                    walk(fid)
                elif name == LEGACY_INDEX_NAME:
                    service.files().update(fileId=fid, body={"trashed": True}).execute()
                    n += 1
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    walk(root_folder_id)
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", type=Path, default=Path(os.environ.get("BANDA_BOARD_ROOT", DEFAULT_BOARD)))
    ap.add_argument("--drive-root-id", default=os.environ.get("BANDA_DRIVE_BOARD_ROOT_ID", DEFAULT_DRIVE_ROOT))
    ap.add_argument(
        "--root-index-label",
        default=os.environ.get("BANDA_BOARD_INDEX_ROOT_LABEL", "Board"),
        help="имя корневого индекса: Index <label>.md (по умолчанию Board)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="только локальная генерация, без Drive (диагностика; после смены структуры не заменяет полный синк)",
    )
    args = ap.parse_args()

    board_root = args.board.resolve()
    if not board_root.is_dir():
        print(f"Board folder not found: {board_root}", file=sys.stderr)
        return 1

    drive_files: dict[str, tuple[str, str]] | None = None
    svc = None
    if not args.dry_run:
        try:
            svc = drive_service()
            drive_files = build_drive_files_index(svc, args.drive_root_id)
            print(f"Drive index: {len(drive_files)} files under export root", file=sys.stderr)
        except Exception as exc:
            print(f"Warning: could not build Drive file index, falling back to wiki links: {exc}", file=sys.stderr)
            drive_files = None

    n_cards, n_index, n_legacy_local = generate_local(
        board_root, drive_files, root_index_label=args.root_index_label
    )
    print(f"Generated {n_cards} board-card files and {n_index} index files under {board_root}")
    if n_legacy_local:
        print(f"Removed {n_legacy_local} local legacy «{LEGACY_INDEX_NAME}» files", file=sys.stderr)

    report: dict = {
        "board_root": str(board_root),
        "drive_root_id": args.drive_root_id,
        "root_index_label": args.root_index_label,
        "cards": n_cards,
        "indices": n_index,
        "legacy_index_removed_local": n_legacy_local,
        "dry_run": args.dry_run,
        "drive_files_indexed": len(drive_files) if drive_files else 0,
    }

    if args.dry_run:
        report["upload"] = {"skipped": True}
    else:
        try:
            if svc is None:
                svc = drive_service()
            path_ids = ensure_path_ids(svc, board_root, args.drive_root_id)
            trashed = trash_legacy_index_board_on_drive(svc, args.drive_root_id)
            report["drive_legacy_index_trashed"] = trashed
            dup_trashed = trash_duplicate_root_md_next_to_obsidian_on_drive(svc, args.drive_root_id)
            report["drive_duplicate_root_md_trashed"] = dup_trashed
            if dup_trashed:
                print(f"Drive: removed {len(dup_trashed)} duplicate .md next to Obsidian/ folders", file=sys.stderr)
            up = upload_md_tree(svc, board_root, path_ids)
            report["upload"] = up
            print(f"Drive: {len(up['uploaded'])} md files synced, errors={len(up['errors'])}")
            for e in up["errors"][:20]:
                print(f"  ERR {e}", file=sys.stderr)
        except Exception as exc:
            report["upload"] = {"fatal": str(exc)}
            print(f"Drive upload failed: {exc}", file=sys.stderr)
            REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            return 1

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {REPORT_PATH}")
    errs = report.get("upload", {}).get("errors") or []
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
