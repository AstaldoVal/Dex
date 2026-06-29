#!/usr/bin/env bash
# Sync Session (macOS) with DEX-RHYTHM: reconcile live Session state vs current slot, then act.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RECONCILE_PY="${SCRIPT_DIR}/ultradian_session_reconcile.py"

FORCE=0
DRY=0
ROOT="${DEFAULT_ROOT}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --force) FORCE=1; shift ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) ROOT="$1"; shift ;;
  esac
done

STATE_PATH="${ROOT}/System/state/ultradian-rhythm-session-state.json"
LOG_PATH="${ROOT}/System/logs/ultradian-rhythm-session-sync.log"
CONFIG_PATH="${ROOT}/05-Areas/Cognitive_Performance/ultradian-rhythm-config.json"

mkdir -p "$(dirname "${STATE_PATH}")" "$(dirname "${LOG_PATH}")"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "ultradian-rhythm-session-sync: missing config ${CONFIG_PATH}" >>"${LOG_PATH}"
  exit 0
fi

eval "$(python3 - "${CONFIG_PATH}" <<'PY'
import json, shlex, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
sync = cfg.get("session_sync") or {}
vals = {
    "PEAK_INTENT": sync.get("peak_intent") or "Фокус DEX-RHYTHM",
    "NOTES_MARKER": cfg.get("note_marker") or "[DEX_RHYTHM]",
}
for k, v in vals.items():
    print(f"{k}={shlex.quote(v)}")
PY
)"

reconcile_args=("${RECONCILE_PY}" "${ROOT}")
[[ "${FORCE}" == "1" ]] && reconcile_args+=("--force")

plan="$(python3 "${reconcile_args[@]}")"

if [[ "${DRY}" == "1" ]]; then
  echo "${plan}"
  exit 0
fi

action="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('action',''))")"
reason="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reason',''))")"
sess_title="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_title',''))")"
slot_label="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('slot_label',''))")"
echo "ultradian-rhythm-session-sync: reconcile action=${action} slot=${slot_label} session=${sess_title} reason=${reason} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"

if [[ "${action}" == "" || "${action}" == "noop" ]]; then
  echo "ultradian-rhythm-session-sync: noop reason=${reason} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"
  PLAN_JSON="${plan}" python3 - "${STATE_PATH}" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
plan = json.loads(os.environ["PLAN_JSON"])
today = (plan.get("now") or "")[:10] or __import__("datetime").date.today().isoformat()
default = {"date": today, "fired_fp": "", "fired_kind": "", "delivered": False, "pending": None}
data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
if data.get("date") != today:
    data = default
if plan.get("fingerprint"):
    data["fired_fp"] = plan["fingerprint"]
    data["fired_kind"] = plan.get("slot_kind", "")
    data["delivered"] = True
    data["pending"] = None
    data["last_reason"] = plan.get("reason", "")
    data["last_session_title"] = plan.get("session_title", "")
path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
PY
  exit 0
fi

if [[ "${action}" == "defer" ]]; then
  echo "ultradian-rhythm-session-sync: defer reason=${reason} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"
  PLAN_JSON="${plan}" python3 - "${STATE_PATH}" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
plan = json.loads(os.environ["PLAN_JSON"])
today = plan.get("now", "")[:10] or __import__("datetime").date.today().isoformat()
default = {"date": today, "fired_fp": "", "fired_kind": "", "delivered": False, "pending": None}
data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
if data.get("date") != today:
    data = default
data["pending"] = {
    "reconcile_plan": plan,
    "fingerprint": plan.get("fingerprint"),
    "kind": plan.get("slot_kind"),
    "summary": plan.get("slot_summary"),
}
path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
PY
  exit 0
fi

open_session_url() {
  local url="$1"
  if ! open "${url}" >>"${LOG_PATH}" 2>&1; then
    echo "ultradian-rhythm-session-sync: open failed url=${url}" >>"${LOG_PATH}"
    return 1
  fi
  return 0
}

activate_session_app() {
  if ! open -a "Session" >>"${LOG_PATH}" 2>&1; then
    open -a "Session Setapp" >>"${LOG_PATH}" 2>&1 || true
  fi
  sleep 0.9
}

SUPPRESS_HOOKS_PATH="${ROOT}/System/state/ultradian-rhythm-sync-suppress-until"

suppress_session_hooks() {
  local seconds="${1:-45}"
  python3 - "${SUPPRESS_HOOKS_PATH}" "${seconds}" <<'PY'
import pathlib, sys
from datetime import datetime, timedelta, timezone
path = pathlib.Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
until = datetime.now(timezone.utc) + timedelta(seconds=int(sys.argv[2]))
path.write_text(until.isoformat(), encoding="utf-8")
PY
}

build_start_url() {
  local intent="$1"
  local duration="$2"
  local slot_notes="$3"
  SESSION_INTENT="${intent}" SESSION_DUR="${duration}" SESSION_NOTES="${slot_notes}" python3 <<'PY'
import os, urllib.parse
intent = os.environ.get("SESSION_INTENT", "Фокус")
dur = int(os.environ.get("SESSION_DUR", "0"))
notes = os.environ.get("SESSION_NOTES", "")
q = urllib.parse.urlencode(
    {"intent": intent, "duration": str(dur), "notes": notes},
    quote_via=urllib.parse.quote,
)
print("session:///start?" + q)
PY
}

run_pre_steps() {
  local pre_json="$1"
  printf '%s' "${pre_json}" | python3 -c "
import json, sys
for step in json.load(sys.stdin):
    print(step)
" | while read -r step; do
    case "${step}" in
      finish) open_session_url "session:///finish" || true; sleep 0.6 ;;
      abandon) open_session_url "session:///abandon" || true; sleep 0.8 ;;
    esac
  done
}

pre="$(printf '%s' "${plan}" | python3 -c "import sys,json; p=json.load(sys.stdin); print(json.dumps(p.get('pre') or []))")"
dur="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('duration_mins',25)))")"
summary="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('slot_summary',''))")"
notes="$(printf '%s' "${plan}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('notes') or d.get('slot_summary',''))")"
fp="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fingerprint',''))")"
kind="$(printf '%s' "${plan}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('slot_kind',''))")"

activate_session_app
suppress_session_hooks 45
run_pre_steps "${pre}"
sleep 0.5

case "${action}" in
  start_peak|finish_start_peak)
    intent="${summary:-${PEAK_INTENT}}"
    slot_notes="${NOTES_MARKER} peak ${summary}"
    open_session_url "$(build_start_url "${intent}" "${dur}" "${slot_notes}")"
    echo "ultradian-rhythm-session-sync: ${action} dur=${dur}m reason=${reason} fp=${fp} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"
    ;;
  break|finish_break)
    open_session_url "session:///break" || true
    echo "ultradian-rhythm-session-sync: ${action} dur=${dur}m reason=${reason} fp=${fp} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"
    ;;
  *)
    echo "ultradian-rhythm-session-sync: unhandled action=${action} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >>"${LOG_PATH}"
    exit 0
    ;;
esac

PLAN_JSON="${plan}" python3 - "${STATE_PATH}" "${fp}" "${kind}" "${reason}" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
plan = json.loads(os.environ["PLAN_JSON"])
today = plan.get("now", "")[:10] or __import__("datetime").date.today().isoformat()
data = {"date": today, "fired_fp": sys.argv[2], "fired_kind": sys.argv[3], "delivered": True, "pending": None, "last_reason": sys.argv[4], "last_session_title": plan.get("session_title", ""), "last_action": plan.get("action", ""), "last_action_at": plan.get("now", "")}
path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
PY

verified="$(PLAN_JSON="${plan}" python3 "${RECONCILE_PY}" verify "${ROOT}" 2>/dev/null || echo 0)"
if [[ "${verified}" != "1" ]]; then
  echo "ultradian-rhythm-session-sync: verify failed action=${action} — will retry next poll" >>"${LOG_PATH}"
  PLAN_JSON="${plan}" python3 - "${STATE_PATH}" "${fp}" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
plan = json.loads(os.environ["PLAN_JSON"])
data = json.loads(path.read_text(encoding="utf-8"))
data["delivered"] = False
data["last_reason"] = (plan.get("reason") or "") + "_verify_failed"
path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
PY
fi
