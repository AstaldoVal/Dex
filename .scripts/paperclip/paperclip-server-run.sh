#!/usr/bin/env bash
# Foreground Paperclip server for launchd (KeepAlive). Do not nohup — launchd owns the process.
set -euo pipefail

INSTANCE_DIR="${PAPERCLIP_INSTANCE_DIR:-$HOME/.paperclip/instances/default}"
PORT="${PORT:-3100}"

if [[ -f "$INSTANCE_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INSTANCE_DIR/.env"
  set +a
fi

# Subscription Cursor (no API billing leak into agent runs).
unset CURSOR_API_KEY
export CURSOR_API_KEY=""

export HEARTBEAT_SCHEDULER_ENABLED="${HEARTBEAT_SCHEDULER_ENABLED:-true}"

VAULT_PATH="${VAULT_PATH:-$HOME/Development/DEX}"
if [[ -f "$VAULT_PATH/.scripts/paperclip/ensure-cursor-cli-config.cjs" ]]; then
  node "$VAULT_PATH/.scripts/paperclip/ensure-cursor-cli-config.cjs" || {
    echo "cursor cli-config bootstrap failed — heartbeats would hit ENOENT (HIR-278). Fix: npm run paperclip:ensure-cursor-cli-config" >&2
    exit 1
  }
fi

PAPERCLIP_DEV_ROOT="${PAPERCLIP_DEV_ROOT:-$HOME/Development/paperclip}"
export PAPERCLIP_CONFIG="${PAPERCLIP_CONFIG:-$INSTANCE_DIR/config.json}"
export PAPERCLIP_INSTANCE_ID="${PAPERCLIP_INSTANCE_ID:-default}"

# Dev monorepo: plugin API + latest UI (vite dev middleware). Global npm 0.3.1 server lacks /api/plugins/*.
DEV_PLUGINS_ROUTE="$PAPERCLIP_DEV_ROOT/server/src/routes/plugins.ts"
DEV_CLI_DIR="$PAPERCLIP_DEV_ROOT/cli"
PNPM_BIN="$(command -v pnpm || true)"
if [[ -f "$DEV_PLUGINS_ROUTE" && -d "$DEV_CLI_DIR" && -n "$PNPM_BIN" ]]; then
  cd "$DEV_CLI_DIR"
  exec "$PNPM_BIN" exec tsx src/index.ts run -c "$PAPERCLIP_CONFIG" --no-repair
fi

PAPERCLIPAI="${PAPERCLIPAI_BIN:-$(command -v paperclipai || true)}"
DEV_CLI="$PAPERCLIP_DEV_ROOT/cli/dist/index.js"
if [[ -f "$DEV_CLI" ]] && node "$DEV_CLI" --version >/dev/null 2>&1; then
  PAPERCLIPAI="$DEV_CLI"
fi

# Fallback: serve UI from dev checkout into global npm ui-dist (Nest, nesting).
if [[ -n "${VAULT_PATH:-}" && -f "$VAULT_PATH/.scripts/paperclip/sync-paperclip-ui-to-runtime.cjs" ]]; then
  node "$VAULT_PATH/.scripts/paperclip/sync-paperclip-ui-to-runtime.cjs" || {
    echo "paperclip UI sync failed (non-fatal if global UI already ok)" >&2
  }
fi

if [[ -z "$PAPERCLIPAI" ]]; then
  echo "paperclipai not found in PATH" >&2
  exit 127
fi

if ! "$PAPERCLIPAI" --version >/dev/null 2>&1; then
  echo "paperclipai failed preflight (--version). Common fix: cd ~/Development/paperclip && pnpm install && launchctl kickstart -k gui/\$(id -u)/com.dex.paperclip-server" >&2
  "$PAPERCLIPAI" --version 2>&1 || true
  exit 1
fi

exec "$PAPERCLIPAI" run
