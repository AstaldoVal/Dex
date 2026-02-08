#!/bin/bash
# Dex Job Search - Daily gaming PM job digest
# Usage: ./install-automation.sh | ./install-automation.sh --status | ./install-automation.sh --stop

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLIST_NAME="com.dex.job-search"
PLIST_TEMPLATE="$SCRIPT_DIR/$PLIST_NAME.plist.template"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$VAULT_PATH/.scripts/logs"

find_node() {
  command -v node 2>/dev/null && which node || ([ -x "/opt/homebrew/bin/node" ] && echo "/opt/homebrew/bin/node") || echo "/usr/local/bin/node"
}
NODE_PATH=$(find_node | tr -d '\n')

if [ "$1" = "--status" ]; then
  echo "Job search automation:"
  [ -f "$PLIST_DEST" ] && echo "  Installed: $PLIST_DEST" || echo "  Not installed"
  launchctl list 2>/dev/null | grep -q "$PLIST_NAME" && echo "  Running: yes" || echo "  Running: no"
  [ -d "$VAULT_PATH/00-Inbox/Job_Search" ] && echo "  Output: 00-Inbox/Job_Search/" && ls -la "$VAULT_PATH/00-Inbox/Job_Search" 2>/dev/null | tail -5
  exit 0
fi

if [ "$1" = "--stop" ] || [ "$1" = "--uninstall" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "Job search automation stopped and removed."
  exit 0
fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
VAULT_PATH_ESC=$(printf '%s\n' "$VAULT_PATH" | sed 's/[&/\]/\\&/g')
NODE_PATH_ESC=$(printf '%s\n' "$NODE_PATH" | sed 's/[&/\]/\\&/g')
sed -e "s|__VAULT_PATH__|$VAULT_PATH_ESC|g" -e "s|__NODE_PATH__|$NODE_PATH_ESC|g" "$PLIST_TEMPLATE" > "$PLIST_DEST"
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"
echo "Job search automation installed. Runs daily at 7:00 AM and at login."
echo "Output: 00-Inbox/Job_Search/gaming-pm-jobs-YYYY-MM-DD.md"
echo "Manual run: node .scripts/job-search/fetch-gaming-pm-jobs.cjs"
