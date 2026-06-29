#!/usr/bin/env bash
# Install user LaunchAgent for telegram-news-bridge (macOS). Idempotent.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UV="${UV:-$(command -v uv)}"
if [[ -z "$UV" || ! -x "$UV" ]]; then
  echo "uv not found; install: brew install uv" >&2
  exit 1
fi
PLIST="$HOME/Library/LaunchAgents/com.dex.telegram-news-bridge.plist"
LABEL="com.dex.telegram-news-bridge"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed -e "s|__UVBIN__|$UV|g" -e "s|__BRIDGEDIR__|$BRIDGE_DIR|g" -e "s|__HOME__|$HOME|g" <<'EOF' >"$tmp"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.telegram-news-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>__UVBIN__</string>
    <string>run</string>
    <string>python</string>
    <string>-m</string>
    <string>telegram_news_bridge</string>
  </array>
  <key>WorkingDirectory</key>
  <string>__BRIDGEDIR__</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>__HOME__</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/telegram-news-bridge.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/telegram-news-bridge.err</string>
</dict>
</plist>
EOF

cp "$tmp" "$PLIST"
chmod 644 "$PLIST"
launchctl load "$PLIST"
echo "Loaded $PLIST (label $LABEL). Logs: /tmp/telegram-news-bridge.{log,err}"
echo "Check: launchctl list | grep $LABEL ; curl -s http://127.0.0.1:8770/health"
