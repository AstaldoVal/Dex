#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST_RUNNER="com.dex.deep-work-runner.plist"
PLIST_SYNC="com.dex.deep-work-calendar-sync.plist"
SRC_RUNNER="${SCRIPT_DIR}/launchd/${PLIST_RUNNER}.in"
SRC_SYNC="${SCRIPT_DIR}/launchd/${PLIST_SYNC}.in"
DST_RUNNER="${HOME}/Library/LaunchAgents/${PLIST_RUNNER}"
DST_SYNC="${HOME}/Library/LaunchAgents/${PLIST_SYNC}"

if [[ ! -f "${SRC_RUNNER}" || ! -f "${SRC_SYNC}" ]]; then
  echo "Missing launchd template(s) in ${SCRIPT_DIR}/launchd/" >&2
  exit 1
fi

mkdir -p "${ROOT}/System/logs"
chmod +x "${ROOT}/.scripts/deep-work/deep-work-runner.sh" 2>/dev/null || true
chmod +x "${ROOT}/.scripts/deep-work/deep-work-calendar-sync.sh" 2>/dev/null || true

sed "s#__REPO_ROOT__#${ROOT}#g" "${SRC_RUNNER}" > "${DST_RUNNER}"
sed "s#__REPO_ROOT__#${ROOT}#g" "${SRC_SYNC}" > "${DST_SYNC}"
echo "Wrote ${DST_RUNNER}"
echo "Wrote ${DST_SYNC}"

launchctl bootout "gui/$(id -u)/${PLIST_RUNNER%.plist}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${PLIST_SYNC%.plist}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DST_RUNNER}" 2>/dev/null || launchctl load -w "${DST_RUNNER}"

echo "Loaded ${PLIST_RUNNER} (every 5m: ultradian Session sync + Todoist; legacy schedule off)"
echo "Skipped ${PLIST_SYNC} — use DEX-RHYTHM (npm run cognitive:ultradian-calendar-sync). To remove old agent: bash .scripts/deep-work/uninstall-deep-work-calendar-sync.sh"
echo "Logs: ${ROOT}/System/logs/deep-work-runner.log"
echo ""
echo "Optional (recommended): brew install terminal-notifier"
echo "  Lets notification tap open Cursor with a prefilled agent prompt instead of Script Editor."
echo ""
echo "Session (macOS): set session_mac_sync.open_on_deep_work_start in System/Deep_Work/deep-work-config.json"
echo "  to open session:///start when the Deep Work window starts (Session Pro URL scheme)."
