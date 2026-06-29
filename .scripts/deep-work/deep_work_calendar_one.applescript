on run argv
  set targetCalendarName to item 1 of argv
  set eventTitle to item 2 of argv
  set eventNote to item 3 of argv
  set y to (item 4 of argv) as integer
  set mo to (item 5 of argv) as integer
  set da to (item 6 of argv) as integer
  set sh to (item 7 of argv) as integer
  set sm to (item 8 of argv) as integer
  set eh to (item 9 of argv) as integer
  set em to (item 10 of argv) as integer

  tell application "Calendar"
    set targetCal to missing value
    if targetCalendarName is not equal to "" then
      try
        set targetCal to calendar targetCalendarName
      end try
    end if
    if targetCal is missing value then
      set targetCal to first calendar
    end if

    set d to current date
    set year of d to y
    set month of d to mo
    set day of d to da
    set hours of d to sh
    set minutes of d to sm
    set seconds of d to 0

    set e to current date
    set year of e to y
    set month of e to mo
    set day of e to da
    set hours of e to eh
    set minutes of e to em
    set seconds of e to 0

    -- Only scan events on this local day (avoid iterating the entire calendar).
    set dayStart to current date
    set year of dayStart to y
    set month of dayStart to mo
    set day of dayStart to da
    set hours of dayStart to 0
    set minutes of dayStart to 0
    set seconds of dayStart to 0
    set dayEnd to dayStart + (1 * days)

    set found to false
    repeat with ev in (every event of targetCal whose start date is greater than or equal to dayStart and start date is less than dayEnd and summary is eventTitle)
      set sd to start date of ev
      if (hours of sd) is sh and (minutes of sd) is sm then
        set found to true
        exit repeat
      end if
    end repeat

    if found is false then
      set newEvent to make new event at end of events of targetCal with properties {summary:eventTitle, start date:d, end date:e, description:eventNote}
      tell newEvent
        try
          make new display alarm at end of display alarms with properties {trigger interval:-300}
        end try
      end tell
    end if
  end tell
end run
