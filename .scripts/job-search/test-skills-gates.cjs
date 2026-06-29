#!/usr/bin/env node
'use strict';

const { ALL_SK_GATE_IDS, runSKGateUnit } = require('./skills-gates.cjs');

let failed = 0;
for (const gateId of ALL_SK_GATE_IDS) {
  const r = runSKGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`skills gates unit: ${failed}/${ALL_SK_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: skills gates unit (${ALL_SK_GATE_IDS.length} gates: ${ALL_SK_GATE_IDS.join(', ')})`);
