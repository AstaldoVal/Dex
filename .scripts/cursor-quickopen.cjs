#!/usr/bin/env node
/**
 * Opens Quick Open (Cmd+P) with a prefilled path prefix via Dex extension UriHandler.
 * Requires: tools/cursor-chat-projects VSIX 0.1.6+ installed, Reload Window.
 *
 * Usage: node .scripts/cursor-quickopen.cjs <relative-to-repo-or-absolute>
 *   npm run cursor:quickopen -- 04-Projects/foo/bar.md
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const os = require("os");

const EXT_AUTHORITY = "dex.cursor-chat-projects";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node .scripts/cursor-quickopen.cjs <path-or-prefix>");
  process.exit(1);
}

const repoRoot = process.env.VAULT_PATH || process.cwd();
const resolved = path.isAbsolute(arg) ? arg : path.resolve(repoRoot, arg);

let prefix;
if (fs.existsSync(resolved)) {
  const rel = path.relative(repoRoot, resolved);
  prefix = rel.startsWith("..") ? resolved : rel.split(path.sep).join("/");
} else {
  prefix = path.isAbsolute(arg) ? arg.split(path.sep).join("/") : arg.split(path.sep).join("/");
}

const uri = `vscode://${EXT_AUTHORITY}/quickopen?path=${encodeURIComponent(prefix)}`;

function openUri(u) {
  const platform = os.platform();
  if (platform === "darwin") {
    return spawnSync("open", ["-a", "Cursor", u], { stdio: "inherit", shell: false });
  }
  const r = spawnSync("cursor", [u], { stdio: "inherit", shell: false });
  if ((r.status ?? 1) === 0) return r;
  if (platform === "win32") {
    return spawnSync("cmd", ["/c", "start", "", u], { stdio: "inherit", shell: false });
  }
  return spawnSync("xdg-open", [u], { stdio: "inherit", shell: false });
}

const r = openUri(uri);
process.exit(r.status ?? 1);
