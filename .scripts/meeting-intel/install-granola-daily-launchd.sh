#!/usr/bin/env bash
# Install macOS LaunchAgent: Granola daily vault export at 21:00 local time.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST_NAME="com.dex.granola-daily-vault.plist"
SRC="${SCRIPT_DIR}/${PLIST_NAME}.template"
DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing template: ${SRC}" >&2
  exit 1
fi

chmod +x "${SCRIPT_DIR}/granola-daily-vault.sh" 2>/dev/null || true

mkdir -p "${VAULT_PATH}/.scripts/logs"

sed "s|__VAULT_PATH__|${VAULT_PATH}|g" "${SRC}" > "${DST}"
echo "Wrote ${DST}"

launchctl bootout "gui/$(id -u)/${PLIST_NAME%.plist}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DST}" 2>/dev/null || launchctl load -w "${DST}"

echo "Loaded ${PLIST_NAME} — runs daily at 21:00 (local), exports to 05-Areas/Meetings/Granola/YYYY-MM-DD/"
echo "Logs: ${VAULT_PATH}/.scripts/logs/granola-daily-vault.{stdout,stderr}.log and granola-daily-vault.log"
echo ""
echo "Manual run: ${SCRIPT_DIR}/granola-daily-vault.sh"
echo "Yesterday instead of today: ${SCRIPT_DIR}/granola-daily-vault.sh --day yesterday"
echo "Uninstall: launchctl bootout gui/\$(id -u) ${PLIST_NAME%.plist} && rm \"${DST}\""
