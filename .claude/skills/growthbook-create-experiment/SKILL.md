---
name: growthbook-create-experiment
description: Create GrowthBook EXP-NNN feature flag, draft experiment, and experiment-ref link. Invoke with /growthbook-create-experiment; dev-only feature, userId hash v2, optional --no-datasource.
---

# Slash: growthbook-create-experiment

**Standalone repo:** https://github.com/AstaldoVal/growthbook-automation  
**Vault path:** `04-Projects/Vegas_Bonanza/growthbook-automation`

Creates in GrowthBook:

1. Feature flag ( **dev only** by default; production/staging disabled )
2. Draft experiment ( **userId**, hash version **2** )
3. experiment-ref rule + publish revision

## When to run

User says `/growthbook-create-experiment`, asks to create a GrowthBook experiment, EXP-NNN automation, or provides partial/full experiment JSON.

## Agent workflow

1. **Working directory:** `04-Projects/Vegas_Bonanza/growthbook-automation` (from vault root) or cloned `growthbook-automation` repo.
2. **Env:** copy `GB_*` from vault `.env` or use project `.env` (`GB_API_KEY`, `GB_PROJECT_ID`). Without warehouse: `--no-datasource`.
3. **Run yourself** (foreground):

From vault root:

```bash
npm run growthbook:create-experiment -- --input 04-Projects/Vegas_Bonanza/growthbook-automation/examples/exp_002.json --dry-run --yes
```

Or from project folder:

```bash
cd 04-Projects/Vegas_Bonanza/growthbook-automation && npm run create-experiment -- --input examples/exp_002.json --dry-run --yes
```

Dry-run first unless user explicitly asked for live.

**Live without datasource:**

```bash
npm run growthbook:create-experiment -- --input 04-Projects/Vegas_Bonanza/growthbook-automation/examples/exp_098_smoke.json --no-datasource --yes
```

4. **Report:** display name, feature key, GrowthBook URLs from Summary, exit code.

## Flags

| Flag | Effect |
|------|--------|
| `--input` | Full or partial JSON |
| `--from-ticket` | Markdown with `EXP-NNN - [AREA] …` title |
| `--dry-run` | Print payloads, no API |
| `--yes` | Skip confirm + non-interactive gap fill where allowed |
| `--no-datasource` | Omit metrics; `assignmentQueryId: ""` |

## Defaults

- `GB_ENVIRONMENTS=dev`
- `hash_attribute`: `userId`
- `hash_version`: 2

## Out of scope

Creating metrics, starting/stopping experiments, enabling production (manual in GB UI).

## Tests

```bash
npm run growthbook:test
```
