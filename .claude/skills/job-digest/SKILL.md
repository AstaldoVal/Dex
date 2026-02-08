---
name: job-digest
description: Fetch new job search digest (LinkedIn from email + Remotive, WWR, RemoteOK, JobsCollider RSS). Run with /job-digest. Optionally specify "только LinkedIn" / "only email" or "только RSS" / "only RSS" to run one source.
---

# Job Digest — Fetch New Vacancy Digest

**Command:** `/job-digest`

Fetches the latest job digest: LinkedIn (from email) plus **Remotive, WWR, RemoteOK, JobsCollider** (RSS), **Foorilla** (scrape: foorilla.com/hiring/), and **BettingJobs** (iGaming Product, remote via scrape). Writes markdown to `00-Inbox/Job_Search/digests/`. BettingJobs is saved in a separate file `digests/bettingjobs-YYYY-MM-DD.md`; the rest merge into the main digest. Pipeline runs sequentially: digest (email + RSS + Foorilla + BettingJobs) → filter (LinkedIn only) → summaries → Teal.

## When You Run This Command

1. **Default:** Run single command that does all steps and skips what’s already done: `npm run job-digest`.
2. **Only LinkedIn (from email):** If the user says "только LinkedIn", "только почта", "only email", or "linkedin only" → run `npm run job-digest -- --linkedin` or `npm run job-search:email`.
3. **Only RSS (no email):** If the user says "только RSS", "only RSS", or "rss only" → run `npm run job-digest -- --rss` or `npm run job-search:rss-only` / `npm run job-search:rss`. iGaming-only RSS: `npm run job-search` (JobsCollider, filtered). See `.claude/reference/job-digest-rss-verify.md`.
4. **One or more sources:** Run `npm run job-digest -- --remotive --foorilla` (or any combination of source flags). See "Source flags" below.

## One command: job-digest

**`npm run job-digest`** runs the full pipeline and **skips steps that are already done**:

- **Step 1 (parser):** Skip if today’s digest exists and has job lines; otherwise parse email and write digest.
- **Step 2 (filter):** If filter state is complete, apply it. If not, use **Dex LinkedIn extension** (no Playwright): pipeline generates an HTML with job links; user opens links in browser, extension captures each page; user clicks "Export for Dex", saves JSON to `00-Inbox/Job_Search/data/dex-linkedin-export-YYYY-MM-DD.json`; re-run `npm run job-digest` to apply export. Extension: `.scripts/job-search/dex-linkedin-extension/` (load unpacked in Chrome).
- **Step 3 (summaries):** 3a) Job descriptions from the same extension export (no Playwright); if export exists, inject into `data/jobs/<id>.json`. Set `SKIP_LINKEDIN_DESCRIPTIONS=1` to skip 3a. 3b) Inject resume summary under each job that has description; skip if all have a summary block.
- **Step 4 (Teal):** Add **all** jobs from the digest to Teal (LinkedIn + RSS boards) with URL and description via `add-digest-jobs-to-teal-playwright.cjs --app`. Close Chrome before running; see `.claude/reference/job-digest-teal-sync.md`.

## What You Do

1. Run **`npm run job-digest`** in the project root (no confirmation).
2. If Step 2 prints "no export file": run **`npm run job-search:open-links:serve`** to open the digest page in Chrome; click **Start auto-capture** in the Dex extension (it will open each job link in turn in the same tab; wait until done), then click "Export for Dex", save the JSON to `00-Inbox/Job_Search/data/`, and run **`npm run job-digest`** again.
3. Capture stdout/stderr. Report which steps ran, which were skipped, and where the digest and Teal output are.

## Source flags

Запуск только выбранных источников (без флагов — все источники):

- `--linkedin` — LinkedIn (парсер писем)
- `--remotive` — Remotive (Product + PM)
- `--wwr` — We Work Remotely
- `--remoteok` — RemoteOK
- `--jobscollider` — JobsCollider (Product + PM)
- `--foorilla` — Foorilla (scrape)
- `--bettingjobs` — BettingJobs (iGaming Product)
- `--rss` — группа: remotive + wwr + remoteok + jobscollider (без Foorilla)

Примеры: `npm run job-digest -- --linkedin`, `npm run job-digest -- --remotive --foorilla`, `npm run job-digest -- --rss --bettingjobs`.

## Commands Reference

- **Full pipeline, skip done (default):** `npm run job-digest`
- **Parser only:** `npm run job-search:step1`
- **Filter from extension export:** `npm run job-search:step2` or `npm run job-search:filter-from-export`
- **Generate job links (open in browser):** `npm run job-search:open-links`
- **Inject descriptions from export:** `npm run job-search:inject-from-export`
- **Summaries report:** `npm run job-search:step3`
- **Teal HTML:** `npm run job-search:step4`
- **LinkedIn from email:** `npm run job-search:email`
- **RSS only (merge into digest):** `npm run job-search:rss`
- **RSS only (separate file):** `npm run job-search:rss-only`
- **iGaming/PM RSS (JobsCollider):** `npm run job-search`
- **BettingJobs (iGaming Product, remote):** `npm run job-search:bettingjobs`

Do not prompt for confirmation before running; execute and report the result.

## Remote-only filter (user preference)
If `System/user-profile.yaml` has `job_search.consider_only_remote: true`, when **presenting** digest entries (e.g. listing jobs, answering "which are remote"), exclude or clearly mark as non-remote any job whose description or snippet indicates on-site: e.g. "based in [Country/City]" without "Remote" in the same context, "relocate to", "on-site", "office-based". Do not exclude if it says "Remote", "Malta, Remote", etc. See CLAUDE.md → Job digest: remote-only filter.

## Teal

Step 4 adds each digest job to Teal (job tracker) with description. If you prefer to open job URLs in the browser and save via the Teal extension instead, run: `node .scripts/job-search/open-digest-jobs-for-teal.cjs --html` and open the generated HTML in Chrome. See `.claude/reference/job-digest-teal-sync.md`.
