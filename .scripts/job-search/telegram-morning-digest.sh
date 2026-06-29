#!/usr/bin/env bash
# Daily Telegram Recruiting PM digest (dump folder → scan → mark channels read).
# Scheduled by launchd and guarded to run once per Lisbon day at 09:00 hour.
#
# After a successful run, opens the digest .md in Cursor:
# - prefers `cursor -r` (reuse existing window when possible)
# - on macOS falls back to `open -a Cursor` (starts Cursor if it was closed)
# Set DEX_SKIP_OPEN_DIGEST_IN_CURSOR=1 to disable (e.g. CI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# Do not `source` the whole .env (unquoted spaces break bash). launchd may set TELEGRAM_RECRUITING_SESSION_PATH;
# otherwise we read only that one line from .env if present.
# shellcheck source=telegram-recruiting-session-from-dotenv.sh
source "${SCRIPT_DIR}/telegram-recruiting-session-from-dotenv.sh"
telegram_recruiting_apply_dotenv "${ROOT}"

# Optional dedicated Telethon session (separate .session SQLite from MCP / bridge).
# Set TELEGRAM_RECRUITING_SESSION_PATH to the session *base path* (no .session suffix), e.g.
#   .../Dex/.claude/telegram/telegram_recruiting
# One-time auth: npm run job-search:telegram-login-recruiting
if [[ -n "${TELEGRAM_RECRUITING_SESSION_PATH:-}" ]]; then
  export TELEGRAM_SESSION_PATH="${TELEGRAM_RECRUITING_SESSION_PATH}"
  echo "telegram-morning-digest: TELEGRAM_SESSION_PATH=${TELEGRAM_SESSION_PATH} (from TELEGRAM_RECRUITING_SESSION_PATH)" >&2
fi

mkdir -p "${ROOT}/System/logs"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi
# Manual/test runs must not write the Lisbon-day stamp, or the real 09:00 launchd run would skip.

LISBON_DATE="$(TZ=Europe/Lisbon date +%Y-%m-%d)"
LISBON_HOUR="$(TZ=Europe/Lisbon date +%H)"
LAST_RUN_STAMP="${ROOT}/System/state/telegram_morning_digest_last_run_lisbon.txt"
mkdir -p "$(dirname "${LAST_RUN_STAMP}")"

if [[ "${FORCE}" != "1" ]]; then
  # Run only during the Lisbon 09:00 hour.
  if [[ "${LISBON_HOUR}" != "09" ]]; then
    echo "telegram-morning-digest: skip (Lisbon hour=${LISBON_HOUR}, waiting for 09)"
    exit 0
  fi
  # Prevent duplicate runs in the same Lisbon day.
  if [[ -f "${LAST_RUN_STAMP}" ]] && [[ "$(cat "${LAST_RUN_STAMP}")" == "${LISBON_DATE}" ]]; then
    echo "telegram-morning-digest: already completed for ${LISBON_DATE} (Lisbon), skip"
    exit 0
  fi
fi

TODAY="${LISBON_DATE}"
JSON_OUT="00-Inbox/Job_Search/Telegram_Recruiting_latest.json"
MD_OUT="00-Inbox/Job_Search/Telegram_Recruiting_PM_morning_${TODAY}.md"
META_OUT="${ROOT}/System/telegram_morning_digest_meta.json"

# One writer at a time (Telethon session SQLite "database is locked" if overlapped).
# Portable lock: mkdir is atomic on local FS (no flock(1) on stock macOS).
DIGEST_LOCKDIR="${ROOT}/System/state/telegram_morning_digest.lockdir"
mkdir -p "$(dirname "${DIGEST_LOCKDIR}")"
if ! mkdir "${DIGEST_LOCKDIR}" 2>/dev/null; then
  echo "telegram-morning-digest: skip (lockdir exists: another run in progress)"
  exit 0
fi
cleanup_digest_lock() {
  rmdir "${DIGEST_LOCKDIR}" 2>/dev/null || true
}
trap cleanup_digest_lock EXIT INT TERM HUP

JSON_ABS="${ROOT}/${JSON_OUT}"
DUMP_RC=1
ACTIVE_SESSION_PATH="${TELEGRAM_SESSION_PATH:-}"
DEFAULT_TELEGRAM_SESSION_PATH="${VAULT_PATH:-$ROOT}/.claude/telegram/telegram"

run_folder_dump() {
  npm run job-search:telegram-dump-folder -- --folder Recruiting --out "${JSON_OUT}"
}

is_unauthorized_err() {
  local path="${1:-}"
  [[ -n "${path}" && -f "${path}" ]] || return 1
  grep -q "Session not authorized" "${path}"
}

heal_unauthorized_session() {
  local err_file="${1:-}"
  [[ -n "${ACTIVE_SESSION_PATH:-}" ]] || return 1
  [[ "${ACTIVE_SESSION_PATH}" == "${DEFAULT_TELEGRAM_SESSION_PATH}" ]] && return 1
  if ! is_unauthorized_err "${err_file}"; then
    return 1
  fi
  echo "telegram-morning-digest: self-heal: recruiting session unauthorized, trying default session path (${DEFAULT_TELEGRAM_SESSION_PATH})" >&2
  export TELEGRAM_SESSION_PATH="${DEFAULT_TELEGRAM_SESSION_PATH}"
  ACTIVE_SESSION_PATH="${TELEGRAM_SESSION_PATH}"
  local retry_err
  retry_err="$(mktemp)"
  if run_folder_dump > >(tee -a "${retry_err}") 2> >(tee -a "${retry_err}" >&2); then
    rm -f "${retry_err}"
    return 0
  fi
  if is_unauthorized_err "${retry_err}"; then
    echo "telegram-morning-digest: self-heal: default session is also unauthorized; run: npm run job-search:telegram-login" >&2
  fi
  rm -f "${retry_err}"
  return 1
}

if [[ "${TELEGRAM_MORNING_SKIP_DUMP:-0}" == "1" ]]; then
  echo "telegram-morning-digest: skipping folder dump (TELEGRAM_MORNING_SKIP_DUMP=1)" >&2
  DUMP_RC=0
else
  DUMP_ERR_FILE="$(mktemp)"
  if run_folder_dump > >(tee -a "${DUMP_ERR_FILE}") 2> >(tee -a "${DUMP_ERR_FILE}" >&2); then
    DUMP_RC=0
  elif heal_unauthorized_session "${DUMP_ERR_FILE}"; then
    DUMP_RC=0
  elif [[ -f "${JSON_ABS}" ]]; then
    echo "telegram-morning-digest: dump failed; continuing with existing ${JSON_OUT}" >&2
    DUMP_RC=1
  fi
  rm -f "${DUMP_ERR_FILE}"
fi

SCAN_RC=1
if [[ -f "${JSON_ABS}" ]] && TELEGRAM_SESSION_PATH="${ACTIVE_SESSION_PATH}" npm run job-search:telegram-recruiting-pm-week -- \
  --json "${JSON_OUT}" \
  --days 1 \
  --out "${MD_OUT}" \
  --mark-read-scanned \
  --strict-vacancy; then
  SCAN_RC=0
fi

if [[ "${SCAN_RC}" != "0" ]] && [[ "${DUMP_RC}" == "0" ]] && [[ -n "${ACTIVE_SESSION_PATH:-}" ]] && [[ "${ACTIVE_SESSION_PATH}" != "${DEFAULT_TELEGRAM_SESSION_PATH}" ]]; then
  SCAN_ERR_FILE="$(mktemp)"
  if TELEGRAM_SESSION_PATH="${ACTIVE_SESSION_PATH}" npm run job-search:telegram-recruiting-pm-week -- \
    --json "${JSON_OUT}" \
    --days 1 \
    --out "${MD_OUT}" \
    --mark-read-scanned \
    --strict-vacancy > >(tee -a "${SCAN_ERR_FILE}") 2> >(tee -a "${SCAN_ERR_FILE}" >&2); then
    SCAN_RC=0
  elif is_unauthorized_err "${SCAN_ERR_FILE}"; then
    echo "telegram-morning-digest: self-heal: scan unauthorized on recruiting session, retrying with default session path (${DEFAULT_TELEGRAM_SESSION_PATH})" >&2
    ACTIVE_SESSION_PATH="${DEFAULT_TELEGRAM_SESSION_PATH}"
    export TELEGRAM_SESSION_PATH="${ACTIVE_SESSION_PATH}"
    if TELEGRAM_SESSION_PATH="${ACTIVE_SESSION_PATH}" npm run job-search:telegram-recruiting-pm-week -- \
      --json "${JSON_OUT}" \
      --days 1 \
      --out "${MD_OUT}" \
      --mark-read-scanned \
      --strict-vacancy; then
      SCAN_RC=0
    fi
  fi
  rm -f "${SCAN_ERR_FILE}"
fi

if [[ "${SCAN_RC}" != "0" ]]; then
  mkdir -p "$(dirname "${ROOT}/${MD_OUT}")"
  DUMP_LABEL="FAILED"
  [[ "${DUMP_RC}" == "0" ]] && DUMP_LABEL="OK"
  {
    echo "# Telegram morning digest (run incomplete)"
    echo ""
    echo "- Generated (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "- Lisbon date: ${TODAY}"
    echo "- Folder dump step: ${DUMP_LABEL} (exit ${DUMP_RC})"
    echo "- PM scan step: FAILED (exit ${SCAN_RC})"
    echo ""
    echo "Re-run locally: \`npm run job-search:telegram-morning-digest\` (or wait for the next launchd interval)."
    echo ""
    echo "_This file is a fallback so hooks and Cursor still have a path for today._"
  } > "${ROOT}/${MD_OUT}"
fi

TOTAL="0"
if [[ -f "${ROOT}/${MD_OUT}" ]]; then
  TOTAL="$(grep -E '^- Total matching messages:' "${ROOT}/${MD_OUT}" | tail -1 | awk '{print $NF}' || true)"
  TOTAL="${TOTAL:-0}"
fi

python3 - "${ROOT}" "${MD_OUT}" "${TOTAL}" <<'PY'
import json, pathlib, sys, datetime

root = pathlib.Path(sys.argv[1])
rel = sys.argv[2]
total = int(sys.argv[3] or 0)
meta_path = root / "System" / "telegram_morning_digest_meta.json"
payload = {
    "digest_relative_path": rel.replace("\\", "/"),
    "digest_absolute_path": str((root / rel).resolve()),
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "total_matching_messages": total,
}
meta_path.parent.mkdir(parents=True, exist_ok=True)
meta_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY

# Only stamp the Lisbon day after a successful scan (not after fallback stub).
if [[ "${FORCE}" != "1" ]] && [[ "${SCAN_RC}" == "0" ]]; then
  printf "%s\n" "${LISBON_DATE}" > "${LAST_RUN_STAMP}"
fi

echo "telegram-morning-digest: wrote ${MD_OUT} (total=${TOTAL}, dump_rc=${DUMP_RC}, scan_rc=${SCAN_RC})"

open_digest_in_cursor() {
  if [[ "${DEX_SKIP_OPEN_DIGEST_IN_CURSOR:-0}" == "1" ]]; then
    echo "telegram-morning-digest: skip opening Cursor (DEX_SKIP_OPEN_DIGEST_IN_CURSOR=1)"
    return 0
  fi
  local abs="${ROOT}/${MD_OUT}"
  [[ -f "${abs}" ]] || return 0
  if command -v cursor >/dev/null 2>&1; then
    if cursor -r "${abs}"; then
      echo "telegram-morning-digest: opened in Cursor (cursor -r)"
      return 0
    fi
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if open -a "Cursor" "${abs}"; then
      echo "telegram-morning-digest: opened in Cursor (open -a)"
      return 0
    fi
  fi
  echo "telegram-morning-digest: warn: could not open Cursor for: ${abs}" >&2
}

open_digest_in_cursor
