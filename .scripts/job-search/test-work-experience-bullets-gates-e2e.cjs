#!/usr/bin/env node
'use strict';

const {
  ALL_WB_GATE_IDS,
  runWBGateUnit,
  simulateWorkExperienceBulletsPipeline
} = require('./work-experience-bullets-gates.cjs');

let failed = 0;
for (const gateId of ALL_WB_GATE_IDS) {
  const r = runWBGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateWorkExperienceBulletsPipeline();
if (!pipe.pass) {
  console.error('E2E work experience bullets pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) {
  console.error(`E2E work experience bullets sim failed (${failed} checks)`);
  process.exit(1);
}
console.log(
  `OK: work experience bullets gates e2e sim (${ALL_WB_GATE_IDS.length} gates + combined pipeline)`
);
