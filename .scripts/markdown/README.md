# Markdown -> DOCX autosync

Automatic conversion for Markdown files to DOCX using `pandoc`.

## What is included

- `md_docx_autosync.py`:
 - Scans configured roots for `.md`
 - Converts only changed stale files (`.md` newer than `.docx`)
 - Stores file state in `System/state/markdown-docx-autosync-state.json`
 - First run does not backfill all historical markdown files
 - Safe to run repeatedly
- `install-md-docx-autosync-launchd.sh`:
 - Registers a `launchd` job (`com.dex.md-docx-autosync`)
 - Triggers on file changes and every 5 minutes
- `uninstall-md-docx-autosync-launchd.sh`:
 - Removes the `launchd` job

## Configuration

Config file:

- `System/config/markdown-docx-autosync.json`

Default roots:

- `00-Inbox`
- `04-Projects`
- `05-Areas`
- `06-Resources`

## One-time setup

1. Install pandoc:
 - `brew install pandoc`
2. Install autosync:
 - `npm run md:docx:autosync:install`

After setup, conversion runs automatically.

## Logs

- `.scripts/logs/md-docx-autosync.log`

## Manual sync (optional)

- `npm run md:docx:sync`

## Backfill all stale markdown once (optional)

- `python3 .scripts/markdown/md_docx_autosync.py --backfill`

