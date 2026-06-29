# GrowthBook experiment automation (Dex reference)

**Standalone repo:** https://github.com/AstaldoVal/growthbook-automation  
**Local path:** `04-Projects/Vegas_Bonanza/growthbook-automation`

From vault root:

```bash
npm run growthbook:create-experiment -- [--input 04-Projects/Vegas_Bonanza/growthbook-automation/examples/exp_002.json] [--dry-run] [--yes] [--no-datasource]
```

Slash: `/growthbook-create-experiment`

Implementation: `04-Projects/Vegas_Bonanza/growthbook-automation/src/create-experiment.cjs`

## Flow

1. `POST /api/v2/features` — dev-only by default
2. `POST /api/v1/experiments` — draft, `userId`, hash v2
3. `POST /api/v2/features/{id}/revisions/new/rules` — experiment-ref
4. Publish revision

## Env (vault `.env`)

- `GB_API_KEY`, `GB_PROJECT_ID` — required for live
- `GB_ENVIRONMENTS=dev`
- `GB_DATASOURCE_ID` — optional; omit with `--no-datasource`

## Naming

EXP-NNN display name → snake_case feature key (max 50 chars).

Full docs: `04-Projects/Vegas_Bonanza/growthbook-automation/README.md`

## Example input

`04-Projects/Vegas_Bonanza/growthbook-automation/examples/exp_002.json`
