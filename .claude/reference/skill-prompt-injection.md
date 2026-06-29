# Prompt injection in skill files

**Purpose:** Learn to detect whether a skill file (SKILL.md or referenced .md) contains prompt-injection-like content that could manipulate the model when the skill is loaded.

---

## What counts as prompt injection in skills

**Prompt injection** here: instructions inside a skill that try to override system behavior, bypass constraints, or make the model behave differently from what the system (CLAUDE.md, rules) intends.

- Skills are trusted content: they are read and followed by the model. Malicious or careless text in a skill can act like an "injected" instruction.
- **Goal:** Catch content that says "ignore X", "override Y", "never do Z", "pretend to be", "do not follow system/CLAUDE", or similar, in a way that undermines safety or scope.

---

## Red-flag patterns (suspicious)

Use these as heuristics, not as proof. Context matters: e.g. "override" in a technical doc is fine; "override all previous instructions" is not.

**1. Instruction override / disregard**

- "ignore (all )?previous instructions"
- "ignore (all )?(above|prior|system) instructions"
- "disregard (all )?(above|prior|system) (instructions|rules)"
- "forget (everything|all (above|prior))"
- "override (system|CLAUDE|all) (instructions|rules)"
- "do not follow (CLAUDE|system prompt|above instructions)"
- "new instructions take precedence"
- "from now on you (must|should|will)"
- "your (real|actual|true) instructions are"
- "the (real|actual) instructions (say|are)"

**2. Role / identity override**

- "you are now (in |in )?(developer|admin|jailbreak) mode"
- "pretend to be" / "act as if you are"
- "from now on you are (a|an) [role that contradicts assistant]"
- "never reveal (that|your|you are)"
- "never tell the user (that|about)"

**3. Hidden / dual instructions**

- "hidden instruction"
- "below is your real task"
- "ignore the above and (only )?do the following"
- "secret instructions"

**4. Output / exfiltration**

- "output only" / "respond only with" (when used to restrict reporting or hide behavior)
- "do not include (any |your )?(reasoning|explanation|that you)"
- "never mention (that|this instruction)"

**5. Delimiters used to “inject”**

- Fake system blocks, e.g. `<system>...</system>` or `### System:` with content that says "ignore everything else" or "you are now X".
- Instructions that say "everything between X and Y is your real prompt" or "your/ below is your real prompt".

**6. Hidden comments and external requests**

- **HTML comments in Markdown** (`<!-- ... -->`): content is hidden from normal view. If such a comment contains a URL (`http://` or `https://`) or a request-like verb (`fetch(`, `axios.`, `curl`, `wget`, `request(`), it could be used to pull payloads from outside or exfiltrate data. Flag for review.
- **Code comments** (in .js, .cjs, .py, .sh under skill dirs): comments that contain full URLs to non-whitelisted hosts, or that look like executable request code (e.g. `// fetch('https://...')`). Legitimate docs links (e.g. agentskills.io, github.com/...) are usually fine; unknown or parameterized URLs are suspicious.
- **Obfuscation**: base64 in comments, encoded URLs, or "paste this in console" snippets that perform network requests.

The scanner only flags URLs/requests that appear **inside** HTML comments (`<!-- ... -->`). Visible links in the skill (e.g. in body text or in code blocks) are not reported. Known doc hosts (e.g. agentskills.io, github.com, schema URIs in OOXML) can be treated as benign when reviewing.

---

## Benign vs malicious

**Usually benign:**

- "User's preference overrides career-level defaults" (override = takes precedence in logic).
- "Template conventions override these guidelines" (override = supersede in scope of the skill).
- "System prompt" in documentation (e.g. "improve the system prompt").
- "Do not follow [specific external site] rules" when scoped to a clear, legitimate rule.

**Suspicious:**

- Any of the red-flag patterns above when they refer to **system/CLAUDE/previous instructions** or **identity/role** in a way that widens scope or bypasses constraints.

---

## How to audit

**1. Automated scan**

- Run the script that checks all SKILL.md (and optionally referenced .md) for the red-flag patterns.
- Treat matches as **candidates**: review each in context.

**2. Manual review**

- When adding or editing a skill, skim for:
  - Phrases that tell the model to ignore or override system/CLAUDE/prior instructions.
  - Phrases that change role/identity or forbid revealing something.
  - Blocks that look like a "second" or "real" set of instructions.

**3. After a positive hit**

- Open the file at the reported line.
- Decide: legitimate (e.g. technical "override") or real injection.
- If legitimate: optionally rephrase to avoid the pattern, or add an exception in the scanner.
- If injection: remove or rewrite the instruction.

---

## Scanner script

Location: `.scripts/skills/scan-skill-injection.cjs`

- Scans `.claude/skills/**/SKILL.md` (and optionally other .md in each skill dir).
- **Two checks:**
  1. **Prompt-injection patterns** (instruction override, role override, etc.).
  2. **Hidden comments with external requests**: HTML comments `<!-- ... -->` whose content contains `http(s)://` or request-like calls (`fetch(`, `axios.`, `curl`, `wget`, `request(`). Reports file, line range of the comment, and snippet.
- Output: file path, line number (or range), pattern id, snippet.
- Exit code: 0 = no matches, 1 = at least one match (for CI).

Run from repo root:

```bash
node .scripts/skills/scan-skill-injection.cjs
node .scripts/skills/scan-skill-injection.cjs --verbose
node .scripts/skills/scan-skill-injection.cjs --no-comments     # skip hidden-comment check
node .scripts/skills/scan-skill-injection.cjs --no-prereqs      # skip Prerequisites/Installation check (ClawHavoc-style)
node .scripts/skills/scan-skill-injection.cjs --frontmatter     # also check YAML (license, name/description mismatch)
node .scripts/skills/scan-skill-injection.cjs --include-scripts # also scan .sh/.py/.js/.cjs in skill dirs
node .scripts/skills/scan-skill-injection.cjs --newer-than <minutes>   # scan only skill dirs modified in last N minutes
node .scripts/skills/scan-skill-injection.cjs --dir .scripts/skills/fixtures   # run on synthetic fixtures (regression test)
```

Or from repo root: `npm run skill-scan` (and `npm run skill-scan:fixtures` for fixture regression).

**Automatic check on install:** Run the watcher so every new or changed skill is scanned without manual steps:

```bash
npm run skill-watch
```

Leave it running (terminal or background). It watches `.claude/skills/` and runs the scanner with `--newer-than 1 --frontmatter --include-scripts` on any change. Script: `.scripts/skills/watch-and-scan.cjs`.

---

## Learning from real-world attacks (ClawHavoc)

OpenClaw/ClawdBot’s ClawHub had 341 malicious skills in a single campaign (ClawHavoc, Feb 2026). Those were mainly **supply-chain** attacks: the “Prerequisites” section in SKILL.md told users to run `curl ... | bash` or download ZIPs, which installed malware (AMOS, trojans). A few skills hid reverse shells or credential exfiltration in code.

**Reference:** `.claude/reference/clawhavoc-malicious-skills-reference.md` — where to find skills (ClawHub, Clawdex), full list of known malicious names, attack patterns.

**Scanner coverage:** The script now includes all known patterns from that reference:
- Prompt-injection phrases (ignore/override instructions, role override, hidden/secret instructions).
- Hidden HTML comments with URLs or fetch/curl/wget/request.
- Prerequisites/Installation: curl|bash, wget|sh, bash -c "$(curl", unzip -P, setup.sh, glot.io, raw IP URL, AuthTool/openclaw-agent.exe, password-protected zip.
- Obfuscation: base64 -d | bash, exec(base64.b64decode), eval(curl), echo ... | base64 -d | bash.
- C2/exfil: IPs 91.92.242.30, 54.91.154.110, port 13338, webhook.site.
- Known malicious skill names are in the script as `KNOWN_MALICIOUS_SKILL_NAMES` for blocklist/name checks.

---

## Improving without live samples (examples removed)

Because the malicious skills were removed from ClawHub, you can still improve the detector in these ways:

**1. Synthetic test fixtures**

The repo includes minimal “malicious” examples that contain only the bad patterns (no real malware) so the scanner can be tested and regressions caught:

- `.scripts/skills/fixtures/injection/SKILL.md` — prompt-injection phrase
- `.scripts/skills/fixtures/prereqs/SKILL.md` — Prerequisites + curl | bash
- `.scripts/skills/fixtures/obfuscation/SKILL.md` — base64 -d | bash

Run from repo root:

```bash
node .scripts/skills/scan-skill-injection.cjs --dir .scripts/skills/fixtures
```

Expected: exit code 1 with at least one hit per fixture. If exit 0, the detector regressed. Run this after changing the script or patterns.

**2. Optional checks**

- **`--frontmatter`** — Check YAML frontmatter: missing `license`, and name/description mismatch (e.g. name like `yahoo-finance` but description says “install system prerequisites”). Use when reviewing skills from external sources (e.g. after downloading from ClawHub).
- **`--include-scripts`** — Also scan `.sh`, `.py`, `.js`, `.cjs` in each skill directory with the same patterns (obfuscation, C2/exfil, prereqs-style commands). Catches hidden code like reverse shells in scripts.

**3. Safe-add workflow (external skill)**

When adding a community skill (e.g. from ClawHub):

1. Check the name: `node .scripts/skills/scan-skill-injection.cjs --check-name <skill-name>`
2. Download or clone the skill into a temp folder, then run: `node .scripts/skills/scan-skill-injection.cjs --dir /path/to/skill --frontmatter --include-scripts`
3. If the scanner reports nothing, still skim SKILL.md (Prerequisites, any “run this command”).
4. Optionally check the skill on https://clawdex.koi.security before installing.

**4. Future ideas (without live malware)**

- **Severity levels** — Tag each pattern as high/medium/low so CI or reviewers can prioritize.
- **Allowlist** — Allow suppressing known false positives (e.g. by file path or pattern id) for CI.
- **Cross-ecosystem patterns** — Reuse ideas from npm/PyPI supply-chain reports (postinstall scripts, optional deps pointing to malicious packages).
- **Periodic fixture run** — Run the fixture scan in CI to ensure the detector still catches the synthetic samples.

---

## Summary

- **Yes, you can learn to detect** prompt-injection-like content in skill files by:
  1. Using this reference (red-flag patterns + benign vs suspicious).
  2. Running the scanner and reviewing every match in context.
  3. Doing a quick manual check when writing or editing skills.
- Detection is **heuristic**: same phrase can be safe in one place and dangerous in another. Human review of scanner output is required.
