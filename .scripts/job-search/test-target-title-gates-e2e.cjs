#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): step 9→10 Target Title gate pipeline (T1–T13 + T99).
 * Optional live Teal: TARGET_TITLE_E2E_LIVE=1 TEAL_RESUME_ID=<id> (same env as test-target-title-gates-live-teal.cjs)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const {
  ALL_T_GATE_IDS,
  runTGateUnit,
  simulateTargetTitleGatesPipeline
} = require('./target-title-gates.cjs');

let failed = 0;

for (const gateId of ALL_T_GATE_IDS) {
  const r = runTGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

const pipe = simulateTargetTitleGatesPipeline();
if (!pipe.pass) {
  console.error('E2E Target Title pipeline:', pipe.pipelineErrors.join('; '));
  console.error('trace:', JSON.stringify(pipe.trace, null, 2));
  failed += 1;
}

if (failed) {
  console.error(`E2E sim failed (${failed} checks)`);
  process.exit(1);
}

console.log(
  `OK: target title gates e2e sim (${ALL_T_GATE_IDS.length} gates + pipeline trace ${pipe.trace.length} steps)`
);

const { shouldRunTargetTitleLiveTeal } = require('./target-title-live-resolve.cjs');
if (shouldRunTargetTitleLiveTeal()) {
  const liveScript = path.join(__dirname, 'test-target-title-gates-live-teal.cjs');
  const r = spawnSync(process.execPath, [liveScript], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, TARGET_TITLE_E2E_LIVE: process.env.TARGET_TITLE_E2E_LIVE || 'auto' },
    stdio: 'inherit'
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
