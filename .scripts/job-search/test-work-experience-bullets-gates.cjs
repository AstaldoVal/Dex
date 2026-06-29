#!/usr/bin/env node
'use strict';

const { ALL_WB_GATE_IDS, runWBGateUnit } = require('./work-experience-bullets-gates.cjs');

let failed = 0;
for (const gateId of ALL_WB_GATE_IDS) {
  const r = runWBGateUnit(gateId);
  if (!r.pass) {
    console.error(`FAIL ${gateId}:`, r.errors.join('; '));
    failed += 1;
  }
}

if (failed) {
  console.error(`Work experience bullets gates unit: ${failed}/${ALL_WB_GATE_IDS.length} failed`);
  process.exit(1);
}

console.log(
  `OK: work experience bullets gates unit (${ALL_WB_GATE_IDS.length} gates: ${ALL_WB_GATE_IDS.join(', ')})`
);
