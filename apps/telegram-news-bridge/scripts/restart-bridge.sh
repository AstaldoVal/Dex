#!/usr/bin/env bash
# Stop whatever listens on BRIDGE_PORT (from .env), then start telegram-news-bridge.
# Usage:
#   ./scripts/restart-bridge.sh              # foreground (Ctrl+C to stop)
#   ./scripts/restart-bridge.sh --detach     # background, logs → /tmp/telegram-news-bridge.log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Порт: спочатку apps/telegram-news-bridge/.env, інакше корінь репо Dex/.env, інакше env/дефолт.
PORT=""
pick_port_from_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local line
  line="$(grep -E '^[[:space:]]*BRIDGE_PORT=' "$f" 2>/dev/null | tail -1 || true)"
  [[ -z "${line}" ]] && return 0
  PORT="${line#*=}"
  PORT="${PORT//[$'\r']}"
  PORT="${PORT// /}"
}
pick_port_from_file "${ROOT}/.env"
if [[ -z "${PORT}" ]]; then
  pick_port_from_file "${ROOT}/../../.env"
fi
if [[ -z "${PORT}" ]]; then
  PORT="${BRIDGE_PORT:-8765}"
fi

echo "telegram-news-bridge: BRIDGE_PORT=${PORT}"

pids="$(lsof -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${pids}" ]]; then
  echo "Stopping listener(s) on :${PORT}: ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
  sleep 1
  pids2="$(lsof -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids2}" ]]; then
    echo "Force kill: ${pids2}"
    # shellcheck disable=SC2086
    kill -9 ${pids2} 2>/dev/null || true
    sleep 0.5
  fi
fi

if [[ "${1:-}" == "--detach" ]]; then
  nohup uv run python -m telegram_news_bridge >>/tmp/telegram-news-bridge.log 2>&1 &
  echo "Started in background PID=$! (logs: /tmp/telegram-news-bridge.log)"
  exit 0
fi

exec uv run python -m telegram_news_bridge
