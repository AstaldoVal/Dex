---
name: linkedin-trends
description: Analyse LinkedIn AI topic trends: show top themes, emerging topics, engagement insights. Run pipeline or read latest report. Use before writing any LinkedIn post.
---

## Purpose

Show what AI topics are performing best on LinkedIn right now — by engagement score (likes, comments, reposts). Provides actionable context for writing posts that are likely to get traction.

## Usage

- `/linkedin-trends` — show the latest trends summary from the most recent digest.
- `/linkedin-trends run` — run the full pipeline (capture → aggregate → analyze → report → dashboard). Takes ~15-20 minutes (browser capture per hashtag).
- `/linkedin-trends run aggregate` — run only aggregate+analyze+report (use existing capture files).

---

## Step 1: Check for Existing Data

Read the context snapshot (fast path — no pipeline needed):

```
00-Inbox/LinkedIn_Trends/trends-context.json
```

If this file exists and `generatedAt` is within the last 7 days, show the summary directly (Step 3). Otherwise, offer to run the pipeline.

---

## Step 2: Run the Full Pipeline (when requested or data is stale)

### Full run (capture + all steps):
```bash
npm run linkedin-trends:full
```
This runs all 5 steps in sequence. Chrome must be open with the Dex extension loaded. Takes ~15-20 min (90s pause between each hashtag).

### Skip capture (reuse existing files):
```bash
npm run linkedin-trends:aggregate && npm run linkedin-trends:analyze && npm run linkedin-trends:report && npm run linkedin-trends:dashboard
```

### Individual steps:
- `npm run linkedin-trends:capture` — open Chrome for each hashtag in config.json, wait for capture files
- `npm run linkedin-trends:aggregate` — deduplicate and score posts from raw JSON
- `npm run linkedin-trends:analyze` — LLM batch analysis via OpenAI GPT-4o-mini (requires OPENAI_API_KEY)
- `npm run linkedin-trends:report` — generate MD digest to `00-Inbox/LinkedIn_Trends/digests/`
- `npm run linkedin-trends:dashboard` — generate interactive HTML to `00-Inbox/LinkedIn_Trends/dashboard/index.html`

### Fetch Taplio trending topics (lightweight, no browser):
```bash
npm run linkedin-trends:taplio
```
Fetches `taplio.com/trending`, parses topic list, saves to `00-Inbox/LinkedIn_Trends/data/taplio-trends-YYYY-MM-DD.json`. Safe to run daily — skips if already fetched within 6 hours.

### Install weekly scheduler (Sunday 09:00, includes Taplio fetch):
```bash
npm run linkedin-trends:scheduler
```

### Install Taplio daily scheduler (every day 09:15, no browser needed):
```bash
npm run linkedin-trends:taplio-scheduler
```
Installs `com.dex.taplio-trends` launchd job. Runs `fetch-taplio-trends.cjs` every day at 09:15. Log: `00-Inbox/LinkedIn_Trends/taplio-scheduler.log`. To uninstall: `launchctl unload ~/Library/LaunchAgents/com.dex.taplio-trends.plist && rm ~/Library/LaunchAgents/com.dex.taplio-trends.plist`.

---

## Step 3: Present the Trends Summary

Read `00-Inbox/LinkedIn_Trends/trends-context.json` and present as:

**Top 5 Topics This Week (by avg engagement):**
For each: topic name, avg engagement score, top format, top tone.

**Emerging Topics:**
Topics growing 30%+ or newly appearing this week.

**Taplio Trending (last 7 days):**
Topics that appeared in Taplio's daily top rankings most frequently. These are platform-wide trends, not restricted to AI hashtags. Show top 5 with day count out of 7.

**Suggested New Hashtags:**
Hashtags found in high-engagement posts not yet tracked in config.json.

**Recommendation:**
One concrete post idea based on the #1 topic and most effective format. Cross-reference with Taplio data: if the same topic appears in both LinkedIn capture and Taplio, flag it as a strong signal.

---

## Step 4: Integrate with /linkedin-posting

When the user runs `/linkedin-posting` or asks to write a LinkedIn post, automatically load `trends-context.json` if it exists and the data is fresher than 14 days. Prepend a brief note:

> **Trend context (Week YYYY-WW):** Top topic: [topic] — [avg engagement]. Format that works: [format].

This happens silently — do not interrupt the posting flow. Just add the trend context at the top of your post guidance.

---

## Config: Manage Tracked Hashtags

Config file: `.scripts/linkedin-trends/config.json`

- Add new hashtags to `hashtags` array with `"status": "active"` or `"status": "testing"`.
- Set `"status": "paused"` to skip a hashtag without deleting it.
- `discoveredHashtags` — auto-populated by `analyze-trends.cjs` with suggestions.

To add a suggested hashtag permanently after reviewing:
1. Read config.json
2. Move the tag from `discoveredHashtags` to `hashtags` with `"status": "testing"`
3. After 2 weeks, set to `"active"` if it's producing good data.

Initial seed hashtags: #ai, #llm, #genai, #artificialintelligence, #chatgpt, #machinelearning, #aiagents, #promptengineering.

---

## Data Files Reference

- `00-Inbox/LinkedIn_Trends/data/dex-linkedin-trend-YYYY-MM-DD-<hashtag>.json` — raw capture per hashtag
- `00-Inbox/LinkedIn_Trends/data/posts-aggregate-YYYY-MM-DD.json` — deduplicated posts with engagement scores
- `00-Inbox/LinkedIn_Trends/data/posts-analyzed-YYYY-MM-DD.json` — LLM-annotated with topic, format, tone clusters
- `00-Inbox/LinkedIn_Trends/data/taplio-trends-YYYY-MM-DD.json` — daily Taplio topic snapshot (fetched daily at 09:15)
- `00-Inbox/LinkedIn_Trends/digests/trends-YYYY-WW.md` — weekly digest report (includes Taplio section)
- `00-Inbox/LinkedIn_Trends/dashboard/index.html` — interactive Chart.js dashboard (includes Taplio card)
- `00-Inbox/LinkedIn_Trends/trends-context.json` — compact context snapshot for skill integration (includes `taplio.top5Topics`)
- `00-Inbox/LinkedIn_Trends/taplio-scheduler.log` — daily Taplio fetch log

---

## Troubleshooting

**Capture file not appearing:** Chrome must be open with the Dex extension installed and active. The save-server starts automatically; check `00-Inbox/LinkedIn_Trends/dex-save-server.log` if issues persist.

**OpenAI errors:** Check OPENAI_API_KEY in `.env`. The analyze script uses `gpt-4o-mini` with automatic retry (3 attempts per batch).

**No data for a hashtag:** LinkedIn may not have content matching the search on that day. Check the raw capture file; if `posts: []`, the search returned no results.

**Taplio shows 0 topics / "page structure changed":** Taplio may have updated their frontend. The script exits gracefully (exit 0) so the rest of the pipeline is unaffected. Check the stub `taplio-trends-YYYY-MM-DD.json` for the `parseError` field. The HTML parsing has three fallback strategies (Next.js JSON, H2 sections, plain text) — if all fail, the stub is saved and the dashboard shows an informational message.

**Daily Taplio fetch not running:** Check `~/Library/LaunchAgents/com.dex.taplio-trends.plist` exists. Run `launchctl list | grep taplio` to confirm it is loaded. Re-run `npm run linkedin-trends:taplio-scheduler` to reinstall.
