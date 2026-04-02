#!/usr/bin/env bash
# Устанавливает launchd: каждые 10 минут подтягивает тикеты из Linear в Dex (03-Tasks/Tasks.md).
# Никакого вебхука и публичного URL не нужно — только LINEAR_API_KEY в .env.
# Запуск из корня репо: ./.scripts/install-linear-sync-launchd.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
SYNC_SCRIPT="$REPO/.scripts/sync_linear_to_dex.py"
LOG_DIR="$REPO/.scripts/logs"
LOG_FILE="$LOG_DIR/linear-sync.log"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/com.dex.linear-sync.plist"

mkdir -p "$LOG_DIR"

# Используем python3 из PATH (часто уже есть; при необходимости укажи полный путь)
PYTHON="$(which python3 2>/dev/null || echo "/usr/bin/python3")"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.linear-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$SYNC_SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
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
echo "Linear → Dex sync: включён (каждые 10 мин, лог: $LOG_FILE)"
echo "Проверка: $PYTHON $SYNC_SCRIPT"
