#!/usr/bin/env bash
# Installs a daily launchd job that fetches Taplio trending topics at 09:15 every day.
# Runs in the foreground (no browser needed — lightweight HTTP fetch only).
#
# Run once from repo root:
#   bash .scripts/linkedin-trends/install-taplio-scheduler.sh
#   npm run linkedin-trends:taplio-scheduler
#
# After install, snapshots are saved daily to:
#   00-Inbox/LinkedIn_Trends/data/taplio-trends-YYYY-MM-DD.json
#
# To uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.dex.taplio-trends.plist
#   rm ~/Library/LaunchAgents/com.dex.taplio-trends.plist

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO/00-Inbox/LinkedIn_Trends"
LOG_FILE="$LOG_DIR/taplio-scheduler.log"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/com.dex.taplio-trends.plist"

mkdir -p "$LOG_DIR"
mkdir -p "$LAUNCH_AGENTS"

NODE="$(which node 2>/dev/null || echo "/usr/local/bin/node")"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.taplio-trends</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/.scripts/linkedin-trends/fetch-taplio-trends.cjs</string>
  </array>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>RunAtLoad</key>
  <false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>
EOF

echo "Plist written to: $PLIST"

# Unload existing if running
launchctl unload "$PLIST" 2>/dev/null || true

# Load new plist
launchctl load "$PLIST"

echo ""
echo "Taplio daily scheduler installed."
echo "  Runs every day at 09:15 — no browser required."
echo "  Saves to: $REPO/00-Inbox/LinkedIn_Trends/data/taplio-trends-YYYY-MM-DD.json"
echo "  Log: $LOG_FILE"
echo ""
echo "Run now to test:"
echo "  npm run linkedin-trends:taplio"
echo ""
echo "To uninstall:"
echo "  launchctl unload $PLIST && rm $PLIST"
