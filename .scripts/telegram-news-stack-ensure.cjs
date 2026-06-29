#!/usr/bin/env node
/**
 * Mac: перевіряє, що telegram-news-bridge і Cloudflare quick tunnel живі й віддають /health.
 * Якщо ні — перезапускає stack (делегує telegram-news-stack-restart.cjs).
 *
 * Після heal:
 * - якщо є VERCEL_TOKEN і не передано --local-only → повний restart (оновлення BRIDGE_URL на Vercel + redeploy);
 * - інакше → restart з --skip-vercel (лише Mac).
 *
 * Usage (з кореня Dex):
 *   node .scripts/telegram-news-stack-ensure.cjs
 *   node .scripts/telegram-news-stack-ensure.cjs --dry-run
 *   node .scripts/telegram-news-stack-ensure.cjs --local-only   # ніколи не чіпати Vercel
 */
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE_DIR = path.join(ROOT, "apps", "telegram-news-bridge");
const CF_PID_FILE = path.join("/tmp", "dex-telegram-news-cloudflared.pid");
const LAST_TUNNEL_FILE = path.join("/tmp", "dex-telegram-last-cloudflared-url.txt");
const RESTART = path.join(ROOT, ".scripts", "telegram-news-stack-restart.cjs");

const QUICK_TUNNEL_RE = /https:\/\/[a-z0-9-]+\.(trycloudflare\.com|cfargotunnel\.com)\/?/i;

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

async function fetchHealthJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && j && j.status === "ok";
    return { ok, status: r.status, url };
  } catch (e) {
    return { ok: false, status: 0, url, error: e.message || String(e) };
  }
}

function readLastTunnelUrl() {
  if (!fs.existsSync(LAST_TUNNEL_FILE)) return null;
  const line = fs.readFileSync(LAST_TUNNEL_FILE, "utf8").trim().split("\n")[0] || "";
  const m = line.match(QUICK_TUNNEL_RE);
  return m ? m[0].replace(/\/+$/, "") : null;
}

/**
 * @returns {{ bridgeOk: boolean, tunnelOk: boolean, notes: string[] }}
 */
async function evaluateStack(port) {
  const notes = [];
  const localhost = `http://127.0.0.1:${port}/health`;
  const local = await fetchHealthJson(localhost);
  const bridgeOk = local.ok;
  if (!bridgeOk) {
    notes.push(
      local.error
        ? `bridge /health FAIL ${localhost} (${local.error})`
        : `bridge /health FAIL ${localhost} (HTTP ${local.status})`
    );
  } else {
    notes.push(`bridge /health OK (${localhost})`);
  }

  const bridgePids = pgrepPattern("telegram_news_bridge");
  if (bridgePids.length === 0) notes.push("pgrep: no telegram_news_bridge process");
  else notes.push(`pgrep: telegram_news_bridge PIDs ${bridgePids.join(",")}`);

  const cfPids = pgrepPattern("cloudflared tunnel");
  const cfPidfile = readPidfile(CF_PID_FILE);
  const pidfileAlive = cfPidfile ? pidAlive(cfPidfile) : false;
  if (cfPids.length === 0 && !pidfileAlive) {
    notes.push("cloudflared: no matching process and pidfile missing/dead");
  } else if (cfPids.length) {
    notes.push(`cloudflared: pgrep PIDs ${cfPids.join(",")}`);
  } else {
    notes.push(`cloudflared: pidfile PID ${cfPidfile} alive`);
  }

  const tunnelBase = readLastTunnelUrl();
  if (!tunnelBase) {
    notes.push("tunnel: no valid URL in last-tunnel file");
    return { bridgeOk, tunnelOk: false, notes };
  }

  const tunHealth = await fetchHealthJson(`${tunnelBase}/health`);
  if (!tunHealth.ok) {
    notes.push(
      tunHealth.error
        ? `tunnel /health FAIL ${tunnelBase}/health (${tunHealth.error})`
        : `tunnel /health FAIL ${tunnelBase}/health (HTTP ${tunHealth.status})`
    );
    return { bridgeOk, tunnelOk: false, notes };
  }
  notes.push(`tunnel /health OK (${tunnelBase}/health)`);

  const tunnelOk = true;
  return { bridgeOk, tunnelOk, notes };
}

function runStackRestart({ skipVercel }) {
  const args = [RESTART];
  if (skipVercel) args.push("--skip-vercel");
  console.log(`\n→ ${process.execPath} ${args.map((a) => path.relative(ROOT, a)).join(" ")}\n`);
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });
  return r.status ?? 1;
}

async function main() {
  const dry = argHas("--dry-run");
  const localOnly = argHas("--local-only");
  const port = readBridgePort();

  console.log(`telegram-news stack ensure (repo ${ROOT})`);
  console.log(`BRIDGE_PORT=${port}`);

  let state = await evaluateStack(port);
  for (const n of state.notes) console.log(`  ${n}`);

  const ok = state.bridgeOk && state.tunnelOk;
  if (ok) {
    console.log("\nSTATUS: bridge + quick tunnel OK\n");
    process.exit(0);
  }

  console.warn("\nSTATUS: need heal (bridge and/or tunnel)\n");
  if (dry) {
    console.log("[dry-run] would run telegram-news-stack-restart.cjs");
    process.exit(1);
  }

  const token = process.env.VERCEL_TOKEN?.trim();
  const skipVercel = localOnly || !token;
  if (skipVercel && !token) console.warn("VERCEL_TOKEN unset → heal with --skip-vercel (оновіть Vercel вручну або задайте токен)\n");
  else if (localOnly) console.log("--local-only → heal without Vercel\n");

  const code = runStackRestart({ skipVercel });
  if (code !== 0) {
    console.error(`stack restart exited ${code}`);
    process.exit(code);
  }

  state = await evaluateStack(port);
  for (const n of state.notes) console.log(`  ${n}`);

  if (!state.bridgeOk || !state.tunnelOk) {
    console.error("\nSTATUS: still NOT OK after heal\n");
    process.exit(1);
  }
  console.log("\nSTATUS: healed — bridge + quick tunnel OK\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
