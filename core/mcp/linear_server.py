#!/usr/bin/env python3
"""
Linear MCP Server for Dex

Подключение DEX к Linear: личный task management (один workspace, без команд).
Аутентификация: Personal API Key в .env (LINEAR_API_KEY) или в окружении.

При старте загружается .env из VAULT_PATH, чтобы ключ из .env подхватывался без настройки в Cursor.

Tools:
- linear_viewer: текущий пользователь (id, name, email)
- linear_my_issues: мои задачи (назначены на меня), фильтр по state_type
- linear_list_teams: список команд (при одном workspace — одна команда)
- linear_list_projects: список проектов
- linear_create_project: создать проект (привязать к команде)
- linear_list_issues: список задач с фильтрами и пагинацией
- linear_get_issue: одна задача по id или identifier (например ENG-123)
- linear_create_issue: создать задачу
- linear_update_issue: обновить задачу
"""

import os
from pathlib import Path
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

# Загрузить .env из VAULT_PATH, чтобы LINEAR_API_KEY подхватывался без настройки в Cursor
_vault = Path(os.environ.get("VAULT_PATH", os.getcwd()))
_env_file = _vault / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file)
    except ImportError:
        pass

mcp = FastMCP("Linear")

LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"


def _get_api_key() -> Optional[str]:
    return os.environ.get("LINEAR_API_KEY") or os.environ.get("LINEAR_TOKEN")


async def _graphql(
    query: str,
    variables: Optional[dict] = None,
) -> dict:
    """Execute GraphQL request against Linear API."""
    import aiohttp

    api_key = _get_api_key()
    if not api_key:
        return {
            "error": "LINEAR_API_KEY (or LINEAR_TOKEN) not set. Create a key in Linear → Settings → API.",
            "data": None,
        }

    payload: dict[str, Any] = {"query": query}
    if variables:
        payload["variables"] = variables

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                LINEAR_GRAPHQL_URL,
                json=payload,
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                body = await resp.json()
    except Exception as e:
        return {"error": str(e), "data": None}

    if "errors" in body and body["errors"]:
        messages = [e.get("message", str(e)) for e in body["errors"]]
        return {"error": "; ".join(messages), "data": body.get("data")}

    return {"error": None, "data": body.get("data")}


# --- Queries ---

QUERY_VIEWER = """
query {
  viewer {
    id
    name
    email
  }
}
"""

QUERY_TEAMS = """
query {
  teams {
    nodes {
      id
      name
      key
      description
    }
  }
}
"""

QUERY_PROJECTS_ALL = """
query {
  projects {
    nodes {
      id
      name
      state
      description
    }
  }
}
"""

QUERY_PROJECTS_BY_TEAM = """
query($teamId: String!) {
  projects(filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      state
      description
    }
  }
}
"""

QUERY_ISSUES = """
query($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter) {
    nodes {
      id
      identifier
      title
      description
      state { id name type }
      assignee { id name email }
      team { id name key }
      project { id name }
      url
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""

QUERY_ISSUE_BY_ID = """
query($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    state { id name type }
    assignee { id name email }
    team { id name key }
    project { id name }
    url
    createdAt
    updatedAt
  }
}
"""

QUERY_TEAM_WORKFLOW_STATES = """
query($teamId: String!) {
  team(id: $teamId) {
    id
    workflowStates {
      nodes {
        id
        name
        type
      }
    }
  }
}
"""

# --- Mutations ---

MUTATION_CREATE_ISSUE = """
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
      state { name }
    }
  }
}
"""

MUTATION_UPDATE_ISSUE = """
mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      identifier
      title
      url
      state { name }
    }
  }
}
"""

MUTATION_CREATE_PROJECT = """
mutation($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project {
      id
      name
      state
      url
    }
  }
}
"""


def _build_issue_filter(
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    state_type: Optional[str] = None,
    assignee_id: Optional[str] = None,
) -> Optional[dict]:
    """Build Linear IssueFilter object for GraphQL."""
    parts = []
    if team_id:
        parts.append({"team": {"id": {"eq": team_id}}})
    if project_id:
        parts.append({"project": {"id": {"eq": project_id}}})
    if state_type:
        # backlog, unstarted, started, completed, canceled
        parts.append({"state": {"type": {"eq": state_type}}})
    if assignee_id:
        parts.append({"assignee": {"id": {"eq": assignee_id}}})
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return {"and": parts}


@mcp.tool()
async def linear_viewer() -> dict:
    """
    Get current Linear user (viewer). Для личного workspace: id используется для linear_create_issue (assignee_id) и linear_my_issues.
    """
    out = await _graphql(QUERY_VIEWER)
    if out.get("error"):
        return {"error": out["error"], "viewer": None}
    viewer = (out.get("data") or {}).get("viewer")
    return {"error": None, "viewer": viewer}


@mcp.tool()
async def linear_my_issues(
    state_type: Optional[str] = None,
    first: int = 50,
    after: Optional[str] = None,
) -> dict:
    """
    List issues assigned to the current user (мои задачи). Для личного task management — основной способ посмотреть свои задачи.
    state_type: backlog | unstarted | started | completed | canceled (optional).
    """
    out = await _graphql(QUERY_VIEWER)
    if out.get("error"):
        return {"error": out["error"], "issues": [], "pageInfo": None}
    viewer = (out.get("data") or {}).get("viewer")
    if not viewer:
        return {"error": "viewer not found", "issues": [], "pageInfo": None}
    return await linear_list_issues(
        assignee_id=viewer["id"],
        state_type=state_type,
        first=first,
        after=after,
    )


@mcp.tool()
async def linear_list_teams() -> dict:
    """
    List all Linear teams in the workspace. При личном использовании обычно одна команда.
    Returns team id, name, key (e.g. ENG), and description.
    """
    out = await _graphql(QUERY_TEAMS)
    if out.get("error"):
        return {"error": out["error"], "teams": []}
    nodes = (out.get("data") or {}).get("teams", {}).get("nodes") or []
    return {"error": None, "teams": nodes}


@mcp.tool()
async def linear_list_projects(team_id: Optional[str] = None) -> dict:
    """
    List Linear projects. Optionally filter by team_id (UUID).
    Returns project id, name, state, description.
    """
    if team_id:
        out = await _graphql(QUERY_PROJECTS_BY_TEAM, {"teamId": team_id})
    else:
        out = await _graphql(QUERY_PROJECTS_ALL)
    if out.get("error"):
        return {"error": out["error"], "projects": []}
    nodes = (out.get("data") or {}).get("projects", {}).get("nodes") or []
    return {"error": None, "projects": nodes}


@mcp.tool()
async def linear_create_project(
    team_id: str,
    name: str,
    description: Optional[str] = None,
) -> dict:
    """
    Create a Linear project and link it to a team.
    team_id: UUID of the team (from linear_list_teams).
    name: project name.
    description: optional.
    """
    inp: dict[str, Any] = {"name": name, "teamIds": [team_id]}
    if description is not None:
        inp["description"] = description
    out = await _graphql(MUTATION_CREATE_PROJECT, {"input": inp})
    if out.get("error"):
        return {"error": out["error"], "project": None}
    data = out.get("data") or {}
    result = data.get("projectCreate") or {}
    if not result.get("success"):
        return {"error": "projectCreate returned success: false", "project": None}
    return {"error": None, "project": result.get("project")}


@mcp.tool()
async def linear_list_issues(
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    state_type: Optional[str] = None,
    assignee_id: Optional[str] = None,
    first: int = 50,
    after: Optional[str] = None,
) -> dict:
    """
    List Linear issues with optional filters and pagination.
    state_type: backlog | unstarted | started | completed | canceled
    Returns issues with id, identifier (e.g. ENG-123), title, state, assignee, team, project, url.
    """
    variables: dict[str, Any] = {"first": min(first, 100)}
    if after:
        variables["after"] = after
    f = _build_issue_filter(
        team_id=team_id,
        project_id=project_id,
        state_type=state_type,
        assignee_id=assignee_id,
    )
    if f:
        variables["filter"] = f
    out = await _graphql(QUERY_ISSUES, variables)
    if out.get("error"):
        return {"error": out["error"], "issues": [], "pageInfo": None}
    data = out.get("data") or {}
    issues_data = data.get("issues") or {}
    nodes = issues_data.get("nodes") or []
    page_info = issues_data.get("pageInfo")
    return {
        "error": None,
        "issues": nodes,
        "pageInfo": page_info,
    }


@mcp.tool()
async def linear_get_issue(issue_id: str) -> dict:
    """
    Get a single Linear issue by id (UUID) or by identifier (e.g. ENG-123).
    Linear API accepts both in the issue(id) query.
    """
    id_val = issue_id.strip()
    out = await _graphql(QUERY_ISSUE_BY_ID, {"id": id_val})
    if out.get("error"):
        return {"error": out["error"], "issue": None}
    issue = (out.get("data") or {}).get("issue")
    return {"error": None, "issue": issue}


@mcp.tool()
async def linear_list_workflow_states(team_id: str) -> dict:
    """
    List workflow states for a team (e.g. Backlog, Todo, In Progress, Done).
    Returns id, name, type (backlog | unstarted | started | completed | canceled).
    Use the state id when updating an issue with linear_update_issue(state_id=...).
    """
    out = await _graphql(QUERY_TEAM_WORKFLOW_STATES, {"teamId": team_id})
    if out.get("error"):
        return {"error": out["error"], "states": []}
    team = (out.get("data") or {}).get("team")
    if not team:
        return {"error": "team not found", "states": []}
    nodes = (team.get("workflowStates") or {}).get("nodes") or []
    return {"error": None, "states": nodes}


@mcp.tool()
async def linear_set_issue_completed(issue_id: str) -> dict:
    """
    Set a Linear issue to completed (Done). Use after marking a task done in Dex
    when the task is linked to this Linear issue (see 03-Tasks/linear_sync.json).
    issue_id: Linear issue UUID or identifier (e.g. INA-5).
    """
    out = await _graphql(QUERY_ISSUE_BY_ID, {"id": issue_id.strip()})
    if out.get("error"):
        return {"error": out["error"], "issue": None}
    issue = (out.get("data") or {}).get("issue")
    if not issue:
        return {"error": "issue not found", "issue": None}
    team = issue.get("team")
    if not team:
        return {"error": "issue has no team", "issue": None}
    team_id = team["id"]
    out_s = await _graphql(QUERY_TEAM_WORKFLOW_STATES, {"teamId": team_id})
    if out_s.get("error"):
        return {"error": out_s["error"], "issue": None}
    team_data = (out_s.get("data") or {}).get("team")
    states = (team_data.get("workflowStates") or {}).get("nodes") or []
    completed_state = next((s for s in states if (s.get("type") or "").lower() == "completed"), None)
    if not completed_state:
        return {"error": "no 'completed' workflow state in team", "issue": None}
    return await linear_update_issue(
        issue_id=issue["id"],
        state_id=completed_state["id"],
    )


@mcp.tool()
async def linear_create_issue(
    team_id: str,
    title: str,
    description: Optional[str] = None,
    state_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    project_id: Optional[str] = None,
    priority: Optional[int] = None,
) -> dict:
    """
    Create a new Linear issue.
    team_id: required (UUID of the team).
    title: required.
    description, state_id, assignee_id, project_id, priority: optional.
    priority: 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low.
    """
    inp: dict[str, Any] = {"teamId": team_id, "title": title}
    if description is not None:
        inp["description"] = description
    if state_id:
        inp["stateId"] = state_id
    if assignee_id:
        inp["assigneeId"] = assignee_id
    if project_id:
        inp["projectId"] = project_id
    if priority is not None:
        inp["priority"] = int(priority)
    out = await _graphql(MUTATION_CREATE_ISSUE, {"input": inp})
    if out.get("error"):
        return {"error": out["error"], "issue": None}
    data = out.get("data") or {}
    result = data.get("issueCreate") or {}
    if not result.get("success"):
        return {"error": "issueCreate returned success: false", "issue": None}
    return {"error": None, "issue": result.get("issue")}


@mcp.tool()
async def linear_create_my_issue(
    title: str,
    description: Optional[str] = None,
    priority: Optional[int] = None,
    project_id: Optional[str] = None,
) -> dict:
    """
    Создать задачу в личном workspace: автоматически выбирается единственная команда и назначается на тебя.
    Для личного task management достаточно title; description, priority и project_id опциональны.
    priority: 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low.
    project_id: UUID проекта (из linear_create_project / linear_list_projects) — задача попадёт в этот проект.
    """
    out_v = await _graphql(QUERY_VIEWER)
    if out_v.get("error"):
        return {"error": out_v["error"], "issue": None}
    viewer = (out_v.get("data") or {}).get("viewer")
    if not viewer:
        return {"error": "viewer not found", "issue": None}
    out_t = await _graphql(QUERY_TEAMS)
    if out_t.get("error"):
        return {"error": out_t["error"], "issue": None}
    teams = (out_t.get("data") or {}).get("teams", {}).get("nodes") or []
    if not teams:
        return {"error": "No teams in workspace (create a team in Linear first)", "issue": None}
    team_id = teams[0]["id"]
    return await linear_create_issue(
        team_id=team_id,
        title=title,
        description=description,
        assignee_id=viewer["id"],
        priority=priority,
        project_id=project_id,
    )


@mcp.tool()
async def linear_update_issue(
    issue_id: str,
    title: Optional[str] = None,
    state_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    description: Optional[str] = None,
    project_id: Optional[str] = None,
) -> dict:
    """
    Update an existing Linear issue by id (UUID).
    Pass only the fields you want to change: title, state_id, assignee_id, description, project_id.
    """
    inp: dict[str, Any] = {}
    if title is not None:
        inp["title"] = title
    if state_id is not None:
        inp["stateId"] = state_id
    if assignee_id is not None:
        inp["assigneeId"] = assignee_id
    if description is not None:
        inp["description"] = description
    if project_id is not None:
        inp["projectId"] = project_id
    if not inp:
        return {"error": "No fields to update", "issue": None}
    out = await _graphql(MUTATION_UPDATE_ISSUE, {"id": issue_id, "input": inp})
    if out.get("error"):
        return {"error": out["error"], "issue": None}
    data = out.get("data") or {}
    result = data.get("issueUpdate") or {}
    if not result.get("success"):
        return {"error": "issueUpdate returned success: false", "issue": None}
    return {"error": None, "issue": result.get("issue")}


if __name__ == "__main__":
    mcp.run()
