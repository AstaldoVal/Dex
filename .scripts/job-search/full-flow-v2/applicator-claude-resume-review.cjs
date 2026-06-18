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
const {
  buildClaudeArgs,
  buildSharedOptimizationContext,
  resolveMonolithicModel,
  getTokenBudget,
  truncateToTokenBudget,
  estimateTokens
} = require('./applicator-cost-routing.cjs');

const PROMPT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-resume-review-prompt.md');
const CONTRACT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-resume-section-feedback-contract.md');

function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('applicator-claude-resume-review: empty stdin');
  return JSON.parse(raw);
}

function extractJsonFromClaudeOutput(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('{')) return trimmed;
  throw new Error('applicator-claude-resume-review: no JSON in claude output');
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

function main() {
  const payload = readStdinJson();
  const instruction = buildInstruction(payload);
  const model = resolveMonolithicModel();
  console.error(`applicator-claude-resume-review: claude --model ${model} round ${payload.round || 1}…`);
  const r = spawnSync('claude', buildClaudeArgs(instruction, model), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: COWORK_CLI_TIMEOUT_MS,
    maxBuffer: 24 * 1024 * 1024
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'claude failed').slice(0, 800);
    console.error(`applicator-claude-resume-review: claude exit ${r.status}: ${err}`);
    process.exit(1);
  }
  let tailored;
  try {
    tailored = JSON.parse(extractJsonFromClaudeOutput(r.stdout || ''));
  } catch (e) {
    console.error('applicator-claude-resume-review: parse error:', e.message);
    process.exit(1);
  }
  const merged = mergeFeedback(payload.currentFeedback, tailored);
  merged._cost = {
    call_id: 'monolithic-review',
    model,
    input_tokens: estimateTokens(instruction),
    output_tokens: estimateTokens(r.stdout || '')
  };
  process.stdout.write(JSON.stringify(merged));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { mergeFeedback, buildInstruction, extractJsonFromClaudeOutput };
