#!/usr/bin/env bash
# Create a DMG for distribution. Run after build.sh.
# Result: build/DexSpeak-1.0.0.dmg — один файл для скачивания и установки.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
VERSION="1.0.0"
APP_NAME="DexSpeak"
BUILD_DIR="$SCRIPT_DIR/build"
SRC_APP="$BUILD_DIR/$APP_NAME.app"
DMG_NAME="$APP_NAME-$VERSION.dmg"
DMG_PATH="$BUILD_DIR/$DMG_NAME"

if [[ ! -d "$SRC_APP" ]]; then
    echo "Run ./build.sh first."
    exit 1
fi

DMG_TMP="$BUILD_DIR/dmg-tmp"
rm -rf "$DMG_TMP"
mkdir -p "$DMG_TMP"
cp -R "$SRC_APP" "$DMG_TMP/"
ln -s /Applications "$DMG_TMP/Applications"

# Create DMG
rm -f "$DMG_PATH"
hdiutil create -volname "DexSpeak" -srcfolder "$DMG_TMP" -ov -format UDZO "$DMG_PATH"
rm -rf "$DMG_TMP"

echo "Created: $DMG_PATH"
echo "Размер: $(du -h "$DMG_PATH" | cut -f1)"
echo "Пользователь: скачать DMG, открыть, перетащить DexSpeak в Applications."
