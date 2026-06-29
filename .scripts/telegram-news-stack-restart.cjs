#!/usr/bin/env node
/**
 * Telegram news stack: restart bridge → (re)start Cloudflare quick tunnel →
 * upsert BRIDGE_URL + NEXT_PUBLIC_BRIDGE_PUBLIC_URL on Vercel → redeploy production
 * so NEXT_PUBLIC_* is rebuilt.
 *
 * Required on the machine that runs the tunnel: `cloudflared`, `uv`, bridge `.env`.
 * For Vercel: VERCEL_TOKEN; optional VERCEL_TEAM_ID; VERCEL_PROJECT_NAME (default: telegram-news-dashboard).
 *
 * Usage (from Dex repo root):
 *   node .scripts/telegram-news-stack-restart.cjs
 *   node .scripts/telegram-news-stack-restart.cjs --dry-run
 *   node .scripts/telegram-news-stack-restart.cjs --skip-bridge --skip-tunnel
 *   node .scripts/telegram-news-stack-restart.cjs --skip-cors-patch   (не змінювати BRIDGE_CORS_ORIGINS у bridge .env)
 *
 * Related: `telegram-news-stack-status.cjs` (processes + health + tunnel + Vercel head),
 * `telegram-news-dashboard-ship.cjs` (build + deploy NEW dashboard code — this script alone does not ship new UI commits).
 */
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE_DIR = path.join(ROOT, "apps", "telegram-news-bridge");
const CF_PID_FILE = path.join("/tmp", "dex-telegram-news-cloudflared.pid");
const LAST_TUNNEL_FILE = path.join("/tmp", "dex-telegram-last-cloudflared-url.txt");

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

function readBridgeApiSecret() {
  return readEnvValueFromFiles("BRIDGE_API_SECRET", [
    path.join(BRIDGE_DIR, ".env"),
    path.join(ROOT, ".env"),
  ]);
}

/** Read KEY=value from the first file that defines it (non-empty). */
function readEnvValueFromFiles(key, files) {
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, "utf8");
    const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m");
    const m = raw.match(re);
    if (!m) continue;
    let v = (m[1] ?? "").trim().replace(/\r$/, "");
    if (!v || v.startsWith("#")) continue;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v) return v;
  }
  const fromProc = process.env[key]?.trim();
  return fromProc || "";
}

const DASHBOARD_DIR = path.join(ROOT, "apps", "telegram-news-dashboard");
const DASHBOARD_ENV_LOCAL = path.join(DASHBOARD_DIR, ".env.local");

/** Env keys to mirror from local files → Vercel (README / .env.example). */
const VERCEL_EXTRA_ENV_SPECS = [
  {
    key: "BRIDGE_API_SECRET",
    files: [path.join(BRIDGE_DIR, ".env"), path.join(ROOT, ".env")],
    sensitive: true,
  },
  {
    key: "BRIDGE_JWT_SECRET",
    files: [path.join(BRIDGE_DIR, ".env"), path.join(ROOT, ".env")],
    sensitive: true,
  },
  {
    key: "DASHBOARD_PASSWORD",
    files: [DASHBOARD_ENV_LOCAL, path.join(BRIDGE_DIR, ".env")],
    sensitive: true,
  },
  {
    key: "DASHBOARD_SESSION_SECRET",
    files: [DASHBOARD_ENV_LOCAL, path.join(BRIDGE_DIR, ".env")],
    sensitive: true,
  },
  {
    key: "REWRITE_BACKEND",
    files: [DASHBOARD_ENV_LOCAL, path.join(BRIDGE_DIR, ".env")],
    sensitive: false,
  },
  {
    key: "OPENAI_API_KEY",
    files: [DASHBOARD_ENV_LOCAL, path.join(BRIDGE_DIR, ".env"), path.join(ROOT, ".env")],
    sensitive: true,
  },
  {
    key: "REWRITE_MODEL",
    files: [DASHBOARD_ENV_LOCAL, path.join(BRIDGE_DIR, ".env")],
    sensitive: false,
  },
];

/** Append trycloudflare origin to BRIDGE_CORS_ORIGINS so browser can call the tunnel. */
function ensureBridgeCorsOrigin(bridgeEnvPath, origin) {
  const o = origin.replace(/\/+$/, "");
  if (!fs.existsSync(bridgeEnvPath)) {
    console.warn(`no ${bridgeEnvPath} → skip CORS patch`);
    return;
  }
  let text = fs.readFileSync(bridgeEnvPath, "utf8");
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const re = /^(\s*BRIDGE_CORS_ORIGINS=)([^\n\r]*)$/m;
  const m = text.match(re);
  if (m) {
    const parts = m[2]
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    if (parts.includes(o)) {
      console.log("BRIDGE_CORS_ORIGINS: already includes tunnel URL");
      return;
    }
    parts.push(o);
    text = text.replace(re, `$1${parts.join(",")}`);
  } else {
    if (!text.endsWith("\n") && text.length) text += nl;
    text += `BRIDGE_CORS_ORIGINS=${o}${nl}`;
  }
  fs.writeFileSync(bridgeEnvPath, text);
  console.log(`patched BRIDGE_CORS_ORIGINS in ${path.relative(ROOT, bridgeEnvPath)}`);
}

async function verifyTunnelFeed(baseUrl, bearer) {
  const root = baseUrl.replace(/\/+$/, "");
  const u = `${root}/feed`;
  const r = await fetch(u, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`tunnel GET /feed failed: ${r.status} ${await r.text()}`);
  const j = await r.json().catch(() => ({}));
  const n = j.channels ? Object.keys(j.channels).length : 0;
  console.log(`tunnel feed: ok (${n} channel keys via ${u})`);
}

function killPidfile(pidFile, label) {
  if (!fs.existsSync(pidFile)) return;
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    fs.unlinkSync(pidFile);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`${label}: sent SIGTERM to PID ${pid}`);
  } catch {
    /* ignore */
  }
  fs.unlinkSync(pidFile);
}

function restartBridgeDetached() {
  const sh = path.join(BRIDGE_DIR, "scripts", "restart-bridge.sh");
  const r = spawnSync("bash", [sh, "--detach"], {
    cwd: BRIDGE_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "restart-bridge failed");
    process.exit(r.status || 1);
  }
  console.log((r.stdout || "").trim());
}

async function waitForBridgeHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/health`;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j && j.status === "ok") return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`bridge health check failed: ${url}`);
}

/** Start Cloudflare quick tunnel; parse public HTTPS URL from stdout/stderr. */
async function startCloudflaredQuickTunnel(port) {
  killPidfile(CF_PID_FILE, "cloudflared");

  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      reject(new Error("timeout waiting for trycloudflare.com URL from cloudflared (60s)"));
    }, 60000);

    const tryResolve = (chunk) => {
      if (settled) return;
      const m = String(chunk).match(QUICK_TUNNEL_RE);
      if (!m) return;
      settled = true;
      clearTimeout(timeout);
      const url = m[0].replace(/\/+$/, "");
      fs.writeFileSync(CF_PID_FILE, String(child.pid), "utf8");
      fs.writeFileSync(LAST_TUNNEL_FILE, `${url}\n`, "utf8");
      child.stdout?.removeAllListeners("data");
      child.stderr?.removeAllListeners("data");
      child.unref();
      resolve(url);
    };

    child.stdout.on("data", tryResolve);
    child.stderr.on("data", tryResolve);
    child.on("error", (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(e);
      }
    });
    child.on("exit", (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`cloudflared exited before URL (code=${code} sig=${sig || ""})`));
    });
  });
}

function deploymentsListUrl(projectId, teamId) {
  const u = new URL("https://api.vercel.com/v6/deployments");
  u.searchParams.set("projectId", projectId);
  u.searchParams.set("target", "production");
  u.searchParams.set("limit", "1");
  if (teamId) u.searchParams.set("teamId", teamId);
  return u.toString();
}

async function vercelUpsertBridgeUrls({ token, teamId, projectName, baseUrl }) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}&upsert=true` : "?upsert=true";
  const keys = ["BRIDGE_URL", "NEXT_PUBLIC_BRIDGE_PUBLIC_URL"];
  for (const key of keys) {
    const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env${q}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value: baseUrl,
        type: "plain",
        target: ["production", "preview"],
        comment: "synced by .scripts/telegram-news-stack-restart.cjs (Cloudflare quick tunnel)",
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Vercel env upsert ${key}: ${r.status} ${t}`);
    }
    console.log(`Vercel: upserted ${key}`);
  }
}

async function vercelUpsertOneEnv({ token, teamId, projectName, key, value, type, comment }) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}&upsert=true` : "?upsert=true";
  const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env${q}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type,
      target: ["production", "preview"],
      comment,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Vercel env upsert ${key}: ${r.status} ${t}`);
  }
  console.log(`Vercel: upserted ${key}`);
}

/** Push BRIDGE_* secrets and optional dashboard keys from local .env files (see README). */
async function vercelUpsertExtraEnvFromLocal({ token, teamId, projectName }) {
  for (const spec of VERCEL_EXTRA_ENV_SPECS) {
    const value = readEnvValueFromFiles(spec.key, spec.files);
    if (!value) {
      console.log(`Vercel: skip ${spec.key} (empty locally)`);
      continue;
    }
    const type = spec.sensitive ? "encrypted" : "plain";
    await vercelUpsertOneEnv({
      token,
      teamId,
      projectName,
      key: spec.key,
      value,
      type,
      comment: "synced by .scripts/telegram-news-stack-restart.cjs (local .env)",
    });
  }
}

async function vercelRedeployProduction({ token, teamId, projectName }) {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (hook) {
    const r = await fetch(hook, { method: "POST" });
    if (!r.ok) throw new Error(`deploy hook POST failed: ${r.status}`);
    console.log("Vercel: triggered VERCEL_DEPLOY_HOOK_URL redeploy");
    return;
  }

  const tid = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const projRes = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${tid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!projRes.ok) throw new Error(`Vercel get project: ${projRes.status} ${await projRes.text()}`);
  const proj = await projRes.json();
  const projectId = proj.id;

  const listRes = await fetch(deploymentsListUrl(projectId, teamId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Vercel list deployments: ${listRes.status} ${await listRes.text()}`);
  const list = await listRes.json();
  const dep0 = list.deployments?.[0];
  const uid = dep0?.uid || dep0?.id;
  if (!uid) throw new Error("no production deployment found (cannot redeploy)");

  const depRes = await fetch(`https://api.vercel.com/v13/deployments${tid ? `?teamId=${encodeURIComponent(teamId)}` : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Without target, Vercel defaults to preview — production keeps old NEXT_PUBLIC_* / BRIDGE_URL.
    body: JSON.stringify({ name: projectName, deploymentId: uid, target: "production" }),
  });
  if (!depRes.ok) throw new Error(`Vercel redeploy: ${depRes.status} ${await depRes.text()}`);
  const out = await depRes.json();
  console.log(`Vercel: redeploy started uid=${out.id || uid}`);
}

async function main() {
  const dry = argHas("--dry-run");
  const skipBridge = argHas("--skip-bridge");
  const skipTunnel = argHas("--skip-tunnel");
  const skipVercel = argHas("--skip-vercel");
  const skipCorsPatch = argHas("--skip-cors-patch");

  const port = readBridgePort();
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectName = process.env.VERCEL_PROJECT_NAME?.trim() || "telegram-news-dashboard";

  console.log(`Repo root: ${ROOT}`);
  console.log(`BRIDGE_PORT (effective): ${port}`);

  if (dry) {
    console.log("[dry-run] would: restart bridge → cloudflared quick tunnel → Vercel env + redeploy");
    if (!token) console.log("[dry-run] VERCEL_TOKEN missing → Vercel steps skipped");
    return;
  }

  if (!skipBridge) {
    restartBridgeDetached();
    await waitForBridgeHealth(port, 45_000);
    console.log("bridge: healthy");
  }

  let publicUrl = null;
  if (!skipTunnel) {
    const which = spawnSync("which", ["cloudflared"], { encoding: "utf8" });
    if (which.status !== 0) {
      console.error("Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/");
      process.exit(1);
    }
    publicUrl = await startCloudflaredQuickTunnel(port);
    console.log(`cloudflared: ${publicUrl}`);

    if (!skipCorsPatch && publicUrl) {
      const envFile = path.join(BRIDGE_DIR, ".env");
      ensureBridgeCorsOrigin(envFile, publicUrl);
      if (!skipBridge) {
        console.log("restarting bridge to pick up BRIDGE_CORS_ORIGINS…");
        restartBridgeDetached();
        await waitForBridgeHealth(port, 45_000);
        console.log("bridge: healthy (after CORS)");
      } else {
        console.warn("Restart bridge manually to apply BRIDGE_CORS_ORIGINS (--skip-bridge was set).");
      }
    }
  } else if (fs.existsSync(LAST_TUNNEL_FILE)) {
    publicUrl = fs.readFileSync(LAST_TUNNEL_FILE, "utf8").trim();
    console.log(`cloudflared: skipped, using last URL file: ${publicUrl}`);
  }

  if (skipVercel || !token) {
    if (!token) console.warn("VERCEL_TOKEN not set → skip Vercel env sync and redeploy");
    else console.log("--skip-vercel: leaving Vercel unchanged");
    if (publicUrl) console.log(`Tunnel URL (set manually on Vercel if needed): ${publicUrl}`);
    return;
  }

  if (!publicUrl) {
    console.warn("No tunnel URL → skip Vercel (start tunnel or pass --skip-tunnel=false)");
    return;
  }

  await vercelUpsertBridgeUrls({ token, teamId, projectName, baseUrl: publicUrl });
  await vercelUpsertExtraEnvFromLocal({ token, teamId, projectName });
  await vercelRedeployProduction({ token, teamId, projectName });

  const bearer = readBridgeApiSecret();
  if (bearer) {
    try {
      await verifyTunnelFeed(publicUrl, bearer);
    } catch (e) {
      console.warn("tunnel /feed verify skipped or failed:", e.message || e);
    }
  } else {
    console.warn("BRIDGE_API_SECRET not found in .env → skip GET /feed through tunnel");
  }

  console.log("Done. Production rebuild may take 1–3 minutes; client will pick up NEXT_PUBLIC_* after deploy.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
