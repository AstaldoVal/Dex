#!/usr/bin/env bash
# One-time login for a Telethon session used only by job-search Telegram flows (morning digest, dump, scan).
# Same API id/hash as MCP; different SQLite file → no "database is locked" vs Cursor Telegram MCP.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT}"

# shellcheck source=telegram-recruiting-session-from-dotenv.sh
source "${SCRIPT_DIR}/telegram-recruiting-session-from-dotenv.sh"
telegram_recruiting_apply_dotenv "${ROOT}"

VAULT="${VAULT_PATH:-$ROOT}"
DEFAULT="${VAULT}/.claude/telegram/telegram_recruiting"
export TELEGRAM_SESSION_PATH="${TELEGRAM_RECRUITING_SESSION_PATH:-$DEFAULT}"

echo "Logging in; session will be saved as: ${TELEGRAM_SESSION_PATH}.session" >&2
exec uv run python core/mcp/telegram_login.py
