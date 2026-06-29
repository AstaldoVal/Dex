#!/usr/bin/env node
'use strict';

/**
 * Poll block-live progress.json until done or timeout.
 * For agents: short block_until loops calling this with --once, or one call with --wait.
 *
 *   node wait-block-live-progress.cjs --slug skills --wait --timeout-ms 3000000
 *   node wait-block-live-progress.cjs --slug skills --once
 */
const { getBlockLiveSuite } = require('./block-live-registry.cjs');
const { readBlockLiveProgress } = require('./block-live-progress.cjs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printProgress(p) {
  if (!p) {
    console.log('[@progress] (no file yet)');
    return;
  }
  const cur = p.currentGate ? ` current=${p.currentGate}` : '';
  const done = p.done ? ' DONE' : '';
  console.log(
    `[@progress] ok=${p.ok}${done} failed=${p.failed || 0} skipped=${p.skipped || 0} completed=${
      (p.completed || []).length
    }${cur}`
  );
}

async function main() {
  const args = process.argv.slice(2);
  let slug = process.env.BLOCK_LIVE_SLUG || 'skills';
  let wait = false;
  let timeoutMs = 3_600_000;
  let pollMs = 3000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug' && args[i + 1]) slug = args[++i];
    else if (args[i] === '--wait') wait = true;
    else if (args[i] === '--once') wait = false;
    else if (args[i] === '--timeout-ms' && args[i + 1]) timeoutMs = Number(args[++i]);
    else if (args[i] === '--poll-ms' && args[i + 1]) pollMs = Number(args[++i]);
  }
  const suite = getBlockLiveSuite(slug);
  const started = Date.now();
  for (;;) {
    const p = readBlockLiveProgress(suite.reportDir);
    printProgress(p);
    if (p && p.done) {
      process.exit(p.ok === false ? 1 : 0);
    }
    if (!wait) process.exit(2);
    if (Date.now() - started >= timeoutMs) {
      console.error('[@progress] timeout waiting for done');
      process.exit(124);
    }
    await sleep(pollMs);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
