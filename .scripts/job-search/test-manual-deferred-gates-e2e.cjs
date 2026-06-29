#!/usr/bin/env node
'use strict';

const {
  ALL_MD_GATE_IDS,
  runMDGateUnit,
  simulateManualDeferredPipeline
} = require('./manual-deferred-gates.cjs');

let failed = 0;
for (const gateId of ALL_MD_GATE_IDS) {
  const r = runMDGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateManualDeferredPipeline();
if (!pipe.pass) {
  console.error('E2E manual.deferred pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(`OK: manual deferred gates e2e sim (${ALL_MD_GATE_IDS.length} gates + combined pipeline)`);
