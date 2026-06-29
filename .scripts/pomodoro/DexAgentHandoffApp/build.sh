#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
APP_NAME="DexAgentHandoff"
OUT_APP="$SCRIPT_DIR/build/$APP_NAME.app"
mkdir -p "$SCRIPT_DIR/build"
rm -rf "$OUT_APP"
mkdir -p "$OUT_APP/Contents/MacOS"
mkdir -p "$OUT_APP/Contents/Resources"
echo "Compiling Swift..."
swiftc -o "$OUT_APP/Contents/MacOS/$APP_NAME" \
  -framework AppKit \
  -framework Foundation \
  AgentHandoffApp.swift
cp Info.plist "$OUT_APP/Contents/Info.plist"
echo "Built: $OUT_APP"
