# Paperclip Cursor adapter — known fixes

When a Paperclip agent with **`adapterType: cursor`** fails at heartbeat start with **`cli-config.json` ENOENT**, use this guide. The issue title may say `claude_local`; CM and Content Writer actually run on the **cursor** adapter (`agent` CLI), which reads `~/.cursor/cli-config.json`.

**Related issues:** HIR-278 (systemic hardening), HIR-272 / HIR-274 (incident recovery), HIR-214 (SIGTERM / watchdog — different class).

---

## Error patterns

- `ENOENT` on `rename '.../cli-config.json.tmp' -> '.../cli-config.json'`
- `adapter_failed` on first heartbeat; run may linger `running` for hours
- Concurrent cursor adapter starts (CM + Content Writer + CTO) racing on the same file

**Not the same as:** Cursor SIGTERM exit 143 after delivery (HIR-214), missing `agent` in PATH, or missing `agent login` / `CURSOR_API_KEY`.

---

## Quick fix (one command)

From Dex repo root:

```bash
npm run paperclip:ensure-cursor-cli-config
```

**Expected:** `cursor cli-config present: ~/.cursor/cli-config.json (… bytes)` or `created` if it was missing.

**Fail-fast check only (no write):**

```bash
npm run paperclip:ensure-cursor-cli-config:check
```

Exit **1** if missing — Paperclip server startup also runs bootstrap and will refuse to start heartbeats until this passes.

---

## What the bootstrap does

1. `mkdir -p ~/.cursor` (idempotent)
2. If `cli-config.json` **missing**: create a minimal seed with `selectedModel: auto` under a file lock (`cli-config.bootstrap.lock`) so concurrent adapters do not race on ENOENT rename
3. If file **exists**: never overwrite (preserves `authInfo` from `agent login`)

**Scripts:**

- `.scripts/paperclip/paperclip-cursor-cli-config-lib.cjs` — library
- `.scripts/paperclip/ensure-cursor-cli-config.cjs` — CLI

**Wired into:**

- `.scripts/paperclip/paperclip-server-run.sh` (launchd server — **fail-fast** before `paperclipai run`)
- `.scripts/paperclip/sync-cursor-auth-to-agents.cjs`
- `.scripts/paperclip/ensure-cursor-adapters-on-quota.cjs` (launchd every 5 min)

---

## Stale `running` runs (zombie)

If a failed bootstrap left a run in `running` >15m:

```bash
PAPERCLIP_API_KEY=… npm run paperclip:reconcile-stale-runs
```

Dry-run:

```bash
PAPERCLIP_API_KEY=… npm run paperclip:reconcile-stale-runs:dry-run
```

Requires board API key; cancels via `POST /api/heartbeat-runs/{id}/cancel`.

---

## Auth still required

Bootstrap only ensures the **file exists**. Subscription mode still needs **`agent login`** (or `CURSOR_API_KEY` in adapter env for API billing). Run:

```bash
npm run paperclip:sync-cursor-subscription
```

Then **Test environment** in Paperclip UI for the agent, or:

`POST /api/companies/{companyId}/adapters/cursor/test-environment`

---

## Smoke (HIR-278 acceptance)

1. `npm run paperclip:ensure-cursor-cli-config` → exit 0
2. Community Manager agent `40698cb1-43a1-469b-9e19-e88262aea321` — one heartbeat completes or fails with a **comment** within 15m (no multi-hour silent `running`)

---

## Add new fixes here

After resolving a new cursor-adapter failure class, append: error pattern, root cause, command, and which script owns the fix.
