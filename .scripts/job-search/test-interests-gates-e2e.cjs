#!/usr/bin/env node
'use strict';

const { ALL_IN_GATE_IDS, runINGateUnit, simulateInterestsPipeline } = require('./interests-gates.cjs');

let failed = 0;
for (const gateId of ALL_IN_GATE_IDS) {
  const r = runINGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateInterestsPipeline();
if (!pipe.pass) {
  console.error('E2E interests pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: interests gates e2e sim (${ALL_IN_GATE_IDS.length} gates + combined pipeline)`);
