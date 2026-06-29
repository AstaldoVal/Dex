#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): PS7/PS9/PS10 regen collect → dry-run → fail blocks paste → ok allows paste.
 */
const {
  ALL_REGEN_SCENARIO_IDS,
  runRegenScenario,
  assertRegenScenario,
  simulateRegenPipelineE2e
} = require('./professional-summary-regen-simulator.cjs');

let failed = 0;

for (const scenarioId of ALL_REGEN_SCENARIO_IDS) {
  const result = runRegenScenario(scenarioId);
  const errors = assertRegenScenario(result);
  if (errors.length) {
    console.error(`E2E scenario ${scenarioId}:`, errors.join('; '));
    failed += 1;
  }
}

const pipe = simulateRegenPipelineE2e();
if (!pipe.pass) {
  console.error('E2E regen pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}

if (failed) {
  console.error(`Regen e2e sim: ${failed} check(s) failed`);
  process.exit(1);
}

console.log(
  `OK: professional summary regen e2e sim (${ALL_REGEN_SCENARIO_IDS.length} scenarios + pipeline ${pipe.trace.length} steps)`
);
