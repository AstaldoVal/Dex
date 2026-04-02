-- Notification helper that shows a dialog with stop button
-- This runs in a separate process and doesn't block the main script

on run argv
    set pidFile to item 1 of argv
    set stopFlagFile to item 2 of argv
    
    -- Show notification
    display notification "Идёт озвучивание отчёта" with title "Dex: Озвучивание" subtitle "Нажмите кнопку для остановки"
    
    -- Show dialog with stop button (non-modal by running async)
    try
        set dialogResult to display dialog "Идёт озвучивание отчёта." & return & return & "Нажмите 'Остановить' для прекращения." buttons {"Остановить"} default button "Остановить" with title "Dex: Озвучивание" with icon note
        
        if button returned of dialogResult is "Остановить" then
            -- Create stop flag file
            do shell script "touch " & quoted form of stopFlagFile
            -- Execute stop command
            do shell script "npm run speak-stop 2>/dev/null || true"
            display notification "Озвучивание остановлено" with title "Dex"
        end if
    on error errorMessage
        -- Dialog was dismissed or error occurred
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
