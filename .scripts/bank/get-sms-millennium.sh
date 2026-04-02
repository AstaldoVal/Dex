#!/usr/bin/env bash
# Wait for a NEW incoming SMS after the bank was triggered, then print its code.
# Requires: Full Disk Access for the app that runs this (Terminal or Cursor).
#   System Settings → Privacy & Security → Full Disk Access → add Terminal / Cursor → restart app.
# Optional: set MILLENNIUM_BCP_SMS_SENDER to the exact sender id (phone or short code as in Messages)
#   so only messages from that sender are used.
# Logic: record the ROWID of the current last incoming message; poll until a message with higher ROWID
#   appears (i.e. a new message arrived after the script started); then extract and print its code.
# Usage: run; stdout = digits only (e.g. 6-digit code). Exit 0 if found, 1 otherwise. Polls up to ~90s.
# On permission error, prints FULL_DISK_ACCESS_NEEDED to stderr.

DB="${HOME}/Library/Messages/chat.db"
if [[ ! -f "$DB" ]]; then
  echo "FULL_DISK_ACCESS_NEEDED" >&2
  exit 1
fi

# Optional filter by sender (escape single quote for SQL)
SENDER_FILTER=""
if [[ -n "${MILLENNIUM_BCP_SMS_SENDER:-}" ]]; then
  SENDER_ESC=$(echo "$MILLENNIUM_BCP_SMS_SENDER" | sed "s/'/''/g")
  SENDER_FILTER="AND h.id = '$SENDER_ESC'"
fi

err=$(mktemp)
trap 'rm -f "$err"' EXIT

# Baseline: ROWID of the most recent incoming message (so we only accept messages that arrive later).
# If MILLENNIUM_SMS_BASELINE_ROWID is set (by Node, before triggering the bank), use that so we
# only accept messages that arrived after the bank was triggered.
get_baseline() {
  if [[ -n "${MILLENNIUM_SMS_BASELINE_ROWID:-}" ]]; then
    echo "$MILLENNIUM_SMS_BASELINE_ROWID"
    return
  fi
  if [[ -n "$SENDER_FILTER" ]]; then
    sqlite3 "$DB" 2>"$err" << SQL
SELECT COALESCE(MAX(m.ROWID), 0) FROM message m JOIN handle h ON m.handle_id = h.ROWID WHERE m.is_from_me = 0 $SENDER_FILTER;
SQL
  else
    sqlite3 "$DB" 2>"$err" "SELECT COALESCE(MAX(ROWID), 0) FROM message WHERE is_from_me = 0;"
  fi
}

# If only baseline requested (Node calls this before clicking Continuar), output baseline and exit
if [[ "${MILLENNIUM_SMS_GET_BASELINE:-0}" =~ ^(1|true|yes)$ ]]; then
  baseline=$(get_baseline)
  if [[ -s "$err" ]] && grep -q "Operation not permitted\|unable to open\|denied" "$err" 2>/dev/null; then
    echo "FULL_DISK_ACCESS_NEEDED" >&2
    exit 1
  fi
  [[ -n "$baseline" ]] && echo "$baseline"
  exit 0
fi

# Get latest message: ROWID and text (only from sender if filter set)
get_latest() {
  if [[ -n "$SENDER_FILTER" ]]; then
    sqlite3 "$DB" 2>"$err" -separator $'\t' << SQL
SELECT m.ROWID, m.text FROM message m JOIN handle h ON m.handle_id = h.ROWID WHERE m.is_from_me = 0 AND m.text IS NOT NULL AND m.text != '' $SENDER_FILTER ORDER BY m.date DESC LIMIT 1;
SQL
  else
    sqlite3 "$DB" 2>"$err" -separator $'\t' "SELECT ROWID, text FROM message WHERE is_from_me = 0 AND text IS NOT NULL AND text != '' ORDER BY date DESC LIMIT 1;"
  fi
}

if ! baseline=$(get_baseline) || [[ -s "$err" ]]; then
  if grep -q "Operation not permitted\|unable to open\|denied" "$err" 2>/dev/null; then
    echo "FULL_DISK_ACCESS_NEEDED" >&2
  fi
  exit 1
fi

# Poll until a new message appears (ROWID > baseline), up to ~90s
max_attempts=30
interval=3
for (( attempt=1; attempt <= max_attempts; attempt++ )); do
  latest=$(get_latest)
  if [[ -s "$err" ]]; then
    if grep -q "Operation not permitted\|unable to open\|denied" "$err" 2>/dev/null; then
      echo "FULL_DISK_ACCESS_NEEDED" >&2
    fi
    exit 1
  fi
  if [[ -n "$latest" ]]; then
    rowid="${latest%%$'\t'*}"
    text="${latest#*$'\t'}"
    if [[ -n "$rowid" && -n "$text" ]] && [[ "$rowid" -gt "$baseline" ]]; then
      # New message: extract code (last 6–8 digit sequence)
      last_code=""
      while [[ "$text" =~ ([0-9]{6,8}) ]]; do
        last_code="${BASH_REMATCH[1]}"
        text="${text#*${BASH_REMATCH[1]}}"
      done
      if [[ -n "$last_code" ]]; then
        echo "$last_code"
        exit 0
      fi
      while [[ "$text" =~ ([0-9]{4,5}) ]]; do
        last_code="${BASH_REMATCH[1]}"
        text="${text#*${BASH_REMATCH[1]}}"
      done
      if [[ -n "$last_code" ]]; then
        echo "$last_code"
        exit 0
      fi
    fi
  fi
  [[ $attempt -lt max_attempts ]] && sleep "$interval"
done

exit 1
