#!/bin/bash
# Install Dex LinkedIn Extension native messaging host for Chrome on macOS.
#
# Usage:
#   ./install-native-host.sh <extension-id>
#
# To find extension ID: go to chrome://extensions, enable Developer Mode,
# look at the ID under "Dex LinkedIn Job Capture".
#
# This registers the native host so Chrome allows the extension to call
# chrome.runtime.sendNativeMessage("com.dex.job_capture", ...).

set -euo pipefail

EXTENSION_ID="${1:-}"

if [ -z "$EXTENSION_ID" ]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo ""
  echo "Find your extension ID at chrome://extensions (Developer Mode on)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="$SCRIPT_DIR/native-host.js"
HOST_NAME="com.dex.job_capture"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

mkdir -p "$MANIFEST_DIR"

cat > "$MANIFEST_DIR/$HOST_NAME.json" <<MANIFEST
{
  "name": "$HOST_NAME",
  "description": "Dex LinkedIn Job Capture — saves JSON exports to project directory",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
MANIFEST

echo "Installed native messaging host:"
echo "  Name:      $HOST_NAME"
echo "  Path:      $HOST_PATH"
echo "  Manifest:  $MANIFEST_DIR/$HOST_NAME.json"
echo "  Extension: $EXTENSION_ID"
echo ""
echo "Restart Chrome for changes to take effect."
