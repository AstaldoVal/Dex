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
import shutil


def load_env_file(path: Path) -> dict:
    """Parse KEY=VALUE lines from a dotenv-style file (no export prefix)."""
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value:
            out[key] = value
    return out


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

    # Replace ${workspaceFolder} and {{VAULT_PATH}} with absolute repo path
    workspace = str(repo_root)
    config_str = json.dumps(config, indent=2)
    config_str = config_str.replace("${workspaceFolder}", workspace)
    config_str = config_str.replace("{{VAULT_PATH}}", workspace)

    global_config = json.loads(config_str)
    servers = global_config.get("mcpServers", {})

    # Ensure all servers are enabled (Cursor may show them as disabled otherwise)
    for name, s in servers.items():
        if isinstance(s, dict):
            s["disabled"] = False

    # Inject secrets from .env into MCP servers
    env_file = repo_root / ".env"
    env_vars = {}
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if value:
                env_vars[key] = value

        # Telegram
        if "user-telegram" in servers and isinstance(servers["user-telegram"], dict):
            env = servers["user-telegram"].setdefault("env", {})
            for k in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH"):
                if k in env_vars:
                    env[k] = env_vars[k]

        # Google Slides (matteoantoci MCP expects GOOGLE_CLIENT_ID, etc.)
        if "google-slides-mcp" in servers and isinstance(servers["google-slides-mcp"], dict):
            env = servers["google-slides-mcp"].setdefault("env", {})
            mapping = {
                "GOOGLE_SLIDES_CLIENT_ID": "GOOGLE_CLIENT_ID",
                "GOOGLE_SLIDES_CLIENT_SECRET": "GOOGLE_CLIENT_SECRET",
                "GOOGLE_SLIDES_REFRESH_TOKEN": "GOOGLE_REFRESH_TOKEN",
            }
            for env_key, mcp_key in mapping.items():
                if env_key in env_vars:
                    env[mcp_key] = env_vars[env_key]

        # Tavily (free tier API key from app.tavily.com)
        if "tavily-mcp" in servers and isinstance(servers["tavily-mcp"], dict):
            env = servers["tavily-mcp"].setdefault("env", {})
            if "TAVILY_API_KEY" in env_vars:
                env["TAVILY_API_KEY"] = env_vars["TAVILY_API_KEY"]

        # Brave Search API (https://brave.com/search/api/)
        if "brave-search-mcp" in servers and isinstance(servers["brave-search-mcp"], dict):
            env = servers["brave-search-mcp"].setdefault("env", {})
            if "BRAVE_API_KEY" in env_vars:
                env["BRAVE_API_KEY"] = env_vars["BRAVE_API_KEY"]

        # Exa (academic / semantic web search MCP — https://exa.ai/docs/reference/exa-mcp)
        if "exa-mcp" in servers and isinstance(servers["exa-mcp"], dict):
            env = servers["exa-mcp"].setdefault("env", {})
            if "EXA_API_KEY" in env_vars:
                env["EXA_API_KEY"] = env_vars["EXA_API_KEY"]

    # LangSmith (Applicator genufit-staging, EU) — keys stay in Credentials/, not .env
    langsmith_env_path = repo_root / "Credentials/applicator-staging/langsmith-staging.env"
    langsmith_vars = load_env_file(langsmith_env_path)
    if "langsmith-mcp" in servers and isinstance(servers["langsmith-mcp"], dict):
        env = servers["langsmith-mcp"].setdefault("env", {})
        for k in ("LANGSMITH_API_KEY", "LANGSMITH_ENDPOINT", "LANGSMITH_PROJECT", "LANGSMITH_WORKSPACE_ID"):
            if k in langsmith_vars:
                env[k] = langsmith_vars[k]

    if "tavily-mcp" in servers and isinstance(servers["tavily-mcp"], dict):
        tav_env = servers["tavily-mcp"].get("env") or {}
        if not (tav_env.get("TAVILY_API_KEY") or "").strip():
            servers["tavily-mcp"]["disabled"] = True

    if "brave-search-mcp" in servers and isinstance(servers["brave-search-mcp"], dict):
        br_env = servers["brave-search-mcp"].get("env") or {}
        if not (br_env.get("BRAVE_API_KEY") or "").strip():
            servers["brave-search-mcp"]["disabled"] = True

    if "exa-mcp" in servers and isinstance(servers["exa-mcp"], dict):
        ex_env = servers["exa-mcp"].get("env") or {}
        if not (ex_env.get("EXA_API_KEY") or "").strip():
            servers["exa-mcp"]["disabled"] = True

    if "langsmith-mcp" in servers and isinstance(servers["langsmith-mcp"], dict):
        ls_env = servers["langsmith-mcp"].get("env") or {}
        if not (ls_env.get("LANGSMITH_API_KEY") or "").strip():
            servers["langsmith-mcp"]["disabled"] = True

    # Cursor often starts with a minimal PATH (no Homebrew), so bare "npx" / "uvx" / "node" are not found
    # and MCPs show red in the UI while the same config works in a full shell (e.g. mcp-health-check.cjs).
    path_hints = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    enriched_path = path_hints + ":" + os.environ.get("PATH", "")
    for _name, s in servers.items():
        if not isinstance(s, dict):
            continue
        orig = s.get("command")
        if not isinstance(orig, str) or orig not in ("npx", "uvx", "node"):
            continue
        resolved = shutil.which(orig, path=enriched_path)
        if resolved:
            s["command"] = resolved
        if orig in ("npx", "uvx"):
            env = s.setdefault("env", {})
            if "PATH" not in env:
                env["PATH"] = enriched_path

    cursor_home = Path.home() / ".cursor"
    cursor_home.mkdir(parents=True, exist_ok=True)
    global_path = cursor_home / "mcp.json"

    with open(global_path, "w", encoding="utf-8") as f:
        json.dump(global_config, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(servers)} MCP servers to {global_path}")
    print("Restart Cursor (full quit and reopen) so it picks up the config.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
