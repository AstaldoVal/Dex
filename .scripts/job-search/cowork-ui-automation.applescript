-- Cowork UI automation: focus Claude, approvals, rename session, paste prompt, Send.
-- Usage: osascript cowork-ui-automation.applescript [delaySec] [approveLoopSec] [pasteBeforeSend 0|1] [sessionTitleFile] [promptFile]
on run argv
  set delaySec to 8
  set approveLoopSec to 24
  set doPaste to true
  set sessionTitleFile to ""
  set promptFile to ""
  if (count of argv) > 0 then set delaySec to (item 1 of argv) as integer
  if (count of argv) > 1 then set approveLoopSec to (item 2 of argv) as integer
  if (count of argv) > 2 then set doPaste to ((item 3 of argv) as integer) = 1
  if (count of argv) > 3 then set sessionTitleFile to item 4 of argv
  if (count of argv) > 4 then set promptFile to item 5 of argv

  my logMsg("waiting " & delaySec & "s before Claude UI automation")
  delay delaySec

  tell application "Claude" to activate
  delay 0.5
  tell application "System Events"
    if exists process "Claude" then
      tell process "Claude"
        set frontmost to true
        if (count of windows) > 0 then
          try
            perform action "AXRaise" of window 1
          end try
          try
            click window 1
          end try
        end if
      end tell
    end if
  end tell
  delay 0.5

  tell application "System Events"
    if not (exists process "Claude") then
      my logMsg("ERROR: Claude process not found - is Claude.app running?")
      return
    end if
    tell process "Claude"
      set frontmost to true
      delay 0.5

      set approveRounds to approveLoopSec * 3
      my logMsg("dismiss Attach/Continue/Allow dialogs (up to " & approveLoopSec & "s)")
      repeat with i from 1 to approveRounds
        set clicksInPass to 0
        repeat with j from 1 to 8
          if my clickApprovalButtons() then
            set clicksInPass to clicksInPass + 1
          else
            exit repeat
          end if
        end repeat
        if clicksInPass > 0 then my logMsg("approval pass " & i & ": " & clicksInPass & " click(s)")
        delay 0.45
      end repeat

      my logMsg("folder trust: Allow / Continue (all windows + Return fallback)")
      my clickButtonNamed("Allow")
      delay 0.3
      if not my clickButtonNamed("Continue") then
        my logMsg("Continue not found by name — trying Return (default button)")
        key code 36
        delay 0.5
      end if
      delay 0.5

      my logMsg("post-trust approval pass")
      repeat with i from 1 to 6
        my clickApprovalButtons()
        delay 0.5
      end repeat
    end tell
  end tell

  tell application "Claude" to activate
  delay 0.3
  tell application "System Events"
    tell process "Claude"
      set frontmost to true
    end tell
  end tell

  set sessionTitle to my readSessionTitleFile(sessionTitleFile)
  if sessionTitle is not "" then
    my logMsg("rename Cowork session: " & sessionTitle)
    set the clipboard to sessionTitle
    set pencilClicked to false
    tell application "System Events"
      tell process "Claude"
        set frontmost to true
        repeat with w in (every window)
          repeat with b in (every button of w)
            if my isRenamePencilButton(b) then
              click b
              set pencilClicked to true
              my logMsg("clicked rename/edit pencil button")
              exit repeat
            end if
          end repeat
          if pencilClicked then exit repeat
        end repeat
      end tell
    end tell
    if not pencilClicked then my logMsg("WARN: rename pencil not found — pasting title anyway")
    delay 0.5
    tell application "System Events"
      tell process "Claude"
        set frontmost to true
        keystroke "a" using command down
        delay 0.15
        keystroke "v" using command down
        delay 0.2
        key code 36
        delay 0.4
      end tell
    end tell
    my logMsg("session rename keystrokes sent")
  end if

  if doPaste then
    if promptFile is not "" then
      try
        do shell script "cat " & quoted form of promptFile & " | pbcopy"
        my logMsg("loaded prompt from file into clipboard")
      on error errMsg
        my logMsg("WARN: pbcopy from prompt file failed: " & errMsg)
      end try
    else
      my logMsg("paste prompt from clipboard (Cmd+V)")
    end if
    tell application "System Events"
      tell process "Claude"
        set frontmost to true
        keystroke "v" using command down
        delay 1.0
        repeat with i from 1 to 4
          my clickApprovalButtons()
          delay 0.4
        end repeat
        my logMsg("Send message (Cmd+Return)")
        keystroke return using command down
        delay 0.3
        my logMsg("Send keystroke issued")
      end tell
    end tell
  end if
end run

on logMsg(msg)
  log "[cowork-ui] " & msg
end logMsg

on readSessionTitleFile(filePath)
  if filePath is "" then return ""
  try
    return do shell script "cat " & quoted form of filePath
  on error errMsg
    my logMsg("WARN: could not read session title file: " & errMsg)
    return ""
  end try
end readSessionTitleFile

on isRenamePencilButton(b)
  set n to name of b
  set d to ""
  try
    set d to description of b
  end try
  if d contains "pencil" or d contains "rename" or d contains "Pencil" or d contains "Rename" then return true
  if d contains "edit" or d contains "Edit" then return true
  if n contains "pencil" or n contains "rename" or n contains "edit" then return true
  return false
end isRenamePencilButton

on clickApprovalButtons()
  set approvalLabels to {"Attach", "Approve", "Allow", "Grant", "Continue", "OK", "Yes"}
  set clickedAny to false
  tell application "System Events"
    tell process "Claude"
      try
        repeat with w in (every window)
          repeat with b in (every button of w)
            if my clickButtonIfLabel(b, approvalLabels) then set clickedAny to true
          end repeat
          try
            repeat with s in (every sheet of w)
              repeat with b in (every button of s)
                if my clickButtonIfLabel(b, approvalLabels) then set clickedAny to true
              end repeat
            end repeat
          end try
        end repeat
      end try
    end tell
  end tell
  return clickedAny
end clickApprovalButtons

on clickButtonIfLabel(b, approvalLabels)
  set n to name of b
  set d to ""
  try
    set d to description of b
  end try
  repeat with lbl in approvalLabels
    if n is equal to lbl or d is equal to lbl or n contains lbl or d contains lbl then
      tell application "System Events"
        tell process "Claude"
          click b
        end tell
      end tell
      my logMsg("clicked '" & n & "' button")
      delay 0.4
      return true
    end if
  end repeat
  return false
end clickButtonIfLabel

on clickButtonNamed(btnName)
  tell application "System Events"
    tell process "Claude"
      try
        repeat with w in (every window)
          repeat with b in (every button of w)
            if my buttonMatchesName(b, btnName) then
              click b
              my logMsg("clicked '" & btnName & "' on window")
              return true
            end if
          end repeat
          try
            repeat with s in (every sheet of w)
              repeat with b in (every button of s)
                if my buttonMatchesName(b, btnName) then
                  click b
                  my logMsg("clicked '" & btnName & "' on sheet")
                  return true
                end if
              end repeat
            end repeat
          end try
        end repeat
      end try
    end tell
  end tell
  return false
end clickButtonNamed

on buttonMatchesName(b, btnName)
  set n to name of b
  if n is equal to btnName then return true
  try
    if (description of b) is equal to btnName then return true
  end try
  return false
end buttonMatchesName
