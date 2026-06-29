#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { getBlockLivePlan, filterGateOrder, getSessionBudget } = require('./block-live-gate-budgets.cjs');

const plan = getBlockLivePlan({ slug: 'skills' });
assert(plan.gateOrder.length === 20, 'skills gate count');
assert(plan.totalLimitMs > plan.sumLimitMs, 'buffer included');
assert(plan.totalLimitMs < 60 * 60 * 1000, 'under 60 min ceiling');
assert(plan.session.limitMs >= 180_000, 'session budget present');

const partial = getSessionBudget(['SK1', 'SK3', 'SK7', 'SK9']);
assert(partial.limitMs >= 240_000, 'partial live run gets wider session budget');

const sub = filterGateOrder(plan.gateOrder, ['SK4', 'SK1']);
assert(sub.length === 2 && sub[0] === 'SK1' && sub[1] === 'SK4', 'filter order preserved from liveOrder');

console.log('OK: block-live gate budgets');
