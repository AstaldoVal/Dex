#!/usr/bin/env node
"use strict";

/**
 * Copy built Paperclip UI into every runtime that serves :3100 static UI.
 * Dev checkout: server/ui-dist. Global npm: @paperclipai/server/ui-dist.
 *
 * Usage (from DEX root): node .scripts/paperclip/sync-paperclip-ui-to-runtime.cjs
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEV_ROOT = process.env.PAPERCLIP_DEV_ROOT
  || path.join(process.env.HOME || "", "Development", "paperclip");
const UI_DIST = path.join(DEV_ROOT, "ui", "dist");
const SERVER_UI_DIST = path.join(DEV_ROOT, "server", "ui-dist");

const GLOBAL_SERVER_UI = path.join(
  process.env.HOME || "",
  ".npm-global/lib/node_modules/paperclipai/node_modules/@paperclipai/server/ui-dist",
);

function copyUiDist(targetDir) {
  if (!fs.existsSync(path.join(UI_DIST, "index.html"))) {
    throw new Error(`Missing UI build at ${UI_DIST}/index.html — run pnpm build in ${DEV_ROOT}`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(UI_DIST, targetDir, { recursive: true });
  const html = fs.readFileSync(path.join(targetDir, "index.html"), "utf8");
  const match = html.match(/assets\/index-[^"]+\.js/);
  console.log(`  synced -> ${targetDir} (${match ? match[0] : "index.html"})`);
}

if (!fs.existsSync(DEV_ROOT)) {
  console.error(`Paperclip dev root not found: ${DEV_ROOT}`);
  process.exit(1);
}

console.log(`→ Paperclip UI sync from ${DEV_ROOT}`);
if (!fs.existsSync(path.join(UI_DIST, "index.html"))) {
  console.log("  building @paperclipai/ui...");
  execSync("pnpm --filter @paperclipai/ui build", {
    cwd: DEV_ROOT,
    stdio: "inherit",
    env: { ...process.env, PATH: `${process.env.HOME}/.npm-global/bin:/opt/homebrew/bin:${process.env.PATH || ""}` },
  });
}

execSync("bash scripts/prepare-server-ui-dist.sh", {
  cwd: DEV_ROOT,
  stdio: "inherit",
  env: { ...process.env, PAPERCLIP_RELEASE_REUSE_UI_DIST: "1" },
});

if (fs.existsSync(path.dirname(GLOBAL_SERVER_UI))) {
  try {
    copyUiDist(GLOBAL_SERVER_UI);
  } catch (err) {
    console.warn(
      `  warn: global npm UI sync skipped (${err && err.message ? err.message : err})`,
    );
    console.warn(`  dev server/ui-dist is still updated via prepare-server-ui-dist.sh`);
  }
} else {
  console.log(`  skip global npm UI (not found): ${GLOBAL_SERVER_UI}`);
}

console.log("done");
