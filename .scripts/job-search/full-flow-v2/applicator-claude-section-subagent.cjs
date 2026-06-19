#!/usr/bin/env node
'use strict';

/**
 * Applicator Step 9 — one parallel sub-agent (one section or one work_experience company).
 * stdin JSON → stdout sub-agent result JSON.
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./paths.cjs');
const { runClaudeForJson } = require('./applicator-claude-resume-review.cjs');
const { resolveLlmProvider } = require('./applicator-anthropic-llm.cjs');
const {
  getTokenBudget,
  truncateToTokenBudget,
  estimateTokens,
  usageToCogsUsd
} = require('./applicator-cost-routing.cjs');

const PROMPT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-section-subagent-prompt.md');
const CONTRACT_PATH = path.join(REPO_ROOT, '.claude/reference/applicator-resume-section-feedback-contract.md');

function asString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function buildInstruction(payload) {
  const promptBase = fs.existsSync(PROMPT_PATH)
    ? fs.readFileSync(PROMPT_PATH, 'utf8')
    : 'Tailor one resume block; output JSON only.';
  const contractBlock = fs.existsSync(CONTRACT_PATH)
    ? fs.readFileSync(CONTRACT_PATH, 'utf8')
    : '';

  const budget = getTokenBudget({
    taskType: payload.task_type,
    sectionId: payload.section_id
  });
  const sharedContext = payload.shared_context
    ? truncateToTokenBudget(payload.shared_context, budget.input - 2000)
    : buildSharedContextFallback(payload, budget.input - 2000);

  const taskLabel =
    payload.task_type === 'work_experience_company'
      ? `Work Experience company: ${payload.company_name || 'N/A'}`
      : `Section: ${payload.section_id || 'N/A'}`;

  const gateHint =
    Array.isArray(payload.gateFailures) && payload.gateFailures.length
      ? `\nPrior quality gate failures (fix in your block if relevant): ${payload.gateFailures.join('; ')}\n`
      : '';
  const evalHint =
    Array.isArray(payload.evalFailures) && payload.evalFailures.length
      ? `\nPrior step 9 eval failures (fix in your block if relevant): ${payload.evalFailures.slice(0, 8).join('; ')}\n`
      : '';

  const parts = [
    promptBase,
    contractBlock ? `\n## Full section contract (reference)\n${contractBlock}\n` : '',
    gateHint,
    evalHint,
    `Round ${payload.round || 1} of ${payload.maxRounds || 2}.`,
    `Model tier: ${payload.model || 'haiku'}.`,
    '',
    sharedContext,
    '',
    `## Your task: ${taskLabel}`,
    `task_id: ${payload.task_id || 'unknown'}`,
    `task_type: ${payload.task_type || 'section'}`,
    '',
    '## Orchestrator brief (main agent)',
    truncateToTokenBudget(payload.orchestrator_brief || '(none)', 1200),
    '',
    '## Vacancy',
    `Hiring company: ${payload.company || 'N/A'}`,
    `Job title: ${payload.jobTitle || 'N/A'}`,
    '',
    '## Baseline section_review for your block',
    truncateToTokenBudget(JSON.stringify(payload.baseline_section_review || {}, null, 2), 1500),
    '',
    '## apply slice for your block (step 10 starting point)',
    truncateToTokenBudget(JSON.stringify(payload.apply_slice || {}, null, 2), 1500)
  ];

  if (payload.task_type === 'work_experience_company') {
    parts.push(
      '',
      '## Company inventory (pick bullets verbatim only)',
      truncateToTokenBudget(JSON.stringify(payload.company_inventory || {}, null, 2), 2000),
      '',
      'OUTPUT: JSON with work_experience_company + changes[] only for this employer.'
    );
  } else {
    parts.push(
      '',
      `OUTPUT: JSON with section_review for section_id=${payload.section_id} and optional apply patch.`
    );
  }

  return truncateToTokenBudget(parts.join('\n'), budget.input);
}

function buildSharedContextFallback(payload, maxInputTokens) {
  return truncateToTokenBudget(
    [
      '## Job description',
      payload.jdText || '(empty)',
      '',
      '## Resume snapshot (markdown)',
      payload.resumeMarkdown || '(empty)'
    ].join('\n'),
    maxInputTokens
  );
}

function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('applicator-claude-section-subagent: empty stdin');
  return JSON.parse(raw);
}

function finishSubagent(payload, result) {
  const { parsed, stdout, instruction: instr, _cost } = result;
  if (!parsed.task_id && payload.task_id) parsed.task_id = payload.task_id;
  parsed._cost =
    _cost ||
    {
      call_id: payload.task_id || payload.section_id || 'subagent',
      model: payload.model || 'haiku',
      input_tokens: estimateTokens(instr),
      output_tokens: estimateTokens(stdout)
    };
  if (!parsed._cost.optimization_cogs_usd) {
    parsed._cost.optimization_cogs_usd = usageToCogsUsd(parsed._cost);
  }
  process.stdout.write(JSON.stringify(parsed));
}

function main() {
  const payload = readStdinJson();
  const instruction = buildInstruction(payload);
  const model = payload.model || 'haiku';
  const label = payload.task_id || payload.section_id || 'subagent';
  const sharedContext = payload.shared_context || '';
  console.error(
    `applicator-claude-section-subagent: ${label} — ${resolveLlmProvider()} ${model}…`
  );

  const run = runClaudeForJson({
    label: `applicator-claude-section-subagent: ${label}`,
    instruction,
    model,
    maxBuffer: 16 * 1024 * 1024,
    sharedContext
  });
  if (run && typeof run.then === 'function') {
    run
      .then((result) => finishSubagent(payload, result))
      .catch((err) => {
        console.error(err && err.stack ? err.stack : String(err));
        process.exit(1);
      });
    return;
  }
  finishSubagent(payload, run);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { buildInstruction };
