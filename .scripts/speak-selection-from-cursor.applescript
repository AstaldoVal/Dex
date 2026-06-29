-- Get selected text from Cursor and speak it
-- This script gets the selection from the active Cursor window and passes it to speak-selection

tell application "System Events"
    tell process "Cursor"
        set frontmost to true
        -- Copy selection to clipboard
        keystroke "c" using command down
    end tell
end tell

-- Wait a moment for clipboard to update
delay 0.2

-- Run speak-selection with clipboard content
set scriptPath to POSIX path of ((path to me as text) & "::..::speak-selection.cjs")
do shell script "cd " & quoted form of (POSIX path of (path to me as text) & "::..::..") & " && npm run speak-selection"
