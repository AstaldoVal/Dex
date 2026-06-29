# Prompt injection in skill files

**Purpose:** Detect whether a skill file (SKILL.md or referenced .md) contains prompt-injection-like content that could manipulate the model when the skill is loaded.

---

## What counts as prompt injection in skills

**Prompt injection** here: instructions inside a skill that try to override system behavior, bypass constraints, or make the model behave differently from what the system intends.

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

- "you are now (in )?(developer|admin|jailbreak) mode"
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

**5. Delimiters used to "inject"**

- Fake system blocks, e.g. `<system>...</system>` or `### System:` with content that says "ignore everything else" or "you are now X".
- Instructions that say "everything between X and Y is your real prompt" or "your/below is your real prompt".

**6. Hidden comments and external requests**

- **HTML comments in Markdown** (`<!-- ... -->`): content is hidden from normal view. If such a comment contains a URL (`http://` or `https://`) or a request-like verb (`fetch(`, `axios.`, `curl`, `wget`, `request(`), it could be used to pull payloads from outside or exfiltrate data. Flag for review.
- **Code comments** (in .js, .cjs, .py, .sh under skill dirs): comments that contain full URLs to non-whitelisted hosts, or that look like executable request code. Legitimate doc links (e.g. agentskills.io, github.com/...) are usually fine; unknown or parameterized URLs are suspicious.
- **Obfuscation**: base64 in comments, encoded URLs, or "paste this in console" snippets that perform network requests.

The scanner flags URLs/requests that appear **inside** HTML comments (`<!-- ... -->`). Visible links in the skill (body text or code blocks) are not reported. Known doc hosts can be treated as benign when reviewing.

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

- Run the scanner on all SKILL.md (and optionally referenced .md or scripts) for the red-flag patterns.
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

## Scanner coverage

The script includes:

- **Prompt-injection patterns** (instruction override, role override, hidden/secret instructions).
- **Hidden comments with external requests**: HTML comments whose content contains `http(s)://` or request-like calls (`fetch(`, `axios.`, `curl`, `wget`, `request(`).
- **Prerequisites/Installation**: curl|bash, wget|sh, bash -c "$(curl", unzip -P, setup.sh, glot.io, raw IP URL, AuthTool/openclaw-agent.exe, password-protected zip.
- **Obfuscation**: base64 -d | bash, exec(base64.b64decode), eval(curl), echo ... | base64 -d | bash.
- **C2/exfil**: Known IPs and ports (ClawHavoc), webhook.site.
- **Blocklist**: Known malicious skill names for `--check-name`.

See `docs/clawhavoc-reference.md` for attack context and blocklist source.

---

## Test fixtures

The repo includes sample SKILL.md files that trigger the detector for regression testing:

- `fixtures/injection/SKILL.md` — prompt-injection phrase
- `fixtures/prereqs/SKILL.md` — Prerequisites + curl | bash
- `fixtures/obfuscation/SKILL.md` — base64 -d | bash

Run from package root:

```bash
node scripts/scan-skill-injection.cjs --dir fixtures
```

Expected: exit code 1 with at least one hit per fixture. If exit 0, the detector regressed.

---

## Optional checks

- **`--frontmatter`** — Check YAML frontmatter: missing `license`, and name/description mismatch (e.g. name like `yahoo-finance` but description says "install system prerequisites"). Use when reviewing skills from external sources.
- **`--include-scripts`** — Also scan `.sh`, `.py`, `.js`, `.cjs` in each skill directory with the same patterns (obfuscation, C2/exfil, prereqs-style commands). Catches hidden code in scripts.

---

## Safe-add workflow (external skill)

When adding a community skill from a registry:

1. Check the name: `node scripts/scan-skill-injection.cjs --check-name <skill-name>`
2. Download or clone the skill into a temp folder, then run: `node scripts/scan-skill-injection.cjs --dir /path/to/skill --frontmatter --include-scripts`
3. If the scanner reports nothing, still skim SKILL.md (Prerequisites, any "run this command").
4. Optionally check the skill on https://clawdex.koi.security before installing.

---

## Summary

- Detect prompt-injection-like content in skill files by:
  1. Using this reference (red-flag patterns + benign vs suspicious).
  2. Running the scanner and reviewing every match in context.
  3. Doing a quick manual check when writing or editing skills.
- Detection is **heuristic**: the same phrase can be safe in one place and dangerous in another. Human review of scanner output is required.
