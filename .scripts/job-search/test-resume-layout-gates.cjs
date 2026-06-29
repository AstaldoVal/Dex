#!/usr/bin/env node
'use strict';

const { ALL_LY_GATE_IDS, runLYGateUnit } = require('./resume-layout-gates.cjs');

let failed = 0;
for (const gateId of ALL_LY_GATE_IDS) {
  const r = runLYGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`resume-layout gates unit: ${failed}/${ALL_LY_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: resume-layout gates unit (${ALL_LY_GATE_IDS.length} gates: ${ALL_LY_GATE_IDS.join(', ')})`);
