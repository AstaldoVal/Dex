#!/usr/bin/env python3
"""
Confluence Multi-Site MCP Server for Dex

Supports multiple Confluence Cloud sites in parallel. Each connection has its own
credentials (email + API token). One authorization does not block another.

Config: System/confluence_connections.yaml lists connection id and site subdomain.
Credentials: CONFLUENCE_{ID}_EMAIL and CONFLUENCE_{ID}_TOKEN in .env (id uppercase).

Tools:
- confluence_list_connections: List configured connections and credential status
- confluence_get_spaces: Get spaces for a given connection
- confluence_get_page: Get a page by ID for a given connection
- confluence_get_pages_in_space: List pages in a space for a given connection
"""

import os
import sys
import json
import base64
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    import yaml
except ImportError:
    yaml = None

try:
    import requests
except ImportError:
    requests = None

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

_repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_repo_root))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(os.environ.get("VAULT_PATH", Path.cwd()))
CONNECTIONS_FILE = BASE_DIR / "System" / "confluence_connections.yaml"


def _load_dotenv() -> None:
    """Load .env from vault so CONFLUENCE_* vars are available."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    try:
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key.startswith("CONFLUENCE_"):
                value = value.strip().strip('"').strip("'")
                if key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        logger.debug("Could not load .env: %s", e)


_load_dotenv()

app = Server("dex-confluence-multi")


def load_connections() -> List[Dict[str, str]]:
    """Load connection list from YAML; credentials from env."""
    connections = []
    if yaml is None:
        logger.warning("PyYAML not installed; cannot load confluence_connections.yaml")
        return connections

    if not CONNECTIONS_FILE.exists():
        # Fallback: discover from env CONFLUENCE_*_SITE
        for key, value in os.environ.items():
            if key.startswith("CONFLUENCE_") and key.endswith("_SITE") and value:
                part = key[:-5]  # strip _SITE
                id_part = part.replace("CONFLUENCE_", "", 1)
                conn_id = id_part.lower()
                connections.append({"id": conn_id, "site": value.strip()})
        return connections

    try:
        data = yaml.safe_load(CONNECTIONS_FILE.read_text())
        raw = data.get("connections") or data.get("connection_ids") or []
        for item in raw:
            if isinstance(item, dict):
                connections.append({"id": item["id"], "site": item["site"]})
            elif isinstance(item, str):
                # legacy: just id, site from env CONFLUENCE_{ID}_SITE
                site = os.environ.get(f"CONFLUENCE_{item.upper()}_SITE", "")
                if site:
                    connections.append({"id": item, "site": site})
    except Exception as e:
        logger.error("Error loading confluence_connections.yaml: %s", e)
    return connections


def get_connection_credentials(conn_id: str) -> Optional[tuple]:
    """Return (email, api_token) for connection id, or None if missing."""
    key = conn_id.upper().replace("-", "_")
    email = os.environ.get(f"CONFLUENCE_{key}_EMAIL", "").strip()
    token = os.environ.get(f"CONFLUENCE_{key}_TOKEN", "").strip()
    if email and token:
        return (email, token)
    return None


def make_base_url(site: str) -> str:
    """Build Confluence API base URL from site subdomain."""
    s = site.strip().lower()
    if ".atlassian.net" in s:
        return f"https://{s}/wiki/api/v2"
    return f"https://{s}.atlassian.net/wiki/api/v2"


def confluence_request(
    connection_id: str, path: str, method: str = "GET", params: Optional[Dict] = None
) -> Dict[str, Any]:
    """Perform Confluence REST API v2 request for a given connection."""
    if requests is None:
        return {"error": "requests not installed. pip install requests"}

    connections = {c["id"]: c for c in load_connections()}
    if connection_id not in connections:
        return {"error": f"Unknown connection: {connection_id}. Available: {list(connections.keys())}"}

    creds = get_connection_credentials(connection_id)
    if not creds:
        return {"error": f"Missing credentials for {connection_id}. Set CONFLUENCE_{connection_id.upper()}_EMAIL and CONFLUENCE_{connection_id.upper()}_TOKEN in .env"}

    email, api_token = creds
    conn = connections[connection_id]
    base_url = make_base_url(conn["site"])
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    auth_str = base64.b64encode(f"{email}:{api_token}".encode()).decode()

    try:
        resp = requests.request(
            method,
            url,
            params=params,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Basic {auth_str}",
            },
            timeout=30,
        )
        if resp.status_code == 401:
            body = (resp.text or "").strip()[:300]
            return {"error": f"Unauthorized for {connection_id}. Check email and API token.", "detail": body}
        if resp.status_code == 403:
            return {"error": f"Forbidden for {connection_id}. Check site access."}
        if resp.status_code >= 400:
            return {"error": f"HTTP {resp.status_code}: {resp.text[:500]}"}
        return resp.json()
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="confluence_list_connections",
            description="List configured Confluence connections (sites). Each connection has its own credentials; one does not block another.",
            inputSchema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        ),
        types.Tool(
            name="confluence_get_spaces",
            description="Get Confluence spaces for a given connection. Use connection_id from confluence_list_connections.",
            inputSchema={
                "type": "object",
                "properties": {
                    "connection_id": {"type": "string", "description": "Connection id (e.g. mindera, connellsgroup)"},
                    "limit": {"type": "integer", "description": "Max results (default 25)", "default": 25},
                    "type": {"type": "string", "enum": ["global", "personal"], "description": "Filter by space type"},
                    "status": {"type": "string", "enum": ["current", "archived"], "description": "Filter by status"},
                },
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        ),
        types.Tool(
            name="confluence_get_page",
            description="Get a Confluence page by ID for a given connection.",
            inputSchema={
                "type": "object",
                "properties": {
                    "connection_id": {"type": "string", "description": "Connection id"},
                    "page_id": {"type": "string", "description": "Page ID (numeric string)"},
                },
                "required": ["connection_id", "page_id"],
                "additionalProperties": False,
            },
        ),
        types.Tool(
            name="confluence_get_pages_in_space",
            description="List pages in a Confluence space for a given connection.",
            inputSchema={
                "type": "object",
                "properties": {
                    "connection_id": {"type": "string", "description": "Connection id"},
                    "space_id": {"type": "string", "description": "Space ID (numeric string)"},
                    "limit": {"type": "integer", "description": "Max results (default 25)", "default": 25},
                },
                "required": ["connection_id", "space_id"],
                "additionalProperties": False,
            },
        ),
    ]


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    args = arguments or {}
    if name == "confluence_list_connections":
        conns = load_connections()
        result = []
        for c in conns:
            creds = get_connection_credentials(c["id"])
            result.append({
                "id": c["id"],
                "site": c["site"],
                "url": make_base_url(c["site"]).replace("/wiki/api/v2", ""),
                "has_credentials": creds is not None,
            })
        return [types.TextContent(type="text", text=json.dumps(result, indent=2))]

    if name == "confluence_get_spaces":
        cid = args.get("connection_id") or ""
        limit = args.get("limit", 25)
        type_filter = args.get("type")
        status_filter = args.get("status")
        params = {"limit": limit}
        if type_filter:
            params["type"] = type_filter
        if status_filter:
            params["status"] = status_filter
        data = confluence_request(cid, "spaces", params=params)
        return [types.TextContent(type="text", text=json.dumps(data, indent=2))]

    if name == "confluence_get_page":
        cid = args.get("connection_id") or ""
        page_id = args.get("page_id") or ""
        data = confluence_request(cid, f"pages/{page_id}")
        return [types.TextContent(type="text", text=json.dumps(data, indent=2))]

    if name == "confluence_get_pages_in_space":
        cid = args.get("connection_id") or ""
        space_id = args.get("space_id") or ""
        limit = args.get("limit", 25)
        data = confluence_request(
            cid, f"spaces/{space_id}/pages", params={"limit": limit}
        )
        return [types.TextContent(type="text", text=json.dumps(data, indent=2))]

    return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


async def _main():
    logger.info("Starting Dex Confluence Multi-Site MCP Server")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="dex-confluence-multi",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    import asyncio
    asyncio.run(_main())


if __name__ == "__main__":
    main()
