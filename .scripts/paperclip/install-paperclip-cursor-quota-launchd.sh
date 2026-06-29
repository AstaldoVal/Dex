#!/usr/bin/env bash
# Poll Paperclip Anthropic quota; when session is near limit, force all company agents to Cursor Auto.
# Run from repo root: ./.scripts/paperclip/install-paperclip-cursor-quota-launchd.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENSURE_SCRIPT="$REPO/.scripts/paperclip/ensure-cursor-adapters-on-quota.cjs"
LOG_DIR="$REPO/.scripts/logs"
LOG_FILE="$LOG_DIR/paperclip-cursor-quota.log"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/com.dex.paperclip-cursor-quota.plist"

mkdir -p "$LOG_DIR"
NODE="$(which node 2>/dev/null || echo "/usr/local/bin/node")"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.paperclip-cursor-quota</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ENSURE_SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VAULT_PATH</key>
    <string>$REPO</string>
  </dict>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Paperclip Cursor quota guard: enabled (every 5 min, log: $LOG_FILE)"
echo "Manual run: npm run paperclip:ensure-cursor-on-quota"
