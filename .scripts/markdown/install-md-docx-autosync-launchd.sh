#!/usr/bin/env bash
# Installs launchd automation for Markdown -> DOCX sync via pandoc.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_BIN="$(which python3 2>/dev/null || echo "/usr/bin/python3")"
SYNC_SCRIPT="$REPO/.scripts/markdown/md_docx_autosync.py"
LOG_DIR="$REPO/.scripts/logs"
LOG_FILE="$LOG_DIR/md-docx-autosync.log"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.dex.md-docx-autosync.plist"

mkdir -p "$LOG_DIR" "$PLIST_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.md-docx-autosync</string>

  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON_BIN</string>
    <string>$SYNC_SCRIPT</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$REPO</string>

  <key>WatchPaths</key>
  <array>
    <string>$REPO/00-Inbox</string>
    <string>$REPO/04-Projects</string>
  </array>

  <key>StartInterval</key>
  <integer>300</integer>

  <key>RunAtLoad</key>
  <true/>

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

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Markdown -> DOCX autosync installed."
echo "Plist: $PLIST_PATH"
echo "Logs:  $LOG_FILE"
echo "To stop: launchctl unload \"$PLIST_PATH\""

