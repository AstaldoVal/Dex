#!/usr/bin/env bash
# Sync cursor-team-kit skills from https://github.com/cursor/plugins (main).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${SCRIPT_DIR}/skills"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins.git "${TMP}/repo"
(
  cd "${TMP}/repo"
  git sparse-checkout set cursor-team-kit/skills
)
mkdir -p "${DEST}"
rsync -a --delete "${TMP}/repo/cursor-team-kit/skills/" "${DEST}/"

count="$(find "${DEST}" -name SKILL.md | wc -l | tr -d ' ')"
echo "Updated cursor-team-kit skills -> ${DEST} (${count} SKILL.md)"

VAULT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
node "${VAULT_ROOT}/.scripts/cursor/sync-slash-autosuggest.cjs" --cursor-team-kit-only
