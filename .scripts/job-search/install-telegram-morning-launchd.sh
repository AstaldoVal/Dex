#!/usr/bin/env bash
# Install macOS launchd job for Telegram morning digest.
# Schedule uses StartInterval; script itself enforces 09:00 Europe/Lisbon once/day.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST_NAME="com.dex.telegram-recruiting-morning.plist"
SRC="${SCRIPT_DIR}/launchd/${PLIST_NAME}.in"
DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing template: ${SRC}" >&2
  exit 1
fi

mkdir -p "${ROOT}/System/logs"
chmod +x "${ROOT}/.scripts/job-search/telegram-morning-digest.sh" 2>/dev/null || true
chmod +x "${ROOT}/.scripts/job-search/telegram-login-recruiting-session.sh" 2>/dev/null || true

sed "s#__REPO_ROOT__#${ROOT}#g" "${SRC}" > "${DST}"
echo "Wrote ${DST}"

launchctl bootout "gui/$(id -u)/${PLIST_NAME%.plist}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DST}" 2>/dev/null || launchctl load -w "${DST}"

echo "Loaded job ${PLIST_NAME} (checks every 10m; runs once/day at 09:00 Europe/Lisbon, WorkingDirectory=${ROOT})"
echo "Logs: ${ROOT}/System/logs/telegram-morning-digest.log"
echo "Digest opens in Cursor after each successful run (set DEX_SKIP_OPEN_DIGEST_IN_CURSOR=1 in plist to disable)."
echo ""
echo "Morning digest uses a dedicated Telethon session (TELEGRAM_RECRUITING_SESSION_PATH in plist) so it does not"
echo "fight Cursor Telegram MCP for the same sqlite. One-time login from repo root:"
echo "  npm run job-search:telegram-login-recruiting"
