#!/usr/bin/env bash
# Build DexSpeak.app and optionally create DMG for distribution.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
APP_NAME="DexSpeak"
BUNDLE_ID="com.dex.speak"
OUT_APP="$SCRIPT_DIR/build/$APP_NAME.app"
mkdir -p "$SCRIPT_DIR/build"
rm -rf "$OUT_APP"
mkdir -p "$OUT_APP/Contents/MacOS"
mkdir -p "$OUT_APP/Contents/Resources"

echo "Compiling Swift..."
swiftc -o "$OUT_APP/Contents/MacOS/$APP_NAME" \
    -framework AppKit \
    -framework Foundation \
    -framework Security \
    -framework AVFoundation \
    -framework PDFKit \
    -framework Quartz \
    KeychainHelper.swift \
    OpenAITTS.swift \
    WidgetPanel.swift \
    PlaybackManager.swift \
    DexSpeakApp.swift

echo "Copying Info.plist..."
cp Info.plist "$OUT_APP/Contents/Info.plist"

echo "Built: $OUT_APP"
echo "Run: open $OUT_APP"
