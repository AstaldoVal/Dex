#!/usr/bin/env bash
# Build all Dex Speak Swift components
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build widget (floating indicator + pause/stop buttons)
OUT_WIDGET="$SCRIPT_DIR/DexSpeakWidget"
swiftc -o "$OUT_WIDGET" DexSpeakWidget.swift -framework AppKit -framework Foundation
echo "Built: $OUT_WIDGET"

# Build audio player (pause-aware AVFoundation player)
OUT_PLAYER="$SCRIPT_DIR/DexAudioPlayer"
swiftc -o "$OUT_PLAYER" DexAudioPlayer.swift -framework AVFoundation -framework AppKit -framework Foundation
echo "Built: $OUT_PLAYER"

# Build clipboard trigger (floating 🔊 button on copy)
OUT_TRIGGER="$SCRIPT_DIR/DexSpeakTrigger"
swiftc -o "$OUT_TRIGGER" DexSpeakTrigger.swift -framework AppKit -framework Foundation
echo "Built: $OUT_TRIGGER"
