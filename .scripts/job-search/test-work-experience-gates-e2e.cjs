#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated):
 * - pipeline A: WE1–WE4 apply + WE5/WE8 deferred in one normalize pass
 * - pipeline B: WE10–WE16 metadata (canonical location, PDF flags, dates_match) + ensure sim
 * Optional live Teal: WORK_EXPERIENCE_E2E_LIVE=1 TEAL_RESUME_ID=<id>
 */
const { spawnSync } = require('child_process');
const path = require('path');
const {
  ALL_WE_GATE_IDS,
  runWEGateUnit,
  simulateWorkExperiencePipeline,
  simulateWorkExperienceMetadataPipeline
} = require('./work-experience-gates.cjs');

let failed = 0;

for (const gateId of ALL_WE_GATE_IDS) {
  const r = runWEGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

const pipe = simulateWorkExperiencePipeline();
if (!pipe.pass) {
  console.error('E2E work experience pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}

const metaPipe = simulateWorkExperienceMetadataPipeline();
if (!metaPipe.pass) {
  console.error('E2E work experience metadata pipeline:', metaPipe.pipelineErrors.join('; '));
  failed += 1;
}

if (failed) {
  console.error(`E2E work experience sim failed (${failed} checks)`);
  process.exit(1);
}

console.log(
  `OK: work experience gates e2e sim (${ALL_WE_GATE_IDS.length} unit gates + toggle pipeline + metadata pipeline)`
);

const { shouldRunWorkExperienceLiveTeal } = require('./work-experience-live-resolve.cjs');
if (shouldRunWorkExperienceLiveTeal()) {
  const liveScript = path.join(__dirname, 'test-work-experience-gates-live-teal.cjs');
  const r = spawnSync(process.execPath, [liveScript], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, WORK_EXPERIENCE_E2E_LIVE: process.env.WORK_EXPERIENCE_E2E_LIVE || 'auto' },
    stdio: 'inherit'
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
