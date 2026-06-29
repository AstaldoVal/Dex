#!/usr/bin/env node
'use strict';

const { ALL_BL_GATE_IDS, runBLGateUnit, simulateBlurbsPipeline } = require('./blurbs-gates.cjs');

let failed = 0;
for (const gateId of ALL_BL_GATE_IDS) {
  const r = runBLGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateBlurbsPipeline();
if (!pipe.pass) {
  console.error('E2E blurbs pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: blurbs gates e2e sim (${ALL_BL_GATE_IDS.length} gates + combined pipeline)`);
