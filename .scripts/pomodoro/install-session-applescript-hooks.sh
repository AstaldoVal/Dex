#!/usr/bin/env bash
# Compile and install Session (macOS) AppleScript hooks that call session-event-log.cjs.
# Apple does not expose "create Shortcut" on the CLI; this path avoids manual Shortcuts UI.
#
# Payload: AppleScript passes Session's argv[1] into stdin if present; otherwise stdin is empty.
# session-event-log.cjs merges JSON from stdin and, when title/notes are missing, reads Notes
# from Session.sqlite (Group Container …group.com.philipyoungg.translucent). See System/Pomodoro/README.md.
#
# Usage (from anywhere):
#   bash /path/to/DEX/.scripts/pomodoro/install-session-applescript-hooks.sh
#
# Optional env:
#   SESSION_BUNDLE_ID  — e.g. com.philipyoungg.session-setapp (default), com.philipyoungg.session, com.philipyoungg.session-direct
#   DRY_RUN=1          — print paths only, do not write .scpt files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CJS="${SCRIPT_DIR}/session-event-log.cjs"

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "error: node not found in PATH. Install Node or add it to PATH, then re-run." >&2
  exit 1
fi

BUNDLE="${SESSION_BUNDLE_ID:-com.philipyoungg.session-setapp}"
TARGET="${HOME}/Library/Application Scripts/${BUNDLE}"

if [[ ! -f "$CJS" ]]; then
  echo "error: missing ${CJS}" >&2
  exit 1
fi

echo "Repo root:  ${REPO_ROOT}"
echo "Node:       ${NODE}"
echo "Log script: ${CJS}"
echo "Install to: ${TARGET}"
echo ""

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN=1 — not writing files."
  exit 0
fi

mkdir -p "${TARGET}"

emit_one() {
  local event="$1"
  local open_flag="$2" # empty or " --open-cursor-prompt"
  local tmp
  tmp="$(mktemp -t "session_${event}.XXXXXX").applescript"
  cat >"${tmp}" <<ASCRIPT
on run argv
	set payloadJson to "{}"
	if (count of argv) > 0 then
		set payloadJson to (item 1 of argv) as text
	end if
	try
		do shell script "printf %s " & quoted form of payloadJson & " | " & quoted form of "${NODE}" & " " & quoted form of "${CJS}" & " --event ${event}${open_flag}"
	end try
end run
ASCRIPT
  osacompile -o "${TARGET}/${event}.scpt" "${tmp}"
  rm -f "${tmp}"
  echo "wrote ${TARGET}/${event}.scpt"
}

emit_one session_start ""
emit_one session_end " --open-cursor-prompt"
emit_one stop_working " --open-cursor-prompt"

echo ""
echo "Next steps:"
echo "  1. Session → Settings → AppleScript — enable Session start / Session end / Stop working (or equivalent labels)."
echo "  2. Turn OFF the same event names under Shortcuts if both are enabled (avoid duplicate log lines and double Cursor open)."
echo "  3. Use Session's Test buttons for session start / session end / stop working."
echo ""
echo "Wrong Session channel? Re-run with SESSION_BUNDLE_ID, e.g.:"
echo "  SESSION_BUNDLE_ID=com.philipyoungg.session bash ${SCRIPT_DIR}/$(basename "$0")"
