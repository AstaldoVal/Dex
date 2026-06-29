#!/usr/bin/env node
'use strict';

/**
 * Unit tests: PS1–PS15 + REGEN-1…4 (professional-summary-ps-gates.cjs).
 */
const { ALL_PS_GATE_IDS, runPsGateUnit } = require('./professional-summary-ps-gates.cjs');

let failed = 0;
for (const gateId of ALL_PS_GATE_IDS) {
  const r = runPsGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`PS gates unit: ${failed}/${ALL_PS_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(`OK: professional summary PS gates unit (${ALL_PS_GATE_IDS.length} gates: ${ALL_PS_GATE_IDS.join(', ')})`);
