#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const {
  FULL_FLOW_CHROME_STEPS,
  resolveProfileDirsForFullFlowStep,
  listChromeProcessesForProfile
} = require('./teal-chrome-cleanup-eval-lib.cjs');
const { listChromeProcessesForProfile: fromProfile } = require('./teal-chrome-profile.cjs');

assert.ok(FULL_FLOW_CHROME_STEPS.has(6));
assert.ok(FULL_FLOW_CHROME_STEPS.has(8));
assert.ok(!FULL_FLOW_CHROME_STEPS.has(9));

const dirs6 = resolveProfileDirsForFullFlowStep(6, {
  TEAL_CHROME_PROFILE: require('./job-search-paths.cjs').TEAL_CHROME_PROFILE_ALT
});
assert.equal(dirs6.length, 1);
assert.ok(fs.existsSync(dirs6[0]));

const dirs3 = resolveProfileDirsForFullFlowStep(3);
assert.equal(dirs3.length, 0);

assert.deepEqual(listChromeProcessesForProfile('/nonexistent/path/xyz'), []);
assert.strictEqual(listChromeProcessesForProfile, fromProfile);

console.log('OK: teal-chrome-cleanup-eval-lib');
