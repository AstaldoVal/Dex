#!/usr/bin/env node
'use strict';

const { readFullFlowProgress } = require('./full-flow-progress.cjs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  let wait = false;
  let timeoutMs = 8 * 60 * 60 * 1000;
  let pollMs = 5000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wait') wait = true;
    else if (args[i] === '--once') wait = false;
    else if (args[i] === '--timeout-ms' && args[i + 1]) timeoutMs = Number(args[++i]);
    else if (args[i] === '--poll-ms' && args[i + 1]) pollMs = Number(args[++i]);
  }
  const started = Date.now();
  for (;;) {
    const p = readFullFlowProgress();
    if (!p) {
      console.log('[@progress] (no full-flow-progress.json yet)');
    } else {
      const cur = p.currentStep != null ? ` step=${p.currentStep}` : '';
      const done = p.done ? ' DONE' : '';
      console.log(
        `[@progress] ok=${p.ok}${done}${cur} lastPass=${p.lastStepPass} completed=${p.lastCompletedStep || '-'}`
      );
    }
    if (p && p.done) process.exit(p.ok === false ? 1 : 0);
    if (!wait) process.exit(2);
    if (Date.now() - started >= timeoutMs) {
      console.error('[@progress] timeout');
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
