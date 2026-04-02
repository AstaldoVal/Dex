# Test fixtures for injection detector

These SKILL.md files trigger the scanner for regression testing.

- `injection/SKILL.md` — prompt-injection phrase
- `prereqs/SKILL.md` — Prerequisites + curl | bash
- `obfuscation/SKILL.md` — base64 -d | bash

Run from package root:

```bash
node scripts/scan-skill-injection.cjs --dir fixtures
```

Expected: exit code 1 with at least one hit per fixture. If exit 0, the detector regressed.
