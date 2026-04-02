#!/bin/bash
# Direct script to get selection from Cursor and speak it
# This uses osascript to get selection, then passes to speak-selection.cjs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get selected text from Cursor using AppleScript
SELECTED_TEXT=$(osascript -e '
tell application "System Events"
    tell process "Cursor"
        set frontmost to true
        keystroke "c" using command down
    end tell
end tell
delay 0.2
the clipboard as text
')

if [ -z "$SELECTED_TEXT" ]; then
    echo "Нет выделенного текста. Выдели текст в Cursor и попробуй снова."
    exit 1
fi

# Speak the selected text
cd "$REPO_ROOT"
echo "$SELECTED_TEXT" | npm run speak-report -- --stdin
