#!/usr/bin/env bash
# Save Todoist API token locally and verify connection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
YAML="${ROOT}/System/integrations/todoist.yaml"
EXAMPLE="${ROOT}/System/integrations/todoist.yaml.example"

TOKEN="${1:-${TODOIST_API_TOKEN:-}}"

if [[ -z "${TOKEN}" ]]; then
  echo "Usage: npm run cognitive:brain-todoist-setup -- <TODOIST_API_TOKEN>" >&2
  echo "Or: TODOIST_API_TOKEN=... npm run cognitive:brain-todoist-setup" >&2
  echo "" >&2
  echo "Token: Todoist → Settings → Integrations → Developer → API token" >&2
  exit 2
fi

mkdir -p "$(dirname "${YAML}")"
cat >"${YAML}" <<EOF
# Local only — gitignored. Created by brain_todoist_setup.sh
enabled: true
api_token: ${TOKEN}
project_name: Brain Protocol
EOF
chmod 600 "${YAML}" 2>/dev/null || true

echo "Saved token to System/integrations/todoist.yaml"

python3 - "${TOKEN}" <<'PY'
import json, sys, urllib.request
token = sys.argv[1]
req = urllib.request.Request(
    "https://api.todoist.com/api/v1/projects",
    headers={"Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(req, timeout=20) as resp:
    data = json.loads(resp.read().decode())
projects = data.get("results") if isinstance(data, dict) else data
names = [p.get("name") for p in (projects or [])[:8]]
print("Todoist OK. Projects:", ", ".join(n for n in names if n) or "(none)")
PY

echo ""
echo "Next:"
echo "  npm run cognitive:brain-todoist-sync"
echo "  npm run cognitive:brain-todoist-status"
