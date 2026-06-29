#!/usr/bin/env node
'use strict';

const { ALL_ED_GATE_IDS, runEDGateUnit } = require('./education-gates.cjs');

let failed = 0;
for (const gateId of ALL_ED_GATE_IDS) {
  const r = runEDGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`education gates unit: ${failed}/${ALL_ED_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: education gates unit (${ALL_ED_GATE_IDS.length} gates: ${ALL_ED_GATE_IDS.join(', ')})`);
