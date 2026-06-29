#!/usr/bin/env bash
# Build (if needed) and launch floating Agent Handoff panel on macOS.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$ROOT/.scripts/pomodoro/DexAgentHandoffApp/build/DexAgentHandoff.app"
export DEX_AGENT_HANDOFF_BOARD="${DEX_AGENT_HANDOFF_BOARD:-$ROOT/System/Pomodoro/agent-handoff-board.json}"

if [[ ! -d "$APP" ]] || [[ "${1:-}" == "--build" ]]; then
  bash "$ROOT/.scripts/pomodoro/DexAgentHandoffApp/build.sh"
fi

echo "Board: $DEX_AGENT_HANDOFF_BOARD"
open -a "$APP"
