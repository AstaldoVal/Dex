#!/usr/bin/env node
/**
 * Build dashboard, then publish NEW frontend to Vercel (new git snapshot / new build).
 * stack-restart alone only upserts env + redeploys the *same* deployment commit — not enough for UI code changes.
 *
 * Order:
 *   1) npm run build in apps/telegram-news-dashboard
 *   2a) If VERCEL_DEPLOY_HOOK_URL → POST (builds default production branch from GitHub)
 *   2b) Else if VERCEL_TOKEN → npx vercel deploy --prod --yes (needs project link or scope flags)
 *   3) Print: run telegram-news:stack:restart on the Mac that hosts the tunnel if URLs changed
 *
 * Usage (from Dex root, after `source` secrets if needed):
 *   node .scripts/telegram-news-dashboard-ship.cjs
 *   node .scripts/telegram-news-dashboard-ship.cjs --build-only
 */
/* eslint-disable no-console */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DASH = path.join(ROOT, "apps", "telegram-news-dashboard");

function argHas(name) {
  return process.argv.includes(name);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  return r.status ?? 1;
}

async function main() {
  const buildOnly = argHas("--build-only");

  console.log("→ telegram-news-dashboard: npm run build");
  if (
    run("npm", ["run", "build"], {
      cwd: DASH,
      env: { NPM_CONFIG_SCRIPT_SHELL: "/bin/sh" },
    }) !== 0
  ) {
    process.exit(1);
  }
  if (buildOnly) {
    console.log("Done (--build-only).");
    process.exit(0);
  }

  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (hook) {
    console.log("→ POST VERCEL_DEPLOY_HOOK_URL (production build from Git default branch)");
    const r = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(60_000) });
    const t = await r.text();
    if (!r.ok) {
      console.error(`Deploy hook failed: ${r.status} ${t}`);
      process.exit(1);
    }
    console.log("Deploy hook accepted. Wait 1–3 min on Vercel dashboard.");
    console.log("Then on tunnel Mac: npm run telegram-news:stack:restart (if tunnel/env must sync).");
    process.exit(0);
  }

  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.error(
      "No VERCEL_DEPLOY_HOOK_URL and no VERCEL_TOKEN — cannot deploy.\n" +
        "Set VERCEL_DEPLOY_HOOK_URL (recommended: Vercel → Project → Settings → Git → Deploy Hooks)\n" +
        "or run from apps/telegram-news-dashboard: npx vercel deploy --prod --yes (linked project)."
    );
    process.exit(1);
  }

  console.log("→ npx vercel deploy --prod --yes (cwd: apps/telegram-news-dashboard)");
  const code = run(
    "npx",
    ["vercel", "deploy", "--prod", "--yes"],
    { cwd: DASH, env: { VERCEL_TOKEN: token } }
  );
  if (code !== 0) {
    console.error(
      "\nvercel deploy failed. Link the project once: cd apps/telegram-news-dashboard && npx vercel link\n" +
        "or set VERCEL_DEPLOY_HOOK_URL and push to GitHub, then re-run this script."
    );
    process.exit(code);
  }
  console.log("Done. On tunnel Mac run: npm run telegram-news:stack:restart if needed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
