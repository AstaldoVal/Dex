#!/usr/bin/env bash
# Wrapper for cron: always write to log first (so we see cron ran even if later steps fail), then run the flow.
# Usage: cron-run-wrapper.sh incremental | incremental-sequential | incremental-igaming | incremental-cpo | full | full-igaming | full-cpo
# Cron calls this script; this script writes "Cron started" then runs schedule-linkedin-teal-flow.sh (all output to same log).
# REPO is set by install-cron-linkedin-teal.sh when it writes this file.

REPO="${VAULT_PATH:-/Users/admin.roman.matsukatov/Documents/Development/DEX/Dex}"
TEAL_LOG_DIR="$REPO/00-Inbox/Job_Search/teal"
mkdir -p "$TEAL_LOG_DIR"

case "${1:-}" in
  full) CRON_LOG="$TEAL_LOG_DIR/full-flow-cron.log" ;;
  full-igaming) CRON_LOG="$TEAL_LOG_DIR/full-flow-igaming-cron.log" ;;
  full-cpo) CRON_LOG="$TEAL_LOG_DIR/full-flow-cpo-cron.log" ;;
  incremental-sequential) CRON_LOG="$TEAL_LOG_DIR/incremental-sequential-cron.log" ;;
  incremental-igaming) CRON_LOG="$TEAL_LOG_DIR/incremental-igaming-cron.log" ;;
  incremental-cpo) CRON_LOG="$TEAL_LOG_DIR/incremental-cpo-cron.log" ;;
  *) CRON_LOG="$TEAL_LOG_DIR/incremental-cron.log" ;;
esac

# Always log that cron triggered (so we never have "no logs")
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron trigger: mode=${1:-none} REPO=$REPO" >> "$CRON_LOG" 2>/dev/null || true

# Run the real flow; all output and errors go to the same log
( export TZ="${TZ:-Europe/Lisbon}"; cd "$REPO" && source .scripts/job-search/cron-env.sh && /bin/bash .scripts/job-search/schedule-linkedin-teal-flow.sh "$1" ) >> "$CRON_LOG" 2>&1
EXIT=$?
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron wrapper finished: exit_code=$EXIT" >> "$CRON_LOG" 2>/dev/null || true
exit $EXIT
