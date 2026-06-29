#!/usr/bin/env python3
"""
Create a Linear issue and link it to a Dex task in 03-Tasks/linear_sync.json.

Usage:
  VAULT_PATH=/path/to/Dex python .scripts/linear_create_and_link.py <task_id> "<title>" [description]

Example:
  VAULT_PATH=/path/to/Dex python .scripts/linear_create_and_link.py task-20260216-225 "Посмотреть видео Лары" "Описание..."
"""

import json
import os
import sys
from pathlib import Path

# Load .env from VAULT_PATH
VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.getcwd()))
_env = VAULT_PATH / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

import requests

LINEAR_GRAPHQL = "https://api.linear.app/graphql"
API_KEY = os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")


def graphql(query: str, variables: dict | None = None) -> dict:
    if not API_KEY:
        return {"error": "LINEAR_API_KEY not set", "data": None}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    try:
        r = requests.post(
            LINEAR_GRAPHQL,
            json=payload,
            headers={"Authorization": API_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
        body = r.json()
    except Exception as e:
        return {"error": str(e), "data": None}
    if "errors" in body and body["errors"]:
        return {"error": "; ".join(e.get("message", str(e)) for e in body["errors"]), "data": body.get("data")}
    return {"error": None, "data": body.get("data")}


def main():
    if len(sys.argv) < 3:
        print("Usage: linear_create_and_link.py <task_id> \"<title>\" [description]", file=sys.stderr)
        sys.exit(1)
    task_id = sys.argv[1].strip()
    title = sys.argv[2].strip()
    description = sys.argv[3].strip() if len(sys.argv) > 3 else None

    # Viewer
    out = graphql("query { viewer { id name email } }")
    if out["error"]:
        print(json.dumps({"error": out["error"]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    viewer = (out.get("data") or {}).get("viewer")
    if not viewer:
        print(json.dumps({"error": "viewer not found"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

    # Teams
    out = graphql("query { teams { nodes { id name key } } }")
    if out["error"]:
        print(json.dumps({"error": out["error"]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    teams = (out.get("data") or {}).get("teams", {}).get("nodes") or []
    if not teams:
        print(json.dumps({"error": "No teams in workspace"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    team_id = teams[0]["id"]

    # Create issue
    mutation = """
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    inp = {"teamId": team_id, "title": title, "assigneeId": viewer["id"]}
    if description:
        inp["description"] = description
    out = graphql(mutation, {"input": inp})
    if out["error"]:
        print(json.dumps({"error": out["error"]}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    result = (out.get("data") or {}).get("issueCreate") or {}
    if not result.get("success"):
        print(json.dumps({"error": "issueCreate success: false"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    issue = result.get("issue")
    if not issue:
        print(json.dumps({"error": "no issue in response"}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

    linear_id = issue["id"]
    linear_identifier = issue.get("identifier") or ""

    # Update linear_sync.json (repo root = parent of .scripts)
    repo_root = Path(__file__).resolve().parent.parent
    sync_file = repo_root / "03-Tasks" / "linear_sync.json"
    if not sync_file.exists():
        data = {"task_to_linear": {}, "task_to_linear_id": {}, "linear_id_to_task": {}}
    else:
        with open(sync_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    data.setdefault("task_to_linear", {})[task_id] = linear_identifier
    data.setdefault("task_to_linear_id", {})[task_id] = linear_id
    data.setdefault("linear_id_to_task", {})[linear_id] = task_id
    with open(sync_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)

    print(json.dumps({"ok": True, "task_id": task_id, "linear_identifier": linear_identifier, "linear_id": linear_id, "url": issue.get("url")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
