---
name: mcp-health-check-custom
description: Verify stdio MCP servers, apply known fixes. Runs at chat start.
---

# MCP Health Check

**When to use:** At the start of each new chat (Cursor), or when MCP servers appear broken. Run `/mcp-health-check-custom` to verify all stdio MCP servers and fix known failures.

## Workflow

1. **Run health check script** from repo root:
   ```bash
   node .claude/skills/mcp-health-check-custom/scripts/mcp-health-check.cjs
   ```
   Exit code 0 = all OK; 1 = at least one failure. Output is JSON to stdout.

2. **Parse output:**
   - `{ "ok": true }` → All servers pass. Report "All MCP servers OK."
   - `{ "ok": false, "results": [...] }` → For each `result` with `ok: false`, extract `name` and `error`.

3. **Apply known fixes** (read `references/known-fixes.md`):
   - For each failed server, match error pattern to known fix.
   - Apply the fix (edit `.cursor/mcp.json.source`, `.claude/mcp-servers/google-slides-mcp/package.json`, etc.).
   - Run `python3 .scripts/cursor-sync-mcp.py` if MCP config changed.
   - Run `npm install` in google-slides-mcp dir if jwa override added/changed.

4. **Re-run health check** to verify. Repeat until all pass or no known fix applies.

5. **Report:**
   - List fixed servers and what was done.
   - For unfixable failures, show error and suggest manual debugging (run MCP manually, check setup docs).

## Important

- **Self-healing:** Do not stop at first error. Apply fixes, re-run, iterate until success or no known fix.
- **Cursor restart:** After fixing `mcp.json.source`, user may need to fully restart Cursor for MCP changes to load.
- **Remote MCPs:** URL-based servers (Notion, Atlassian) are not tested by the script; they require auth and network.
