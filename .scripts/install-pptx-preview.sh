#!/usr/bin/env bash
# Install PPTX Preview extension in Cursor from VS Code Marketplace.
# Cursor uses Open VSX and doesn't have this extension; we download the VSIX manually.
set -e

EXT_PUBLISHER="Corotata"
EXT_NAME="pptx-preview"
TMP_DIR="${TMPDIR:-/tmp}/pptx-preview-install"
VSIX_PATH="$TMP_DIR/pptx-preview.vsix"

mkdir -p "$TMP_DIR"

# Get latest version via Marketplace API
echo "Fetching extension metadata..."
VER=$(curl -sL -X POST "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json; api-version=7.2-preview.1" \
  -d "{\"filters\":[{\"criteria\":[{\"filterType\":7,\"value\":\"${EXT_PUBLISHER}.${EXT_NAME}\"}],\"pageNumber\":1,\"pageSize\":1}],\"flags\":514}" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['results'][0]['extensions'][0]['versions'][0]['version'])
" 2>/dev/null)

if [ -z "$VER" ]; then
  echo "Failed to get extension version." >&2
  exit 1
fi

echo "Downloading ${EXT_PUBLISHER}.${EXT_NAME} v${VER}..."
curl -sL -o "$VSIX_PATH.raw" \
  "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${EXT_PUBLISHER}/vsextensions/${EXT_NAME}/${VER}/vspackage"

# Marketplace returns gzip; decompress to get ZIP-based VSIX
gunzip -c "$VSIX_PATH.raw" > "$VSIX_PATH" 2>/dev/null || mv "$VSIX_PATH.raw" "$VSIX_PATH"
rm -f "$VSIX_PATH.raw"

echo "Installing in Cursor..."
cursor --install-extension "$VSIX_PATH"

rm -rf "$TMP_DIR"
echo "Done. PPTX Preview installed."
