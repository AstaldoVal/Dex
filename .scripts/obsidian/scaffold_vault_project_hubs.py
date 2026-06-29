#!/usr/bin/env python3
"""
Create _Vault_Project_Hub.md in each first-level folder under 04-Projects/

Obsidian Graph labels nodes by file name; many README.md hubs collapse visually.
Hub files use a stable basename with a human title inside the note.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HUB_FILENAME = "_Vault_Project_Hub.md"


def slugify(segment: str) -> str:
    s = segment.lower().replace(" ", "-")
    s = re.sub(r"[^a-z0-9_-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "root"


def human_title(segment: str) -> str:
    return segment.replace("_", " ")


def hub_body(segment: str, vault_root: Path) -> str:
    proj = vault_root / "04-Projects" / segment
    has_readme = (proj / "README.md").is_file()
    title = human_title(segment)
    lines = [
        f"# {title}",
        "",
        "Точка входа для **Graph View**: уникальное имя файла вместо десятков одинаковых «README».",
        "",
    ]
    if has_readme:
        lines.append(f"- Репозиторий / техничка: [[04-Projects/{segment}/README]]")
    else:
        lines.append(
            "- В папке пока нет `README.md` — добавьте при необходимости для кода/репо."
        )
    lines.append("- Индекс проектов: [[04-Projects/_MOC_Projects]]")
    return "\n".join(lines) + "\n"


def hub_frontmatter(segment: str) -> str:
    slug = slugify(segment)
    return f"""---
type: project-hub
domain: projects
project: {slug}
cluster: projects-{slug}
status: active
review: 2026-05-01
tags:
  - dex/project-hub
  - dex/domain/projects
  - dex/project/{slug}
---
"""


def write_root_hub(vault_root: Path, dry_run: bool) -> int:
    """Single hub for loose 04-Projects/*.md so graph shows one named island."""
    path = vault_root / "04-Projects" / "_Vault_Root_Projects_Hub.md"
    if path.exists():
        print("root_hub=exists")
        return 0
    bullets: list[str] = []
    for f in sorted((vault_root / "04-Projects").glob("*.md")):
        if f.name.startswith("_MOC_") or f.name == "_Vault_Root_Projects_Hub.md":
            continue
        bullets.append(f"- [[04-Projects/{f.stem}]]")
    body = "\n".join(
        [
            "# Projects — корневые заметки",
            "",
            "Заметки лежат прямо в `04-Projects/*.md` (не в подпапке). Отдельный узел графа вместо слипания с README.",
            "",
            "## Ссылки",
            "",
            *bullets,
            "",
            "- [[04-Projects/_MOC_Projects]]",
            "",
        ]
    )
    text = (
        "---\n"
        "type: project-hub\n"
        "domain: projects\n"
        "project: root\n"
        "cluster: projects-root\n"
        "status: active\n"
        "review: 2026-05-01\n"
        "tags:\n"
        "  - dex/project-hub\n"
        "  - dex/domain/projects\n"
        "  - dex/project/root\n"
        "---\n\n"
        f"{body}"
    )
    rel = "04-Projects/_Vault_Root_Projects_Hub.md"
    if dry_run:
        print(f"would_create={rel}")
        return 1
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"created={rel}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    vault_root = args.vault_root.resolve()
    projects = vault_root / "04-Projects"
    if not projects.is_dir():
        print("ERROR: 04-Projects not found", file=sys.stderr)
        return 2

    created = 0
    skipped = 0
    for p in sorted(projects.iterdir()):
        if not p.is_dir():
            continue
        if p.name.startswith("."):
            continue
        hub = p / HUB_FILENAME
        if hub.is_file():
            skipped += 1
            continue
        text = hub_frontmatter(p.name) + "\n" + hub_body(p.name, vault_root)
        rel = hub.relative_to(vault_root).as_posix()
        if args.dry_run:
            print(f"would_create={rel}")
            created += 1
            continue
        hub.write_text(text, encoding="utf-8", newline="\n")
        print(f"created={rel}")
        created += 1

    created += write_root_hub(vault_root, args.dry_run)

    print(
        f"folders_scanned="
        f"{sum(1 for x in projects.iterdir() if x.is_dir() and not x.name.startswith('.'))}"
    )
    print(f"hubs_created={created}")
    print(f"project_hubs_skipped_existing={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
