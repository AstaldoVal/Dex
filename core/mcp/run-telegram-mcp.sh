#!/usr/bin/env bash
# Launch Telegram MCP with Telethon + mcp + python-dotenv (uv), no global pip required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
export VAULT_PATH="${VAULT_PATH:-$ROOT}"
if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found; install: https://docs.astral.sh/uv/" >&2
  exit 1
fi
exec uv run --with mcp --with telethon --with python-dotenv python "$ROOT/core/mcp/telegram_server.py"
