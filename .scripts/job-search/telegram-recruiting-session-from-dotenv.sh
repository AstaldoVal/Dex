#!/usr/bin/env bash
# shellcheck disable=SC2034
# Read TELEGRAM_RECRUITING_SESSION_PATH from repo .env without sourcing the whole file (unsafe if values have spaces).
telegram_recruiting_apply_dotenv() {
  local root="${1:?root}"
  [[ -n "${TELEGRAM_RECRUITING_SESSION_PATH:-}" ]] && return 0
  [[ -f "${root}/.env" ]] || return 0
  local line
  line="$(grep -E '^[[:space:]]*TELEGRAM_RECRUITING_SESSION_PATH=' "${root}/.env" 2>/dev/null | tail -1)" || true
  [[ -z "${line}" ]] && return 0
  local val="${line#*=}"
  val="${val%$'\r'}"
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"
  [[ -z "${val}" ]] && return 0
  export TELEGRAM_RECRUITING_SESSION_PATH="${val}"
}
