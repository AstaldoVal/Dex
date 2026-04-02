# Known MCP Fixes

When MCP health check fails for a server, match by server name and error pattern, then apply the fix.

---

## mac-messages-mcp

**Error patterns:** `unexpected keyword argument 'description'`, `FastMCP`, `TypeError: FastMCP.__init__`

**Cause:** PyPI `mac-messages-mcp` uses old FastMCP API. The `description` argument was removed in newer FastMCP.

**Fix:**
1. In `.cursor/mcp.json.source`, ensure `mac-messages-mcp` args use the git commit:
   ```json
   "args": [
     "--from",
     "mac-messages-mcp @ git+https://github.com/carterlasalle/mac_messages_mcp.git@dc0452a47e7178bcb579db04b4470b2361d39d91",
     "mac-messages-mcp"
   ]
   ```
2. Run `python3 .scripts/cursor-sync-mcp.py` from repo root.
3. Full Cursor restart may be needed for MCP changes to apply.

---

## google-slides-mcp

**Error patterns:** `Cannot read properties of undefined (reading 'prototype')`, `buffer-equal-constant-time`, `jwa`

**Cause:** Node.js v25+ removed `SlowBuffer`; older `jwa` uses it. Override `jwa` to 2.0.1 which uses `crypto.timingSafeEqual`.

**Fix:**
1. In `.claude/mcp-servers/google-slides-mcp/package.json`, add under `"overrides"`:
   ```json
   "overrides": {
     "jwa": "^2.0.1"
   }
   ```
2. From `.claude/mcp-servers/google-slides-mcp/`: `rm -rf node_modules package-lock.json && npm install`
3. If the server uses env vars (GOOGLE_CLIENT_ID, etc.), ensure they are in `.env` and cursor-sync-mcp injects them. Missing env causes different errors (OAuth/credentials).

---

## Python MCPs (work-mcp, calendar-mcp, etc.)

**Error patterns:** `ModuleNotFoundError`, `No module named`, `Python`

**Cause:** Missing Python dependencies or wrong Python path.

**Fix:**
1. From repo root: `pip install -r requirements.txt` or `uv sync` if using uv.
2. Ensure `python3` resolves to Python 3.10+.
3. For Dex core MCPs: dependencies are in repo root `requirements.txt`.

---

## Generic

**If no known fix matches:**
- Capture the full error from health check output.
- Search `.claude/reference/mcp-servers.md` and `.claude/mcp/*.json` for setup notes.
- Suggest user run the MCP manually (e.g. `uvx mac-messages-mcp`) to see full stack trace.
- Add new fix to this file after resolving.
