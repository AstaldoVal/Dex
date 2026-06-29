#!/usr/bin/env node
"use strict";

/**
 * Harden scheduled Paperclip routines: catch-up after downtime + coalesce (not skip) when CEO still running.
 *
 * Env:
 *   PAPERCLIP_BASE_URL     default http://127.0.0.1:3100
 *   PAPERCLIP_COMPANY_ID   default Hiring Advisors UUID
 *   PAPERCLIP_API_KEY      optional (local_trusted often works without)
 *   PAPERCLIP_ROUTINE_IDS  comma-separated; default CEO night push
 *   PAPERCLIP_ROUTINE_FIX_ALL_SCHEDULED=1  patch every active scheduled routine with skip_missed
 */

const BASE = (process.env.PAPERCLIP_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "bcce9859-427e-404c-beaf-4401cc79dc04";
const API_KEY = (process.env.PAPERCLIP_API_KEY || "").trim();
const DEFAULT_ROUTINE = "1d270f6f-f586-4785-9012-f54060a60d2f";
const FIX_ALL = process.env.PAPERCLIP_ROUTINE_FIX_ALL_SCHEDULED === "1";

const TARGET_CATCH_UP = "enqueue_missed_with_cap";
const TARGET_CONCURRENCY = "coalesce_if_active";

async function api(method, urlPath, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
    throw err;
  }
  return parsed;
}

function routineIdsFromEnv() {
  const raw = (process.env.PAPERCLIP_ROUTINE_IDS || DEFAULT_ROUTINE).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function listScheduledRoutineIds() {
  const routines = await api("GET", `/api/companies/${COMPANY_ID}/routines`);
  const list = Array.isArray(routines) ? routines : routines.items || [];
  return list
    .filter(
      (r) =>
        r.status === "active" &&
        (r.catchUpPolicy === "skip_missed" || FIX_ALL) &&
        Array.isArray(r.triggers) &&
        r.triggers.some((t) => t.kind === "schedule" && t.enabled !== false),
    )
    .map((r) => r.id);
}

async function patchRoutine(id) {
  const before = await api("GET", `/api/routines/${id}`);
  const patch = {};
  if (before.catchUpPolicy !== TARGET_CATCH_UP) patch.catchUpPolicy = TARGET_CATCH_UP;
  if (before.concurrencyPolicy !== TARGET_CONCURRENCY) {
    patch.concurrencyPolicy = TARGET_CONCURRENCY;
  }
  if (Object.keys(patch).length === 0) {
    return { id, title: before.title, changed: false, before, after: before };
  }
  const after = await api("PATCH", `/api/routines/${id}`, patch);
  return { id, title: before.title, changed: true, patch, after };
}

async function main() {
  const health = await api("GET", "/api/health");
  if (health.status !== "ok") {
    throw new Error(`Paperclip health not ok: ${JSON.stringify(health)}`);
  }

  let ids = FIX_ALL ? await listScheduledRoutineIds() : routineIdsFromEnv();
  if (!ids.length) {
    console.log("no routines to patch");
    return;
  }

  const results = [];
  for (const id of ids) {
    results.push(await patchRoutine(id));
  }

  for (const r of results) {
    if (r.changed) {
      console.log(
        `patched ${r.title} (${r.id}): ${JSON.stringify(r.patch)}`,
      );
    } else {
      console.log(`ok ${r.title} (${r.id}): already reliable settings`);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
