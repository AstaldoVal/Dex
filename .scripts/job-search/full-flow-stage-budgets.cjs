'use strict';

/**
 * Atomic wall-clock budgets per full-flow step (1–10) and sub-stages.
 * Ceiling for watchdog = sum(active steps) + buffer (see getFullFlowPlan).
 */
const { MIN, RESUME_PIPELINE_WAIT_MS, JOB_SEARCH_STALL_MS, SINGLE_JOB_CAPTURE_TIMEOUT_MS } = require('./job-search-timeouts.cjs');

/** @type {Record<number, { limitMs: number, stallMs: number, phase: string, label: string }>} */
const FULL_FLOW_STEP_BUDGETS = {
  1: { limitMs: 40 * MIN, stallMs: 120_000, phase: 'capture', label: 'LinkedIn capture' },
  2: { limitMs: 10 * MIN, stallMs: 60_000, phase: 'digest', label: 'MD digest' },
  3: { limitMs: 5 * MIN, stallMs: 60_000, phase: 'links', label: 'open-links HTML' },
  4: { limitMs: 45 * MIN, stallMs: 120_000, phase: 'descriptions', label: 'descriptions 100%' },
  5: { limitMs: 5 * MIN, stallMs: 60_000, phase: 'filter', label: 'digest filter' },
  6: { limitMs: 30 * MIN, stallMs: 120_000, phase: 'teal', label: 'add jobs Teal' },
  7: { limitMs: 3 * 60 * MIN, stallMs: 180_000, phase: 'teal', label: 'create resumes' },
  8: { limitMs: 3 * 60 * MIN, stallMs: 180_000, phase: 'teal', label: 'match-score' },
  9: { limitMs: RESUME_PIPELINE_WAIT_MS, stallMs: Math.max(JOB_SEARCH_STALL_MS, 150_000), phase: 'review', label: 'Claude Code S9' },
  10: { limitMs: RESUME_PIPELINE_WAIT_MS, stallMs: Math.max(JOB_SEARCH_STALL_MS, 150_000), phase: 'apply', label: 'apply feedback S10' }
};

const SUBSTAGE_BUDGETS = {
  single_job_capture: {
    limitMs: SINGLE_JOB_CAPTURE_TIMEOUT_MS,
    stallMs: 45_000,
    phase: 'capture',
    label: 'single job extension capture'
  }
};

function getFullFlowStepBudget(step) {
  const n = Number(step);
  return FULL_FLOW_STEP_BUDGETS[n] || { limitMs: 15 * MIN, stallMs: JOB_SEARCH_STALL_MS, phase: 'other', label: 'step ' + step };
}

function getSubstageBudget(key) {
  return SUBSTAGE_BUDGETS[key] || null;
}

/**
 * @param {{ activeSteps?: number[] }} [opts] default steps 1–10
 */
function getFullFlowPlan(opts = {}) {
  const activeSteps = opts.activeSteps || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let sumLimitMs = 0;
  let maxStallMs = JOB_SEARCH_STALL_MS;
  const steps = [];
  for (const step of activeSteps) {
    const b = getFullFlowStepBudget(step);
    sumLimitMs += b.limitMs;
    maxStallMs = Math.max(maxStallMs, b.stallMs);
    steps.push({ step, ...b });
  }
  const bufferMs = Math.round(sumLimitMs * 0.06) + 5 * MIN;
  const totalLimitMs = sumLimitMs + bufferMs;
  return {
    activeSteps,
    steps,
    sumLimitMs,
    bufferMs,
    totalLimitMs,
    stallMs: Number(process.env.FULL_FLOW_STALL_MS) || maxStallMs
  };
}

/** Legacy exports for run-full-linkedin-teal-flow.cjs */
const CAPTURE_TIMEOUT_MS = FULL_FLOW_STEP_BUDGETS[1].limitMs;
const FETCH_DESC_TIMEOUT_MS = FULL_FLOW_STEP_BUDGETS[4].limitMs;
const TEAL_ADD_TIMEOUT_MS = FULL_FLOW_STEP_BUDGETS[6].limitMs;
const BATCH_TIMEOUT_MS = FULL_FLOW_STEP_BUDGETS[7].limitMs;
const MATCH_SCORE_TIMEOUT_MS = FULL_FLOW_STEP_BUDGETS[8].limitMs;

function formatPlanForChat(plan) {
  const min = Math.ceil(plan.totalLimitMs / MIN);
  return `full-flow: ${plan.activeSteps.length} шагов, потолок watchdog ~${min} мин; завершение по exit; stall без вывода ~${Math.round(plan.stallMs / 1000)} с`;
}

function cliMain() {
  const args = process.argv.slice(2);
  if (args.includes('--print-total-ms')) {
    console.log(getFullFlowPlan().totalLimitMs);
    return;
  }
  if (args.includes('--print-chat')) {
    console.log(formatPlanForChat(getFullFlowPlan()));
    return;
  }
  if (args.includes('--print-plan')) {
    console.log(JSON.stringify(getFullFlowPlan(), null, 2));
    return;
  }
  console.error('Usage: full-flow-stage-budgets.cjs --print-total-ms|--print-chat|--print-plan');
  process.exit(1);
}

if (require.main === module) {
  cliMain();
}

module.exports = {
  FULL_FLOW_STEP_BUDGETS,
  SUBSTAGE_BUDGETS,
  getFullFlowStepBudget,
  getSubstageBudget,
  getFullFlowPlan,
  formatPlanForChat,
  CAPTURE_TIMEOUT_MS,
  FETCH_DESC_TIMEOUT_MS,
  TEAL_ADD_TIMEOUT_MS,
  BATCH_TIMEOUT_MS,
  MATCH_SCORE_TIMEOUT_MS
};
