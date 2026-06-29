#!/usr/bin/env node
'use strict';

/**
 * Unit tests: step-10 regen triggers PS7 / PS9 / PS10 (simulated, no Claude/Teal).
 */
const assert = require('assert');
const {
  ALL_REGEN_SCENARIO_IDS,
  REGEN_SCENARIOS,
  classifyRegenReasons,
  runAllRegenScenarioUnits
} = require('./professional-summary-regen-simulator.cjs');
const { collectWritingQualityRegenReasons } = require('./professional-summary-extended-gate.cjs');
const { compareStep9SummaryToStep8: compareStep8 } = require('./professional-summary-step8-quality-gate.cjs');

// classifyRegenReasons
const mixed = classifyRegenReasons([
  'step 9 summary much shorter than step 8 (40 vs 200 chars)',
  'PS9 repetition: repeated product',
  'PS10 summary too long (1900 chars, soft max 1800)'
]);
assert.strictEqual(mixed.ps7.length, 1);
assert.strictEqual(mixed.ps9.length, 1);
assert.strictEqual(mixed.ps10.length, 1);

// PS7 compare export sanity
const worse = compareStep8(
  REGEN_SCENARIOS['REGEN-PS7-shorter'].step8Text,
  REGEN_SCENARIOS['REGEN-PS7-shorter'].step9Text,
  { meta: REGEN_SCENARIOS['REGEN-PS7-shorter'].meta },
  ''
);
assert.ok(worse.worse, 'PS7 shorter fixture must compare worse');

// PS9 isolated via collectWritingQualityRegenReasons
const ps9Only = collectWritingQualityRegenReasons({
  apply: { professional_summary: { action: 'replace', text: REGEN_SCENARIOS['REGEN-PS9-writing'].step9Text } },
  meta: {
    professional_summary_extended_gate: {
      ps9_writing_quality: {
        pass: false,
        issues: [{ type: 'repetition', detail: 'repeated product' }]
      }
    }
  }
});
assert.ok(ps9Only.some((r) => /^PS9 /.test(r)), 'PS9 regen reasons');

let failed = 0;
const batch = runAllRegenScenarioUnits();
for (const r of batch.results) {
  if (!r.pass) {
    console.error(`FAIL ${r.scenarioId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed || !batch.pass) {
  console.error(`Regen unit: ${failed}/${ALL_REGEN_SCENARIO_IDS.length} failed`);
  process.exit(1);
}

console.log(
  `OK: professional summary regen unit (${ALL_REGEN_SCENARIO_IDS.length} scenarios: ${ALL_REGEN_SCENARIO_IDS.join(', ')})`
);
