#!/usr/bin/env node
'use strict';

/**
 * Run focus eval up to N times until a winner passes 7/7 (agent iteration helper).
 * npm run job-search:teal-chrome-focus-eval-iterate
 */
const { spawnSync } = require('child_process');
const path = require('path');

const MAX = Number(process.env.TEAL_CHROME_EVAL_MAX_ITER) || 10;
const script = path.join(__dirname, 'teal-chrome-focus-eval.cjs');

for (let i = 1; i <= MAX; i++) {
  console.log('\n=== eval iteration ' + i + '/' + MAX + ' ===\n');
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  if (r.status === 0) {
    console.log('\nEval passed on iteration ' + i);
    process.exit(0);
  }
}
console.error('\nNo winner after ' + MAX + ' iterations — inspect chrome-focus-eval/latest.json');
process.exit(1);
