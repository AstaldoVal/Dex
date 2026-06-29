#!/usr/bin/env bash
set -euo pipefail

ROOT="${VAULT_PATH:-$(pwd)}"
RUNNER="$ROOT/.scripts/analytics/run-and-log.cjs"

if [[ $# -eq 0 ]]; then
  echo "Usage: .scripts/analytics/dex-run.sh <command> [args...]" >&2
  exit 1
fi

node "$RUNNER" -- "$@"
