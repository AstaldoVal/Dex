#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST="com.dex.ultradian-calendar-sync.plist"
SRC="${SCRIPT_DIR}/launchd/${PLIST}.in"
DST="${HOME}/Library/LaunchAgents/${PLIST}"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing ${SRC}" >&2
  exit 1
fi

mkdir -p "${ROOT}/System/logs"
chmod +x "${SCRIPT_DIR}/ultradian-calendar-sync.sh" 2>/dev/null || true

sed "s#__REPO_ROOT__#${ROOT}#g" "${SRC}" > "${DST}"
echo "Wrote ${DST}"

launchctl bootout "gui/$(id -u)/${PLIST%.plist}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DST}" 2>/dev/null || launchctl load -w "${DST}"

echo "Loaded ${PLIST} (daily ~06:20 + at load: extend DEX-RHYTHM horizon)"
echo "Manual: npm run cognitive:ultradian-calendar-sync"
echo "Logs: ${ROOT}/System/logs/ultradian-google-calendar-sync.log"
