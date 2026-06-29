on run argv
  set calName to item 1 of argv
  set y to (item 2 of argv) as integer
  set mo to (item 3 of argv) as integer
  set da to (item 4 of argv) as integer
  set titleMarker to item 5 of argv

  set dayStart to current date
  set year of dayStart to y
  set month of dayStart to mo
  set day of dayStart to da
  set hours of dayStart to 0
  set minutes of dayStart to 0
  set seconds of dayStart to 0
  set dayEnd to dayStart + (1 * days)

  set outLines to {}
  tell application "Calendar"
    set tgt to missing value
    if calName is not "" then
      repeat with c in calendars
        if name of c is calName then
          set tgt to c
          exit repeat
        end if
      end repeat
    end if
    if tgt is missing value then
      set tgt to first calendar
    end if
    repeat with ev in (every event of tgt whose start date is greater than or equal to dayStart and start date is less than dayEnd)
      set smry to summary of ev
      if smry contains titleMarker then
        set sd to start date of ev
        set ed to end date of ev
        set dnote to ""
        try
          set dnote to description of ev
        end try
        set sy to year of sd as string
        set smo to (month of sd as integer) as string
        set sda to day of sd as string
        set sh to hours of sd as string
        set sm to minutes of sd as string
        set eh to hours of ed as string
        set em to minutes of ed as string
        set end of outLines to smry & "|" & sy & "|" & smo & "|" & sda & "|" & sh & "|" & sm & "|" & eh & "|" & em & "|" & dnote
      end if
    end repeat
  end tell
  repeat with ln in outLines
    log ln
  end repeat
  if (count of outLines) > 0 then
    set AppleScript's text item delimiters to linefeed
    return outLines as text
  end if
  return ""
end run
