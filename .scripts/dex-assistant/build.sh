#!/usr/bin/env bash
# Build DexAssistant.app — assistant with avatar in bottom-right corner.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
APP_NAME="DexAssistant"
BUNDLE_ID="com.dex.assistant"
OUT_APP="$SCRIPT_DIR/build/$APP_NAME.app"
mkdir -p "$SCRIPT_DIR/build"
rm -rf "$OUT_APP"
mkdir -p "$OUT_APP/Contents/MacOS"
mkdir -p "$OUT_APP/Contents/Resources"

echo "Compiling Swift..."
swiftc -parse-as-library -o "$OUT_APP/Contents/MacOS/$APP_NAME" \
    -framework AppKit \
    -framework AVFoundation \
    -framework Foundation \
    DexAssistantApp.swift

echo "Copying Info.plist..."
cp Info.plist "$OUT_APP/Contents/Info.plist"

echo "Built: $OUT_APP"
open "$OUT_APP"
echo "Launched. Иконка — в Dock и в строке меню справа; окно аватара — в правом нижнем углу."
