# Scan Skill Injection

Scanner for Agent Skills (SKILL.md) and related files: detects prompt-injection patterns, supply-chain risks (e.g. Prerequisites with `curl | bash`), hidden comments with external requests, obfuscation, and known C2/exfil indicators. Use in CI or for manual review of skill registries and local skill folders.

**Requirements:** Node.js 16+. No dependencies (uses only `fs` and `path`).

---

## Quick start

```bash
git clone https://github.com/AstaldoVal/scan-skill-injection.git
cd scan-skill-injection
npm run scan              # scan ./skills (create the folder and add SKILL.md files to scan)
npm run scan:fixtures     # run regression test (expect exit 1)
```

To scan a custom directory:

```bash
node scripts/scan-skill-injection.cjs --dir /path/to/your/skills
```

- **Exit 0:** No patterns found.
- **Exit 1:** One or more hits; review each in context (file:line, pattern id, snippet).

---

## Automatic check when you install a skill

Run the **watcher** once (e.g. in a terminal or as a background service). After that, every new or changed skill in your skills directory is scanned automatically — no extra commands or parameters.

```bash
npm run watch
```

Leave the process running. It watches `skills/` (or pass `--dir <path>` to watch another directory). On any change it runs the scanner with `--newer-than 1 --frontmatter --include-scripts`. If the scanner finds issues, it prints them to the console.

- **Cursor:** `node scripts/watch-and-scan.cjs --dir .cursor/skills`
- **Other:** default is `skills/`; override with `--dir <your-skills-path>`.

---

## Usage by vendor / environment

### Cursor (IDE with rules and skills)

Skills and rules live under `.cursor/` or your project’s skill directory. Point the scanner at that folder:

```bash
node scripts/scan-skill-injection.cjs --dir .cursor/skills
# or
node scripts/scan-skill-injection.cjs --dir .cursor/rules
```

Use `--include-scripts` if skill directories contain `.sh`/`.py`/`.js` you want to scan.

### Claude (Anthropic) / AgentSkills

If you keep AgentSkills-format skills in a directory (e.g. `skills/` with one subfolder per skill, each containing `SKILL.md`):

```bash
node scripts/scan-skill-injection.cjs --dir skills --frontmatter
```

For skills downloaded from a registry (e.g. ClawHub), run a stricter check before installing:

```bash
node scripts/scan-skill-injection.cjs --check-name <skill-name>
node scripts/scan-skill-injection.cjs --dir /path/to/downloaded/skill --frontmatter --include-scripts
```

### OpenClaw / ClawHub

**When installing a skill:** Check the name, then scan the skill folder (run both; if the name is blocklisted, do not install):

```bash
node scripts/scan-skill-injection.cjs --check-name <skill-name>   # exit 1 = blocklisted
node scripts/scan-skill-injection.cjs --dir /path/to/cloned/skill --frontmatter --include-scripts
```

To verify **only newly installed** skills (e.g. after installing several at once), scan directories modified in the last N minutes:

```bash
node scripts/scan-skill-injection.cjs --dir skills --newer-than 10 --frontmatter --include-scripts
```

Optionally verify the skill at [Clawdex (Koi Security)](https://clawdex.koi.security).

### Generic Node / CI

From the repo root:

```bash
# Scan a directory of skills (default: ./skills)
node scripts/scan-skill-injection.cjs [--dir <path>] [--verbose]

# Regression test (must exit 1)
node scripts/scan-skill-injection.cjs --dir fixtures
```

Example GitHub Actions step:

```yaml
- name: Clone scan-skill-injection
  uses: actions/checkout@v4
  with:
    repository: AstaldoVal/scan-skill-injection
    path: scan-skill-injection
- name: Scan skills
  run: |
    node scan-skill-injection/scripts/scan-skill-injection.cjs --dir ./my-skills
  # Fail the job if scanner finds something (exit 1)
```

---

## Options

| Option | Description |
|--------|-------------|
| `--dir <path>` | Directory to scan (default: `skills`). |
| `--newer-than <minutes>` | Scan only skill subdirectories modified in the last N minutes (for verifying newly installed skills). |
| `--verbose` | Print file count when clean. |
| `--no-comments` | Skip hidden HTML-comment check. |
| `--no-prereqs` | Skip Prerequisites/Installation block check. |
| `--frontmatter` | Check YAML frontmatter (missing license, name/description mismatch). |
| `--include-scripts` | Also scan `.sh`, `.py`, `.js`, `.cjs` in each skill directory. |
| `--check-name <name>` | Check skill name against known malicious list; exit 1 if listed. |

---

## What it detects

- **Prompt-injection phrases:** ignore/override instructions, role override, hidden/secret instructions, never reveal.
- **Hidden comments:** HTML `<!-- ... -->` containing URLs or fetch/curl/wget/request.
- **Prerequisites/Installation:** `curl | bash`, `wget | sh`, `bash -c "$(curl ...)"`, `unzip -P`, `./setup.sh`, glot.io, raw IP URLs, AuthTool/openclaw-agent.exe, password-protected zip.
- **Obfuscation:** `base64 -d | bash`, `exec(base64.b64decode(...))`, `eval(curl ...)`.
- **C2/exfil:** Known IPs and ports (ClawHavoc), webhook.site.
- **Blocklist:** Known malicious skill names (ClawHavoc campaign).

See `docs/skill-prompt-injection.md` and `docs/clawhavoc-reference.md` for pattern details and references.

---

## Test fixtures

The `fixtures/` directory contains sample SKILL.md files that trigger the detector. Use for regression after changing the script:

```bash
node scripts/scan-skill-injection.cjs --dir fixtures
```

Expected: exit 1 with at least one hit per fixture. If exit 0, the detector regressed.

---

## Safe-add workflow (external skills)

When adding a community skill from a registry:

1. Check the name: `node scripts/scan-skill-injection.cjs --check-name <skill-name>`
2. Download the skill to a folder and run: `node scripts/scan-skill-injection.cjs --dir <path> --frontmatter --include-scripts`
3. Review SKILL.md manually (Prerequisites, any “run this command”).
4. Optionally check the skill at [clawdex.koi.security](https://clawdex.koi.security).

---

## License

MIT. See [LICENSE](LICENSE).
