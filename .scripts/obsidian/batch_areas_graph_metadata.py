#!/usr/bin/env python3
"""
Batch-add Obsidian graph spine metadata to markdown notes under 05-Areas.

Design goal: keep clusters separated by linking notes primarily to local area MOC
and monthly changelog anchor, avoiding oversized central hubs.
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

CHANGE_ANCHOR = "[[System/Change_Log/2026-04#2026-04-22-batch-areas]]"
ROOT_MOC = "[[05-Areas/_MOC_Areas]]"

AREA_MOC_MAP = {
    "career": "[[05-Areas/Career/_MOC_Career]]",
    "companies": "[[05-Areas/Companies/_MOC_Companies]]",
    "meetings": "[[05-Areas/Meetings/_MOC_Meetings]]",
    "people": "[[05-Areas/People/_MOC_People]]",
    "physical": "[[05-Areas/Physical/_MOC_Physical]]",
}


def split_frontmatter(text: str) -> tuple[str | None, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text
    return m.group("body"), text[m.end() :]


def infer_area(rel_posix: str) -> str:
    parts = rel_posix.split("/")
    if len(parts) >= 3:
        candidate = parts[1].lower()
        if candidate in AREA_MOC_MAP:
            return candidate
    return "general"


def infer_type(rel_posix: str, name: str, area: str) -> str:
    lname = name.lower()
    lower = rel_posix.lower()
    if name.startswith("_MOC_"):
        return "moc"
    if name == "README.md":
        return "guide"
    if area == "meetings":
        return "meeting-note"
    if area == "people":
        return "person-note"
    if area == "companies":
        return "company-note"
    if area == "physical" and "/logs/" in lower:
        return "physical-log"
    if area == "physical":
        return "physical-note"
    if area == "career":
        return "career-note"
    if "profile" in lname:
        return "profile-note"
    return "area-note"


def merge_tags(existing, area: str) -> list[str]:
    tags: list[str] = []
    if isinstance(existing, list):
        tags = [str(t) for t in existing]
    elif isinstance(existing, str) and existing.strip():
        tags = [existing.strip()]

    required = ["dex/note", "dex/domain/areas", f"dex/area/{area}"]
    return list(OrderedDict.fromkeys([*tags, *required]))


def graph_line_for(area: str) -> str:
    area_moc = AREA_MOC_MAP.get(area, ROOT_MOC)
    if area_moc == ROOT_MOC:
        return f"Graph links: {ROOT_MOC} | {CHANGE_ANCHOR}"
    return f"Graph links: {ROOT_MOC} | {area_moc} | {CHANGE_ANCHOR}"


def build_frontmatter(existing: dict, rel_posix: str, name: str) -> dict:
    data = dict(existing) if isinstance(existing, dict) else {}
    area = infer_area(rel_posix)
    inferred_type = infer_type(rel_posix, name, area)

    existing_type = data.get("type")
    if existing_type in (None, "", "note", "area-note"):
        data["type"] = inferred_type
    else:
        data["type"] = existing_type

    data["domain"] = "areas"
    data["area"] = area
    data["cluster"] = f"areas-{area}"
    data["status"] = data.get("status") or "active"
    data["review"] = data.get("review") or "2026-05-01"
    data["moc"] = AREA_MOC_MAP.get(area, ROOT_MOC)
    data["change_log"] = CHANGE_ANCHOR
    data["tags"] = merge_tags(data.get("tags"), area)
    data.setdefault("parent_moc", ROOT_MOC)
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


def compose(text: str, rel_posix: str, name: str) -> str:
    fm_raw, body = split_frontmatter(text)
    parsed = yaml.safe_load(fm_raw) if fm_raw else None
    if parsed is not None and not isinstance(parsed, dict):
        raise ValueError("frontmatter is not a mapping")

    area = infer_area(rel_posix)
    graph_line = graph_line_for(area)
    merged = build_frontmatter(parsed or {}, rel_posix, name)
    frontmatter = dump_frontmatter(merged)
    body_clean = strip_graph_lines(body).lstrip("\n")
    return f"---\n{frontmatter}\n---\n\n{graph_line}\n\n{body_clean}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    parser.add_argument(
        "--folder",
        type=str,
        default="05-Areas",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = args.vault_root.resolve()
    folder = (root / args.folder).resolve()
    if not folder.exists():
        print(f"ERROR: folder not found: {folder}", file=sys.stderr)
        return 2

    files = sorted(p for p in folder.rglob("*.md") if p.is_file())
    changed = 0
    unchanged = 0
    skipped = 0
    errors: list[str] = []

    for path in files:
        rel = path.relative_to(root).as_posix()
        if path.name == "_MOC_Areas.md" or path.name.startswith("_MOC_"):
            skipped += 1
            continue

        try:
            original = path.read_text(encoding="utf-8")
            updated = compose(original, rel, path.name)
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
