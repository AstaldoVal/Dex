#!/usr/bin/env bash
# Fill macOS Calendar with Deep Work [DEX] slots for the next N days (default 21).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DAYS="${1:-21}"
exec python3 "${SCRIPT_DIR}/deep_work_calendar_sync.py" "${ROOT}" "${DAYS}"
