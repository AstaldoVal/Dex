#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): step 9→10 Professional Summary gate pipeline (PS1–PS15 + REGEN).
 */
const {
  ALL_PS_GATE_IDS,
  runPsGateUnit,
  simulatePsGatesPipeline
} = require('./professional-summary-ps-gates.cjs');

let failed = 0;

// E2E-PS-1: each gate id passes isolated unit (same as unit file, bundled for e2e runner)
for (const gateId of ALL_PS_GATE_IDS) {
  const r = runPsGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

// E2E-PS-2: ordered pipeline (format → validators → regen → PS12 → PS13 → PS1 → REGEN block → PS14/15)
const pipe = simulatePsGatesPipeline();
if (!pipe.pass) {
  console.error('E2E pipeline:', pipe.pipelineErrors.join('; '));
  console.error('trace:', JSON.stringify(pipe.trace, null, 2));
  failed += 1;
}

if (failed) {
  console.error(`E2E sim failed (${failed} checks)`);
  process.exit(1);
}

console.log(
  `OK: professional summary PS gates e2e sim (${ALL_PS_GATE_IDS.length} gates + pipeline trace ${pipe.trace.length} steps)`
);
