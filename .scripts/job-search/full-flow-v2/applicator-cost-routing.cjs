'use strict';

/**
 * Full Flow 2 Step 9 — cost routing (model tier, company cap, token budgets, COGS telemetry).
 * Genufit v1 JD optimization; see HIR-80 / pricing-model v5 levers.
 */

const HAIKU_SECTIONS = new Set([
  'contact_info',
  'target_title',
  'skills',
  'education',
  'certifications',
  'projects',
  'interests'
]);

const SONNET_SECTIONS = new Set(['professional_summary']);

const DEFAULT_WX_COMPANY_CAP = Math.max(
  1,
  Number(process.env.APPLICATOR_WX_COMPANY_CAP || 3)
);

const SHORT_CV_COMPANY_THRESHOLD = Math.max(
  1,
  Number(process.env.APPLICATOR_SHORT_CV_COMPANY_THRESHOLD || 3)
);

const DEFAULT_MAX_ROUNDS = Math.max(1, Number(process.env.APPLICATOR_REVIEW_MAX_ROUNDS || 1));
const HARD_MAX_ROUNDS_CAP = Math.max(
  DEFAULT_MAX_ROUNDS,
  Number(process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP || 2)
);

/** USD per 1M tokens (input / output / cache_read) — Haiku 4.5 + Sonnet 4.6 list prices (2026-06). */
const MODEL_USD_PER_M = {
  haiku: { input: 1.0, output: 5.0, cache_read: 0.1, cache_write: 1.25 },
  sonnet: { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 }
};

const SECTION_TOKEN_BUDGETS = {
  orchestrator: { input: 12_000, output: 800 },
  monolithic: { input: 24_000, output: 8_000 },
  contact_info: { input: 6_000, output: 1_200 },
  target_title: { input: 6_000, output: 800 },
  professional_summary: { input: 8_000, output: 2_000 },
  skills: { input: 6_000, output: 1_500 },
  education: { input: 5_000, output: 1_000 },
  certifications: { input: 5_000, output: 1_000 },
  projects: { input: 5_000, output: 1_000 },
  interests: { input: 4_000, output: 600 },
  work_experience_company: { input: 8_000, output: 2_500 }
};

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function estimateTokens(text) {
  const len = String(text || '').length;
  return Math.max(1, Math.ceil(len / 4));
}

function resolveReviewMaxRounds() {
  const requested = Number(process.env.APPLICATOR_REVIEW_MAX_ROUNDS || DEFAULT_MAX_ROUNDS);
  const n = Number.isFinite(requested) ? requested : DEFAULT_MAX_ROUNDS;
  return Math.min(HARD_MAX_ROUNDS_CAP, Math.max(1, n));
}

function resolveModelForTask(task) {
  if (!task || typeof task !== 'object') return 'haiku';
  if (task.taskType === 'work_experience_company') return 'sonnet';
  const sectionId = task.sectionId || '';
  if (SONNET_SECTIONS.has(sectionId)) return 'sonnet';
  if (HAIKU_SECTIONS.has(sectionId)) return 'haiku';
  return 'haiku';
}

function resolveOrchestratorModel() {
  return (process.env.APPLICATOR_ORCHESTRATOR_MODEL || 'haiku').toLowerCase();
}

function resolveMonolithicModel() {
  return (process.env.APPLICATOR_MONOLITHIC_MODEL || 'sonnet').toLowerCase();
}

/**
 * Pick top-N employers for parallel WX sub-agents (JD relevance order when available).
 */
function selectWorkExperienceCompanies(companyNames, companyPriority, cap = DEFAULT_WX_COMPANY_CAP) {
  const ordered = [];
  const seen = new Set();
  for (const name of asArray(companyPriority).map(asString).filter(Boolean)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }
  for (const name of asArray(companyNames).map(asString).filter(Boolean)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }
  return ordered.slice(0, Math.max(1, cap));
}

function shouldUseMonolithicPath(companyCount) {
  if (process.env.APPLICATOR_FORCE_PARALLEL === '1') return false;
  return Number(companyCount) < SHORT_CV_COMPANY_THRESHOLD;
}

function budgetKeyForTask(task) {
  if (!task) return 'skills';
  if (task.taskType === 'work_experience_company') return 'work_experience_company';
  return task.sectionId || 'skills';
}

function getTokenBudget(taskOrKey) {
  const key =
    typeof taskOrKey === 'string' ? taskOrKey : budgetKeyForTask(taskOrKey);
  return SECTION_TOKEN_BUDGETS[key] || SECTION_TOKEN_BUDGETS.skills;
}

function truncateToTokenBudget(text, maxInputTokens) {
  const maxChars = Math.max(200, maxInputTokens * 4);
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 64)}\n\n[truncated for token budget]`;
}

/**
 * Shared JD + resume block — identical prefix for all sub-agents in one optimization run.
 * Written once per round; sub-agents reference the same content (API cache-ready shape).
 */
function buildSharedOptimizationContext(jdText, resumeMarkdown, maxInputTokens = 14_000) {
  const block = [
    '## SHARED OPTIMIZATION CONTEXT',
    '(identical across sub-agents in this run — do not reinterpret JD/resume facts)',
    '',
    '## Job description',
    jdText || '(empty)',
    '',
    '## Resume snapshot (markdown)',
    resumeMarkdown || '(empty)'
  ].join('\n');
  return truncateToTokenBudget(block, maxInputTokens);
}

function assignModelsToTasks(tasks) {
  return asArray(tasks).map((task) => ({
    ...task,
    model: resolveModelForTask(task)
  }));
}

function usageToCogsUsd(call) {
  if (!call || typeof call !== 'object') return 0;
  const model = (call.model || 'haiku').toLowerCase();
  const rates = MODEL_USD_PER_M[model] || MODEL_USD_PER_M.haiku;
  const input = Number(call.input_tokens) || 0;
  const output = Number(call.output_tokens) || 0;
  const cacheRead = Number(call.cache_read_input_tokens) || 0;
  const cacheWrite = Number(call.cache_creation_input_tokens) || 0;
  const billableInput = Math.max(0, input - cacheRead - cacheWrite);
  let total = (billableInput / 1_000_000) * rates.input;
  total += (output / 1_000_000) * rates.output;
  if (cacheRead > 0) {
    total += (cacheRead / 1_000_000) * (rates.cache_read || rates.input * 0.1);
  }
  if (cacheWrite > 0) {
    total += (cacheWrite / 1_000_000) * (rates.cache_write || rates.input * 1.25);
  }
  return Math.round(total * 10_000) / 10_000;
}

function createTelemetryCollector() {
  const calls = [];
  return {
    calls,
    record(call) {
      if (!call || typeof call !== 'object') return;
      const model = (call.model || 'haiku').toLowerCase();
      const inputTokens =
        call.input_tokens != null ? Number(call.input_tokens) : estimateTokens(call.input_text);
      const outputTokens =
        call.output_tokens != null ? Number(call.output_tokens) : estimateTokens(call.output_text);
      const entry = {
        call_id: call.call_id || 'unknown',
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: Number(call.cache_creation_input_tokens) || 0,
        cache_read_input_tokens: Number(call.cache_read_input_tokens) || 0
      };
      entry.cogs_usd = usageToCogsUsd(entry);
      calls.push(entry);
    },
    optimizationCogsUsd() {
      let total = 0;
      for (const c of calls) {
        total += c.cogs_usd != null ? c.cogs_usd : usageToCogsUsd(c);
      }
      return Math.round(total * 10_000) / 10_000;
    },
    toJSON() {
      return {
        calls: [...calls],
        optimization_cogs_usd: this.optimizationCogsUsd()
      };
    }
  };
}

function buildClaudeArgs(instruction, model) {
  const args = ['-p', instruction, '--output-format', 'text', '--dangerously-skip-permissions'];
  const m = asString(model).toLowerCase();
  if (m === 'haiku' || m === 'sonnet' || m === 'opus') {
    return ['--model', m, ...args];
  }
  return args;
}

module.exports = {
  HAIKU_SECTIONS,
  SONNET_SECTIONS,
  DEFAULT_WX_COMPANY_CAP,
  SHORT_CV_COMPANY_THRESHOLD,
  DEFAULT_MAX_ROUNDS,
  HARD_MAX_ROUNDS_CAP,
  MODEL_USD_PER_M,
  SECTION_TOKEN_BUDGETS,
  resolveReviewMaxRounds,
  resolveModelForTask,
  resolveOrchestratorModel,
  resolveMonolithicModel,
  selectWorkExperienceCompanies,
  shouldUseMonolithicPath,
  getTokenBudget,
  truncateToTokenBudget,
  buildSharedOptimizationContext,
  assignModelsToTasks,
  createTelemetryCollector,
  buildClaudeArgs,
  estimateTokens,
  usageToCogsUsd
};
