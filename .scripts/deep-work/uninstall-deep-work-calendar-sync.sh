#!/usr/bin/env bash
# Stop legacy Deep Work [DEX] calendar fill (replaced by DEX-RHYTHM Google Calendar).
set -euo pipefail

PLIST="com.dex.deep-work-calendar-sync"
DST="${HOME}/Library/LaunchAgents/${PLIST}.plist"

launchctl bootout "gui/$(id -u)/${PLIST}" 2>/dev/null || true
if [[ -f "${DST}" ]]; then
  rm -f "${DST}"
  echo "Removed ${DST}"
else
  echo "No plist at ${DST}"
fi
echo "Legacy deep-work-calendar-sync disabled. Peaks/troughs: npm run cognitive:ultradian-calendar-sync"
