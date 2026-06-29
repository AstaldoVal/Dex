"use strict";

/**
 * Resolve Paperclip API base for local Cursor heartbeats.
 * Tunnel URLs in PAPERCLIP_API_URL often hang 800s+; localhost is fast when launchd is up.
 *
 * Priority:
 *   1. PAPERCLIP_BASE_URL (explicit operator override)
 *   2. http://127.0.0.1:3100 when health check passes (default for local adapter)
 *   3. PAPERCLIP_API_URL only if localhost unreachable (short timeout)
 *
 * Env:
 *   PAPERCLIP_FORCE_TUNNEL=1  — skip localhost probe, use PAPERCLIP_API_URL
 *   PAPERCLIP_API_TIMEOUT_MS    default 25000
 */

const DEFAULT_LOCAL = "http://127.0.0.1:3100";
const DEFAULT_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.PAPERCLIP_API_TIMEOUT_MS || "25000")
);

function stripSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

async function probeHealth(base, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${stripSlash(base)}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePaperclipApiBase(options = {}) {
  const preferLocal = options.preferLocal !== false;
  const forceTunnel = process.env.PAPERCLIP_FORCE_TUNNEL === "1";

  const explicitBase = stripSlash(process.env.PAPERCLIP_BASE_URL || "");
  if (explicitBase) return explicitBase;

  if (!forceTunnel && preferLocal) {
    if (await probeHealth(DEFAULT_LOCAL)) return DEFAULT_LOCAL;
  }

  const tunnel = stripSlash(process.env.PAPERCLIP_API_URL || "");
  if (tunnel && tunnel !== DEFAULT_LOCAL) {
    if (await probeHealth(tunnel, 5000)) return tunnel;
  }

  return DEFAULT_LOCAL;
}

async function paperclipFetch(method, urlPath, options = {}) {
  const base = stripSlash(options.base || (await resolvePaperclipApiBase()));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const apiKey = (options.apiKey ?? process.env.PAPERCLIP_API_KEY ?? "").trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (options.runId || process.env.PAPERCLIP_RUN_ID) {
    headers["X-Paperclip-Run-Id"] = options.runId || process.env.PAPERCLIP_RUN_ID;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${urlPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
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
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_LOCAL,
  DEFAULT_TIMEOUT_MS,
  probeHealth,
  resolvePaperclipApiBase,
  paperclipFetch,
};
