#!/usr/bin/env node
'use strict';

/**
 * Unit tests: T1–T13 + T99 (target-title-gates.cjs).
 */
const { ALL_T_GATE_IDS, runTGateUnit } = require('./target-title-gates.cjs');

let failed = 0;
for (const gateId of ALL_T_GATE_IDS) {
  const r = runTGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`Target Title gates unit: ${failed}/${ALL_T_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(
  `OK: target title gates unit (${ALL_T_GATE_IDS.length} gates: ${ALL_T_GATE_IDS.join(', ')})`
);
