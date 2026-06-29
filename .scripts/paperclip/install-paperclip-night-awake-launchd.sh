#!/usr/bin/env bash
# launchd: prevent Mac sleep during Paperclip night routines (22:00–07:00 Lisbon).
# From repo root: npm run paperclip:night-awake-launchd:install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNNER="$SCRIPT_DIR/paperclip-night-awake-run.sh"
LOG_DIR="$REPO/.scripts/logs"
LOG_FILE="$LOG_DIR/paperclip-night-awake.log"
PLIST_LABEL="com.dex.paperclip-night-awake"
PLIST="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

mkdir -p "$LOG_DIR"
chmod +x "$RUNNER"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>21</integer>
    <key>Minute</key>
    <integer>58</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TZ</key>
    <string>Europe/Lisbon</string>
  </dict>
</dict>
</plist>
EOF

LAUNCHD_UID="$(id -u)"
launchctl bootout "gui/${LAUNCHD_UID}/${PLIST_LABEL}" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
if launchctl bootstrap "gui/${LAUNCHD_UID}" "$PLIST" 2>/dev/null; then
  :
else
  launchctl load -w "$PLIST"
fi

echo "Paperclip night-awake launchd: loaded ${PLIST_LABEL}"
echo "Schedule: daily 21:58 local time (runner uses Europe/Lisbon until 07:00)"
echo "Log: ${LOG_FILE}"

TZ=Europe/Lisbon hour="$(date +%H)"
if [[ "$hour" -ge 22 || "$hour" -lt 7 ]]; then
  nohup bash "$RUNNER" >>"$LOG_FILE" 2>&1 &
  echo "Started immediate night-awake (already in 22:00–07:00 window)."
fi
