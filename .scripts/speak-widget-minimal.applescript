-- Minimal floating widget with animated indicator
-- Appears only when audio starts playing

on run argv
    set pidFile to item 1 of argv
    set stopFlagFile to item 2 of argv
    
    -- Wait for audio to actually start
    delay 0.3
    
    -- Show minimal notification
    display notification "🔊 Озвучивание..." with title "Dex"
    
    -- Create minimal compact dialog
    try
        -- Very compact dialog - minimal text
        set dialogText to "🔊 Озвучивание..." & return & return & "Остановить?"
        set dialogResult to display dialog dialogText buttons {"Остановить"} default button "Остановить" giving up after 3600 with title "Dex" with icon note
        
        if button returned of dialogResult is "Остановить" then
            -- Create stop flag
            do shell script "touch " & quoted form of (POSIX path of stopFlagFile)
            -- Execute stop command
            do shell script "cd " & quoted form of (do shell script "pwd") & " && npm run speak-stop 2>/dev/null || true"
            display notification "⏹ Остановлено" with title "Dex"
        end if
    on error errorMessage
        -- Dialog dismissed or timed out
        -- Check if process finished
        try
            if (do shell script "test -f " & quoted form of (POSIX path of pidFile) & " && echo 'exists' || echo 'not'") is "exists" then
                set pidContent to do shell script "cat " & quoted form of (POSIX path of pidFile)
                do shell script "kill -0 " & pidContent & " 2>/dev/null"
                -- Process still running
            else
                -- Process finished
                display notification "✅ Завершено" with title "Dex"
            end if
        on error
            -- Process finished
            display notification "✅ Завершено" with title "Dex"
        end try
    end try
end run
