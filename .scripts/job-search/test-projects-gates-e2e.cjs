#!/usr/bin/env node
'use strict';

const { ALL_PR_GATE_IDS, runPRGateUnit, simulateProjectsPipeline } = require('./projects-gates.cjs');

let failed = 0;
for (const gateId of ALL_PR_GATE_IDS) {
  const r = runPRGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateProjectsPipeline();
if (!pipe.pass) {
  console.error('E2E projects pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: projects gates e2e sim (${ALL_PR_GATE_IDS.length} gates + combined pipeline)`);
