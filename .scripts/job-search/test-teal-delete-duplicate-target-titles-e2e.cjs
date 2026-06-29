#!/usr/bin/env node
'use strict';

/**
 * E2E (simulated): T10 maintenance dedupe plan + delete simulation (no Teal).
 */
const assert = require('assert');
const {
  planTargetTitleDedupeDeletes,
  simulateTargetTitleDedupe,
  T10_MAINTENANCE_NPM
} = require('./teal-delete-duplicate-target-titles-lib.cjs');

const plan5 = planTargetTitleDedupeDeletes(5, 1);
assert.strictEqual(plan5.deletes.length, 4);
assert.strictEqual(plan5.finalCount, 1);

const run = simulateTargetTitleDedupe({ initialCount: 4, keep: 1, confirmPopup: true });
assert.strictEqual(run.deleted, 3);
assert.strictEqual(run.remaining, 1);
assert.strictEqual(run.exitCode, 0);

const partial = simulateTargetTitleDedupe({ initialCount: 2, keep: 1 });
assert.strictEqual(partial.deleted, 1);
assert.strictEqual(partial.remaining, 1);

const fail = simulateTargetTitleDedupe({
  initialCount: 3,
  keep: 1,
  deleteAlwaysOk: false
});
assert.strictEqual(fail.exitCode, 1);

assert.ok(T10_MAINTENANCE_NPM.includes('teal-delete-duplicate-target-titles'));

console.log('OK: teal-delete-duplicate-target-titles e2e sim (T10 maintenance)');
