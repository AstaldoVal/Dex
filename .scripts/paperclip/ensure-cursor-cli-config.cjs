#!/usr/bin/env node
"use strict";

/**
 * Bootstrap ~/.cursor/cli-config.json before Paperclip cursor adapter heartbeats.
 * Prevents ENOENT on concurrent Cursor CLI atomic renames (HIR-278 / HIR-272).
 *
 * Env:
 *   PAPERCLIP_CLI_CONFIG_CHECK_ONLY=1  — exit 1 if missing (no write)
 */

const { ensureCursorCliConfig } = require("./paperclip-cursor-cli-config-lib.cjs");

const CHECK_ONLY = process.env.PAPERCLIP_CLI_CONFIG_CHECK_ONLY === "1";

async function main() {
  const result = await ensureCursorCliConfig({ checkOnly: CHECK_ONLY });
  if (!result.ok) {
    console.error(result.error || "cli-config bootstrap failed");
    process.exitCode = 1;
    return;
  }
  const verb = result.created ? "created" : "present";
  console.log(`cursor cli-config ${verb}: ${result.path} (${result.bytes} bytes)`);
}

main().catch((err) => {
  console.error(`paperclip:ensure-cursor-cli-config failed: ${err.message}`);
  if (err.code) console.error(`code: ${err.code}`);
  process.exitCode = 1;
});
