#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): contact header block — CH1 omit + CH2 set_field deferred in one normalize pass.
 * Optional live Teal: CONTACT_HEADER_E2E_LIVE=1 TEAL_RESUME_ID=<id>
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { ALL_CH_GATE_IDS, runCHGateUnit, simulateContactHeaderPipeline } = require('./contact-header-gates.cjs');

let failed = 0;

for (const gateId of ALL_CH_GATE_IDS) {
  const r = runCHGateUnit(gateId);
  if (!r.pass) {
    console.error(`E2E gate ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

const pipe = simulateContactHeaderPipeline();
if (!pipe.pass) {
  console.error('E2E contact header pipeline:', pipe.pipelineErrors.join('; '));
  failed += 1;
}

if (failed) {
  console.error(`E2E contact header sim failed (${failed} checks)`);
  process.exit(1);
}

console.log(
  `OK: contact header gates e2e sim (${ALL_CH_GATE_IDS.length} gates + combined pipeline)`
);

const { shouldRunContactHeaderLiveTeal } = require('./contact-header-live-resolve.cjs');
if (shouldRunContactHeaderLiveTeal()) {
  const liveScript = path.join(__dirname, 'test-contact-header-gates-live-teal.cjs');
  const r = spawnSync(process.execPath, [liveScript], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, CONTACT_HEADER_E2E_LIVE: process.env.CONTACT_HEADER_E2E_LIVE || 'auto' },
    stdio: 'inherit'
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
