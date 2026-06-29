# Full Flow v2

Полный дубликат **Full Flow v1** (`run-full-linkedin-teal-flow.cjs`), изолирован для правок под новый интерфейс Teal.

## Отделение от v1

| v1 | v2 |
|----|-----|
| `npm run job-search:full-flow` | `npm run job-search:full-flow-v2` |
| `00-Inbox/Job_Search/teal/full-flow-state.json` | `00-Inbox/Job_Search/teal/full-flow-v2/full-flow-state.json` |
| `[@flow-step]` в логе | `[@flow-step-v2]` |
| Общие шаги 6–10 пишут evidence в `teal/` | При v2 в env `JOB_SEARCH_TEAL_FLOW_DIR` → `teal/full-flow-v2/` |

LinkedIn data (`data/`, `digests/`) общие с v1. Менять селекторы и UI-логику в **копиях** в этой папке или в дочерних скриптах по мере адаптации.

## Applicator Step 9 (parallel sub-agents)

| Script | Role |
|--------|------|
| `applicator-resume-review.cjs` | Step 9 entry; rounds + eval |
| `applicator-claude-orchestrator-brief.cjs` | Main agent: JD brief for sub-agents |
| `applicator-parallel-resume-review.cjs` | Fan-out + merge |
| `applicator-claude-section-subagent.cjs` | One block / one company |
| `applicator-claude-resume-review.cjs` | Legacy monolithic (all blocks in one call) |

Env: `APPLICATOR_REVIEW_MODE=parallel` (default) | `monolithic`; `APPLICATOR_PARALLEL_CONCURRENCY=8`.

### LLM provider (HIR-156)

| Env | Default | Meaning |
|-----|---------|---------|
| `APPLICATOR_LLM_PROVIDER` | `cli` | `cli` = local `claude -p`; `api` = Applicator `apps/api` Anthropic proxy |
| `APPLICATOR_API_URL` | `http://localhost:8000` | API base (staging: Cloud Run URL) |
| `ANTHROPIC_API_KEY` | — | Required in `apps/api/.env` for API path |
| `APPLICATOR_INTERNAL_API_KEY` | — | Optional gate for `/api/v1/optimization/*` |

Module: `applicator-anthropic-llm.cjs` · API routes: `apps/api/app/routers/optimization.py`

### Cost routing (Genufit v1 / HIR-80)

| Lever | Env / default |
|-------|----------------|
| Model routing | Haiku: skills, education, certs, contact, title, projects, interests. Sonnet: professional_summary + top-N WX companies |
| WX company cap | `APPLICATOR_WX_COMPANY_CAP=3` |
| Eval rounds | `APPLICATOR_REVIEW_MAX_ROUNDS=1`, hard cap `APPLICATOR_REVIEW_MAX_ROUNDS_CAP=2` |
| Short-CV fallback | `<3` employers → monolithic Sonnet (`APPLICATOR_SHORT_CV_COMPANY_THRESHOLD=3`) |
| Orchestrator model | `APPLICATOR_ORCHESTRATOR_MODEL=haiku` |
| Monolithic model | `APPLICATOR_MONOLITHIC_MODEL=sonnet` |
| Force parallel | `APPLICATOR_FORCE_PARALLEL=1` (skip short-CV fallback) |

Module: `applicator-cost-routing.cjs`. Telemetry: `step-9-cost-telemetry.json`, `optimization_cogs_usd` in `step-9-evidence.json`.

Tests: `npm run job-search:test-applicator-cost-routing` · `npm run job-search:test-applicator-parallel-merge`

## Команды (корень DEX)

```bash
npm run job-search:full-flow-v2 -- "<linkedin-url>"
npm run job-search:full-flow-v2 -- --from-text "00-Inbox/Job_Search/pasted-job.md"
npm run job-search:full-flow-v2-total-ms
npm run job-search:wait-full-flow-v2-progress -- --once
npm run job-search:full-flow-v2-parallel -- -- job1.md job2.md
```

Документация шагов: `.claude/reference/job-search-full-flow-v2-steps.md`  
Skill: `.claude/skills/full-flow-v2/SKILL.md` · slash: `/full-flow-v2`
