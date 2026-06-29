#!/usr/bin/env bash
# Install launchd agent for Brain checklist local server (Slidepad).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST_NAME="com.dex.brain-checklist-server.plist"
PLIST_SRC="${SCRIPT_DIR}/launchd/${PLIST_NAME}.in"
PLIST_DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"

mkdir -p "${HOME}/Library/LaunchAgents"
sed "s|__REPO_ROOT__|${ROOT}|g" "${PLIST_SRC}" > "${PLIST_DST}"

launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_DST}"
launchctl enable "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true

echo "Installed ${PLIST_DST}"
echo "Checklist: http://127.0.0.1:18765/"
echo "Logs: ${ROOT}/System/logs/brain-checklist-server.log"
