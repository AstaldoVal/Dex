# OpenAI usage logging and quality metrics

All OpenAI API calls in Dex are logged to `System/openai-usage/YYYY-MM-DD.jsonl` (one JSON object per line). Same format is used by Python (job_digest, cover-letter) and Node (vision, TTS, meeting_intel).

## What is logged per call

- **ts** — UTC timestamp
- **operation** — `job_summary` | `cover_letter` | `vision_skills` | `tts` | `meeting_intel`
- **model** — e.g. `gpt-5.2`, `gpt-4o`, `tts-1-hd`
- **prompt_tokens**, **completion_tokens**, **total_tokens** — from API (null for TTS)
- **max_tokens_limit** — configured limit for the call
- **request_id** — groups calls (e.g. company + job title for one resume)
- **iteration** — 1-based within one API request: 1 = first draft, 2 = revision (e.g. compliance rewrite)
- **summary_round** — 1..5 when from match-score: which round of the summary loop (up to 5 attempts per resume)
- **eval_score** — 0–100 quality score (see below)
- **eval_notes** — short reason (e.g. `ok`, `em_dash`, `revision`). Used to auto-avoid in next round (see Eval feedback).
- **input_chars** — for TTS, characters per chunk
- **fallback_used** — true if e.g. gpt-4o-mini was used after gpt-4o failed
- **truncation_risk** — true when completion_tokens ≥ 80% of max_tokens_limit (possible truncation)

## Eval criteria (current)

- **job_summary:** paragraphs count, presence of `---SUGGESTED_QUESTIONS---`, no em dash, length, for AI type no compliance/Pin-Up.
- **cover_letter:** paragraphs, no em dash, length, no banned phrase.
- **vision_skills:** valid JSON, non-empty red/yellow/green arrays.

## Daily stats

```bash
npm run openai-usage-summary           # last 7 days, human-readable
npm run openai-usage-summary -- --days 30
npm run openai-usage-summary -- --json # machine-readable
```

Output: requests per day and per operation, token totals, **cost estimate (USD)**, average eval score, **truncation_risk count**, iterations/summary_round.

**Command:** `/ai-stats` — runs the summary and surfaces problems (low eval, truncation). See `.claude/skills/ai-stats/SKILL.md`.

## Eval feedback (auto-avoid in next round)

For **job_summary** in match-score: when generating round 2..5, the script reads the last `eval_notes` for this `request_id` from today's log and passes them as `previous_eval_notes` into the prompt. The model is instructed to avoid those issues (e.g. "em_dash", "forbidden_ai", "no_questions"). So problem patterns are automatically avoided in subsequent iterations.

## Cost estimate

Prices are in `System/openai-usage/openai-pricing.json` (per 1M tokens or per 1M chars for TTS). Update from [OpenAI Pricing](https://platform.openai.com/docs/pricing). The daily summary script computes cost per entry and totals by day and by operation.

## Truncation risk

Logged when `completion_tokens >= 0.8 * max_tokens_limit`. Surfaces in daily summary as `truncation_risk` count; consider raising the limit for that operation if frequent.

## Ideas for additional quality metrics

- **job_summary:** keyword overlap with JD (red/yellow phrases from Teal matched in summary), length of suggested_questions list.
- **cover_letter:** sentiment/formal tone check, presence of company/role name.
- **vision_skills:** compare with DOM-extracted skills when both exist; flag mismatches.
- **Latency:** optional log of request duration to spot slow or failing calls.
