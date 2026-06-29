-- Args: calendar name, event title, year, month, day
-- Output: DELETED|<count>  or  ERR|<message>
on run argv
	set calName to item 1 of argv
	set evTitle to item 2 of argv
	set y to (item 3 of argv) as integer
	set mo to (item 4 of argv) as integer
	set da to (item 5 of argv) as integer
	set deleted to 0
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
			return "ERR|calendar not found: " & calName
		end if
		set dayStart to current date
		set year of dayStart to y
		set month of dayStart to mo
		set day of dayStart to da
		set hours of dayStart to 0
		set minutes of dayStart to 0
		set seconds of dayStart to 0
		set dayEnd to dayStart + (1 * days)
		set matches to every event of tgt whose start date is greater than or equal to dayStart and start date is less than dayEnd and summary is evTitle
		repeat with ev in matches
			delete ev
			set deleted to deleted + 1
		end repeat
	end tell
	return "DELETED|" & (deleted as string)
end run
