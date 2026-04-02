-- Show notification and dialog with stop button
-- This runs in a separate process and monitors the speaking process

on run argv
    set pidFile to item 1 of argv
    set notificationTitle to "Dex: Озвучивание"
    set notificationText to "Идёт озвучивание отчёта..."
    
    -- Show initial notification
    display notification notificationText with title notificationTitle
    
    -- Show dialog with stop button (non-blocking by running in background)
    try
        set dialogResult to display dialog notificationText & return & return & "Нажмите 'Остановить' для прекращения озвучивания." buttons {"Остановить"} default button "Остановить" giving up after 3600 with title notificationTitle with icon note
        if button returned of dialogResult is "Остановить" then
            -- Execute stop command
            do shell script "cd " & quoted form of (POSIX path of (path to me as string) & "..:..:..:") & " && npm run speak-stop"
            display notification "Озвучивание остановлено" with title "Dex"
        end if
    on error
        -- Dialog was dismissed or timed out, check if process is still running
        try
            set pidContent to do shell script "cat " & quoted form of pidFile
            set pid to pidContent as integer
            -- Check if process exists
            do shell script "kill -0 " & pid
            -- Process still running, show notification
            display notification "Озвучивание продолжается. Используйте 'npm run speak-stop' для остановки." with title "Dex"
        on error
            -- Process finished
            display notification "Озвучивание завершено" with title "Dex"
        end try
    end try
end run
