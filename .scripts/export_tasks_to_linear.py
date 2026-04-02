#!/usr/bin/env python3
"""
Export open tasks from Dex 03-Tasks/Tasks.md to a new Linear project.
Creates project "Dex / Cursor tasks" and one Linear issue per open task.

Requires: LINEAR_API_KEY in VAULT_PATH/.env (or LINEAR_TOKEN in env).
Usage: VAULT_PATH=/path/to/Dex python .scripts/export_tasks_to_linear.py
       or from repo root: python .scripts/export_tasks_to_linear.py (VAULT_PATH defaults to repo root)

If you see SSL certificate errors (e.g. on macOS): run the script in a venv where
certifi is installed, or run "Install Certificates.command" from your Python install.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

# VAULT_PATH = repo root when running from Dex
REPO_ROOT = Path(__file__).resolve().parent.parent
VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
ENV_FILE = VAULT_PATH / ".env"
TASKS_FILE = VAULT_PATH / "03-Tasks" / "Tasks.md"

if ENV_FILE.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_FILE)
    except ImportError:
        pass

LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"


def _get_api_key():
    return os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")


def _ssl_context():
    """Use certifi certificates if available, so SSL works on macOS without manual install."""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return True  # aiohttp will use default

async def _graphql(query: str, variables: dict | None = None) -> dict:
    import aiohttp
    api_key = _get_api_key()
    if not api_key:
        return {"error": "LINEAR_API_KEY (or LINEAR_TOKEN) not set. Add to VAULT_PATH/.env or env.", "data": None}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    ssl_ctx = _ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx is not True else None
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
        messages = [e.get("message", str(e)) for e in body["errors"]]
        return {"error": "; ".join(messages), "data": body.get("data")}
    return {"error": None, "data": body.get("data")}


# GraphQL fragments
QUERY_VIEWER = "query { viewer { id name email } }"
QUERY_TEAMS = "query { teams { nodes { id name key } } }"
MUTATION_CREATE_PROJECT = """
mutation($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project { id name state url }
  }
}
"""
MUTATION_CREATE_ISSUE = """
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier title url state { name } }
  }
}
"""


def parse_open_tasks(content: str) -> list[dict]:
    """Extract open tasks from Tasks.md: list of {title, description, task_id}."""
    tasks = []
    # Match: - [ ] **Title** ^task-id (optional rest of line)
    pattern = re.compile(r'^-\s+\[\s\]\s+\*\*(.+?)\*\*(.*?)(\^task-\S+)', re.MULTILINE)
    for m in pattern.finditer(content):
        title = m.group(1).strip()
        raw_id = m.group(3).strip()
        task_id = raw_id.lstrip("^")  # store as task-YYYYMMDD-XXX for linear_sync.json
        tasks.append({"title": title, "description": None, "task_id": task_id})
    # Optionally attach description: next lines that are sub-bullets (tab + -)
    for i, t in enumerate(tasks):
        # We don't have position in content; descriptions can be added by second pass
        pass
    return tasks


async def main():
    if not TASKS_FILE.exists():
        print(f"Tasks file not found: {TASKS_FILE}", file=sys.stderr)
        sys.exit(1)
    text = TASKS_FILE.read_text(encoding="utf-8")
    tasks = parse_open_tasks(text)
    if not tasks:
        print("No open tasks found in 03-Tasks/Tasks.md")
        return

    if not _get_api_key():
        print("LINEAR_API_KEY (or LINEAR_TOKEN) not set. Add to VAULT_PATH/.env or env.", file=sys.stderr)
        sys.exit(1)
    print(f"Found {len(tasks)} open task(s).")

    # Viewer
    out = await _graphql(QUERY_VIEWER)
    if out.get("error"):
        print(f"Linear API error (viewer): {out['error']}", file=sys.stderr)
        sys.exit(1)
    viewer = (out.get("data") or {}).get("viewer")
    if not viewer:
        print("Viewer not found.", file=sys.stderr)
        sys.exit(1)
    print(f"Linear user: {viewer.get('name')} ({viewer.get('email')})")

    # Teams
    out = await _graphql(QUERY_TEAMS)
    if out.get("error"):
        print(f"Linear API error (teams): {out['error']}", file=sys.stderr)
        sys.exit(1)
    teams = (out.get("data") or {}).get("teams", {}).get("nodes") or []
    if not teams:
        print("No teams in Linear workspace. Create a team in Linear first.", file=sys.stderr)
        sys.exit(1)
    team_id = teams[0]["id"]
    print(f"Using team: {teams[0].get('name')} ({teams[0].get('key')})")

    # Create project
    project_name = "Dex / Cursor tasks"
    out = await _graphql(MUTATION_CREATE_PROJECT, {
        "input": {"name": project_name, "teamIds": [team_id], "description": "Exported from Dex 03-Tasks/Tasks.md"}
    })
    if out.get("error"):
        print(f"Linear API error (projectCreate): {out['error']}", file=sys.stderr)
        sys.exit(1)
    result = (out.get("data") or {}).get("projectCreate") or {}
    if not result.get("success"):
        print("projectCreate returned success: false", file=sys.stderr)
        sys.exit(1)
    project = result.get("project")
    project_id = project["id"]
    print(f"Created project: {project.get('name')} | {project.get('url', '')}")

    # Create issues and collect links for 03-Tasks/linear_sync.json
    sync_file = VAULT_PATH / "03-Tasks" / "linear_sync.json"
    sync_file.parent.mkdir(parents=True, exist_ok=True)
    task_to_linear = {}
    task_to_linear_id = {}
    linear_id_to_task = {}
    if sync_file.exists():
        try:
            data = json.loads(sync_file.read_text(encoding="utf-8"))
            task_to_linear = data.get("task_to_linear") or {}
            task_to_linear_id = data.get("task_to_linear_id") or {}
            linear_id_to_task = data.get("linear_id_to_task") or {}
        except Exception:
            pass

    for t in tasks:
        inp = {
            "teamId": team_id,
            "title": t["title"][:255],
            "assigneeId": viewer["id"],
            "projectId": project_id,
        }
        if t.get("description"):
            inp["description"] = t["description"]
        out = await _graphql(MUTATION_CREATE_ISSUE, {"input": inp})
        if out.get("error"):
            print(f"  Skip \"{t['title'][:50]}...\": {out['error']}", file=sys.stderr)
            continue
        res = (out.get("data") or {}).get("issueCreate") or {}
        if res.get("success"):
            issue = res.get("issue")
            task_id = t.get("task_id")
            lid = issue.get("id")
            ident = issue.get("identifier")
            if task_id and lid and ident:
                task_to_linear[task_id] = ident
                task_to_linear_id[task_id] = lid
                linear_id_to_task[lid] = task_id
            print(f"  Created: {issue.get('identifier')} {issue.get('title', '')[:50]} | {issue.get('url', '')}")
        else:
            print(f"  Skip \"{t['title'][:50]}...\": issueCreate success false", file=sys.stderr)

    sync_file.write_text(
        json.dumps({
            "task_to_linear": task_to_linear,
            "task_to_linear_id": task_to_linear_id,
            "linear_id_to_task": linear_id_to_task,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Updated {sync_file} with {len(task_to_linear)} task–Linear links.")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
