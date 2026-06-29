#!/usr/bin/env python3
"""Auto-sync Markdown files to DOCX using pandoc.

Behavior:
- Reads roots from System/config/markdown-docx-autosync.json
- Converts only stale files where .md is newer than .docx
- Can be called repeatedly (safe/idempotent)
"""

from __future__ import annotations

import json
import os
import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".cursor",
    ".claude",
    ".obsidian",
    "__pycache__",
    ".venv",
    "venv",
    ".venv-drive",
}

DEFAULT_IGNORE_FILES = {
    "README.md",
    "CHANGELOG.md",
    "AGENTS.md",
}


@dataclass
class Config:
    roots: list[Path]
    ignore_dirs: set[str]
    ignore_files: set[str]
    follow_symlinks: bool


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_config(path: Path) -> Config:
    if not path.exists():
        return Config(
            roots=[repo_root()],
            ignore_dirs=set(DEFAULT_IGNORE_DIRS),
            ignore_files=set(DEFAULT_IGNORE_FILES),
            follow_symlinks=False,
        )

    raw = json.loads(path.read_text(encoding="utf-8"))
    cfg = raw.get("markdown_docx_autosync", {})

    roots_raw = cfg.get("roots", ["."])
    roots = []
    root_base = repo_root()
    for item in roots_raw:
        p = (root_base / item).resolve() if not os.path.isabs(item) else Path(item).resolve()
        roots.append(p)

    ignore_dirs = set(DEFAULT_IGNORE_DIRS) | set(cfg.get("ignore_dirs", []))
    ignore_files = set(DEFAULT_IGNORE_FILES) | set(cfg.get("ignore_files", []))
    follow_symlinks = bool(cfg.get("follow_symlinks", False))

    return Config(
        roots=roots,
        ignore_dirs=ignore_dirs,
        ignore_files=ignore_files,
        follow_symlinks=follow_symlinks,
    )


def load_state(path: Path) -> dict[str, float]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_state(path: Path, state: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def is_baseline_run(state: dict[str, float]) -> bool:
    return "__meta__.initialized" not in state


def iter_markdown_files(cfg: Config) -> Iterable[Path]:
    for root in cfg.roots:
        if not root.exists():
            continue

        for current_root, dirnames, filenames in os.walk(root, followlinks=cfg.follow_symlinks):
            dirnames[:] = [d for d in dirnames if not should_ignore_dir(d, cfg.ignore_dirs)]

            for name in filenames:
                if not name.endswith(".md"):
                    continue
                if name in cfg.ignore_files:
                    continue
                yield Path(current_root) / name


def should_convert(md_path: Path, docx_path: Path) -> bool:
    if not docx_path.exists():
        return True
    return md_path.stat().st_mtime > docx_path.stat().st_mtime


def should_ignore_dir(dirname: str, ignore_dirs: set[str]) -> bool:
    if dirname in ignore_dirs:
        return True
    # Catch virtualenv variants like .venv-foo, venv3, etc.
    return dirname.startswith(".venv") or dirname.startswith("venv")


def convert_file(md_path: Path, docx_path: Path) -> tuple[bool, str]:
    # Disable auto-generated heading IDs so Google Docs does not import them as bookmarks.
    cmd = [
        "pandoc",
        "--from=markdown-auto_identifiers",
        str(md_path),
        "-o",
        str(docx_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        return True, ""
    except FileNotFoundError:
        return False, "pandoc is not installed or not in PATH"
    except subprocess.CalledProcessError as err:
        return False, (err.stderr or err.stdout or "pandoc failed").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-sync Markdown to DOCX")
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Convert all stale files immediately (ignore first-run skip behavior).",
    )
    args = parser.parse_args()

    root = repo_root()
    config_path = root / "System" / "config" / "markdown-docx-autosync.json"
    state_path = root / "System" / "state" / "markdown-docx-autosync-state.json"
    cfg = load_config(config_path)
    state = load_state(state_path)
    baseline_run = is_baseline_run(state)
    updated_state = dict(state)

    converted = 0
    skipped = 0
    failed = 0

    for md_path in iter_markdown_files(cfg):
        md_key = str(md_path)
        md_mtime = md_path.stat().st_mtime
        seen_mtime = state.get(md_key)

        # Safety default: first time a file is seen, remember it but don't backfill.
        if baseline_run and seen_mtime is None and not args.backfill:
            updated_state[md_key] = md_mtime
            skipped += 1
            continue

        docx_path = md_path.with_suffix(".docx")
        is_updated_since_last_seen = seen_mtime is None or md_mtime > seen_mtime
        if not is_updated_since_last_seen and not args.backfill:
            skipped += 1
            continue

        if not should_convert(md_path, docx_path) and not args.backfill:
            updated_state[md_key] = md_mtime
            skipped += 1
            continue

        ok, error = convert_file(md_path, docx_path)
        rel = md_path.relative_to(root) if md_path.is_relative_to(root) else md_path
        if ok:
            converted += 1
            updated_state[md_key] = md_mtime
            print(f"[OK] {rel} -> {docx_path.name}")
        else:
            failed += 1
            print(f"[ERR] {rel}: {error}", file=sys.stderr)

    updated_state["__meta__.initialized"] = 1.0
    save_state(state_path, updated_state)
    print(f"[SUMMARY] converted={converted} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

