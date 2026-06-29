#!/usr/bin/env node
"use strict";

/**
 * Align Paperclip Cursor adapters with Roman's billing choice.
 *
 * Default (PAPERCLIP_CURSOR_BILLING=subscription):
 *   model auto, no CURSOR_API_KEY — uses annual Cursor subscription via `agent login`.
 *
 * API mode (PAPERCLIP_CURSOR_BILLING=api):
 *   injects CURSOR_API_KEY from .env — pay-per-use API track (not subscription Auto).
 */

const path = require("path");
const {
  loadCursorBillingMode,
  loadCursorApiKey,
  mergeCursorAdapterConfig,
  resetCursorSessions,
} = require("./paperclip-cursor-auth-lib.cjs");
const { ensureCursorCliConfig } = require("./paperclip-cursor-cli-config-lib.cjs");

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, "../..");
const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";

async function api(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(parsed.error || parsed.message || `HTTP ${res.status}`);
  }
  return parsed;
}

async function main() {
  await ensureCursorCliConfig();
  const billing = loadCursorBillingMode();
  if (billing === "api" && !loadCursorApiKey(VAULT)) {
    console.error(
      "PAPERCLIP_CURSOR_BILLING=api, но CURSOR_API_KEY нет в .env. Для подписки Auto оставь billing по умолчанию (subscription)."
    );
    process.exitCode = 1;
    return;
  }

  const agents = await api("GET", `/api/companies/${COMPANY_ID}/agents`);
  for (const agent of agents) {
    const { cfg } = mergeCursorAdapterConfig(agent.adapterConfig, VAULT);
    await api("PATCH", `/api/agents/${agent.id}`, {
      adapterType: "cursor",
      adapterConfig: cfg,
      status: agent.status === "error" ? "idle" : agent.status,
    });
    const keyNote = billing === "api" ? "api-key" : "subscription";
    console.log(`ok: ${agent.name} (${keyNote}, model=${cfg.model})`);
  }

  const resetCount = await resetCursorSessions(BASE, COMPANY_ID);
  console.log(
    billing === "subscription"
      ? `Режим: подписка Cursor + model auto. Сброшено сессий: ${resetCount}. Нужен agent login (не API key).`
      : `Режим: API key. Сброшено сессий: ${resetCount}.`
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
