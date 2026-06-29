#!/usr/bin/env bash
# Run Granola → vault daily export (Python, uses Dex .venv when present).
set -euo pipefail

BREADCRUMB="${HOME}/.config/dex/vault-path"
VAULT_PATH=""
if [[ -f "${BREADCRUMB}" ]]; then
  VAULT_PATH="$(tr -d '[:space:]' < "${BREADCRUMB}")"
fi
if [[ -z "${VAULT_PATH}" ]] || [[ ! -d "${VAULT_PATH}" ]]; then
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
  VAULT_PATH="$(cd "${SELF_DIR}/../.." && pwd)"
fi

export VAULT_PATH
cd "${VAULT_PATH}"

PY="${VAULT_PATH}/.venv/bin/python"
if [[ ! -x "${PY}" ]]; then
  PY="python3"
fi

exec "${PY}" "${VAULT_PATH}/.scripts/meeting-intel/granola_daily_to_vault.py" "$@"
