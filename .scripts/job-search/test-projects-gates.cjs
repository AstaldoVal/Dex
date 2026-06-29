#!/usr/bin/env node
'use strict';

const { ALL_PR_GATE_IDS, runPRGateUnit } = require('./projects-gates.cjs');

let failed = 0;
for (const gateId of ALL_PR_GATE_IDS) {
  const r = runPRGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`projects gates unit: ${failed}/${ALL_PR_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: projects gates unit (${ALL_PR_GATE_IDS.length} gates: ${ALL_PR_GATE_IDS.join(', ')})`);
