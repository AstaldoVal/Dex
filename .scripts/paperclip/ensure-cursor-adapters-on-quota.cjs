#!/usr/bin/env node
"use strict";

/**
 * When Anthropic (Claude Code) session quota is high, ensure all Paperclip
 * company agents use the Cursor adapter with model "auto".
 *
 * Env:
 *   PAPERCLIP_BASE_URL          default http://127.0.0.1:3100
 *   PAPERCLIP_COMPANY_ID        default Hiring Advisors UUID
 *   PAPERCLIP_QUOTA_THRESHOLD   default 90 (session usedPercent)
 *   PAPERCLIP_CWD               default repo root (VAULT_PATH)
 *   PAPERCLIP_FORCE_CURSOR      if "1", always enforce cursor (ignore quota)
 */

const fs = require("fs");
const path = require("path");
const { mergeCursorAdapterConfig, resetCursorSessions } = require("./paperclip-cursor-auth-lib.cjs");
const { ensureCursorCliConfig } = require("./paperclip-cursor-cli-config-lib.cjs");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const THRESHOLD = Number(process.env.PAPERCLIP_QUOTA_THRESHOLD || "90");
const CWD = process.env.PAPERCLIP_CWD || VAULT;
const FORCE = process.env.PAPERCLIP_FORCE_CURSOR === "1";
const LOG_DIR = path.join(VAULT, ".scripts/logs");
const LOG_FILE = path.join(LOG_DIR, "paperclip-cursor-quota.log");

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
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
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
    err.body = parsed;
    throw err;
  }
  return parsed;
}

function sessionQuotaPercent(quotaWindows) {
  if (!Array.isArray(quotaWindows)) return null;
  const anthropic = quotaWindows.find((q) => q.provider === "anthropic");
  if (!anthropic || !anthropic.ok || !Array.isArray(anthropic.windows)) return null;
  const session = anthropic.windows.find((w) =>
    String(w.label || "").toLowerCase().includes("session")
  );
  if (!session || typeof session.usedPercent !== "number") return null;
  return session.usedPercent;
}

function needsCursor(agent) {
  const cfg = agent.adapterConfig || {};
  return (
    agent.adapterType !== "cursor" ||
    cfg.model !== "auto" ||
    agent.status === "error"
  );
}

async function main() {
  await ensureCursorCliConfig();
  let quota;
  try {
    quota = await api("GET", `/api/companies/${COMPANY_ID}/costs/quota-windows`);
  } catch (e) {
    log(`quota fetch failed: ${e.message}`);
    if (!FORCE) {
      process.exitCode = 1;
      return;
    }
  }

  const usedPercent = sessionQuotaPercent(quota);
  const quotaHigh = usedPercent !== null && usedPercent >= THRESHOLD;
  const enforce = FORCE || quotaHigh;

  log(
    `session quota=${usedPercent ?? "n/a"}% threshold=${THRESHOLD} enforce=${enforce}`
  );

  if (!enforce) {
    log("quota below threshold; no adapter changes");
    try {
      const { syncAgentHeartbeats } = require("./sync-agent-heartbeat-by-adapter.cjs");
      await syncAgentHeartbeats({ log });
    } catch (e) {
      log(`heartbeat sync warning: ${e.message}`);
    }
    try {
      const { syncCheapProfileToAuto } = require("./sync-cursor-cheap-profile-auto.cjs");
      await syncCheapProfileToAuto({ log });
    } catch (e) {
      log(`cheap profile sync warning: ${e.message}`);
    }
    return;
  }

  let agents;
  try {
    agents = await api("GET", `/api/companies/${COMPANY_ID}/agents`);
  } catch (e) {
    log(`agents list failed: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  let changed = 0;
  const auth = mergeCursorAdapterConfig({}, VAULT);
  if (auth.billing === "api" && !auth.hasApiKey) {
    log("warning: PAPERCLIP_CURSOR_BILLING=api but CURSOR_API_KEY missing in .env");
  }

  for (const agent of agents) {
    const merged = mergeCursorAdapterConfig(agent.adapterConfig, VAULT);
    const adapterEnv = agent.adapterConfig?.env || {};
    const hasKeyInAdapter = Boolean(
      adapterEnv.CURSOR_API_KEY &&
        (typeof adapterEnv.CURSOR_API_KEY === "string"
          ? adapterEnv.CURSOR_API_KEY.trim()
          : adapterEnv.CURSOR_API_KEY?.value?.trim())
    );
    const shouldPatch =
      needsCursor(agent) ||
      (auth.billing === "api" && auth.hasApiKey && !hasKeyInAdapter) ||
      (auth.billing === "subscription" && hasKeyInAdapter);
    if (!shouldPatch) continue;

    const cfg = { ...merged.cfg, model: "auto", cwd: CWD };
    try {
      const updated = await api("PATCH", `/api/agents/${agent.id}`, {
        status: "idle",
        adapterType: "cursor",
        adapterConfig: cfg,
      });
      changed += 1;
      log(
        `switched ${updated.name}: ${agent.adapterType}/${(agent.adapterConfig || {}).model} -> cursor/auto`
      );

      const desired = cfg.paperclipSkillSync?.desiredSkills;
      if (Array.isArray(desired) && desired.length > 0) {
        try {
          await api("POST", `/api/agents/${agent.id}/skills/sync`, {
            desiredSkills: desired,
          });
          log(`skills sync ok: ${updated.name} (${desired.length} desired)`);
        } catch (e) {
          log(`skills sync skipped ${updated.name}: ${e.message}`);
        }
      }
    } catch (e) {
      log(`patch failed ${agent.name}: ${e.message}`);
      process.exitCode = 1;
    }
  }

  if (changed === 0) {
    log("all agents already on cursor/auto");
  } else {
    log(`updated ${changed} agent(s)`);
    try {
      const n = await resetCursorSessions(BASE, COMPANY_ID);
      log(`reset cursor sessions for ${n} agent(s) after adapter change`);
    } catch (e) {
      log(`reset-session warning: ${e.message}`);
    }
  }

  try {
    const { syncAgentHeartbeats } = require("./sync-agent-heartbeat-by-adapter.cjs");
    await syncAgentHeartbeats({ log });
  } catch (e) {
    log(`heartbeat sync warning: ${e.message}`);
  }

  try {
    const { syncCheapProfileToAuto } = require("./sync-cursor-cheap-profile-auto.cjs");
    await syncCheapProfileToAuto({ log });
  } catch (e) {
    log(`cheap profile sync warning: ${e.message}`);
  }
}

main().catch((e) => {
  log(`fatal: ${e.message}`);
  process.exitCode = 1;
});
