#!/usr/bin/env bash
# Полный тест без ручных сообщений в чате: --test + запись START/END в jsonl через тот же hook.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export VAULT_PATH="${ROOT}"

bash "${SCRIPT_DIR}/deep-work-runner.sh" --test

node "${ROOT}/.claude/hooks/deep-work-capture.cjs" <<'JSON'
{"hook_event_name":"UserPromptSubmit","prompt":"DW START: demo auto | критерий = нотификация + baseline + две строки в логе"}
JSON
node "${ROOT}/.claude/hooks/deep-work-capture.cjs" <<'JSON'
{"hook_event_name":"UserPromptSubmit","prompt":"DW END: demo auto закрыт | отвлечений нет | следующий шаг = слот по расписанию"}
JSON

echo "--- tail System/Deep_Work/deep-work-log.jsonl ---"
tail -n 3 "${ROOT}/System/Deep_Work/deep-work-log.jsonl"
