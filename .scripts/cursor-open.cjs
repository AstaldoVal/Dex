#!/usr/bin/env node
/**
 * Opens a file or folder in the current Cursor window (reuse).
 * Usage: node .scripts/cursor-open.cjs <relative-to-repo-or-absolute>
 *   npm run cursor:open -- 04-Projects/foo/bar.md
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node .scripts/cursor-open.cjs <path>");
  process.exit(1);
}

const repoRoot = process.env.VAULT_PATH || process.cwd();
const resolved = path.isAbsolute(arg) ? arg : path.resolve(repoRoot, arg);

if (!fs.existsSync(resolved)) {
  console.error("cursor-open: not found:", resolved);
  process.exit(1);
}

const r = spawnSync("cursor", ["-r", resolved], { stdio: "inherit", shell: false });
process.exit(r.status ?? 1);
