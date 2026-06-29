#!/usr/bin/env bash
# Uninstalls launchd automation for Markdown -> DOCX sync.

set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.dex.md-docx-autosync.plist"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "Markdown -> DOCX autosync removed."
echo "Removed: $PLIST_PATH"

