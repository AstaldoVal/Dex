#!/usr/bin/env python3
"""
Export all Linear issues (workspace) to a Markdown snapshot under Banda/operations (not the Obsidian vault).

Requires: LINEAR_API_KEY or LINEAR_TOKEN in repo-root .env (or env).

Usage from repo root:
  python3 .scripts/banda/export_linear_snapshot.py
  python3 .scripts/banda/export_linear_snapshot.py --out 04-Projects/Banda/operations/LINEAR_SNAPSHOT.md
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv

        load_dotenv(ENV_FILE)
    except ImportError:
        pass

import requests

API_URL = "https://api.linear.app/graphql"
QUERY = """
query Issues($first: Int!, $after: String) {
  issues(first: $first, after: $after, includeArchived: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier
      title
      url
      updatedAt
      state { name type }
      team { name }
      assignee { name }
      priority
      project { name }
    }
  }
}
"""


def fetch_all(api_key: str) -> list[dict]:
    out: list[dict] = []
    cursor: str | None = None
    while True:
        r = requests.post(
            API_URL,
            json={"query": QUERY, "variables": {"first": 100, "after": cursor}},
            headers={"Authorization": api_key, "Content-Type": "application/json"},
            timeout=60,
        )
        r.raise_for_status()
        body = r.json()
        if body.get("errors"):
            raise RuntimeError(json.dumps(body["errors"], indent=2))
        data = (body.get("data") or {}).get("issues") or {}
        nodes = data.get("nodes") or []
        out.extend(nodes)
        pi = data.get("pageInfo") or {}
        if not pi.get("hasNextPage"):
            break
        cursor = pi.get("endCursor")
        if not cursor:
            break
    return out


def priority_label(p: int | None) -> str:
    if p is None:
        return ""
    return {0: "none", 1: "urgent", 2: "high", 3: "medium", 4: "low"}.get(p, str(p))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        default="04-Projects/Banda/operations/LINEAR_SNAPSHOT.md",
        help="Output path relative to repo root",
    )
    args = parser.parse_args()

    api_key = os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")
    if not api_key:
        print("ERROR: LINEAR_API_KEY (or LINEAR_TOKEN) not set.", file=sys.stderr)
        return 1

    issues = fetch_all(api_key)
    issues.sort(key=lambda x: (x.get("identifier") or ""))

    out_path = REPO_ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines: list[str] = [
        "# Снимок задач (внешний трекер)",
        "",
        f"Сгенерировано: {now}. Канонический список в трекере задач; этот файл только локальная копия для поиска по репозиторию.",
        "",
        "Обновить вручную:",
        "",
        "```bash",
        "python3 .scripts/banda/export_linear_snapshot.py",
        "```",
        "",
        f"Всего issues: {len(issues)}.",
        "",
    ]

    by_state: dict[str, list[dict]] = {}
    for it in issues:
        st = (it.get("state") or {}).get("name") or "Unknown"
        by_state.setdefault(st, []).append(it)

    for state_name in sorted(by_state.keys(), key=lambda s: (s != "Done", s.lower())):
        lines.append(f"## {state_name}")
        lines.append("")
        for it in sorted(by_state[state_name], key=lambda x: x.get("identifier") or ""):
            ident = it.get("identifier") or "?"
            title = (it.get("title") or "").replace("\n", " ")
            url = it.get("url") or ""
            team = (it.get("team") or {}).get("name") or ""
            assignee = (it.get("assignee") or {}).get("name") or ""
            project = (it.get("project") or {}).get("name") or ""
            pr = it.get("priority")
            pl = priority_label(pr) if pr is not None else ""
            lines.append(f"- **{ident}** {title}")
            lines.append(f"  - URL: {url}")
            meta = []
            if team:
                meta.append(f"team: {team}")
            if assignee:
                meta.append(f"assignee: {assignee}")
            if project:
                meta.append(f"project: {project}")
            if pl:
                meta.append(f"priority: {pl}")
            if meta:
                lines.append(f"  - {'; '.join(meta)}")
            lines.append("")
        lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {len(issues)} issues to {out_path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
