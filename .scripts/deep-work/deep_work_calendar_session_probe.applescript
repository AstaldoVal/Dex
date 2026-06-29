-- Args: calendar name (or ""), event summary to match (e.g. "Deep Work [DEX]")
-- Output one line: INACTIVE  OR  ACTIVE|<durSecs>|<fingerprint>|<description>
-- fingerprint = start string ^^ end string (no pipes) for dedupe across polls
on run argv
	set calName to item 1 of argv
	set evTitle to item 2 of argv
	set nowT to current date
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
			if summary of ev is evTitle then
				set sd to start date of ev
				set ed to end date of ev
				set durSecs to (ed - sd)
				set dnote to ""
				try
					set dnote to description of ev
				end try
				set fp to (sd as string) & "^^" & (ed as string)
				set dline to "ACTIVE|" & (durSecs as string) & "|" & fp & "|" & dnote
				return dline
			end if
		end repeat
	end tell
	return "INACTIVE"
end run
