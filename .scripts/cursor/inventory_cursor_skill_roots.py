#!/usr/bin/env python3
"""Inventory Cursor Agent Skills discovery roots: count SKILL.md, optional git remote.

Does not modify disk. Use to see which global vs project trees inflate the Skills meter.

Usage (from repo root):
  python3 .scripts/cursor/inventory_cursor_skill_roots.py
  python3 .scripts/cursor/inventory_cursor_skill_roots.py --workspace /path/to/vault
  python3 .scripts/cursor/inventory_cursor_skill_roots.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def count_skill_md(root: Path) -> int:
    if not root.is_dir():
        return 0
    n = 0
    for p in root.rglob("SKILL.md"):
        if p.is_file():
            n += 1
    return n


def git_remote(root: Path) -> str | None:
    git_dir = root / ".git"
    if not git_dir.exists():
        return None
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--workspace",
        type=Path,
        default=None,
        help="Optional workspace root to scan project-level skill dirs (default: cwd)",
    )
    ap.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of Markdown")
    args = ap.parse_args()

    home = Path.home()
    ws = args.workspace or Path.cwd()

    rows: list[dict] = []

    def add_row(label: str, root: Path, kind: str) -> None:
        n = count_skill_md(root)
        remote = git_remote(root) if root.is_dir() else None
        rows.append(
            {
                "label": label,
                "kind": kind,
                "path": str(root.expanduser()) if isinstance(root, Path) else str(root),
                "exists": root.is_dir(),
                "skill_md_count": n,
                "git_origin": remote,
            }
        )

    # User-level (Cursor docs)
    add_row("User ~/.cursor/skills", home / ".cursor" / "skills", "user")
    add_row("User ~/.agents/skills", home / ".agents" / "skills", "user")
    add_row("User ~/.claude/skills", home / ".claude" / "skills", "user_compat")
    add_row("User ~/.codex/skills", home / ".codex" / "skills", "user_compat")
    # Sibling folder sometimes used manually (not always indexed by Cursor — verify in UI)
    add_row("User ~/.cursor/skills-cursor (sibling)", home / ".cursor" / "skills-cursor", "user_optional")

    # Project-level under workspace
    add_row("Project .cursor/skills", ws / ".cursor" / "skills", "project")
    add_row("Project .agents/skills", ws / ".agents" / "skills", "project")
    add_row("Project .claude/skills", ws / ".claude" / "skills", "project_compat")
    add_row("Project .codex/skills", ws / ".codex" / "skills", "project_compat")

    if args.json:
        print(json.dumps({"workspace": str(ws.resolve()), "roots": rows}, indent=2))
        return 0

    total = sum(r["skill_md_count"] for r in rows)
    print("# Cursor skills roots inventory\n")
    print(f"- Workspace scanned: `{ws.resolve()}`\n")
    print("Сводка по корням (каждая строка — отдельное дерево на диске; Cursor рекурсивно индексирует папки с `SKILL.md`):\n")
    for r in rows:
        ex = "да" if r["exists"] else "нет"
        go = f"\n  - git origin: `{r['git_origin']}`" if r["git_origin"] else ""
        print(
            f"- **{r['label']}** (`{r['kind']}`)\n"
            f"  - путь: `{r['path']}`\n"
            f"  - есть на диске: {ex}\n"
            f"  - число `SKILL.md` (рекурсивно): **{r['skill_md_count']}**{go}\n"
        )
    print(f"- **Сумма по всем перечисленным корням:** {total} (часть путей может не индексироваться Cursor, см. документацию)\n")
    print(
        "Подсказка: массовый набор из одного git-репозитория в `~/.cursor/skills` "
        "даёт сотни строк в Settings; тумблер **Include third-party…** может добавлять ещё источники.\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
