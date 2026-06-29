#!/usr/bin/env node
'use strict';

const { ALL_ED_GATE_IDS, runEDGateUnit, simulateEducationPipeline } = require('./education-gates.cjs');

let failed = 0;
for (const gateId of ALL_ED_GATE_IDS) {
  const r = runEDGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateEducationPipeline();
if (!pipe.pass) {
  console.error('education pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: education gates e2e sim (${ALL_ED_GATE_IDS.length} gates + pipeline)`);
