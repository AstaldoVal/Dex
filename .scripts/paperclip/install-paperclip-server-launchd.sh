#!/usr/bin/env bash
# Install launchd agent: Paperclip UI/API on http://127.0.0.1:3100 (KeepAlive, RunAtLoad).
# From repo root: npm run paperclip:server-launchd:install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNNER="$SCRIPT_DIR/paperclip-server-run.sh"
LOG_DIR="$REPO/.scripts/logs"
LOG_FILE="$LOG_DIR/paperclip-server.log"
PLIST_LABEL="com.dex.paperclip-server"
PLIST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
PORT="${PORT:-3100}"

NODE_PATH="$(dirname "$(command -v node 2>/dev/null || echo /usr/local/bin/node)")"
PAPERCLIPAI="$(command -v paperclipai 2>/dev/null || echo "")"
PNPM_BIN="$(command -v pnpm 2>/dev/null || echo "")"
if [[ -z "$PNPM_BIN" && -x "${HOME}/.npm-global/bin/pnpm" ]]; then
  PNPM_BIN="${HOME}/.npm-global/bin/pnpm"
fi
if [[ -z "$PAPERCLIPAI" ]]; then
  echo "paperclipai not found in PATH. Install: npm i -g paperclipai" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
chmod +x "$RUNNER"

# Hand off port to launchd — stop stale Paperclip (global npm or old dev tsx).
if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    cmdline="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    if [[ "$cmdline" == *"tsx"* && "$cmdline" == *"index.ts run"* ]] \
      || [[ "$cmdline" == *"paperclipai"* ]]; then
      echo "Stopping stale Paperclip on :${PORT} (pid ${pid})…" >&2
      kill "$pid" 2>/dev/null || true
    fi
  done <<< "$(lsof -i ":${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  sleep 2
fi

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${NODE_PATH}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.npm-global/bin:${HOME}/.local/bin:${HOME}/Library/pnpm:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>VAULT_PATH</key>
    <string>${REPO}</string>
    <key>PAPERCLIPAI_BIN</key>
    <string>${PAPERCLIPAI}</string>
    <key>HEARTBEAT_SCHEDULER_ENABLED</key>
    <string>true</string>
    <key>CURSOR_API_KEY</key>
    <string></string>
    <key>PAPERCLIP_DEV_ROOT</key>
    <string>${HOME}/Development/paperclip</string>
$(if [[ -n "$PNPM_BIN" && -x "$PNPM_BIN" ]]; then echo "    <key>PNPM_BIN</key>
    <string>${PNPM_BIN}</string>"; fi)
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
EOF

LAUNCHD_UID="$(id -u)"
launchctl bootout "gui/${LAUNCHD_UID}/${PLIST_LABEL}" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
if launchctl bootstrap "gui/${LAUNCHD_UID}" "$PLIST" 2>/dev/null; then
  :
else
  launchctl load -w "$PLIST"
fi

echo "Paperclip launchd: loaded ${PLIST_LABEL}"
echo "Log: ${LOG_FILE}"
echo "UI:  http://127.0.0.1:${PORT}"

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  root_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "http://127.0.0.1:${PORT}/" 2>/dev/null || echo 0)"
  plugins_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "http://127.0.0.1:${PORT}/api/plugins/ui-contributions" 2>/dev/null || echo 0)"
  if [[ "$root_code" == "200" || "$root_code" == "302" ]] && [[ "$plugins_code" == "200" ]]; then
    echo "Health: HTTP ${root_code}; plugin API: HTTP ${plugins_code}"
    exit 0
  fi
  sleep 2
done

echo "Warning: server not responding yet — check ${LOG_FILE}" >&2
exit 1
