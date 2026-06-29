#!/usr/bin/env python3
"""
One-off: link existing Linear issues (in project "Dex / Cursor tasks") to Dex tasks
by matching issue title to task title in 03-Tasks/Tasks.md. Writes 03-Tasks/linear_sync.json.

Use when you already exported tasks to Linear before linear_sync.json existed.
Requires: LINEAR_API_KEY in .env, VAULT_PATH.

Run: python .scripts/backfill_linear_sync_from_project.py
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
ENV_FILE = VAULT_PATH / ".env"
TASKS_FILE = VAULT_PATH / "03-Tasks" / "Tasks.md"
SYNC_FILE = VAULT_PATH / "03-Tasks" / "linear_sync.json"

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
    except ImportError:
        pass

LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"


def _get_api_key():
    return os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")


async def _graphql(query: str, variables: dict | None = None) -> dict:
    import aiohttp
    import ssl
    try:
        import certifi
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ssl_ctx = True
    connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx is not True else None
    api_key = _get_api_key()
    if not api_key:
        return {"error": "LINEAR_API_KEY not set", "data": None}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    try:
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.post(
                LINEAR_GRAPHQL_URL,
                json=payload,
                headers={"Authorization": api_key, "Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                body = await resp.json()
    except Exception as e:
        return {"error": str(e), "data": None}
    if body.get("errors"):
        return {"error": "; ".join(e.get("message", str(e)) for e in body["errors"]), "data": body.get("data")}
    return {"error": None, "data": body.get("data")}


QUERY_PROJECTS = "query { projects { nodes { id name } } }"
QUERY_ISSUES_BY_PROJECT = """
query($first: Int!, $filter: IssueFilter) {
  issues(first: $first, filter: $filter) {
    nodes { id identifier title }
  }
}
"""


def parse_tasks_with_ids(content: str) -> list[dict]:
    """Return list of {task_id, title} from Tasks.md (open tasks)."""
    tasks = []
    pattern = re.compile(r'^-\s+\[\s\]\s+\*\*(.+?)\*\*(.*?)(\^task-\S+)', re.MULTILINE)
    for m in pattern.finditer(content):
        title = m.group(1).strip()
        task_id = m.group(3).strip().lstrip("^")
        tasks.append({"task_id": task_id, "title": title})
    return tasks


def normalize_title(s: str) -> str:
    return s.lower().strip()[:80]


def main():
    async def run():
        if not _get_api_key():
            print("LINEAR_API_KEY not set.", file=sys.stderr)
            sys.exit(1)
        if not TASKS_FILE.exists():
            print(f"Tasks file not found: {TASKS_FILE}", file=sys.stderr)
            sys.exit(1)
        dex_tasks = parse_tasks_with_ids(TASKS_FILE.read_text(encoding="utf-8"))
        if not dex_tasks:
            print("No open tasks in Tasks.md.")
            return
        out = await _graphql(QUERY_PROJECTS)
        if out.get("error"):
            print(f"Linear API: {out['error']}", file=sys.stderr)
            sys.exit(1)
        projects = (out.get("data") or {}).get("projects", {}).get("nodes") or []
        project = next((p for p in projects if (p.get("name") or "").strip() == "Dex / Cursor tasks"), None)
        if not project:
            print('Project "Dex / Cursor tasks" not found in Linear.')
            sys.exit(1)
        project_id = project["id"]
        out2 = await _graphql(QUERY_ISSUES_BY_PROJECT, {
            "first": 100,
            "filter": {"project": {"id": {"eq": project_id}}},
        })
        if out2.get("error"):
            print(f"Linear API: {out2['error']}", file=sys.stderr)
            sys.exit(1)
        issues = (out2.get("data") or {}).get("issues", {}).get("nodes") or []
        task_to_linear = {}
        task_to_linear_id = {}
        linear_id_to_task = {}
        dex_by_norm = {normalize_title(t["title"]): t for t in dex_tasks}
        for issue in issues:
            title = (issue.get("title") or "").strip()
            norm = normalize_title(title)
            # exact or prefix match
            match = dex_by_norm.get(norm)
            if not match:
                for dt in dex_tasks:
                    if norm in normalize_title(dt["title"]) or normalize_title(dt["title"]) in norm:
                        match = dt
                        break
            if not match:
                continue
            task_id = match["task_id"]
            lid = issue["id"]
            ident = issue.get("identifier") or ""
            task_to_linear[task_id] = ident
            task_to_linear_id[task_id] = lid
            linear_id_to_task[lid] = task_id
            print(f"  Linked {ident} ↔ {task_id}")
        SYNC_FILE.parent.mkdir(parents=True, exist_ok=True)
        existing = {}
        if SYNC_FILE.exists():
            try:
                existing = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        task_to_linear = {**existing.get("task_to_linear", {}), **task_to_linear}
        task_to_linear_id = {**existing.get("task_to_linear_id", {}), **task_to_linear_id}
        linear_id_to_task = {**existing.get("linear_id_to_task", {}), **linear_id_to_task}
        SYNC_FILE.write_text(json.dumps({
            "task_to_linear": task_to_linear,
            "task_to_linear_id": task_to_linear_id,
            "linear_id_to_task": linear_id_to_task,
        }, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {len(task_to_linear)} links to {SYNC_FILE}")

    asyncio.run(run())


if __name__ == "__main__":
    main()
