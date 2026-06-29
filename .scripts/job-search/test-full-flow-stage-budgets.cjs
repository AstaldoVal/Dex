#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { getFullFlowPlan } = require('./full-flow-stage-budgets.cjs');

const plan = getFullFlowPlan();
assert.equal(plan.activeSteps.length, 10);
assert(plan.totalLimitMs > plan.sumLimitMs);
console.log('OK: full-flow stage budgets, totalLimitMs=' + plan.totalLimitMs);
