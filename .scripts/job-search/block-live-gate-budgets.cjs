'use strict';

/**
 * Per-gate wall-clock budgets for block Live Dedicated (LD) Teal runs.
 * Used by test-block-gates-live-teal.cjs (in-process race) and run-block-live-watched.cjs (watchdog ceiling).
 */
const { getBlockLiveSuite } = require('./block-live-registry.cjs');

/** @type {Record<string, { limitMs: number, stallMs: number, phase: string }>} */
const SK_GATE_BUDGETS = {
  __session__: { limitMs: 180_000, stallMs: 90_000, phase: 'session' },
  __teardown__: { limitMs: 60_000, stallMs: 45_000, phase: 'teardown' },
  SK1: { limitMs: 240_000, stallMs: 120_000, phase: 'probe' },
  SK2: { limitMs: 60_000, stallMs: 45_000, phase: 'read' },
  SK3: { limitMs: 360_000, stallMs: 150_000, phase: 'probe' },
  SK4: { limitMs: 90_000, stallMs: 60_000, phase: 'checkbox' },
  SK5: { limitMs: 90_000, stallMs: 60_000, phase: 'checkbox' },
  SK6: { limitMs: 90_000, stallMs: 60_000, phase: 'checkbox' },
  SK7: { limitMs: 180_000, stallMs: 90_000, phase: 'category' },
  SK8: { limitMs: 60_000, stallMs: 45_000, phase: 'read' },
  SK9: { limitMs: 180_000, stallMs: 90_000, phase: 'category' },
  SK10: { limitMs: 240_000, stallMs: 120_000, phase: 'category' },
  SK11: { limitMs: 180_000, stallMs: 90_000, phase: 'category' },
  SK12: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' },
  SK13: { limitMs: 120_000, stallMs: 60_000, phase: 'category' },
  SK14: { limitMs: 60_000, stallMs: 45_000, phase: 'read' },
  SK15: { limitMs: 60_000, stallMs: 45_000, phase: 'read' },
  SK16: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' },
  SK17: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' },
  SK19: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' },
  SK20: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' },
  SK99: { limitMs: 30_000, stallMs: 20_000, phase: 'routing' }
};

const DEFAULT_GATE_BUDGET = { limitMs: 120_000, stallMs: 60_000, phase: 'other' };

function getGateBudget(gateId) {
  return SK_GATE_BUDGETS[gateId] || { ...DEFAULT_GATE_BUDGET };
}

function getSessionBudget(gateOrder = []) {
  const base = getGateBudget('__session__');
  const envMs = process.env.BLOCK_LIVE_SESSION_LIMIT_MS;
  if (envMs && Number(envMs) > 0) return { ...base, limitMs: Number(envMs) };
  const partial = gateOrder.length > 0 && gateOrder.length < 20;
  const profileAttempts = Number(process.env.BLOCK_LIVE_PROFILE_ATTEMPTS) || (partial ? 3 : 8);
  const launchMs = Number(process.env.TEAL_LAUNCH_TIMEOUT_MS) || 45_000;
  const computed = Math.min(
    600_000,
    Math.max(base.limitMs, profileAttempts * (launchMs + 15_000) + 60_000)
  );
  return { ...base, limitMs: computed };
}

function parseGateFilter(envValue) {
  if (!envValue || !String(envValue).trim()) return null;
  return String(envValue)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function filterGateOrder(gateOrder, filterList) {
  if (!filterList || !filterList.length) return gateOrder;
  const set = new Set(filterList);
  const out = gateOrder.filter((id) => set.has(id));
  const missing = filterList.filter((id) => !gateOrder.includes(id));
  if (missing.length) {
    throw new Error(`BLOCK_LIVE_GATES unknown gate(s): ${missing.join(', ')}`);
  }
  return out;
}

function buildSuitePlan(slug, gateOrder) {
  const session = getSessionBudget(gateOrder);
  const teardown = getGateBudget('__teardown__');
  let sumLimitMs = session.limitMs + teardown.limitMs;
  let maxStallMs = Math.max(session.stallMs, teardown.stallMs);
  const gates = [];
  for (const gateId of gateOrder) {
    const b = getGateBudget(gateId);
    sumLimitMs += b.limitMs;
    maxStallMs = Math.max(maxStallMs, b.stallMs);
    gates.push({ gateId, ...b });
  }
  const bufferMs = Math.round(sumLimitMs * 0.08) + 60_000;
  const totalLimitMs = sumLimitMs + bufferMs;
  return {
    slug,
    gateCount: gateOrder.length,
    gates,
    session,
    sumLimitMs,
    bufferMs,
    totalLimitMs,
    maxStallMs,
    stallMs: Number(process.env.BLOCK_LIVE_STALL_MS) || maxStallMs
  };
}

function getBlockLivePlan(opts = {}) {
  const slug = opts.slug || process.env.BLOCK_LIVE_SLUG;
  if (!slug) throw new Error('BLOCK_LIVE_SLUG required');
  const suite = getBlockLiveSuite(slug);
  const filterList = parseGateFilter(opts.gates || process.env.BLOCK_LIVE_GATES);
  const gateOrder =
    suite.liveOrder.length === suite.gateIds.length &&
    suite.gateIds.every((id) => suite.liveOrder.includes(id))
      ? suite.liveOrder
      : suite.gateIds;
  const filtered = filterGateOrder(gateOrder, filterList);
  const plan = buildSuitePlan(slug, filtered);
  return {
    ...plan,
    blockId: suite.blockId,
    reportDir: suite.reportDir,
    envVar: suite.envVar,
    gateOrder: filtered
  };
}

function formatPlanForChat(plan) {
  const min = Math.ceil(plan.totalLimitMs / 60_000);
  const lines = [
    `блок ${plan.blockId}: ${plan.gateCount} гейтов, потолок watchdog ~${min} мин (сумма бюджетов + запас)`,
    `тишина в выводе > ${Math.round(plan.stallMs / 1000)} с → прерывание`
  ];
  const byPhase = {};
  for (const g of plan.gates) {
    byPhase[g.phase] = (byPhase[g.phase] || 0) + 1;
  }
  const phaseBits = Object.entries(byPhase)
    .map(([p, n]) => `${p}: ${n}`)
    .join(', ');
  if (phaseBits) lines.push(`фазы: ${phaseBits}`);
  return lines.join('; ');
}

function cliMain() {
  const args = process.argv.slice(2);
  if (args.includes('--print-total-ms')) {
    const slug = process.env.BLOCK_LIVE_SLUG || 'skills';
    const plan = getBlockLivePlan({ slug });
    console.log(plan.totalLimitMs);
    return;
  }
  if (args.includes('--print-plan')) {
    const slug = process.env.BLOCK_LIVE_SLUG || 'skills';
    const plan = getBlockLivePlan({ slug });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (args.includes('--print-chat')) {
    const slug = process.env.BLOCK_LIVE_SLUG || 'skills';
    console.log(formatPlanForChat(getBlockLivePlan({ slug })));
    return;
  }
  console.error('Usage: block-live-gate-budgets.cjs --print-total-ms|--print-plan|--print-chat');
  process.exit(1);
}

if (require.main === module) {
  cliMain();
}

module.exports = {
  SK_GATE_BUDGETS,
  getGateBudget,
  getSessionBudget,
  parseGateFilter,
  filterGateOrder,
  buildSuitePlan,
  getBlockLivePlan,
  formatPlanForChat
};
