#!/usr/bin/env bash
set -euo pipefail

PLIST_LABEL="com.dex.paperclip-server"
PLIST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
LAUNCHD_UID="$(id -u)"

launchctl bootout "gui/${LAUNCHD_UID}/${PLIST_LABEL}" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Paperclip launchd: removed ${PLIST_LABEL}"
