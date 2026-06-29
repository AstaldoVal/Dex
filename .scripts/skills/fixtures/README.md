# Synthetic test fixtures for injection detector

These SKILL.md files contain **only** the bad patterns (no real malware). Used to verify the scanner still catches them after changes.

- `injection/SKILL.md` — prompt-injection phrase
- `prereqs/SKILL.md` — Prerequisites + curl | bash
- `obfuscation/SKILL.md` — base64 -d | bash

Run from repo root:

```bash
node .scripts/skills/scan-skill-injection.cjs --dir .scripts/skills/fixtures
```

Expected: exit code 1 with at least one hit per fixture. If exit 0, the detector regressed.
