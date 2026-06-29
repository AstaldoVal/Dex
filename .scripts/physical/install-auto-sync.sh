#!/bin/bash
# Install launchd job to auto-sync Apple Health data every morning at 08:00
# Run once: bash .scripts/physical/install-auto-sync.sh

set -e

VAULT_PATH="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_NAME="com.dex.physical-sync"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$VAULT_PATH/.scripts/logs"
NODE_BIN="$(which node)"

mkdir -p "$LOG_DIR"

echo "🔧 Installing Dex Physical Auto-Sync..."
echo "   Vault: $VAULT_PATH"
echo "   Node:  $NODE_BIN"
echo "   Plist: $PLIST_PATH"
echo ""

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${VAULT_PATH}/.scripts/physical/apple-health-sync.cjs</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>VAULT_PATH</key>
    <string>${VAULT_PATH}</string>
  </dict>

  <!-- Run every day at 08:00 -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <!-- Also run whenever a new Health Export file appears in iCloud -->
  <key>WatchPaths</key>
  <array>
    <string>${HOME}/Library/Mobile Documents/com~apple~CloudDocs/Health data</string>
  </array>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/physical-sync.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/physical-sync-error.log</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# Unload if already running
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Load the new job
launchctl load "$PLIST_PATH"

echo "✅ Auto-sync installed!"
echo ""
echo "Schedule:"
echo "  - Every day at 08:00"
echo "  - Whenever a new file appears in ~/Library/.../Health data/"
echo ""
echo "Logs: $LOG_DIR/physical-sync.log"
echo ""
echo "To uninstall: bash .scripts/physical/uninstall-auto-sync.sh"
echo "To trigger now: npm run sync"
