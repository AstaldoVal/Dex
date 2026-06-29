#!/usr/bin/env bash
# Ensure Paperclip runs via launchd (dev monorepo + synced Dex UI). Do NOT start global `paperclipai run`.
set -euo pipefail

PORT="${PORT:-3100}"
PLIST_LABEL="com.dex.paperclip-server"
LAUNCHD_UID="$(id -u)"

if curl -sf --connect-timeout 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null \
  && curl -sf --connect-timeout 2 "http://127.0.0.1:${PORT}/api/plugins/ui-contributions" >/dev/null; then
  echo "Paperclip already healthy on :${PORT} (launchd dev server)"
  exit 0
fi

echo "Starting Paperclip via launchd (not global paperclipai)…" >&2
launchctl kickstart -k "gui/${LAUNCHD_UID}/${PLIST_LABEL}" 2>/dev/null \
  || launchctl bootstrap "gui/${LAUNCHD_UID}" "$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist" 2>/dev/null \
  || true

for i in $(seq 1 30); do
  if curl -sf --connect-timeout 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null \
    && curl -sf --connect-timeout 2 "http://127.0.0.1:${PORT}/api/plugins/ui-contributions" >/dev/null; then
    echo "Paperclip ready on http://127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "Paperclip did not become healthy on :${PORT}. Run: npm run paperclip:server-launchd:install" >&2
exit 1
