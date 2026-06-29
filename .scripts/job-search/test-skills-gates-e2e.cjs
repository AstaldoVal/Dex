#!/usr/bin/env node
'use strict';

const {
  ALL_SK_GATE_IDS,
  runSKGateUnit,
  simulateSkillsPipeline,
  simulateSkillsDuplicatePipelines
} = require('./skills-gates.cjs');

let failed = 0;
for (const gateId of ALL_SK_GATE_IDS) {
  const r = runSKGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}
const pipe = simulateSkillsPipeline();
if (!pipe.pass) {
  console.error('E2E skills pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}
const dup = simulateSkillsDuplicatePipelines();
if (!dup.pass) {
  console.error('E2E skills dup pipeline:', dup.pipelineErrors.join('; '));
  failed += 1;
}
if (failed) process.exit(1);
console.log(
  `OK: skills gates e2e sim (${ALL_SK_GATE_IDS.length} gates + pipeline + SK19/SK20 dup-policy)`
);
