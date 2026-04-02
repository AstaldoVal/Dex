-- Small floating widget with stop button and speaking indicator
-- Appears only when audio starts playing

on run argv
    set pidFile to item 1 of argv
    set stopFlagFile to item 2 of argv
    
    -- Show small notification first
    display notification "Озвучивание началось" with title "Dex" subtitle "Нажмите кнопку для остановки"
    
    -- Create small floating window using AppleScript
    try
        -- Use display dialog but make it smaller and positioned
        set screenBounds to bounds of window 1 of application "Finder"
        set screenWidth to item 3 of screenBounds
        set screenHeight to item 4 of screenBounds
        
        -- Position in bottom-right corner
        set widgetX to screenWidth - 250
        set widgetY to screenHeight - 120
        
        -- Show compact dialog with indicator
        set widgetText to "🔊 Озвучивание..." & return & return & "Нажмите 'Остановить' для прекращения."
        
        -- Use display dialog with custom positioning (macOS 10.13+)
        set dialogResult to display dialog widgetText buttons {"Остановить"} default button "Остановить" giving up after 3600 with title "Dex" with icon note
        
        if button returned of dialogResult is "Остановить" then
            -- Create stop flag
            do shell script "touch " & quoted form of (POSIX path of stopFlagFile)
            -- Execute stop command
            do shell script "npm run speak-stop 2>/dev/null || true"
            display notification "Озвучивание остановлено" with title "Dex"
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
                display notification "Озвучивание завершено" with title "Dex"
            end if
        on error
            -- Process finished
            display notification "Озвучивание завершено" with title "Dex"
        end try
    end try
end run
