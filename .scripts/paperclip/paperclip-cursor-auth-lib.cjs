"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function loadDotenv(vault) {
  try {
    require("dotenv").config({ path: path.join(vault, ".env") });
  } catch {
    /* optional */
  }
}

function defaultAgentCommand() {
  const home = os.homedir();
  const candidates = [
    process.env.PAPERCLIP_CURSOR_COMMAND,
    path.join(home, ".local/bin/agent"),
    path.join(home, ".cursor/bin/agent"),
    "agent",
  ].filter(Boolean);
  for (const cmd of candidates) {
    if (cmd === "agent") return cmd;
    try {
      if (fs.existsSync(cmd)) return cmd;
    } catch {
      /* ignore */
    }
  }
  return "agent";
}

function loadCursorApiKey(vault) {
  loadDotenv(vault);
  const key = (process.env.CURSOR_API_KEY || "").trim();
  return key || null;
}

function unwrapPlainEnv(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value;
  }
  return "";
}

function buildCursorPathEnv(existingPath) {
  const home = os.homedir();
  const prefix = [
    path.join(home, ".local/bin"),
    path.join(home, ".cursor/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const pathTail =
    unwrapPlainEnv(existingPath) ||
    (typeof process.env.PATH === "string" ? process.env.PATH : "");
  const parts = [...prefix, ...pathTail.split(":")]
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set();
  const merged = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    merged.push(p);
  }
  return merged.join(":");
}

function loadCursorBillingMode() {
  const raw = (process.env.PAPERCLIP_CURSOR_BILLING || "subscription").trim().toLowerCase();
  return raw === "api" ? "api" : "subscription";
}

/** Merge Cursor adapter config for Paperclip. Default: subscription + model auto (no API key). */
function mergeCursorAdapterConfig(adapterConfig, vault) {
  const billing = loadCursorBillingMode();
  const key = billing === "api" ? loadCursorApiKey(vault) : null;
  const cfg = { ...(adapterConfig || {}) };
  cfg.model = "auto";
  cfg.command = cfg.command || defaultAgentCommand();
  const env = { ...(cfg.env || {}) };
  env.PATH = buildCursorPathEnv(env.PATH);
  if (billing === "api" && key) {
    env.CURSOR_API_KEY = key;
  } else {
    delete env.CURSOR_API_KEY;
    // Override CURSOR_API_KEY leaked from the Paperclip server process.env.
    env.CURSOR_API_KEY = "";
  }
  cfg.env = env;
  return { cfg, billing, hasApiKey: Boolean(key) };
}

async function resetCursorSessions(baseUrl, companyId) {
  const res = await fetch(`${baseUrl}/api/companies/${companyId}/agents`, {
    headers: { Accept: "application/json" },
  });
  const agents = await res.json();
  if (!res.ok) {
    throw new Error(agents.error || `HTTP ${res.status}`);
  }
  for (const agent of agents) {
    const resetRes = await fetch(
      `${baseUrl}/api/agents/${agent.id}/runtime-state/reset-session`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    if (!resetRes.ok) {
      const body = await resetRes.text();
      throw new Error(`${agent.name}: reset-session failed (${resetRes.status}) ${body}`);
    }
  }
  return agents.length;
}

module.exports = {
  loadCursorApiKey,
  loadCursorBillingMode,
  mergeCursorAdapterConfig,
  defaultAgentCommand,
  resetCursorSessions,
};
