#!/usr/bin/env bash
set -euo pipefail

ROOT="${VAULT_PATH:-$(pwd)}"
EVENT_LOGGER="$ROOT/.scripts/analytics/log-local-event.cjs"

command_str=""
if [[ "${1:-}" == "-c" ]]; then
  command_str="${2:-}"
else
  command_str="$*"
fi

script_name="${npm_lifecycle_event:-unknown}"
script_cmd="${npm_lifecycle_script:-$command_str}"

if [[ -f "$EVENT_LOGGER" ]]; then
  props_start="$(SN="$script_name" SC="$script_cmd" node -e 'process.stdout.write(JSON.stringify({trigger:"npm_run",script_name:process.env.SN,command:process.env.SC}))')"
  node "$EVENT_LOGGER" script_invoked "$props_start" || true
fi

set +e
/bin/bash "$@"
exit_code=$?
set -e

if [[ -f "$EVENT_LOGGER" ]]; then
  props_end="$(SN="$script_name" EC="$exit_code" node -e 'process.stdout.write(JSON.stringify({trigger:"npm_run",script_name:process.env.SN,exit_code:Number(process.env.EC)}))')"
  node "$EVENT_LOGGER" script_completed "$props_end" || true
fi

exit $exit_code
