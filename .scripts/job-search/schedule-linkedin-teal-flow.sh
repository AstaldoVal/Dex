#!/usr/bin/env bash
# Schedule: hourly incremental (new jobs only) + daily full flow.
# Both can run in parallel: incremental uses TEAL_CHROME_PROFILE_HOURLY, full uses TEAL_CHROME_PROFILE_ALT.
#
# 1) Set URL (required):
#    export LINKEDIN_SEARCH_URL="https://www.linkedin.com/jobs/search/?currentJobId=4372738622&distance=25.0&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager&origin=JOBS_HOME_KEYWORD_HISTORY"
#
# 2) Cron (run from repo root):
#    # Every hour: incremental (new jobs only), separate browser profile
#    0 * * * * LINKEDIN_SEARCH_URL="https://..." VAULT_PATH="/path/to/Dex" /path/to/Dex/.scripts/job-search/schedule-linkedin-teal-flow.sh incremental >> /path/to/Dex/00-Inbox/Job_Search/teal/incremental-cron.log 2>&1
#    # Once daily at 08:00: full flow
#    0 8 * * * LINKEDIN_SEARCH_URL="https://..." VAULT_PATH="/path/to/Dex" /path/to/Dex/.scripts/job-search/schedule-linkedin-teal-flow.sh full >> /path/to/Dex/00-Inbox/Job_Search/teal/full-flow-cron.log 2>&1
#
# 3) Or launchd (macOS): see .scripts/job-search/README-schedule-linkedin-teal.md

set -e
# Cron runs with minimal PATH; ensure node is findable
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# When run via stdin (launchd: cat script | bash -s), $0 is not script path; use VAULT_PATH
if [ -n "${VAULT_PATH:-}" ]; then
  REPO_ROOT="$VAULT_PATH"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# Load cron-env.sh when present and URL not already set (launchd may pass env but cannot read Documents)
SOURCED_CRON_ENV=0
if [ -z "${LINKEDIN_SEARCH_URL:-}" ] && [ -f "$REPO_ROOT/.scripts/job-search/cron-env.sh" ]; then
  set -a
  source "$REPO_ROOT/.scripts/job-search/cron-env.sh"
  set +a
  SOURCED_CRON_ENV=1
elif [ -n "${LINKEDIN_SEARCH_URL:-}" ]; then
  SOURCED_CRON_ENV=1
fi

cd "$REPO_ROOT"

TEAL_LOG_DIR="$REPO_ROOT/00-Inbox/Job_Search/teal"
mkdir -p "$TEAL_LOG_DIR"
if [ "$1" = "full" ]; then
  CRON_LOG="$TEAL_LOG_DIR/full-flow-cron.log"
elif [ "$1" = "full-igaming" ]; then
  CRON_LOG="$TEAL_LOG_DIR/full-flow-igaming-cron.log"
elif [ "$1" = "full-cpo" ]; then
  CRON_LOG="$TEAL_LOG_DIR/full-flow-cpo-cron.log"
elif [ "$1" = "incremental-igaming" ]; then
  CRON_LOG="$TEAL_LOG_DIR/incremental-igaming-cron.log"
elif [ "$1" = "incremental-cpo" ]; then
  CRON_LOG="$TEAL_LOG_DIR/incremental-cpo-cron.log"
elif [ "$1" = "incremental-sequential" ]; then
  CRON_LOG="$TEAL_LOG_DIR/incremental-sequential-cron.log"
else
  CRON_LOG="$TEAL_LOG_DIR/incremental-cron.log"
fi
[ -n "${DEX_CRON_LOG:-}" ] && CRON_LOG="$DEX_CRON_LOG"
# Write once at start so we know cron ran even if node fails (e.g. PATH)
# Check log: tail -50 "$REPO_ROOT/00-Inbox/Job_Search/teal/incremental-cron.log" (or full-flow-cron.log)
echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron started: mode=${1:-none} VAULT_PATH=$REPO_ROOT" >> "$CRON_LOG" 2>/dev/null || true
[ "$SOURCED_CRON_ENV" = 1 ] && echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Loaded cron-env.sh (LINKEDIN_SEARCH_URL set)" >> "$CRON_LOG" 2>/dev/null || true

# For incremental/full-igaming use LINKEDIN_SEARCH_URL_IGAMING; for incremental/full-cpo use LINKEDIN_SEARCH_URL_CPO
if [ "$1" = "incremental-igaming" ] || [ "$1" = "full-igaming" ]; then
  [ -n "$LINKEDIN_SEARCH_URL_IGAMING" ] && export LINKEDIN_SEARCH_URL="$LINKEDIN_SEARCH_URL_IGAMING"
elif [ "$1" = "incremental-cpo" ] || [ "$1" = "full-cpo" ]; then
  [ -n "$LINKEDIN_SEARCH_URL_CPO" ] && export LINKEDIN_SEARCH_URL="$LINKEDIN_SEARCH_URL_CPO"
fi
# incremental-sequential: run all three URLs in sequence (one LinkedIn capture at a time to avoid blocking)
if [ "$1" = "incremental-sequential" ]; then
  if [ -z "$LINKEDIN_SEARCH_URL" ] || [ -z "$LINKEDIN_SEARCH_URL_IGAMING" ] || [ -z "$LINKEDIN_SEARCH_URL_CPO" ]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] incremental-sequential requires LINKEDIN_SEARCH_URL, LINKEDIN_SEARCH_URL_IGAMING, LINKEDIN_SEARCH_URL_CPO in cron-env.sh" >> "$CRON_LOG" 2>&1
    exit 1
  fi
else
  if [ -z "$LINKEDIN_SEARCH_URL" ]; then
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] LINKEDIN_SEARCH_URL not set. Set in cron-env.sh or export before running." >> "$CRON_LOG" 2>&1
    exit 1
  fi
fi

# Teal automation: always visible browser (see CLAUDE.md / job-search rules). Cron must run when user session has display.

case "${1:-}" in
  incremental)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting incremental flow (hourly)." >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    SUMMARY_FILE="$REPO_ROOT/00-Inbox/Job_Search/teal/last-incremental-summary.txt"
    if [ -f "$SUMMARY_FILE" ]; then
      echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Summary: $(cat "$SUMMARY_FILE" | tr -d '\n')" >> "$CRON_LOG"
    fi
    exit $EXIT
    ;;
  incremental-sequential)
    # Run three incremental flows one after another so only one LinkedIn capture is active at a time (avoids blocking).
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting incremental-sequential: senior PM -> igaming -> CPO (one capture at a time)." >> "$CRON_LOG"
    EXIT=0
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] --- 1/3 incremental (senior PM) ---" >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL" >> "$CRON_LOG" 2>&1
    R=$?; [ $R -ne 0 ] && EXIT=$R
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] 1/3 finished: exit_code=$R" >> "$CRON_LOG"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] --- 2/3 incremental-igaming ---" >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL_IGAMING" >> "$CRON_LOG" 2>&1
    R=$?; [ $R -ne 0 ] && EXIT=$R
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] 2/3 finished: exit_code=$R" >> "$CRON_LOG"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] --- 3/3 incremental-cpo ---" >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL_CPO" >> "$CRON_LOG" 2>&1
    R=$?; [ $R -ne 0 ] && EXIT=$R
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] 3/3 finished: exit_code=$R" >> "$CRON_LOG"
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] incremental-sequential done: exit_code=$EXIT" >> "$CRON_LOG"
    exit $EXIT
    ;;
  incremental-igaming)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting incremental flow (igaming search, hourly)." >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    SUMMARY_FILE="$REPO_ROOT/00-Inbox/Job_Search/teal/last-incremental-summary.txt"
    if [ -f "$SUMMARY_FILE" ]; then
      echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Summary: $(cat "$SUMMARY_FILE" | tr -d '\n')" >> "$CRON_LOG"
    fi
    exit $EXIT
    ;;
  incremental-cpo)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting incremental flow (CPO search, every 3h)." >> "$CRON_LOG"
    node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    SUMMARY_FILE="$REPO_ROOT/00-Inbox/Job_Search/teal/last-incremental-summary.txt"
    if [ -f "$SUMMARY_FILE" ]; then
      echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Summary: $(cat "$SUMMARY_FILE" | tr -d '\n')" >> "$CRON_LOG"
    fi
    exit $EXIT
    ;;
  full)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting full flow (daily, senior PM)." >> "$CRON_LOG"
    node .scripts/job-search/run-full-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    exit $EXIT
    ;;
  full-igaming)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting full flow (daily, igaming)." >> "$CRON_LOG"
    node .scripts/job-search/run-full-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    exit $EXIT
    ;;
  full-cpo)
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Starting full flow (daily, CPO)." >> "$CRON_LOG"
    node .scripts/job-search/run-full-linkedin-teal-flow.cjs "$LINKEDIN_SEARCH_URL"
    EXIT=$?
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] Run finished: exit_code=$EXIT" >> "$CRON_LOG"
    exit $EXIT
    ;;
  *)
    echo "Usage: $0 incremental | incremental-sequential | incremental-igaming | incremental-cpo | full | full-igaming | full-cpo" >&2
    echo "  incremental            — single run: primary search (LINKEDIN_SEARCH_URL), new jobs only." >&2
    echo "  incremental-sequential — run all three (senior PM, igaming, CPO) one after another; one LinkedIn capture at a time." >&2
    echo "  incremental-igaming    — single run: igaming search (LINKEDIN_SEARCH_URL_IGAMING), new jobs only." >&2
    echo "  incremental-cpo        — single run: CPO search (LINKEDIN_SEARCH_URL_CPO), new jobs only." >&2
    echo "  full                — daily: full 8-step flow (senior PM)." >&2
    echo "  full-igaming        — daily: full 8-step flow (igaming)." >&2
    echo "  full-cpo            — daily: full 8-step flow (CPO)." >&2
    exit 1
    ;;
esac
