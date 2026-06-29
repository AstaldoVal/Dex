on run argv
  set calName to item 1 of argv
  set titleMarker to item 2 of argv
  set peakPrefix to item 3 of argv
  set troughPrefixes to item 4 of argv
  set nowT to current date

  set troughList to my splitString(troughPrefixes, ",")

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

    repeat with ev in (every event of tgt whose start date is less than or equal to nowT and end date is greater than nowT)
      set smry to summary of ev
      if smry contains titleMarker then
        set slotKind to ""
        if smry starts with peakPrefix then
          set slotKind to "peak"
        else
          repeat with tp in troughList
            set tpTrim to my trimString(tp)
            if tpTrim is not "" and smry starts with tpTrim then
              set slotKind to "trough"
              exit repeat
            end if
          end repeat
        end if

        if slotKind is "" then
          set dnote to ""
          try
            set dnote to description of ev
          end try
          if dnote contains "kind=peak" then
            set slotKind to "peak"
          else if dnote contains "kind=trough" then
            set slotKind to "trough"
          end if
        end if

        if slotKind is not "" then
          set sd to start date of ev
          set ed to end date of ev
          set durSecs to (ed - sd)
          set dnote to ""
          try
            set dnote to description of ev
          end try
          set fp to (sd as string) & "^^" & (ed as string)
          set dline to "ACTIVE|" & slotKind & "|" & (durSecs as string) & "|" & fp & "|" & dnote & "|" & smry
          return dline
        end if
      end if
    end repeat
  end tell
  return "INACTIVE"
end run

on splitString(theText, delim)
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to delim
  set parts to text items of theText
  set AppleScript's text item delimiters to oldDelims
  return parts
end splitString

on trimString(theText)
  set t to theText as text
  repeat while t begins with " " or t begins with tab
    set t to text 2 thru -1 of t
  end repeat
  repeat while t ends with " " or t ends with tab
    set t to text 1 thru -2 of t
  end repeat
  return t
end trimString
