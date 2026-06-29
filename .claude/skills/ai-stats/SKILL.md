---
name: ai-stats
description: Daily OpenAI API usage and quality stats. Shows requests, tokens, cost estimate, eval scores, truncation risk, and problem patterns.
---

# AI Stats — OpenAI Usage & Quality

**Command:** `/ai-stats`

View daily OpenAI API usage: requests by operation, token counts, cost estimate, average eval score, truncation risk, and recent problem patterns (low eval, bad eval_notes).

## When You Run This Command

The user wants to:
- See how much OpenAI is used per day and per operation
- Understand cost by operation
- Spot quality issues (low eval_score, recurring eval_notes)
- Spot truncation risk (completion near limit)

## Workflow

1. **Run the summary script** from repo root:
   ```bash
   npm run openai-usage-summary
   ```
   Default: last 7 days. User can ask for more: e.g. "last 30 days" → add `-- --days 30`.

2. **Show the output** in chat (the script prints human-readable totals, by-day breakdown, by-operation, cost estimate, and truncation_risk count).

3. **Optional: surface problems**
   - If user asks "where are the problems" or "low quality": run `npm run openai-usage-summary -- --json` and from the JSON find entries with `eval_score` &lt; 70 or `truncation_risk: true`, group by `eval_notes`, and list recent examples (date, operation, request_id, eval_notes, score).
   - Or run a one-off read of `System/openai-usage/*.jsonl` for today/yesterday and filter low eval / truncation_risk, then summarize.

4. **Optional: cost by operation**
   - The summary script already includes cost per day and per operation when `--json` is used; in human-readable mode it shows total cost. If user asks "what costs the most", highlight the operation with highest cost from the summary.

## Output to Present

- Total requests and tokens (prompt, completion, total) over the period
- Cost estimate (USD) total and by operation
- Average eval score (and by operation if available)
- Truncation risk count (calls where completion was ≥80% of limit)
- By operation: requests, tokens, cost, avg eval
- If problems: recent low-eval or truncation_risk entries with request_id and eval_notes

## Files

- `System/openai-usage/YYYY-MM-DD.jsonl` — raw log (one JSON object per line)
- `.scripts/openai-usage-daily-summary.cjs` — aggregation and cost
- `System/openai-usage/openai-pricing.json` — price table (update from OpenAI docs)
- `.claude/reference/openai-usage-logging.md` — schema and eval criteria

## Example

**User:** `/ai-stats`  
**You:** Run `npm run openai-usage-summary`, show the printed report, highlight total cost and any truncation_risk or low avg eval.

**User:** `/ai-stats last 30 days`  
**You:** Run with `-- --days 30`, show report.

**User:** `/ai-stats what's wrong`  
**You:** Run summary with `--json`, find low eval_score or truncation_risk, list by eval_notes and suggest fixes (e.g. "em_dash: avoid em dash in summaries", "increase max_tokens for job_summary").
