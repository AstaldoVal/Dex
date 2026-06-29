-- Floating widget with animated indicator and stop button
-- Uses AppleScriptObjC for a small floating window

on run argv
    set pidFile to item 1 of argv
    set stopFlagFile to item 2 of argv
    
    -- Wait for audio to start
    delay 0.3
    
    -- Show compact notification first
    display notification "🔊 Озвучивание..." with title "Dex" subtitle "Нажмите для остановки"
    
    -- Create floating widget using AppleScriptObjC
    try
        -- Use script object to create small window
        script FloatingWidget
            property widgetWindow : missing value
            
            on createWidget()
                -- Create small floating window
                tell application "System Events"
                    -- Show compact dialog (smallest possible)
                    set dialogResult to display dialog "🔊 Озвучивание..." & return & return & "Остановить?" buttons {"Остановить"} default button "Остановить" giving up after 3600 with title "Dex" with icon note
                    
                    if button returned of dialogResult is "Остановить" then
                        -- Create stop flag
                        do shell script "touch " & quoted form of (POSIX path of stopFlagFile)
                        -- Execute stop command
                        do shell script "cd " & quoted form of (do shell script "pwd") & " && npm run speak-stop 2>/dev/null || true"
                        display notification "⏹ Остановлено" with title "Dex"
                    end if
                end tell
            end createWidget
        end script
        
        tell FloatingWidget
            createWidget()
        end tell
        
    on error errorMessage
        -- Fallback: simple dialog
        try
            set dialogResult to display dialog "🔊 Озвучивание..." & return & return & "Остановить?" buttons {"Остановить"} default button "Остановить" giving up after 3600 with title "Dex" with icon note
            
            if button returned of dialogResult is "Остановить" then
                do shell script "touch " & quoted form of (POSIX path of stopFlagFile)
                do shell script "cd " & quoted form of (do shell script "pwd") & " && npm run speak-stop 2>/dev/null || true"
                display notification "⏹ Остановлено" with title "Dex"
            end if
        on error
            -- Dialog dismissed, check if process finished
            try
                if (do shell script "test -f " & quoted form of (POSIX path of pidFile) & " && echo 'exists' || echo 'not'") is "exists" then
                    set pidContent to do shell script "cat " & quoted form of (POSIX path of pidFile)
                    do shell script "kill -0 " & pidContent & " 2>/dev/null"
                else
                    display notification "✅ Завершено" with title "Dex"
                end if
            on error
                display notification "✅ Завершено" with title "Dex"
            end try
        end try
    end try
end run
