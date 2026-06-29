#!/usr/bin/env node
"use strict";

/**
 * Cancel Paperclip heartbeat runs stuck in running/queued beyond a threshold.
 * Complements server watchdog (HIR-214); targets adapter bootstrap zombies (HIR-278).
 *
 * Env:
 *   PAPERCLIP_BASE_URL          default http://127.0.0.1:3100
 *   PAPERCLIP_COMPANY_ID        default Hiring Advisors UUID
 *   PAPERCLIP_API_KEY           required for cancel (skip reconcile if unset)
 *   PAPERCLIP_STALE_RUN_MINUTES default 15
 *   PAPERCLIP_RECONCILE_DRY_RUN=1
 */

const VAULT = process.env.VAULT_PATH || require("path").resolve(__dirname, "../..");
const {
  resolvePaperclipApiBase,
  paperclipFetch,
} = require("./paperclip-api-lib.cjs");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const API_KEY = (process.env.PAPERCLIP_API_KEY || "").trim();
const STALE_MINUTES = Math.max(1, Number(process.env.PAPERCLIP_STALE_RUN_MINUTES || "15"));
const DRY_RUN = process.env.PAPERCLIP_RECONCILE_DRY_RUN === "1";

const ADAPTER_FAIL_PATTERNS = [
  /cli-config/i,
  /adapter_failed/i,
  /ENOENT/i,
  /rename.*cli-config/i,
];

async function api(method, urlPath, body) {
  return paperclipFetch(method, urlPath, {
    apiKey: API_KEY,
    body,
  });
}

function runAgeMinutes(run) {
  const started = run.startedAt || run.createdAt;
  if (!started) return 0;
  const ms = Date.now() - new Date(started).getTime();
  return ms / 60_000;
}

function looksLikeAdapterBootstrapFailure(run) {
  const hay = [
    run.livenessReason,
    run.nextAction,
    run.retryExhaustedReason,
    JSON.stringify(run.outputSilence || {}),
  ]
    .filter(Boolean)
    .join("\n");
  return ADAPTER_FAIL_PATTERNS.some((re) => re.test(hay));
}

async function main() {
  if (!API_KEY) {
    console.log("skip: PAPERCLIP_API_KEY unset — list-only mode unavailable for cancel");
    process.exitCode = 0;
    return;
  }

  const base = await resolvePaperclipApiBase();
  console.log(`paperclip api base: ${base}`);

  const runs = await api("GET", `/api/companies/${COMPANY_ID}/live-runs?limit=50`);
  const live = Array.isArray(runs) ? runs : runs.items || [];
  const stale = live.filter((run) => {
    const status = run.status;
    if (status !== "running" && status !== "queued") return false;
    return runAgeMinutes(run) >= STALE_MINUTES;
  });

  if (stale.length === 0) {
    console.log(`no stale runs (threshold ${STALE_MINUTES}m)`);
    return;
  }

  let cancelled = 0;
  for (const run of stale) {
    const age = runAgeMinutes(run).toFixed(1);
    const adapterHint = looksLikeAdapterBootstrapFailure(run) ? " adapter-bootstrap?" : "";
    if (DRY_RUN) {
      console.log(`dry-run cancel ${run.id} (${run.agentName || run.agentId}) age=${age}m${adapterHint}`);
      cancelled += 1;
      continue;
    }
    try {
      await api("POST", `/api/heartbeat-runs/${run.id}/cancel`, {
        reason: `HIR-278 reconcile: stale ${run.status} ${age}m${adapterHint}`,
      });
      console.log(`cancelled ${run.id} (${run.agentName || run.agentId}) age=${age}m`);
      cancelled += 1;
    } catch (err) {
      if (err.status === 403) {
        console.log(
          `skip cancel ${run.id} (${run.agentName || run.agentId}) age=${age}m — board access required (CEO/Roman token)`
        );
        continue;
      }
      throw err;
    }
  }

  console.log(`reconciled ${cancelled} stale run(s)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
