#!/usr/bin/env python3
"""
Batch-add Obsidian graph spine metadata to markdown notes under 00-Inbox/Job_Search.

Idempotent: safe to re-run; updates YAML frontmatter keys and normalizes the Graph links line.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\r?\n(?P<body>.*?)\r?\n---\s*\r?\n", re.DOTALL)
GRAPH_LINE_RE = re.compile(r"^Graph links:.*\r?\n?", re.MULTILINE)

CHANGE_LOG_SUBMOCS = "[[System/Change_Log/2026-04#2026-04-22-batch-job-search-submocs]]"
JOB_MOC_LINK = "[[00-Inbox/Job_Search/_MOC_Job_Search]]"
INBOX_MOC_LINK = "[[00-Inbox/_MOC_Inbox]]"

SUB_MOC_TELEGRAM = "[[00-Inbox/Job_Search/_MOC_Job_Search_Telegram]]"
SUB_MOC_FEEDBACK = "[[00-Inbox/Job_Search/_MOC_Job_Search_Feedback]]"
SUB_MOC_SNAPSHOTS = "[[00-Inbox/Job_Search/_MOC_Job_Search_Snapshots]]"

SUBCLUSTER_TO_MOC: dict[str, str] = {
    "telegram": SUB_MOC_TELEGRAM,
    "feedback": SUB_MOC_FEEDBACK,
    "snapshot": SUB_MOC_SNAPSHOTS,
}

REQUIRED_TAGS = ["dex/note", "dex/domain/job-search", "dex/cluster/inbox-job-search"]


def classify_subcluster(_rel_posix: str, name: str) -> str:
    """Route notes to sub-MOCs by filename heuristics (priority: telegram > feedback > snapshot)."""
    ln = name.lower()
    if ln.startswith("telegram_"):
        return "telegram"
    feedback_markers = (
        "gmail_",
        "job_application",
        "paperclip",
        "positive_signals",
        "recruiter_follow",
        "confirmation",
        "submissions",
    )
    if any(m in ln for m in feedback_markers):
        return "feedback"
    if "feedback" in ln:
        return "feedback"
    if "snapshot" in ln:
        return "snapshot"
    return "default"


def graph_links_line(subcluster: str) -> str:
    parts: list[str] = [INBOX_MOC_LINK, JOB_MOC_LINK]
    if subcluster in SUBCLUSTER_TO_MOC:
        parts.append(SUBCLUSTER_TO_MOC[subcluster])
    parts.append(CHANGE_LOG_SUBMOCS)
    return "Graph links: " + " | ".join(parts)


def infer_type(rel_posix: str, name: str) -> str:
    lower = rel_posix.lower()
    lname = name.lower()
    if name == "_MOC_Job_Search.md":
        return "moc"
    if "market" in lname and "research" in lname:
        return "research-note"
    if "merged" in lname or "refresh" in lname:
        return "synthesis-note"
    if "digests/" in lower:
        return "digest"
    if name.startswith("pasted-job"):
        return "job-posting"
    if name.startswith("Telegram_"):
        return "telegram-intel"
    if name.startswith("Gmail_") or "Application" in name or "Feedback" in name:
        return "application-feedback"
    if "Summary_Optimized" in name:
        return "resume-summary"
    if "full-flow-state" in name:
        return "workflow-state"
    return "note"


def split_frontmatter(text: str) -> tuple[str | None, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text
    return m.group("body"), text[m.end() :]


def merge_tags(existing) -> list[str]:
    tags: list[str] = []
    if isinstance(existing, list):
        tags = [str(t) for t in existing]
    elif isinstance(existing, str) and existing.strip():
        tags = [existing.strip()]
    merged = list(OrderedDict.fromkeys([*tags, *REQUIRED_TAGS]))
    return merged


def build_frontmatter(
    existing: dict, rel_posix: str, name: str, subcluster: str
) -> dict:
    data = dict(existing) if isinstance(existing, dict) else {}
    inferred_type = infer_type(rel_posix, name)
    existing_type = data.get("type")
    if existing_type in (None, "", "note"):
        data["type"] = inferred_type
    else:
        data["type"] = existing_type
    data["domain"] = "job-search"
    data["cluster"] = "inbox-job-search"
    data["status"] = data.get("status") or "active"
    data["review"] = data.get("review") or "2026-05-01"
    data["moc"] = SUBCLUSTER_TO_MOC.get(subcluster, JOB_MOC_LINK)
    data["change_log"] = CHANGE_LOG_SUBMOCS
    data["tags"] = merge_tags(data.get("tags"))

    # Keep a lightweight structural link for YAML-only consumers.
    data.setdefault("parent_moc", INBOX_MOC_LINK)

    return data


def dump_frontmatter(data: dict) -> str:
    dumped = yaml.safe_dump(
        data,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    ).strip()
    return dumped


def strip_graph_lines(body: str) -> str:
    body = GRAPH_LINE_RE.sub("", body)
    return body.lstrip("\n")


def compose(text: str, rel_posix: str, name: str) -> str:
    fm_raw, body = split_frontmatter(text)
    parsed = yaml.safe_load(fm_raw) if fm_raw else None
    if parsed is not None and not isinstance(parsed, dict):
        raise ValueError("frontmatter is not a mapping")

    subcluster = classify_subcluster(rel_posix, name)
    merged = build_frontmatter(parsed or {}, rel_posix, name, subcluster)
    fm_block = dump_frontmatter(merged)
    body_clean = strip_graph_lines(body).lstrip("\n")
    graph_line = graph_links_line(subcluster)

    return f"---\n{fm_block}\n---\n\n{graph_line}\n\n{body_clean}"


def iter_markdown_files(root: Path, folder: Path) -> list[Path]:
    return sorted(p for p in folder.rglob("*.md") if p.is_file())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Vault root (contains 00-Inbox/).",
    )
    parser.add_argument(
        "--folder",
        type=str,
        default="00-Inbox/Job_Search",
        help="Folder under vault root to process.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print counts only; do not write files.",
    )
    args = parser.parse_args()

    vault_root: Path = args.vault_root
    folder = (vault_root / args.folder).resolve()
    if not folder.exists():
        print(f"ERROR: folder not found: {folder}", file=sys.stderr)
        return 2

    files = iter_markdown_files(vault_root, folder)
    skipped: list[str] = []
    changed = 0
    unchanged = 0
    errors: list[str] = []
    stats: defaultdict[str, int] = defaultdict(int)

    for path in files:
        rel = path.relative_to(vault_root).as_posix()
        name = path.name
        if name.startswith("_MOC_"):
            skipped.append(rel)
            continue

        stats[classify_subcluster(rel, name)] += 1

        try:
            original = path.read_text(encoding="utf-8")
            updated = compose(original, rel, name)
        except Exception as exc:  # noqa: BLE001 - batch tool surfaces all failures
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
    print(f"skipped_moc={len(skipped)}")
    print(
        "subcluster_counts="
        + ",".join(f"{k}={stats[k]}" for k in sorted(stats.keys(), key=str))
    )
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
