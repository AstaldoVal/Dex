#!/usr/bin/env bash
# JSON -> stdout file; stderr -> terminal AND append to log (bash process substitution).
# Usage (from repo root):
#   packages/transcript-skill/scripts/transcribe_to_log.sh OUT.json OUT.stderr.log -- [args to transcribe.py ...]
# Example:
#   packages/transcript-skill/scripts/transcribe_to_log.sh 00-Inbox/t.json 00-Inbox/t.log -- \
#     --model large-v3 --compute-type float32 "/path/to/video.mp4"
set -euo pipefail
if [[ "${1:-}" == "" || "${2:-}" == "" || "${3:-}" != "--" ]]; then
  echo "Usage: $0 OUT.json OUT.stderr.log -- [transcribe.py arguments...]" >&2
  exit 1
fi
out_json="$1"
out_log="$2"
shift 3
mkdir -p "$(dirname "$out_json")"
mkdir -p "$(dirname "$out_log")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
{
  echo ""
  echo "────────────────────────────────────────────────────────────────────"
  echo "  transcript_to_log.sh (stderr -> терминал + tee в лог)"
  echo "  stdout JSON: $out_json"
  echo "  stderr log:  $out_log"
  echo -n "  аргументы transcribe.py: " >&2
  printf '%q ' "$@" >&2
  echo "" >&2
  echo "────────────────────────────────────────────────────────────────────"
  echo ""
} >&2
# tee пишет в лог и на свой stdout; без >&2 stdout tee = stdout родителя = тот же fd что и JSON,
# из-за чего весь stderr оказывался в OUT.json. Направляем копию в терминал через stderr оболочки.
python3 -u "$script_dir/transcribe.py" "$@" >"$out_json" 2> >(tee -a "$out_log" >&2)
rc=$?

summary_md="${out_json%.json}.summary.md"
if [[ $rc -eq 0 ]]; then
  if python3 "$script_dir/summarize_transcript.py" "$out_json" "$summary_md"; then
    {
      echo ""
      echo "────────────────────────────────────────────────────────────────────"
      echo "  transcript-media · результаты"
      echo "────────────────────────────────────────────────────────────────────"
      echo "  transcript: $out_json"
      echo "  stderr log: $out_log"
      echo "  summary:    $summary_md"
      echo "────────────────────────────────────────────────────────────────────"
      echo ""
    } >&2
  else
    {
      echo ""
      echo "[transcript-media] summary generation failed (transcript kept): $out_json"
      echo ""
    } >&2
  fi
fi

exit $rc
