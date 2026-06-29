#!/usr/bin/env node
'use strict';

/**
 * Unit tests: WE1–WE8 (work-experience-gates.cjs).
 */
const { ALL_WE_GATE_IDS, runWEGateUnit } = require('./work-experience-gates.cjs');

let failed = 0;
for (const gateId of ALL_WE_GATE_IDS) {
  const r = runWEGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`Work experience gates unit: ${failed}/${ALL_WE_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(
  `OK: work experience gates unit (${ALL_WE_GATE_IDS.length} gates: ${ALL_WE_GATE_IDS.join(', ')})`
);
