#!/usr/bin/env bash
# Keep Mac awake during Applicator night routine window (22:00–07:00 Europe/Lisbon).
# Invoked by launchd at ~21:58 Lisbon; runs until 07:00 same night/morning.
set -euo pipefail

SECONDS_LEFT="$(
  python3 - <<'PY'
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

tz = ZoneInfo("Europe/Lisbon")
now = datetime.now(tz)
end = now.replace(hour=7, minute=0, second=0, microsecond=0)
if now.hour >= 22 or now.hour < 7:
    if end <= now:
        end += timedelta(days=1)
else:
    # Daytime manual run: nothing to do.
    print(0)
    raise SystemExit(0)
remaining = int((end - now).total_seconds())
print(max(60, remaining))
PY
)"

if [[ "${SECONDS_LEFT}" -le 0 ]]; then
  echo "night-awake: outside window or zero duration; exit" >&2
  exit 0
fi

echo "night-awake: caffeinate ${SECONDS_LEFT}s until 07:00 Europe/Lisbon" >&2
exec caffeinate -dims -t "${SECONDS_LEFT}"
