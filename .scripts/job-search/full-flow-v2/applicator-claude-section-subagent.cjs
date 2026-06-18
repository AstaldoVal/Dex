#!/usr/bin/env node
'use strict';

/**
 * Applicator Step 9 — one parallel sub-agent (one section or one work_experience company).
 * stdin JSON → stdout sub-agent result JSON.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./paths.cjs');
const { COWORK_CLI_TIMEOUT_MS } = require('../job-search-timeouts.cjs');
const { extractJsonFromClaudeOutput } = require('./applicator-claude-resume-review.cjs');
const {
  buildClaudeArgs,
  getTokenBudget,
  truncateToTokenBudget,
  estimateTokens
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

function main() {
  const payload = readStdinJson();
  const instruction = buildInstruction(payload);
  const model = payload.model || 'haiku';
  const label = payload.task_id || payload.section_id || 'subagent';
  console.error(`applicator-claude-section-subagent: ${label} — claude --model ${model}…`);

  const r = spawnSync('claude', buildClaudeArgs(instruction, model), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: COWORK_CLI_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'claude failed').slice(0, 800);
    console.error(`applicator-claude-section-subagent: exit ${r.status}: ${err}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(extractJsonFromClaudeOutput(r.stdout || ''));
  } catch (e) {
    console.error('applicator-claude-section-subagent: parse error:', e.message);
    process.exit(1);
  }
  if (!parsed.task_id && payload.task_id) parsed.task_id = payload.task_id;
  parsed._cost = {
    call_id: payload.task_id || label,
    model,
    input_tokens: estimateTokens(instruction),
    output_tokens: estimateTokens(r.stdout || '')
  };
  process.stdout.write(JSON.stringify(parsed));
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
