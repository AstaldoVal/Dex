#!/usr/bin/env node
"use strict";

/**
 * Cursor adapter "cheap" profile defaults to gpt-5.1-codex-mini, which has its own
 * Pro included-usage bucket (often exhausted before Auto). Override per agent:
 *   runtimeConfig.modelProfiles.cheap.adapterConfig.model = "auto"
 *
 * Env:
 *   PAPERCLIP_BASE_URL
 *   PAPERCLIP_COMPANY_ID
 *   PAPERCLIP_CHEAP_PROFILE_SYNC_DRY_RUN=1
 *   PAPERCLIP_AGENT_IDS=comma-separated (optional; default all cursor agents in company)
 */

const fs = require("fs");
const path = require("path");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const HOD_ID = process.env.PAPERCLIP_HOD_AGENT_ID || "4e30dff6-a796-467e-85a6-68733603b110";
const DRY_RUN = process.env.PAPERCLIP_CHEAP_PROFILE_SYNC_DRY_RUN === "1";
const LOG_DIR = path.join(VAULT, ".scripts/logs");
const LOG_FILE = path.join(LOG_DIR, "paperclip-cheap-profile-sync.log");

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

function desiredCheapProfile(existingRuntimeConfig) {
  const runtimeConfig = { ...(existingRuntimeConfig || {}) };
  const modelProfiles = { ...(runtimeConfig.modelProfiles || {}) };
  modelProfiles.cheap = {
    ...(modelProfiles.cheap || {}),
    enabled: modelProfiles.cheap?.enabled !== false,
    adapterConfig: {
      ...(modelProfiles.cheap?.adapterConfig || {}),
      model: "auto",
    },
  };
  runtimeConfig.modelProfiles = modelProfiles;
  return runtimeConfig;
}

function cheapProfileNeedsPatch(agent) {
  if (!CURSOR_ADAPTERS.has(agent.adapterType)) return false;
  const cheap = agent.runtimeConfig?.modelProfiles?.cheap;
  const currentModel = cheap?.adapterConfig?.model;
  if (cheap?.enabled === false) return true;
  return currentModel !== "auto";
}

async function syncCheapProfileToAuto(options = {}) {
  const dryRun = options.dryRun ?? DRY_RUN;
  const logger = options.log || log;
  const filterIds = options.agentIds || null;

  const agents = await api("GET", `/api/companies/${COMPANY_ID}/agents`);
  let changed = 0;

  for (const agent of agents) {
    if (SKIP_STATUSES.has(agent.status)) continue;
    if (!CURSOR_ADAPTERS.has(agent.adapterType)) continue;
    if (filterIds && !filterIds.includes(agent.id)) continue;
    if (!cheapProfileNeedsPatch(agent)) continue;

    const runtimeConfig = desiredCheapProfile(agent.runtimeConfig);
    if (dryRun) {
      logger(`dry-run ${agent.name}: cheap → auto`);
      changed += 1;
      continue;
    }
    await api("PATCH", `/api/agents/${agent.id}`, { runtimeConfig });
    changed += 1;
    logger(`${agent.name}: runtimeConfig.modelProfiles.cheap.adapterConfig.model=auto`);
  }

  if (changed === 0) {
    logger("all cursor agents already have cheap→auto");
  } else {
    logger(`patched ${changed} agent(s)${dryRun ? " (dry-run)" : ""}`);
  }
  return { changed };
}

async function main() {
  const filterEnv = (process.env.PAPERCLIP_AGENT_IDS || "").trim();
  const agentIds = filterEnv ? filterEnv.split(",").map((s) => s.trim()).filter(Boolean) : null;
  log(`cheap profile sync — company ${COMPANY_ID}, HoD ${HOD_ID}`);
  await syncCheapProfileToAuto({ agentIds });
}

if (require.main === module) {
  main().catch((e) => {
    log(`fatal: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { syncCheapProfileToAuto, desiredCheapProfile };
