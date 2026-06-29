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

# If dev server is already up with plugin API, attach to it so launchd KeepAlive tracks uptime.
if curl -sf --connect-timeout 2 "http://127.0.0.1:${PORT}/api/plugins/ui-contributions" >/dev/null 2>&1; then
  listener_pid="$(lsof -i ":${PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  if [[ -n "$listener_pid" ]] && kill -0 "$listener_pid" 2>/dev/null; then
    echo "Paperclip already healthy on :${PORT} (pid ${listener_pid}); launchd waiting on listener." >&2
    while kill -0 "$listener_pid" 2>/dev/null; do sleep 30; done
    exit 1
  fi
fi

# Prevent launchd / agent scripts from starting multiple overlapping servers (port kill spiral).
START_LOCK_DIR="${INSTANCE_DIR}/.paperclip-server-start.lockdir"
if [[ -d "$START_LOCK_DIR" ]]; then
  lock_pid="$(cat "$START_LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
    echo "Paperclip server start already in progress (pid ${lock_pid}); skipping duplicate spawn." >&2
    exit 0
  fi
  rm -rf "$START_LOCK_DIR"
fi
mkdir "$START_LOCK_DIR"
echo $$ > "$START_LOCK_DIR/pid"
cleanup_start_lock() {
  rm -rf "$START_LOCK_DIR" 2>/dev/null || true
}
trap cleanup_start_lock EXIT

# Free :PORT before bind — launchd owns one dev server (synced Dex UI + plugin API).
free_paperclip_port() {
  local port="${PORT:-3100}"
  if ! lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  fi
  local listeners
  listeners="$(lsof -i ":${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "$listeners" ]]; then
    return 0
  fi
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    local cmdline
    cmdline="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    if [[ "$cmdline" == *"tsx"* && "$cmdline" == *"index.ts run"* ]] \
      || [[ "$cmdline" == *"paperclipai"* ]]; then
      echo "Stopping stale Paperclip on :${port} (pid ${pid})…" >&2
      kill "$pid" 2>/dev/null || true
    fi
  done <<< "$listeners"
  sleep 2
}
free_paperclip_port

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
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm || true)}"
if [[ -n "$PNPM_BIN" && ! -x "$PNPM_BIN" ]]; then
  PNPM_BIN="$(command -v pnpm || true)"
fi
if [[ -z "$PNPM_BIN" && -x "${HOME}/Library/pnpm/pnpm" ]]; then
  PNPM_BIN="${HOME}/Library/pnpm/pnpm"
fi
if [[ -z "$PNPM_BIN" && -x "${HOME}/.npm-global/bin/pnpm" ]]; then
  PNPM_BIN="${HOME}/.npm-global/bin/pnpm"
fi

# Custom UI (Nest, role badges, board-read) lives in dev checkout — rebuild into server/ui-dist before serve.
if [[ -n "${VAULT_PATH:-}" && -f "$VAULT_PATH/.scripts/paperclip/sync-paperclip-ui-to-runtime.cjs" ]]; then
  node "$VAULT_PATH/.scripts/paperclip/sync-paperclip-ui-to-runtime.cjs" || {
    echo "paperclip UI sync failed — Inbox may show stock UI without Dex customizations" >&2
    exit 1
  }
fi

DEV_MONOREPO_READY=false
if [[ -f "$DEV_PLUGINS_ROUTE" && -d "$DEV_CLI_DIR" && -n "$PNPM_BIN" && -x "$PNPM_BIN" ]]; then
  DEV_MONOREPO_READY=true
  cd "$DEV_CLI_DIR"
  exec "$PNPM_BIN" exec tsx src/index.ts run -c "$PAPERCLIP_CONFIG" --no-repair
fi

if [[ -f "$DEV_PLUGINS_ROUTE" ]]; then
  echo "ERROR: Paperclip dev monorepo required for plugin API (~/Development/paperclip)." >&2
  echo "pnpm missing or cli dir absent — refusing global npm fallback (UI plugin banners would 404)." >&2
  echo "Fix: cd $PAPERCLIP_DEV_ROOT && pnpm install && launchctl kickstart -k gui/\$(id -u)/com.dex.paperclip-server" >&2
  exit 1
fi

PAPERCLIPAI="${PAPERCLIPAI_BIN:-$(command -v paperclipai || true)}"
DEV_CLI="$PAPERCLIP_DEV_ROOT/cli/dist/index.js"
if [[ -f "$DEV_CLI" ]] && node "$DEV_CLI" --version >/dev/null 2>&1; then
  PAPERCLIPAI="$DEV_CLI"
fi

# Fallback global npm path (should not run when dev monorepo exists — kept for legacy only).
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
