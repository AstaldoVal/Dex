-- Compact floating widget that appears only when audio starts playing
-- Shows animated indicator and stop button

on run argv
    set pidFile to item 1 of argv
    set stopFlagFile to item 2 of argv
    
    -- Wait a moment for audio to start, then show compact widget
    delay 0.5
    
    -- Show compact notification
    display notification "🔊 Озвучивание..." with title "Dex" subtitle "Нажмите для остановки"
    
    -- Create compact floating dialog
    try
        -- Compact dialog with animated indicator
        set indicatorChars to {"🔊", "🔉", "🔊"}
        set currentIndicator to 0
        
        -- Show compact dialog (smaller size)
        set dialogResult to display dialog "🔊 Озвучивание..." & return & return & "Нажмите 'Остановить' для прекращения." buttons {"Остановить"} default button "Остановить" giving up after 3600 with title "Dex" with icon note
        
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
                -- Process still running, show notification
                display notification "Озвучивание продолжается. Используйте 'npm run speak-stop' для остановки." with title "Dex"
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
