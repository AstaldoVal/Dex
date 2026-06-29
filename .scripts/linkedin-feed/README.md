# LinkedIn Feed (Dex)

- Purpose:
  - Capture and summarise recent LinkedIn posts from selected people (allowlist + “watchlist” based on profiles you opened).
  - Output is an MD list of post links (no auto-comments).

- Capture (profiles -> recent posts JSON):
  - Run: `npm run linkedin-interest:capture -- --max-profiles 100`
  - Optional:
    - pass `--run-id <id>` to make filenames and digest filtering deterministic
  - What it reads:
    - Allowlist: `System/linkedin-feed/author-allowlist.txt`
    - Watchlist events: `00-Inbox/Job_Search/data/dex-linkedin-watchlist-event-*.json`
  - What it writes:
    - `00-Inbox/Job_Search/data/dex-linkedin-profile-posts-<slug>-<runId>-YYYY-MM-DD.json`

- Generate digest (MD links):
  - Run: `npm run linkedin-interest:digest`
  - Optional:
    - pass `--run-id <id>` to generate digest only for that exact capture run
  - What it reads:
    - All `00-Inbox/Job_Search/data/dex-linkedin-profile-posts-*-YYYY-MM-DD.json` for today
  - What it writes:
    - `00-Inbox/LinkedIn_Feed/digests/linkedin-interest-posts-YYYY-MM-DD.md`
  - Filter:
    - Recency window: last 7 days (publishedAt must be parseable)

