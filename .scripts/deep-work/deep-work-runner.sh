#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Stable interpreter for launchd (TCC is per-binary; avoid ambiguous python3 shims).
DEX_PYTHON="${DEX_PYTHON:-/opt/homebrew/bin/python3.14}"
if [[ ! -x "${DEX_PYTHON}" ]]; then
  DEX_PYTHON="$(command -v python3 || echo /usr/bin/python3)"
fi

CONFIG_PATH="${ROOT}/System/Deep_Work/deep-work-config.json"
STATE_PATH="${ROOT}/System/state/deep-work-state.json"
LOG_PATH="${ROOT}/System/logs/deep-work-runner.log"

mkdir -p "$(dirname "${STATE_PATH}")" "$(dirname "${LOG_PATH}")"

# DEX-RHYTHM → Session: peaks = focus, troughs = break (runs even when legacy schedule is disabled).
bash "${SCRIPT_DIR}/../cognitive-performance/ultradian_rhythm_session_sync.sh" "${ROOT}" >>"${LOG_PATH}" 2>&1 || true

# Brain Protocol → Todoist daily checklist (idempotent; needs System/integrations/todoist.yaml).
"${DEX_PYTHON}" "${SCRIPT_DIR}/../cognitive-performance/brain_todoist_daily_sync.py" >>"${LOG_PATH}" 2>&1 || true

# DEX-RHYTHM Google Calendar: extend horizon once per day (backup if launchd not installed).
ULTRADIAN_CAL_MARKER="${ROOT}/System/state/ultradian-gcal-auto-extend-$(date +%Y-%m-%d)"
if [[ ! -f "${ULTRADIAN_CAL_MARKER}" ]]; then
  "${DEX_PYTHON}" "${SCRIPT_DIR}/../cognitive-performance/ultradian_google_calendar_sync.py" "${ROOT}" --auto >>"${LOG_PATH}" 2>&1 || true
  touch "${ULTRADIAN_CAL_MARKER}" 2>/dev/null || true
fi

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "deep-work-runner: missing config ${CONFIG_PATH}" >> "${LOG_PATH}"
  exit 1
fi

eval "$(python3 - "${CONFIG_PATH}" <<'PY'
import datetime as dt, json, shlex, sys, zoneinfo
cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))
tz_name = cfg.get("timezone") or "Europe/Lisbon"
tz = zoneinfo.ZoneInfo(tz_name)
now = dt.datetime.now(tz)
day_map = {0:"mon",1:"tue",2:"wed",3:"thu",4:"fri",5:"sat",6:"sun"}
key = day_map[now.weekday()]
s = cfg.get("schedule", {}).get(key, {})
enabled = bool(s.get("enabled", False))
start = s.get("start", "")
end = s.get("end", "")
cal = cfg.get("calendar_name", "")
title = cfg.get("notification_title", "Dex Deep Work")
open_cursor = bool(cfg.get("open_cursor_on_start", True))
open_file = cfg.get("open_file_on_start", "")
sync = cfg.get("session_mac_sync") or {}
session_sync_open = "1" if bool(sync.get("open_on_deep_work_start", False)) else "0"
session_intent = sync.get("intent") or "Dex Deep Work"
session_notes_prefix = sync.get("notes_prefix") or "[DEX_DEEPWORK]"
session_use_calendar = "1" if bool(sync.get("use_calendar_event_for_session", False)) else "0"

def mins(hhmm):
    if not hhmm:
        return -1
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)

vals = {
    "TODAY": now.date().isoformat(),
    "DAY_KEY": key,
    "ENABLED": "1" if enabled else "0",
    "START_HHMM": start,
    "END_HHMM": end,
    "START_MINS": str(mins(start)),
    "END_MINS": str(mins(end)),
    "NOW_MINS": str(now.hour * 60 + now.minute),
    "TZ_NAME": tz_name,
    "CALENDAR_NAME": cal,
    "NOTIF_TITLE": title,
    "OPEN_CURSOR": "1" if open_cursor else "0",
    "OPEN_FILE": open_file,
    "SESSION_SYNC_OPEN": session_sync_open,
    "SESSION_INTENT": session_intent,
    "SESSION_NOTES_PREFIX": session_notes_prefix,
    "SESSION_USE_CALENDAR": session_use_calendar,
}
for k, v in vals.items():
    print(f"{k}={shlex.quote(v)}")
PY
)"

# Attribution for banner + workable “click opens Cursor” (not Script Editor / osascript).
CURSOR_BUNDLE_ID="${CURSOR_BUNDLE_ID:-com.todesktop.230313mzl4w4u92}"

cursor_prompt_url() {
  python3 -c 'import urllib.parse,sys; print("cursor://anysphere.cursor-deeplink/prompt?text=" + urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

_log_terminal_notifier_hint_once() {
  local marker="${ROOT}/System/state/deep-work-terminal-notifier-hint-${TODAY:-daily}"
  [[ -f "${marker}" ]] && return 0
  touch "${marker}" 2>/dev/null || true
  echo "deep-work-runner: for notification tap -> Cursor draft use: brew install terminal-notifier" >> "${LOG_PATH}"
}

# Args: short banner text, full multi-line prompt for Cursor deeplink (optional; defaults to message).
notify() {
  local message="$1"
  local prompt_body="${2:-$1}"
  message="${message//$'\n'/ }"

  if command -v terminal-notifier >/dev/null 2>&1; then
    local url
    url="$(cursor_prompt_url "$prompt_body")"
    if [[ ${#url} -gt 7800 ]]; then
      prompt_body="${prompt_body:0:2500}..."
      url="$(cursor_prompt_url "$prompt_body")"
    fi
    terminal-notifier \
      -title "${NOTIF_TITLE}" \
      -message "${message}" \
      -sender "${CURSOR_BUNDLE_ID}" \
      -open "${url}" >/dev/null 2>&1 || true
    return 0
  fi

  _log_terminal_notifier_hint_once
  osascript -e "display notification \"${message//\"/\\\"}\" with title \"${NOTIF_TITLE//\"/\\\"}\"" >/dev/null 2>&1 || true
}

open_in_cursor() {
  [[ "${OPEN_CURSOR}" == "1" ]] || return 0
  [[ -n "${OPEN_FILE}" ]] || return 0
  local abs="${ROOT}/${OPEN_FILE}"
  [[ -f "${abs}" ]] || return 0
  if command -v cursor >/dev/null 2>&1; then
    cursor -r "${abs}" >/dev/null 2>&1 || true
  else
    open -a "Cursor" "${abs}" >/dev/null 2>&1 || true
  fi
}

# Session (macOS app): Pro URL scheme — start a focus block.
# https://www.stayinsession.com/learn/session-url-scheme
open_session_mac_url() {
  local dur="$1"
  local notes="$2"
  local session_url
  session_url="$(
    SESSION_INTENT="${SESSION_INTENT}" SESSION_DUR="${dur}" SESSION_NOTES="${notes}" python3 <<'PY'
import os, urllib.parse
intent = os.environ.get("SESSION_INTENT", "Dex Deep Work")
dur = int(os.environ.get("SESSION_DUR", "0"))
notes = os.environ.get("SESSION_NOTES", "")
q = urllib.parse.urlencode(
    {"intent": intent, "duration": str(dur), "notes": notes},
    quote_via=urllib.parse.quote,
)
print("session:///start?" + q)
PY
  )"
  if ! open "${session_url}" >>"${LOG_PATH}" 2>&1; then
    echo "deep-work-runner: session_mac_sync open failed (install Session / check Pro URL scheme)" >>"${LOG_PATH}"
  else
    echo "deep-work-runner: session_mac_sync opened duration=${dur}m" >>"${LOG_PATH}"
  fi
}

# When use_calendar_event_for_session=true: ultradian peak first, then legacy Deep Work [DEX].
maybe_open_session_mac_from_calendar_when_configured() {
  [[ "${SESSION_SYNC_OPEN:-0}" == "1" ]] || return 0
  [[ "${SESSION_USE_CALENDAR:-0}" == "1" ]] || return 0
  local json active
  json="$(python3 "${SCRIPT_DIR}/../cognitive-performance/ultradian_calendar_session_probe.py" "${ROOT}" 2>>"${LOG_PATH}")" || json='{"active":false}'
  active="$(printf '%s' "${json}" | python3 -c "import sys,json; print('1' if json.load(sys.stdin).get('active') else '0')")"
  if [[ "${active}" != "1" ]]; then
    return 0
  fi
  local fp dur notes cur
  fp="$(printf '%s' "${json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fingerprint',''))")"
  dur="$(printf '%s' "${json}" | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('duration_mins', 25)))")"
  notes="$(printf '%s' "${json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('notes',''))")"
  cur="$(python3 -c "import json; print(json.load(open('${STATE_PATH}')).get('session_mac_fired_fp',''))")"
  if [[ -n "${fp}" && "${fp}" == "${cur}" ]]; then
    return 0
  fi
  open_session_mac_url "${dur}" "${notes}"
  python3 - "${STATE_PATH}" "${fp}" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
fp = sys.argv[2]
data = json.loads(p.read_text(encoding="utf-8"))
data["session_mac_fired_fp"] = fp
p.write_text(json.dumps(data) + "\n", encoding="utf-8")
PY
}

# When use_calendar_event_for_session=false: start Session once when wall clock enters the config slot (legacy).
open_session_mac_on_deep_work_start_if_configured() {
  [[ "${SESSION_SYNC_OPEN:-0}" == "1" ]] || return 0
  [[ "${SESSION_USE_CALENDAR:-0}" != "1" ]] || return 0
  local dur=$((END_MINS - START_MINS))
  if [[ "${dur}" -lt 1 ]]; then
    echo "deep-work-runner: session_mac_sync skip (duration ${dur}m)" >>"${LOG_PATH}"
    return 0
  fi
  local notes="${SESSION_NOTES_PREFIX} ${TODAY} ${START_HHMM}-${END_HHMM}"
  open_session_mac_url "${dur}" "${notes}"
}

# Dry run: macOS notification + open baseline (no calendar/state), works outside the scheduled window.
if [[ "${1:-}" == "--test" ]]; then
  notify \
    "ТЕСТ Deep Work. Тапни уведомление: черновик вопроса в Cursor." \
    "Dex Deep Work (тест). Задай один вопрос про мой план на условный блок и напомни форматы: DW START: цель | критерий готово и DW END: результат | отвлечение | следующий шаг."
  open_in_cursor
  echo "deep-work-runner: --test at $(date -u +"%Y-%m-%dT%H:%M:%SZ") opened=${OPEN_FILE}" >> "${LOG_PATH}"
  exit 0
fi

# Fill Calendar for the next N days (Mon–Fri + Sun per config); does not touch notification state.
if [[ "${1:-}" == "--sync-calendar" ]]; then
  exec "${SCRIPT_DIR}/deep-work-calendar-sync.sh" "${2:-21}"
fi

if [[ "${ENABLED}" != "1" ]]; then
  exit 0
fi

if [[ "${START_MINS}" -lt 0 || "${END_MINS}" -le "${START_MINS}" ]]; then
  echo "deep-work-runner: invalid window for ${DAY_KEY}: ${START_HHMM}-${END_HHMM}" >> "${LOG_PATH}"
  exit 1
fi

python3 - "${STATE_PATH}" "${TODAY}" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
today = sys.argv[2]
if not path.exists():
    path.write_text(json.dumps({"date": today, "pre_notified": False, "started": False, "ended": False, "event_created": False, "session_mac_fired_fp": ""}) + "\n", encoding="utf-8")
    sys.exit(0)
data = json.loads(path.read_text(encoding="utf-8"))
if data.get("date") != today:
    data = {"date": today, "pre_notified": False, "started": False, "ended": False, "event_created": False, "session_mac_fired_fp": ""}
else:
    if "session_mac_fired_fp" not in data:
        data["session_mac_fired_fp"] = ""
path.write_text(json.dumps(data) + "\n", encoding="utf-8")
PY

get_state() {
  python3 - "${STATE_PATH}" "$1" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
print("1" if data.get(sys.argv[2], False) else "0")
PY
}

set_state() {
  python3 - "${STATE_PATH}" "$1" <<'PY'
import json, sys
path = sys.argv[1]
key = sys.argv[2]
data = json.load(open(path, "r", encoding="utf-8"))
data[key] = True
open(path, "w", encoding="utf-8").write(json.dumps(data) + "\n")
PY
}

create_calendar_event_once() {
  local created
  created="$(get_state event_created)"
  [[ "${created}" == "1" ]] && return 0

  local sh="${START_HHMM%%:*}"
  local sm="${START_HHMM##*:}"
  local eh="${END_HHMM%%:*}"
  local em="${END_HHMM##*:}"

  if osascript <<OSA >/dev/null 2>&1
set targetCalendarName to "${CALENDAR_NAME}"
set eventTitle to "Deep Work [DEX]"
set eventNote to "[DEX_DEEPWORK] ${TODAY} ${START_HHMM}-${END_HHMM}"
tell application "Calendar"
  set targetCal to missing value
  if targetCalendarName is not "" then
    try
      set targetCal to calendar targetCalendarName
    end try
  end if
  if targetCal is missing value then
    set targetCal to first calendar
  end if
  set d to (current date)
  set year of d to (year of (current date))
  set month of d to (month of (current date))
  set day of d to (day of (current date))
  set hours of d to ${sh}
  set minutes of d to ${sm}
  set seconds of d to 0
  set e to d + ((${eh} * 60 + ${em}) - (${sh} * 60 + ${sm})) * minutes
  set existing to (every event of targetCal whose summary is eventTitle and start date is d)
  if (count of existing) is 0 then
    set newEvent to make new event at end of events of targetCal with properties {summary:eventTitle, start date:d, end date:e, description:eventNote}
    tell newEvent
      make new display alarm at end of display alarms with properties {trigger interval:-300}
    end tell
  end if
end tell
OSA
  then
    set_state event_created
  else
    echo "deep-work-runner: calendar event create failed (check Calendar permission and calendar name \"${CALENDAR_NAME}\"). ${TODAY} ${START_HHMM}-${END_HHMM}" >> "${LOG_PATH}"
  fi
}

create_calendar_event_once

maybe_open_session_mac_from_calendar_when_configured

PRE_NOTIFIED="$(get_state pre_notified)"
STARTED="$(get_state started)"
ENDED="$(get_state ended)"

# Notify 5 minutes before start.
if [[ "${PRE_NOTIFIED}" == "0" && "${NOW_MINS}" -ge $((START_MINS - 5)) && "${NOW_MINS}" -lt "${START_MINS}" ]]; then
  notify \
    "Через 5 минут Deep Work (${START_HHMM}-${END_HHMM}). Тапни: черновик в Cursor." \
    "Dex Deep Work: через несколько минут окно ${START_HHMM}-${END_HHMM}. Задай один конкретный вопрос: что я беру в этот блок и какой один критерий готово? Напомни отправить в чат: DW START: цель | критерий готово."
  set_state pre_notified
fi

# Start window.
if [[ "${STARTED}" == "0" && "${NOW_MINS}" -ge "${START_MINS}" && "${NOW_MINS}" -lt "${END_MINS}" ]]; then
  notify \
    "Старт Deep Work (${START_HHMM}-${END_HHMM}). Тапни: черновик в Cursor." \
    "Dex Deep Work: блок только начался (${START_HHMM}-${END_HHMM}). Задай один вопрос про фокус и отвлечения. Напомни отправить DW START: цель | критерий готово, если ещё не отправил."
  open_session_mac_on_deep_work_start_if_configured
  open_in_cursor
  set_state started
fi

# End window.
if [[ "${STARTED}" == "1" && "${ENDED}" == "0" && "${NOW_MINS}" -ge "${END_MINS}" ]]; then
  notify \
    "Deep Work завершён. Тапни: черновик итога в Cursor." \
    "Dex Deep Work: окно закончилось. Задай коротко: что сделано, что мешало, следующий шаг. Напомни отправить DW END: результат | отвлечение | следующий шаг."
  set_state ended
fi

echo "deep-work-runner: ${TODAY} ${DAY_KEY} now=${NOW_MINS} window=${START_HHMM}-${END_HHMM} pre=${PRE_NOTIFIED} started=${STARTED} ended=${ENDED}" >> "${LOG_PATH}"
