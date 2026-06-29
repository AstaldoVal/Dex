#!/usr/bin/env node
'use strict';

const { ALL_MD_GATE_IDS, runMDGateUnit } = require('./manual-deferred-gates.cjs');

let failed = 0;
for (const gateId of ALL_MD_GATE_IDS) {
  const r = runMDGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`manual-deferred gates unit: ${failed}/${ALL_MD_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: manual-deferred gates unit (${ALL_MD_GATE_IDS.length} gates: ${ALL_MD_GATE_IDS.join(', ')})`);
