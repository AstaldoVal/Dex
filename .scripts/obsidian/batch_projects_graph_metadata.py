#!/usr/bin/env python3
"""
Batch-add Obsidian graph spine metadata to markdown notes under 04-Projects.

- Root MOC + changelog on every note (anti-hub: no Inbox/Areas/Resources spam).
- Per-project graph hub (priority): `04-Projects/<Name>/_Vault_Project_Hub.md`, else
  `README.md`, else `04-Projects/<Name>.md`. Unique filenames avoid Obsidian collapsing
  many nodes into one label «README».
- Loose `04-Projects/*.md` link to `04-Projects/_Vault_Root_Projects_Hub.md` when present.
Project slug for tags is derived from the first folder under 04-Projects/.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import OrderedDict
from pathlib import Path

import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\r?\n(?P<body>.*?)\r?\n---\s*\r?\n", re.DOTALL)
GRAPH_LINE_RE = re.compile(r"^Graph links:.*\r?\n?", re.MULTILINE)

CHANGE_ANCHOR = "[[System/Change_Log/2026-04#2026-04-22-batch-projects]]"
ROOT_MOC = "[[04-Projects/_MOC_Projects]]"


def slugify(segment: str) -> str:
    s = segment.lower().replace(" ", "-")
    s = re.sub(r"[^a-z0-9_-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "root"


def infer_project_slug(rel_posix: str) -> str:
    parts = rel_posix.split("/")
    if len(parts) >= 3:
        return slugify(parts[1])
    return "root"


def infer_project_folder(rel_posix: str) -> str | None:
    parts = rel_posix.split("/")
    if len(parts) >= 3:
        return parts[1]
    return None


def is_project_hub_note(rel_posix: str, segment: str | None) -> bool:
    if rel_posix == "04-Projects/_Vault_Root_Projects_Hub.md":
        return True
    if not segment:
        return False
    if rel_posix == f"04-Projects/{segment}/_Vault_Project_Hub.md":
        return True
    if rel_posix == f"04-Projects/{segment}/README.md":
        return True
    if rel_posix == f"04-Projects/{segment}.md":
        return True
    return False


def project_hub_wikilink(vault_root: Path, segment: str) -> str | None:
    proj_dir = vault_root / "04-Projects" / segment
    vault_hub = proj_dir / "_Vault_Project_Hub.md"
    if vault_hub.is_file():
        return f"[[04-Projects/{segment}/_Vault_Project_Hub]]"
    if (proj_dir / "README.md").is_file():
        return f"[[04-Projects/{segment}/README]]"
    sibling = vault_root / "04-Projects" / f"{segment}.md"
    if sibling.is_file():
        return f"[[04-Projects/{segment}]]"
    return None


def effective_project_hub(rel_posix: str, vault_root: Path) -> str | None:
    parts = rel_posix.replace("\\", "/").split("/")
    if len(parts) == 2 and parts[0] == "04-Projects" and parts[1].endswith(".md"):
        name = parts[1]
        if name.startswith("_MOC_"):
            return None
        if name == "_Vault_Root_Projects_Hub.md":
            return None
        root_hub = vault_root / "04-Projects" / "_Vault_Root_Projects_Hub.md"
        if root_hub.is_file():
            return "[[04-Projects/_Vault_Root_Projects_Hub]]"

    segment = infer_project_folder(rel_posix)
    if not segment:
        return None
    hub = project_hub_wikilink(vault_root, segment)
    if not hub:
        return None
    if is_project_hub_note(rel_posix, segment):
        return None
    return hub


def split_frontmatter(text: str) -> tuple[str | None, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text
    return m.group("body"), text[m.end() :]


def infer_type(rel_posix: str, name: str) -> str:
    lower = rel_posix.lower()
    lname = name.lower()
    if name.startswith("_MOC_"):
        return "moc"
    if name in ("_Vault_Project_Hub.md", "_Vault_Root_Projects_Hub.md"):
        return "project-hub"
    if name in ("README.md", "INDEX.md"):
        return "guide"
    if "/posts/" in lower and lname.startswith("day_"):
        return "substack-post"
    if "transcript" in lname:
        return "transcript"
    if "assignment" in lower or "test_assignment" in lower:
        return "assignment-note"
    return "project-note"


def merge_tags(existing, slug: str) -> list[str]:
    tags: list[str] = []
    if isinstance(existing, list):
        tags = [str(t) for t in existing]
    elif isinstance(existing, str) and existing.strip():
        tags = [existing.strip()]
    required = ["dex/note", "dex/domain/projects", f"dex/project/{slug}"]
    return list(OrderedDict.fromkeys([*tags, *required]))


def graph_links_line(project_hub: str | None) -> str:
    parts: list[str] = [ROOT_MOC]
    if project_hub:
        parts.append(project_hub)
    parts.append(CHANGE_ANCHOR)
    return "Graph links: " + " | ".join(parts)


def build_frontmatter(
    existing: dict, rel_posix: str, name: str, vault_root: Path
) -> dict:
    data = dict(existing) if isinstance(existing, dict) else {}
    slug = infer_project_slug(rel_posix)
    inferred_type = infer_type(rel_posix, name)

    existing_type = data.get("type")
    if name in ("_Vault_Project_Hub.md", "_Vault_Root_Projects_Hub.md"):
        data["type"] = "project-hub"
    elif existing_type in (None, "", "note", "project-note"):
        data["type"] = inferred_type
    else:
        data["type"] = existing_type

    data["domain"] = "projects"
    data["project"] = slug
    data["cluster"] = f"projects-{slug}"
    data["status"] = data.get("status") or "active"
    data["review"] = data.get("review") or "2026-05-01"
    data["moc"] = ROOT_MOC
    data["change_log"] = CHANGE_ANCHOR
    data["tags"] = merge_tags(data.get("tags"), slug)
    data.setdefault("parent_moc", ROOT_MOC)

    hub = effective_project_hub(rel_posix, vault_root)
    if hub:
        data["project_hub"] = hub
    else:
        data.pop("project_hub", None)

    return data


def dump_frontmatter(data: dict) -> str:
    return yaml.safe_dump(
        data,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    ).strip()


def strip_graph_lines(body: str) -> str:
    return GRAPH_LINE_RE.sub("", body).lstrip("\n")


def compose(text: str, rel_posix: str, name: str, vault_root: Path) -> str:
    fm_raw, body = split_frontmatter(text)
    parsed = yaml.safe_load(fm_raw) if fm_raw else None
    if parsed is not None and not isinstance(parsed, dict):
        raise ValueError("frontmatter is not a mapping")

    merged = build_frontmatter(parsed or {}, rel_posix, name, vault_root)
    frontmatter = dump_frontmatter(merged)
    body_clean = strip_graph_lines(body).lstrip("\n")
    hub = effective_project_hub(rel_posix, vault_root)
    return f"---\n{frontmatter}\n---\n\n{graph_links_line(hub)}\n\n{body_clean}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    parser.add_argument("--folder", type=str, default="04-Projects")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = args.vault_root.resolve()
    folder = (root / args.folder).resolve()
    if not folder.exists():
        print(f"ERROR: folder not found: {folder}", file=sys.stderr)
        return 2

    files = sorted(
        p
        for p in folder.rglob("*.md")
        if p.is_file()
        and "node_modules" not in p.relative_to(root).as_posix()
        and "/.git/" not in p.relative_to(root).as_posix()
    )
    changed = 0
    unchanged = 0
    skipped = 0
    errors: list[str] = []

    for path in files:
        rel = path.relative_to(root).as_posix()
        if path.name.startswith("_MOC_"):
            skipped += 1
            continue

        try:
            original = path.read_text(encoding="utf-8")
            updated = compose(original, rel, path.name, root)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{rel}: {exc}")
            continue

        if updated == original:
            unchanged += 1
            continue

        if args.dry_run:
            changed += 1
            continue

        path.write_text(updated, encoding="utf-8", newline="\n")
        changed += 1

    print(f"files_total={len(files)}")
    print(f"changed={changed}")
    print(f"unchanged={unchanged}")
    print(f"skipped_moc={skipped}")
    print(f"errors={len(errors)}")
    if errors:
        print("--- errors ---", file=sys.stderr)
        for line in errors[:50]:
            print(line, file=sys.stderr)
        if len(errors) > 50:
            print(f"... and {len(errors) - 50} more", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
