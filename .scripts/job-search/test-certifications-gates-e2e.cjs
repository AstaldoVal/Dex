#!/usr/bin/env node
'use strict';

const {
  ALL_CT_GATE_IDS,
  runCTGateUnit,
  simulateCertificationsPipeline
} = require('./certifications-gates.cjs');

let failed = 0;
for (const gateId of ALL_CT_GATE_IDS) {
  const r = runCTGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateCertificationsPipeline();
if (!pipe.pass) {
  console.error('E2E certifications pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: certifications gates e2e sim (${ALL_CT_GATE_IDS.length} gates + combined pipeline)`);
