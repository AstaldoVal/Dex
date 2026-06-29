#!/usr/bin/env node
'use strict';

const { ALL_IN_GATE_IDS, runINGateUnit } = require('./interests-gates.cjs');

let failed = 0;
for (const gateId of ALL_IN_GATE_IDS) {
  const r = runINGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`interests gates unit: ${failed}/${ALL_IN_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: interests gates unit (${ALL_IN_GATE_IDS.length} gates: ${ALL_IN_GATE_IDS.join(', ')})`);
