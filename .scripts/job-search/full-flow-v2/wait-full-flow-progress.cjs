#!/usr/bin/env node
'use strict';

const { readFullFlowProgress } = require('./full-flow-progress.cjs');

function main() {
  const once = process.argv.includes('--once');
  const p = readFullFlowProgress();
  if (!p) {
    console.log('[@progress-v2] (no full-flow-progress.json yet)');
    process.exit(once ? 1 : 0);
  }
  console.log(JSON.stringify(p, null, 2));
  process.exit(0);
}

main();
