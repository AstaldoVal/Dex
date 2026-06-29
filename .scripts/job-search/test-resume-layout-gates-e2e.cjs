#!/usr/bin/env node
'use strict';

const {
  ALL_LY_GATE_IDS,
  runLYGateUnit,
  simulateResumeLayoutPipeline
} = require('./resume-layout-gates.cjs');

let failed = 0;
for (const gateId of ALL_LY_GATE_IDS) {
  const r = runLYGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateResumeLayoutPipeline();
if (!pipe.pass) {
  console.error('E2E resume layout pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: resume layout gates e2e sim (${ALL_LY_GATE_IDS.length} gates + combined pipeline)`);
