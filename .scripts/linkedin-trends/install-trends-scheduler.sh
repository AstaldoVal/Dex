#!/usr/bin/env bash
# Installs launchd job: every Sunday at 09:00 runs the full LinkedIn trends pipeline.
# Run from repo root: bash .scripts/linkedin-trends/install-trends-scheduler.sh
# Or via npm: npm run linkedin-trends:scheduler

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO/00-Inbox/LinkedIn_Trends"
LOG_FILE="$LOG_DIR/trends-scheduler.log"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/com.dex.linkedin-trends.plist"

mkdir -p "$LOG_DIR"
mkdir -p "$LAUNCH_AGENTS"

NODE="$(which node 2>/dev/null || echo "/usr/local/bin/node")"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.linkedin-trends</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd "$REPO" && "$NODE" .scripts/linkedin-trends/linkedin-trends-capture-run.cjs 2>&amp;1 &amp;&amp; "$NODE" .scripts/linkedin-trends/aggregate-posts.cjs 2>&amp;1 &amp;&amp; "$NODE" .scripts/linkedin-trends/analyze-trends.cjs 2>&amp;1 &amp;&amp; "$NODE" .scripts/linkedin-trends/generate-trends-report.cjs 2>&amp;1 &amp;&amp; "$NODE" .scripts/linkedin-trends/generate-trends-dashboard.cjs 2>&amp;1</string>
  </array>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
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

echo "Scheduler installed. Runs every Sunday at 09:00."
echo "Log: $LOG_FILE"
echo "To uninstall: launchctl unload $PLIST && rm $PLIST"
