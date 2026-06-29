#!/usr/bin/env node
'use strict';

/**
 * Unit / contract tests for T10 maintenance — teal-delete-duplicate-target-titles.cjs
 * (no Playwright; complements live T10 read-only check in target-title-live-teal-harness).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  planTargetTitleDedupeDeletes,
  simulateTargetTitleDedupe,
  T10_MAINTENANCE_NPM,
  isDexTargetTitleProbeLabel
} = require('./teal-delete-duplicate-target-titles-lib.cjs');

const scriptPath = path.join(__dirname, 'teal-delete-duplicate-target-titles.cjs');

assert.ok(fs.existsSync(scriptPath), 'teal-delete-duplicate-target-titles.cjs exists');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
assert.ok(pkg.scripts && pkg.scripts[T10_MAINTENANCE_NPM], `${T10_MAINTENANCE_NPM} in package.json`);

const src = fs.readFileSync(scriptPath, 'utf8');
assert.match(src, /teal-delete-duplicate-target-titles-lib/, 'T10 script uses shared lib');

const plan = planTargetTitleDedupeDeletes(3, 1);
assert.strictEqual(plan.deletes.length, 2);

const sim = simulateTargetTitleDedupe({ initialCount: 3, keep: 1 });
assert.strictEqual(sim.deleted, 2);
assert.strictEqual(sim.remaining, 1);

assert.ok(isDexTargetTitleProbeLabel('DEX T4 Probe abc123'));
assert.ok(isDexTargetTitleProbeLabel('DEX T9 Probe deadbeef'));
assert.ok(isDexTargetTitleProbeLabel('DEX T10 dup ff00'));
assert.ok(!isDexTargetTitleProbeLabel('Senior Product Manager'));

console.log(`OK: ${T10_MAINTENANCE_NPM} contract unit (T10 maintenance + probe labels)`);
