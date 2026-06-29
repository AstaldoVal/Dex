#!/usr/bin/env python3
"""
Sync Linear issues assigned to me into Dex: create tasks in 03-Tasks/Tasks.md
for issues not yet in linear_sync.json. No webhook or public URL needed.

Run manually: VAULT_PATH=/path/to/Dex python3 .scripts/sync_linear_to_dex.py
Or install launchd (see install-linear-sync-launchd.sh) to run every 10 minutes.
"""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("VAULT_PATH", str(REPO_ROOT))
VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
_env = VAULT_PATH / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

sys.path.insert(0, str(REPO_ROOT))

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
        return {
            "error": "; ".join(e.get("message", str(e)) for e in body["errors"]),
            "data": body.get("data"),
        }
    return {"error": None, "data": body.get("data")}


def fetch_my_issues() -> list:
    out = graphql("query { viewer { id } }")
    if out["error"]:
        return []
    viewer = (out.get("data") or {}).get("viewer")
    if not viewer:
        return []
    query = """
    query($first: Int!, $filter: IssueFilter) {
      issues(first: $first, filter: $filter) {
        nodes { id identifier title description }
      }
    }
    """
    variables = {
        "first": 100,
        "filter": {"assignee": {"id": {"eq": viewer["id"]}}},
    }
    out = graphql(query, variables)
    if out["error"]:
        return []
    nodes = (out.get("data") or {}).get("issues", {}).get("nodes") or []
    return [
        {
            "id": n.get("id"),
            "identifier": n.get("identifier") or "",
            "title": (n.get("title") or "").strip() or "Untitled",
            "description": (n.get("description") or "").strip(),
        }
        for n in nodes
        if n.get("id")
    ]


def main() -> int:
    if not API_KEY:
        print("LINEAR_API_KEY not set (check .env)", file=sys.stderr)
        return 1
    issues = fetch_my_issues()
    if not issues:
        return 0
    from core.mcp.work_server import sync_linear_issues_to_dex

    result = sync_linear_issues_to_dex(issues)
    created = result.get("created") or []
    if created:
        print(f"Synced {len(created)} issue(s) from Linear to Dex: {[c['linear_identifier'] for c in created]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
