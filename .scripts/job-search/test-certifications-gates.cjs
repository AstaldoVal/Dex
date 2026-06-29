#!/usr/bin/env node
'use strict';

const { ALL_CT_GATE_IDS, runCTGateUnit } = require('./certifications-gates.cjs');

let failed = 0;
for (const gateId of ALL_CT_GATE_IDS) {
  const r = runCTGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`certifications gates unit: ${failed}/${ALL_CT_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: certifications gates unit (${ALL_CT_GATE_IDS.length} gates: ${ALL_CT_GATE_IDS.join(', ')})`);
