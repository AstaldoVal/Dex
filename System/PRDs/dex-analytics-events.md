# Dex Analytics Events (Unreleased)

Purpose:
- Keep event names consistent across Dex features
- Enable `/dex-level-up` and journey metadata to understand adoption

## Event: context manager
- Skill/command: `/context-manager`
- Event name: `context_manager_completed`
- Properties:
  - `items_processed` (number)
  - `context_scope` (string)
  - `mode` (string, optional)

## Event: physical daily check-in
- Skill/command: `/physical-daily-checkin`
- Event name: `physical_daily_checkin_completed`
- Properties:
  - `mode` (string: `chat` | `terminal_full` | `terminal_short`)
  - `had_health_merge` (boolean, optional)

