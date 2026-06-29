#!/usr/bin/env node
'use strict';

const { ALL_BL_GATE_IDS, runBLGateUnit } = require('./blurbs-gates.cjs');

let failed = 0;
for (const gateId of ALL_BL_GATE_IDS) {
  const r = runBLGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`blurbs gates unit: ${failed}/${ALL_BL_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: blurbs gates unit (${ALL_BL_GATE_IDS.length} gates: ${ALL_BL_GATE_IDS.join(', ')})`);
