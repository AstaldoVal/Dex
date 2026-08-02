# Session outcomes (optional)

If you prefer not to edit `session-events.jsonl` lines in place, the agent can append short outcome notes here as `YYYY-MM-DD.md` (one file per day) after a Session ends and you confirm the Cursor prompt.

Full step-by-step instructions for the agent: **`System/Pomodoro/CURSOR_SESSION_OUTCOME_PROMPT.md`** (session title from preceding `session_start` in JSONL, or Roman’s one-line reply in Cursor if AppleScript sent `{}`). The deeplink text is a short pointer in `.scripts/pomodoro/session-event-log.cjs` (`CURSOR_DEEPLINK_TEXT`).
