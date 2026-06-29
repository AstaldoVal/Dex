#!/usr/bin/env node
'use strict';

/**
 * Applicator Step 9 LLM review (stdin JSON → stdout feedback JSON).
 * Invoked by applicator-resume-review.cjs via APPLICATOR_REVIEW_LLM_COMMAND default.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./paths.cjs');
const { COWORK_CLI_TIMEOUT_MS } = require('../job-search-timeouts.cjs');
const { normalizeSectionReviews } = require('./applicator-resume-section-reviews.cjs');
const { extractJsonFromClaudeOutput } = require('./applicator-claude-json.cjs');
const {
  buildClaudeArgs,
  buildSharedOptimizationContext,
  resolveMonolithicModel,
  getTokenBudget,
  truncateToTokenBudget,
  estimateTokens,
  usageToCogsUsd
} = require('./applicator-cost-routing.cjs');
const { resolveLlmProvider, runAnthropicApiForJson } = require('./applicator-anthropic-llm.cjs');

const PROMPT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-resume-review-prompt.md');
const CONTRACT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-resume-section-feedback-contract.md');

function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('applicator-claude-resume-review: empty stdin');
  return JSON.parse(raw);
}

function mergeFeedback(baseline, tailored) {
  const out = JSON.parse(JSON.stringify(baseline || {}));
  if (!out.meta) out.meta = {};
  if (!out.apply) out.apply = {};
  if (!out.deferred_v1) out.deferred_v1 = { new_sections: [], other: [] };
  if (tailored && tailored.meta) Object.assign(out.meta, tailored.meta);
  if (tailored && tailored.apply) {
    for (const [key, value] of Object.entries(tailored.apply)) {
      if (value != null) out.apply[key] = value;
    }
  }
  if (tailored && tailored.deferred_v1) {
    out.deferred_v1 = tailored.deferred_v1;
  }
  if (tailored && Array.isArray(tailored.section_reviews) && tailored.section_reviews.length) {
    out.section_reviews = tailored.section_reviews;
  }
  out.meta.source = 'applicator-claude-step9';
  return normalizeSectionReviews(out);
}

function buildInstruction(payload) {
  const promptBase = fs.existsSync(PROMPT_PATH)
    ? fs.readFileSync(PROMPT_PATH, 'utf8')
    : 'Tailor resume to JD; output feedback.json schema.';
  const contractBlock = fs.existsSync(CONTRACT_PATH)
    ? fs.readFileSync(CONTRACT_PATH, 'utf8')
    : '';
  const budget = getTokenBudget('monolithic');
  const gateHint =
    Array.isArray(payload.gateFailures) && payload.gateFailures.length
      ? `\nFix quality gate failures from prior round: ${payload.gateFailures.join('; ')}\n`
      : '';
  const evalHint =
    Array.isArray(payload.evalFailures) && payload.evalFailures.length
      ? `\nFix step 9 extended eval failures from prior round (same gates as Full Flow v1 Cowork): ${payload.evalFailures.slice(0, 12).join('; ')}\n`
      : '';
  const shared =
    payload.shared_context ||
    buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown, budget.input - 4000);
  return truncateToTokenBudget(
    [
      promptBase,
      contractBlock ? `\n## Section feedback contract (enforce)\n${contractBlock}\n` : '',
      gateHint,
      evalHint,
      `Round ${payload.round || 1} of ${payload.maxRounds || 2}.`,
      '',
      shared,
      '',
      '## Baseline feedback (starting point — tailor apply sections for JD)',
      truncateToTokenBudget(JSON.stringify(payload.currentFeedback || {}, null, 2), 6000),
      '',
      'OUTPUT: Single ```json fence with complete feedback object only.',
      '',
      'REMINDER: section_reviews — verdict ≤100 chars (context header only). Every edit = separate changes[] row. Skills: skills_detail + changes[] mirroring layout_notes.'
    ].join('\n'),
    budget.input
  );
}

function runClaudeForJson({ label, instruction, model, maxBuffer = 24 * 1024 * 1024, sharedContext = '' }) {
  if (resolveLlmProvider() === 'api') {
    return runAnthropicApiForJson({ label, instruction, model, sharedContext });
  }
  const args = buildClaudeArgs(instruction, model);
  const opts = {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: COWORK_CLI_TIMEOUT_MS,
    maxBuffer
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = spawnSync('claude', args, opts);
    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || 'claude failed').slice(0, 800);
      if (attempt === 2) {
        console.error(`${label}: claude exit ${r.status}: ${err}`);
        process.exit(1);
      }
      console.error(`${label}: claude exit ${r.status}, retrying…`);
      continue;
    }
    try {
      const stdout = r.stdout || '';
      return {
        parsed: JSON.parse(extractJsonFromClaudeOutput(stdout)),
        stdout,
        instruction,
        _cost: {
          call_id: label,
          model,
          input_tokens: estimateTokens(instruction),
          output_tokens: estimateTokens(stdout)
        }
      };
    } catch (e) {
      if (attempt === 2) {
        console.error(`${label}: parse error:`, e.message);
        process.exit(1);
      }
      console.error(`${label}: parse error (${e.message}), retrying…`);
    }
  }
}

function main() {
  const payload = readStdinJson();
  const instruction = buildInstruction(payload);
  const model = resolveMonolithicModel();
  const sharedContext =
    payload.shared_context ||
    buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown);
  console.error(
    `applicator-claude-resume-review: ${resolveLlmProvider()} ${model} round ${payload.round || 1}…`
  );
  const run = runClaudeForJson({
    label: 'applicator-claude-resume-review',
    instruction,
    model,
    sharedContext
  });
  const finish = (result) => {
    const { parsed: tailored, stdout, instruction: instr, _cost } = result;
    const merged = mergeFeedback(payload.currentFeedback, tailored);
    merged._cost =
      _cost ||
      {
        call_id: 'monolithic-review',
        model,
        input_tokens: estimateTokens(instr),
        output_tokens: estimateTokens(stdout)
      };
    if (merged._cost && !merged._cost.optimization_cogs_usd) {
      merged._cost.optimization_cogs_usd = usageToCogsUsd(merged._cost);
    }
    process.stdout.write(JSON.stringify(merged));
  };
  if (run && typeof run.then === 'function') {
    run.then(finish).catch((err) => {
      console.error(err && err.stack ? err.stack : String(err));
      process.exit(1);
    });
    return;
  }
  finish(run);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { mergeFeedback, buildInstruction, runClaudeForJson };
