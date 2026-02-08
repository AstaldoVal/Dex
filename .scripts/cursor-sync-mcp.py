#!/usr/bin/env python3
"""
Sync Dex MCP config to Cursor's global config so MCPs load in every chat.

Cursor does not reliably load project-level .cursor/mcp.json (known bug).
This script copies the config to ~/.cursor/mcp.json with absolute paths.
Run from the Dex repo root: python3 .scripts/cursor-sync-mcp.py
"""
from pathlib import Path
import json
import os

def main():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    cursor_dir = repo_root / ".cursor"
    # Prefer .cursor/mcp.json.source so project .cursor/mcp.json can stay empty (avoids duplicate MCPs in Cursor UI)
    project_mcp = cursor_dir / "mcp.json.source"
    if not project_mcp.exists():
        project_mcp = cursor_dir / "mcp.json"
    if not project_mcp.exists():
        print(f"Error: {cursor_dir / 'mcp.json.source'} or {cursor_dir / 'mcp.json'} not found. Run from Dex repo root.")
        return 1

    with open(project_mcp, encoding="utf-8") as f:
        config = json.load(f)

    # Replace ${workspaceFolder} with absolute repo path
    workspace = str(repo_root)
    config_str = json.dumps(config, indent=2)
    config_str = config_str.replace("${workspaceFolder}", workspace)

    global_config = json.loads(config_str)
    cursor_home = Path.home() / ".cursor"
    cursor_home.mkdir(parents=True, exist_ok=True)
    global_path = cursor_home / "mcp.json"

    with open(global_path, "w", encoding="utf-8") as f:
        json.dump(global_config, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(global_config.get('mcpServers', {}))} MCP servers to {global_path}")
    print("Restart Cursor (full quit and reopen) so it picks up the config.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
