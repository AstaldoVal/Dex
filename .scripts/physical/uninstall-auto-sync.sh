#!/bin/bash
PLIST_NAME="com.dex.physical-sync"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"
echo "✅ Auto-sync uninstalled"
