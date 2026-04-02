---
name: scan-skill-injection
description: Scan skill files for prompt-injection and supply-chain patterns. Run with /scan-skill-injection. Automatic check on install when watcher is running (npm run watch).
---

# Scan Skill Injection

**Command:** `/scan-skill-injection`

Scans SKILL.md (and optionally scripts) for prompt-injection-like text, hidden comments with external requests, dangerous Prerequisites (e.g. curl | bash), obfuscation, and known C2/exfil indicators. Reports file, line, pattern id, and snippet. Exit 0 = clean, 1 = at least one hit (review in context).

## Automatic check when you install a skill

If the **watcher** is running, every new or changed skill is scanned automatically (no extra steps, no params). To enable: from package root run `npm run watch` and leave the process running. The watcher monitors the skills directory and runs the scanner on any change. So: start the watcher once; then whenever you add or update a skill, it is checked automatically.

## When the user runs this command

1. **Default:** Run the scanner on the skills directory and report the result.
   - From package root: `npm run scan` or `node scripts/scan-skill-injection.cjs --dir skills`
   - If exit 0: report that no patterns were found and how many files were scanned.
   - If exit 1: show the script output (file:line [patternId], snippet) and note that hits are candidates for review; see `docs/skill-prompt-injection.md`.

2. **Newly installed skill (ClawHub / any registry):** When the user says they installed a skill, are about to install one, or want to verify a skill they just added:
   - If they give a **skill name** (e.g. from ClawHub): run `node scripts/scan-skill-injection.cjs --check-name <name>`. If exit 1 (blocklisted), tell them the skill is on the blocklist and stop. If exit 0 and the skill folder exists (e.g. `skills/<name>` or their path), run `node scripts/scan-skill-injection.cjs --dir skills/<name> --frontmatter --include-scripts`. If they gave a path, use that path with `--dir`. If the folder does not exist yet (e.g. they are about to install), after --check-name suggest they run this again after installation to scan the folder.
   - If they say they installed **several** skills and don't specify which: run `node scripts/scan-skill-injection.cjs --dir skills --newer-than 10 --frontmatter --include-scripts` to scan only directories modified in the last 10 minutes. Report results; if exit 0 and no output, say no new skills were found or they're clean.
   - Always use `--frontmatter --include-scripts` when verifying an installed or external skill.

3. **Check a skill name only (blocklist):** If the user only wants to check a name (e.g. "is X malicious?"):
   - Run: `node scripts/scan-skill-injection.cjs --check-name <name>`
   - Report: name is in blocklist (exit 1) or not (exit 0).

4. **Stricter scan (external skill):** If the user says "with frontmatter", "include scripts", or is reviewing a downloaded/external skill:
   - Run with `--frontmatter` and/or `--include-scripts`. For a specific folder: `--dir <path>`.
   - Example: `node scripts/scan-skill-injection.cjs --dir /path/to/skill --frontmatter --include-scripts`

5. **Regression test (fixtures):** If the user says "fixtures" or "test detector":
   - Run: `npm run scan:fixtures` or `node scripts/scan-skill-injection.cjs --dir fixtures`
   - Expected: exit 1 with hits. If exit 0, the detector regressed.

## What you do

- Run the appropriate command from the **package root** (where `scripts/` and `package.json` live). Capture stdout/stderr.
- Summarize: number of files scanned, exit code, and if there are hits list them (file:line [id] and short snippet). Run the command yourself; do not ask the user to run it.

## Reference

- Patterns and options: `docs/skill-prompt-injection.md`
- ClawHavoc context and blocklist: `docs/clawhavoc-reference.md`
