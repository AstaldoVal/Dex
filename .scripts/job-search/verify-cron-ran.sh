#!/usr/bin/env bash
# Проверяет, сработал ли крон в указанный слот (по записям в логах).
# Usage: verify-cron-ran.sh 10:40
# Exit 0 если в логе есть "Cron slot 10:40" или "Cron trigger" после 10:39 сегодня, иначе 1.

SLOT="${1:-10:40}"
REPO="${VAULT_PATH:-$(cd "$(dirname "$0")/../.." && pwd)}"
TEAL_LOG="$REPO/00-Inbox/Job_Search/teal"
TODAY="$(TZ=Europe/Lisbon date +%Y-%m-%d)"

case "$SLOT" in
  10:40) LOG="$TEAL_LOG/incremental-cron.log" ;;
  10:41) LOG="$TEAL_LOG/incremental-igaming-cron.log" ;;
  11:55) LOG="/tmp/dex-incremental-cron.log" ;;
  11:56) LOG="/tmp/dex-incremental-igaming-cron.log" ;;
  11:57) LOG="/tmp/dex-incremental-cpo-cron.log" ;;
  *) LOG="$TEAL_LOG/incremental-cron.log" ;;
esac

if [ ! -f "$LOG" ]; then
  echo "Log not found: $LOG"
  exit 1
fi

# Match "Cron slot 10:40" (cron) or "[date]T10:40... Cron trigger" (launchd)
if grep "Cron slot $SLOT" "$LOG" 2>/dev/null | grep -q "$TODAY"; then
  echo "OK: found Cron slot $SLOT in $LOG"
  grep "Cron slot $SLOT" "$LOG" | tail -1
  exit 0
fi
if grep "$TODAY" "$LOG" 2>/dev/null | grep "T$SLOT" | grep -q "Cron trigger"; then
  echo "OK: found Cron trigger today at $SLOT in $LOG"
  grep "$TODAY" "$LOG" | grep "T$SLOT" | grep "Cron trigger" | tail -1
  exit 0
fi

echo "MISSING: no Cron slot $SLOT or trigger at $SLOT today in $LOG (schedule may not have run)"
exit 1
