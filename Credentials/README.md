# Credentials (local secrets)

All machine-local OAuth tokens, service account JSON, and shell-exported API keys for this Dex clone live **under this directory**, not in the repository root.

**Exception:** the root `.env` file stays at the repo root (already gitignored) for environment variables.

## Layout

| Path | Contents |
|------|----------|
| `personal/` | Personal Google OAuth: `credentials.json`, `gmail_token.json`, `google_calendar_token.json`, `google_drive_token.json` |
| `google-work/` | Work Google account (same filenames; used by `*-work-mcp` in `.mcp.json`) |
| `google-glorium/` | Glorium Gmail token (`gmail_token.json`) |
| `vercel/` | `dex-vercel-token.sh` — `source` for `VERCEL_TOKEN` (e.g. telegram-news stack) |
| `google-speech/` | `service-account.json` (Google Cloud service account for Speech) |
| `linkedin/` | LinkedIn Playwright session: `context_state.json`, `subscription_results.json`, `jobs_digest_partial.json`, digest logs (not Google OAuth) |
| `applicator-staging/` | HIR-181: `staging-basic-auth.env` — HTTP basic user/pass for `staging.genufit.app` (Cloudflare Pages secrets; not readable in dashboard after save). OpenAI: `openai-staging.env` (see `openai-staging.env.example`) → Cloud Run `OPENAI_API_KEY`. PostHog EU (HIR-392): `posthog-genufit-staging.env` (see `posthog-genufit-staging.env.example`) → Personal API key for Data Analyst agent. Stripe billing (HIR-447): `stripe-staging.env` (see `stripe-staging.env.example`) → `./scripts/cloud-run-update-stripe-staging-secrets.sh`. LangSmith EU (genufit-staging): `langsmith-staging.env` (see `langsmith-staging.env.example`) → Cursor `langsmith-mcp` via `cursor-sync-mcp.py` (not committed). **Paperclip named tunnel (HIR-468):** `cloudflare-genufit.env` (see `cloudflare-genufit.env.example`) + `paperclip-tunnel.token` → `04-Projects/Applicator/scripts/paperclip-named-tunnel-setup.sh`. |
| `genufit-reddit-readonly.env` | HIR-1349: Reddit OAuth read-only for CM (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REFRESH_TOKEN`). Example: `genufit-reddit-readonly.env.example`. Setup: `genufit-reddit-readonly-roman-steps.md`. Ingest: `npm run cm:reddit-oauth-ingest` from Applicator. |

Compatibility symlinks (point here):

- `.claude/google-work` → `../Credentials/google-work`
- `.claude/google-glorium` → `../Credentials/google-glorium`
- `.claude/linkedin` → `../Credentials/linkedin`
- `System/Secrets/dex-vercel-token.sh` → `../../Credentials/vercel/dex-vercel-token.sh`
- `System/Secrets/google-speech-service-account.json.json` → `../../Credentials/google-speech/service-account.json`

Defaults in code: `core/credentials_paths.py` (personal OAuth and `linkedin_session_dir()`). Override with `GMAIL_*`, `GOOGLE_*`, or `LINKEDIN_SESSION_DIR` when needed.

After moving files, run `python3 .scripts/cursor-sync-mcp.py` so `~/.cursor/mcp.json` picks up path changes.
