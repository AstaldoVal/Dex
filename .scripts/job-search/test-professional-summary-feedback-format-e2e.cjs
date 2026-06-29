#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): full feedback format pipeline F-1 … F-6, F-4a, F-1-legacy — no Teal.
 */
const {
  ALL_F_SCENARIO_IDS,
  simulateFeedbackFormatScenario,
  assertScenarioMatchesExpect
} = require('./professional-summary-feedback-format-simulator.cjs');

const E2E_SCENARIOS = ALL_F_SCENARIO_IDS;

let failed = 0;
for (const id of E2E_SCENARIOS) {
  const sim = simulateFeedbackFormatScenario(id);
  const errors = assertScenarioMatchesExpect(sim);
  if (errors.length) {
    console.error(`FAIL ${id}:`, errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`E2E sim: ${failed}/${E2E_SCENARIOS.length} scenarios failed`);
  process.exit(1);
}

console.log(`OK: professional summary feedback format e2e sim (${E2E_SCENARIOS.length} scenarios: ${E2E_SCENARIOS.join(', ')})`);
