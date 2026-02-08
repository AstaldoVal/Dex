#!/bin/bash
# Установка автоматического трекера ответов на отклики

VAULT_PATH="$1"
if [ -z "$VAULT_PATH" ]; then
    echo "Usage: $0 <vault_path>"
    exit 1
fi

PLIST_TEMPLATE=".scripts/job-search/com.dex.job-tracker.plist.template"
PLIST_FILE="$HOME/Library/LaunchAgents/com.dex.job-tracker.plist"

# Заменяем __VAULT_PATH__ в шаблоне
sed "s|__VAULT_PATH__|$VAULT_PATH|g" "$VAULT_PATH/$PLIST_TEMPLATE" > "$PLIST_FILE"

# Загружаем launchd job
launchctl unload "$PLIST_FILE" 2>/dev/null
launchctl load "$PLIST_FILE"

echo "✅ Автоматический трекер ответов установлен"
echo "   Запуск каждый день в 8:00 AM"
echo "   Логи: $VAULT_PATH/.scripts/logs/job-tracker.*.log"
echo ""
echo "Для ручного запуска:"
echo "   node $VAULT_PATH/.scripts/job-search/auto-track-responses.js"
echo ""
echo "Для остановки:"
echo "   launchctl unload $PLIST_FILE"
