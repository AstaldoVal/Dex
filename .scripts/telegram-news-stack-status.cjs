#!/usr/bin/env node
/**
 * One-screen status: bridge process, localhost /health, cloudflared + pidfile,
 * last tunnel URL file, optional Vercel production deployment (needs VERCEL_TOKEN).
 *
 *   node .scripts/telegram-news-stack-status.cjs
 *   node .scripts/telegram-news-stack-status.cjs --json
 */
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE_DIR = path.join(ROOT, "apps", "telegram-news-bridge");
const CF_PID_FILE = path.join("/tmp", "dex-telegram-news-cloudflared.pid");
const LAST_TUNNEL_FILE = path.join("/tmp", "dex-telegram-last-cloudflared-url.txt");

function argHas(name) {
  return process.argv.includes(name);
}

function readBridgePort() {
  const tryFiles = [path.join(BRIDGE_DIR, ".env"), path.join(ROOT, ".env")];
  for (const f of tryFiles) {
    if (!fs.existsSync(f)) continue;
    const line = fs
      .readFileSync(f, "utf8")
      .split("\n")
      .find((l) => /^\s*BRIDGE_PORT=/.test(l));
    if (line) {
      const v = line.split("=", 2)[1]?.trim().replace(/\r$/, "") ?? "";
      if (v) return Number.parseInt(v, 10) || 8765;
    }
  }
  const e = process.env.BRIDGE_PORT;
  if (e && /^\d+$/.test(e)) return Number.parseInt(e, 10);
  return 8765;
}

function pidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidfile(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function pgrepPattern(pattern) {
  const r = spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout?.trim()) return [];
  return r.stdout
    .trim()
    .split("\n")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function psArgs(pid) {
  const r = spawnSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
  return (r.stdout || "").trim();
}

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  const text = await r.text();
  let j = {};
  try {
    j = JSON.parse(text);
  } catch {
    j = { _raw: text.slice(0, 200) };
  }
  return { ok: r.ok, status: r.status, json: j };
}

async function bridgeHealth(port) {
  const url = `http://127.0.0.1:${port}/health`;
  try {
    const { ok, status, json } = await fetchJson(url);
    const good = ok && json && json.status === "ok";
    return { url, ok: good, httpStatus: status, body: json };
  } catch (e) {
    return { url, ok: false, httpStatus: 0, error: e.message || String(e) };
  }
}

function deploymentsListUrl(projectId, teamId) {
  const u = new URL("https://api.vercel.com/v6/deployments");
  u.searchParams.set("projectId", projectId);
  u.searchParams.set("target", "production");
  u.searchParams.set("limit", "1");
  if (teamId) u.searchParams.set("teamId", teamId);
  return u.toString();
}

async function vercelProductionHead() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) return { skipped: true, reason: "VERCEL_TOKEN not set" };
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectName = process.env.VERCEL_PROJECT_NAME?.trim() || "telegram-news-dashboard";
  const tid = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const projRes = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${tid}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!projRes.ok) {
    return { error: `get project ${projRes.status} ${await projRes.text()}` };
  }
  const proj = await projRes.json();
  const projectId = proj.id;
  const listRes = await fetch(deploymentsListUrl(projectId, teamId), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    return { error: `list deployments ${listRes.status} ${await listRes.text()}` };
  }
  const list = await listRes.json();
  const d = list.deployments?.[0];
  if (!d) return { error: "no production deployments" };
  return {
    uid: d.uid,
    state: d.state,
    readyState: d.readyState,
    url: d.url ? `https://${d.url}` : null,
    createdAt: d.createdAt,
    meta: d.meta?.githubCommitSha || d.meta?.githubCommitRef || null,
  };
}

async function main() {
  const jsonOut = argHas("--json");
  const port = readBridgePort();
  const bridgePids = pgrepPattern("telegram_news_bridge");
  const cfPids = pgrepPattern("cloudflared tunnel");
  const cfPidfile = readPidfile(CF_PID_FILE);
  const pidfileAlive = cfPidfile ? pidAlive(cfPidfile) : false;
  const pidfileCmd = cfPidfile && pidfileAlive ? psArgs(cfPidfile) : "";
  const tunnelFromFile = fs.existsSync(LAST_TUNNEL_FILE)
    ? fs.readFileSync(LAST_TUNNEL_FILE, "utf8").trim().split("\n")[0] || null
    : null;

  const health = await bridgeHealth(port);

  const cloudflaredPidfileMismatch =
    Boolean(cfPidfile) && !pidfileAlive && cfPids.length > 0
      ? "pidfile stale (cloudflared running under other PID)"
      : Boolean(cfPidfile) && !pidfileAlive && cfPids.length === 0
        ? "pidfile points to dead process; no cloudflared tunnel in pgrep"
        : null;

  const vercel = await vercelProductionHead();

  const report = {
    repoRoot: ROOT,
    bridgePort: port,
    bridgeHealth: health,
    bridgeProcessPids: bridgePids,
    cloudflaredPgrep: cfPids,
    cloudflaredPidfile: cfPidfile,
    cloudflaredPidfileAlive: pidfileAlive,
    cloudflaredPidfileCmdSample: pidfileCmd.slice(0, 120) || null,
    lastTunnelFileUrl: tunnelFromFile,
    cloudflaredPidfileMismatch: cloudflaredPidfileMismatch,
    vercelProduction: vercel,
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Repo: ${ROOT}`);
    console.log(`Bridge port: ${port}`);
    console.log(
      `Bridge /health: ${health.ok ? "OK" : "FAIL"} ${health.url}${health.error ? ` (${health.error})` : ""}`
    );
    console.log(`telegram_news_bridge PIDs (pgrep): ${bridgePids.length ? bridgePids.join(", ") : "— none —"}`);
    console.log(`cloudflared PIDs (pgrep "tunnel"): ${cfPids.length ? cfPids.join(", ") : "— none —"}`);
    console.log(
      `cloudflared pidfile: ${cfPidfile ?? "—"} ${cfPidfile ? (pidfileAlive ? "(alive)" : "(dead)") : ""}`
    );
    if (tunnelFromFile) console.log(`Last tunnel URL file: ${tunnelFromFile}`);
    if (cloudflaredPidfileMismatch) console.warn(`Tunnel note: ${cloudflaredPidfileMismatch}`);
    if (vercel.skipped) console.log(`Vercel: ${vercel.reason}`);
    else if (vercel.error) console.log(`Vercel: error ${vercel.error}`);
    else
      console.log(
        `Vercel production: state=${vercel.state} ready=${vercel.readyState} url=${vercel.url || "—"} sha=${vercel.meta || "—"}`
      );
  }

  // Exit 1 if bridge unhealthy or no bridge process
  if (!health.ok || bridgePids.length === 0) {
    if (!jsonOut) console.error("\nSTATUS: NOT OK (bridge down or unhealthy)\n");
    process.exit(1);
  }

  // Warn path: no cloudflared but we had a tunnel file — Vercel may 530
  if (cfPids.length === 0) {
    if (!jsonOut) console.warn("\nWARN: no cloudflared quick tunnel — if BRIDGE_URL points at trycloudflare, fix with stack:restart\n");
  }

  if (!jsonOut) console.log("\nSTATUS: bridge process + /health OK\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
