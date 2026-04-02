-- Simple notification monitor that shows stop button
-- Runs in background and checks for stop request

on run argv
    set pidFile to item 1 of argv
    set stopFile to path to temporary items as string & "dex-speak-stop-request"
    
    -- Show notification
    display notification "Идёт озвучивание отчёта. Нажмите 'Остановить' для прекращения." with title "Dex: Озвучивание"
    
    -- Show dialog with stop button
    try
        repeat
            set dialogResult to display dialog "Идёт озвучивание отчёта." & return & return & "Нажмите 'Остановить' для прекращения." buttons {"Остановить"} default button "Остановить" giving up after 1 with title "Dex: Озвучивание"
            
            if button returned of dialogResult is "Остановить" then
                -- Create stop request file
                do shell script "touch " & quoted form of (POSIX path of stopFile)
                -- Execute stop command
                do shell script "cd " & quoted form of (do shell script "pwd") & " && npm run speak-stop 2>/dev/null || true"
                display notification "Озвучивание остановлено" with title "Dex"
                exit repeat
            end if
            
            -- Check if process finished
            try
                set pidContent to do shell script "cat " & quoted form of (POSIX path of pidFile)
                do shell script "kill -0 " & pidContent & " 2>/dev/null"
            on error
                -- Process finished
                display notification "Озвучивание завершено" with title "Dex"
                exit repeat
            end try
        end repeat
    on error
        -- Dialog dismissed or error
    end try
end run
