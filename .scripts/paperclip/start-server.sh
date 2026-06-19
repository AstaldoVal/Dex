#!/usr/bin/env bash
# Start local Paperclip server with routine + heartbeat schedulers enabled.
# HEARTBEAT_SCHEDULER_ENABLED=false disables BOTH agent heartbeats AND routine cron triggers.
set -euo pipefail

INSTANCE_DIR="${PAPERCLIP_INSTANCE_DIR:-$HOME/.paperclip/instances/default}"
LOG_FILE="${PAPERCLIP_SERVER_LOG:-/tmp/paperclip-run.log}"
PORT="${PORT:-3100}"

if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Paperclip already listening on :${PORT}" >&2
  exit 0
fi

export HEARTBEAT_SCHEDULER_ENABLED=true

if [[ -f "$INSTANCE_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INSTANCE_DIR/.env"
  set +a
fi

# Re-assert after sourcing instance .env (must not be "false").
export HEARTBEAT_SCHEDULER_ENABLED=true

nohup paperclipai run >>"$LOG_FILE" 2>&1 &
echo "Started paperclipai run (pid $!, log $LOG_FILE, HEARTBEAT_SCHEDULER_ENABLED=true)"
