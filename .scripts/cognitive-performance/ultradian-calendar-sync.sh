#!/usr/bin/env bash
# Keep DEX-RHYTHM Google Calendar filled horizon_weeks ahead (--auto).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
exec python3 "${SCRIPT_DIR}/ultradian_google_calendar_sync.py" "${ROOT}" --auto "$@"
