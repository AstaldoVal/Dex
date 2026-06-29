# /miro-sync-record

Pull one Miro board snapshot and write it into a PKM Record markdown file.

## When to use
- User says: "sync Miro to record", "pull board updates", "update decision file from board".
- User provides a Miro board URL and wants a file created or updated in vault.

## Inputs
- `board_url` (required)
- `record_title` (required, human-readable question/title)
- `record_path` (optional; if empty, derive from title)

## Output
One markdown file with this exact structure:

- Question
- Decision (or blocker)
- Confirmed
- Unverified
- Next actions
- Miro link

## Workflow
1. Validate Miro auth and fetch board snapshot via the Miro plugin (or connector in Claude Code).
2. Extract high-signal board content:
   - text widgets and headings
   - labels and status blocks
   - obvious decision candidates
3. Resolve file target:
   - if `record_path` provided, use it
   - otherwise create from title (kebab or underscore style accepted by repo)
4. If file exists, read it and preserve prior context.
5. Ask only missing semantic fields:
   - final decision now
   - assumptions still open
   - owner and due date for next action
6. Write file update in the standard Record shape.
7. Return a short change summary:
   - created vs updated
   - fields changed
   - board link used

## Command examples
- `/miro-sync-record https://miro.com/app/board/uXjVO7BrR0M=/ "Vendor shortlist decision"`
- `/miro-sync-record https://miro.com/app/board/uXjVO7BrR0M=/ "Monthly mention campaign" "04-Projects/Marketing/Monthly-mention-campaign.md"`

## Guardrails
- Do not invent decisions from layout-only boards.
- If board is mostly placeholders, keep `Decision` as blocker and ask a clarifying question.
- Never overwrite user-authored context sections that are outside the Record skeleton.
