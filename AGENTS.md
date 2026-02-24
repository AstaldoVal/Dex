# Dex - Personal Knowledge System

See `CLAUDE.md` for the full system guide, user profile, skills, and core behaviors.

## Cursor Cloud specific instructions

**What this is:** Dex is a personal knowledge management (PKM) system built as a Markdown vault + Python MCP servers + Node.js automation scripts. There is no traditional web server or UI -- MCP servers communicate via JSON-RPC over stdio and are launched on-demand by the IDE.

### Running MCP servers

- All MCP servers are in `core/mcp/*_server.py` and require `VAULT_PATH` env var set to the repo root.
- Start any server: `VAULT_PATH=/workspace python3 core/mcp/<server>.py`
- Servers use stdio transport (JSON-RPC 2.0). They block waiting for input and exit on EOF.
- Core servers (work, onboarding, career, resume, beta, dex_improvements) only need `core/mcp/requirements.txt` deps.
- Optional servers (gmail, google_calendar, google_drive, linkedin, job_digest, ai_updates) have their own `requirements-*.txt` and need external credentials/OAuth.

### Lint / Validation

- No ESLint or TypeScript config. No formal test suite.
- `bash scripts/verify-distribution.sh` is the repo's safety check (API key leaks, gitignore compliance, template integrity). Warnings about tracked user-data folders are expected in dev.
- Python syntax: `python3 -c "import ast; ast.parse(open('file.py').read())"` for quick checks.
- Node syntax: `node -c file.cjs`

### Key gotchas

- Python packages install to `~/.local` (user mode). The `mcp` CLI is at `~/.local/bin/mcp`.
- `.mcp.json` is gitignored and must be generated from `System/.mcp.json.example` with `{{VAULT_PATH}}` replaced. The `install.sh` script does this.
- The `install.sh` script has interactive prompts (`read -r`) -- do not run it non-interactively in Cloud Agent. Instead, run `npm install` and `pip3 install -r core/mcp/requirements.txt` directly.
- MCP server test pattern: pipe JSON-RPC init + tool call to stdin, read JSON-RPC response from stdout. Stderr has logs.
