---
name: mcp-health-check-custom
description: Verify stdio MCP servers, apply known fixes. Runs at chat start.
---

# MCP Health Check

**When to use:** At the start of each new chat (Cursor), or when MCP tool connections appear broken. Run `/mcp-health-check-custom` to verify **local** MCP integrations from Cursor's MCP config (stdio transport; the script skips remote URL servers) and fix known failures.

## Workflow

1. **Run health check script** from repo root:
   ```bash
   node .claude/skills/mcp-health-check-custom/scripts/mcp-health-check.cjs
   ```
   For the **agent** (internal): exit code 0 means every **stdio** MCP entry the script tests passed; 1 means at least one failure. Script prints JSON to stdout. For **Roman in chat**, do not say «stdio» or exit codes first; say in plain Russian whether **local tool connections to Cursor** are OK and what that means (see «User-visible report» below).

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

### User-visible report (chat to Roman)

- **Success (canonical, prefer verbatim):** «Все подключения MCP инструментов в порядке. В данном чате можно ими пользоваться.»
- **Do not** append one long parenthesis to those two sentences mixing «stdio», «проверка из корня репозитория», and URL-only entries — that puts internal report jargon back into the same breath as the human outcome. If Roman should know URL-only servers (e.g. Atlassian) were not exercised: **separate** short plain-Russian sentence **without** «stdio», e.g. «Записи Atlassian в конфиге только по URL, этот скрипт их не проверяет, так задумано.»
- **Single failure (canonical template):** «Не поднимается подключение к … (имя из списка) MCP, в настройках Tools and MCP посмотри статус / перезапусти Cursor» — подставь точное имя из списка вместо многоточия; при нескольких сбоях можно повторить шаблон по одному имени за раз или одной фразой перечислить имена, затем одна рекомендация про Tools and MCP / перезапуск Cursor.
- **Do not** start the user message with `exit 0`, raw exit codes, `128 + N`, jargon like «stdio MCP», or similar. Those belong in logs or after the human summary if Roman asks for debug detail.
- Optional follow-up (plain Russian, no «stdio»): MCP entries that exist only as URLs in config were not exercised by this script (auth in Cursor); say so only if it matters to Roman’s expectations.

## Important

- **Self-healing:** Do not stop at first error. Apply fixes, re-run, iterate until success or no known fix.
- **Cursor restart:** After fixing `mcp.json.source`, user may need to fully restart Cursor for MCP changes to load.
- **Remote MCPs:** URL-based servers (Notion, Atlassian) are not tested by the script; they require auth and network.
