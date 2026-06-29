#!/usr/bin/env node
"use strict";

/**
 * Per-agent heartbeat policy by adapter + role (Hiring Advisors default company):
 * - cursor / cursor_cloud → tiered timer + wakeOnAssignment + wakeOnDemand
 *   - CEO: timer OFF (hourly routine + assignment wakes)
 *   - Executor Haiku: 1200 s default (PAPERCLIP_EXECUTOR_HAIKU_INTERVAL_SEC)
 *   - Executor Opus / Sonnet: 1800 s (PAPERCLIP_EXECUTOR_OPUS_SONNET_INTERVAL_SEC)
 *   - Other Cursor roles: 1800 s default (PAPERCLIP_CURSOR_HEARTBEAT_INTERVAL_SEC)
 * - claude_local (and other non-Cursor locals) → timer heartbeat OFF, wakeOnDemand
 *
 * Does NOT touch HEARTBEAT_SCHEDULER_ENABLED on the server (must stay true for routine cron).
 *
 * Env:
 *   PAPERCLIP_BASE_URL
 *   PAPERCLIP_COMPANY_ID
 *   PAPERCLIP_CURSOR_HEARTBEAT_INTERVAL_SEC          default 1800
 *   PAPERCLIP_EXECUTOR_HAIKU_INTERVAL_SEC            default 1200
 *   PAPERCLIP_EXECUTOR_OPUS_SONNET_INTERVAL_SEC      default 1800
 *   PAPERCLIP_HEARTBEAT_SYNC_DRY_RUN                 if "1", log only
 */

const fs = require("fs");
const path = require("path");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const CURSOR_INTERVAL_SEC = Math.max(
  60,
  Number(process.env.PAPERCLIP_CURSOR_HEARTBEAT_INTERVAL_SEC || "1800")
);
const EXECUTOR_HAIKU_INTERVAL_SEC = Math.max(
  60,
  Number(process.env.PAPERCLIP_EXECUTOR_HAIKU_INTERVAL_SEC || "1200")
);
const EXECUTOR_OPUS_SONNET_INTERVAL_SEC = Math.max(
  60,
  Number(process.env.PAPERCLIP_EXECUTOR_OPUS_SONNET_INTERVAL_SEC || "1800")
);
const DRY_RUN = process.env.PAPERCLIP_HEARTBEAT_SYNC_DRY_RUN === "1";
const LOG_DIR = path.join(VAULT, ".scripts/logs");
const LOG_FILE = path.join(LOG_DIR, "paperclip-heartbeat-sync.log");

const CURSOR_ADAPTERS = new Set(["cursor", "cursor_cloud"]);
const SKIP_STATUSES = new Set(["paused", "terminated", "pending_approval"]);

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, msg + "\n");
  } catch {
    /* best effort */
  }
}

async function api(method, urlPath, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${urlPath}`, opts);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(parsed.error || parsed.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return parsed;
}

function cursorIntervalSec(agent) {
  if (agent.role === "ceo") {
    return 0;
  }
  const name = String(agent.name || "");
  if (name === "Executor Haiku") {
    return EXECUTOR_HAIKU_INTERVAL_SEC;
  }
  if (name === "Executor Opus" || name === "Executor Sonnet") {
    return EXECUTOR_OPUS_SONNET_INTERVAL_SEC;
  }
  return CURSOR_INTERVAL_SEC;
}

function desiredHeartbeat(agent) {
  const existing = agent.runtimeConfig?.heartbeat || {};
  if (CURSOR_ADAPTERS.has(agent.adapterType)) {
    const intervalSec = cursorIntervalSec(agent);
    const timerEnabled = intervalSec > 0;
    return {
      ...existing,
      enabled: timerEnabled,
      intervalSec,
      wakeOnAssignment: true,
      wakeOnDemand: true,
    };
  }
  return {
    ...existing,
    enabled: false,
    intervalSec: 0,
    wakeOnAssignment: true,
    wakeOnDemand: true,
  };
}

function heartbeatNeedsPatch(agent, desired) {
  const current = agent.runtimeConfig?.heartbeat || {};
  return (
    Boolean(current.enabled) !== Boolean(desired.enabled) ||
    Number(current.intervalSec || 0) !== Number(desired.intervalSec || 0) ||
    Boolean(current.wakeOnDemand) !== Boolean(desired.wakeOnDemand) ||
    Boolean(current.wakeOnAssignment) !== Boolean(desired.wakeOnAssignment)
  );
}

function describeMode(agent, desired) {
  if (!CURSOR_ADAPTERS.has(agent.adapterType)) {
    return "claude-off";
  }
  if (agent.role === "ceo") {
    return "ceo-routine-only";
  }
  return `cursor-on-${desired.intervalSec}s`;
}

async function syncAgentHeartbeats(options = {}) {
  const dryRun = options.dryRun ?? DRY_RUN;
  const logger = options.log || log;

  let agents;
  try {
    agents = await api("GET", `/api/companies/${COMPANY_ID}/agents`);
  } catch (e) {
    logger(`agents list failed: ${e.message}`);
    throw e;
  }

  let changed = 0;
  for (const agent of agents) {
    if (SKIP_STATUSES.has(agent.status)) continue;
    const desired = desiredHeartbeat(agent);
    if (!heartbeatNeedsPatch(agent, desired)) continue;

    const runtimeConfig = {
      ...(agent.runtimeConfig || {}),
      heartbeat: desired,
    };
    const mode = describeMode(agent, desired);
    if (dryRun) {
      logger(
        `dry-run ${agent.name} (${agent.adapterType}): ${mode} wakeOnAssignment=${desired.wakeOnAssignment}`
      );
      changed += 1;
      continue;
    }
    try {
      await api("PATCH", `/api/agents/${agent.id}`, { runtimeConfig });
      changed += 1;
      logger(
        `${agent.name}: heartbeat ${mode} (enabled=${desired.enabled}, intervalSec=${desired.intervalSec}, wakeOnAssignment=${desired.wakeOnAssignment})`
      );
    } catch (e) {
      logger(`patch failed ${agent.name}: ${e.message}`);
      throw e;
    }
  }

  if (changed === 0) {
    logger("all agents already match adapter heartbeat policy");
  } else {
    logger(`updated ${changed} agent(s)${dryRun ? " (dry-run)" : ""}`);
  }
  return { changed };
}

async function main() {
  await syncAgentHeartbeats();
}

if (require.main === module) {
  main().catch((e) => {
    log(`fatal: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  syncAgentHeartbeats,
  desiredHeartbeat,
  cursorIntervalSec,
  CURSOR_ADAPTERS,
};
