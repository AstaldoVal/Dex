#!/usr/bin/env node
'use strict';

/**
 * Applicator Step 9 orchestrator — JD brief for parallel sub-agents (main agent).
 * stdin JSON → stdout { orchestrator_brief, priorities, company_priority }.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./paths.cjs');
const {
  buildClaudeArgs,
  buildSharedOptimizationContext,
  resolveOrchestratorModel,
  getTokenBudget,
  truncateToTokenBudget,
  estimateTokens,
  usageToCogsUsd
} = require('./applicator-cost-routing.cjs');
const { resolveLlmProvider, runAnthropicApiForJson } = require('./applicator-anthropic-llm.cjs');
const { extractJsonFromClaudeOutput } = require('./applicator-claude-json.cjs');

const ORCHESTRATOR_TIMEOUT_MS = Math.min(
  Number(process.env.APPLICATOR_ORCHESTRATOR_TIMEOUT_MS || 180_000),
  600_000
);

function readStdinJson() {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('applicator-claude-orchestrator-brief: empty stdin');
  return JSON.parse(raw);
}

function extractJsonFromText(text) {
  return extractJsonFromClaudeOutput(text);
}

function fallbackBrief(payload) {
  const title = payload.jobTitle || 'role';
  const company = payload.company || 'employer';
  return {
    orchestrator_brief: `Tailor resume for ${title} at ${company}. Prioritize JD keywords without inventing experience.`,
    priorities: ['professional_summary', 'skills', 'work_experience'],
    company_priority: (payload.companyNames || []).slice(0, 5)
  };
}

function buildInstruction(payload) {
  const budget = getTokenBudget('orchestrator');
  const shared = buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown, budget.input - 1500);
  return truncateToTokenBudget(
    [
      'You are the main orchestrator for Applicator resume tailoring (Step 9).',
      'Read the JD and resume snapshot. Output a short brief for parallel sub-agents (one per resume block).',
      'Do not tailor sections yourself — only coordinate.',
      '',
      shared,
      '',
      '## Employers on resume (order)',
      JSON.stringify(payload.companyNames || [], null, 2),
      '',
      'OUTPUT: single ```json fence:',
      '{',
      '  "orchestrator_brief": "2-4 sentences: JD fit strategy for sub-agents",',
      '  "priorities": ["section_id", "..."],',
      '  "company_priority": ["most relevant employer names for JD, ordered"]',
      '}'
    ].join('\n'),
    budget.input
  );
}

function main() {
  const payload = readStdinJson();
  if (process.env.APPLICATOR_ORCHESTRATOR_SKIP_LLM === '1') {
    process.stdout.write(JSON.stringify(fallbackBrief(payload)));
    return;
  }

  const model = resolveOrchestratorModel();
  const instruction = buildInstruction(payload);
  const sharedContext = buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown);
  const provider = resolveLlmProvider();
  console.error(`applicator-claude-orchestrator-brief: ${provider} ${model}…`);

  const writeParsed = (parsed, stdout, costExtra = {}) => {
    if (!parsed.orchestrator_brief) {
      parsed.orchestrator_brief = fallbackBrief(payload).orchestrator_brief;
    }
    parsed._cost = {
      call_id: costExtra.call_id || 'orchestrator-brief',
      model: costExtra.model || model,
      input_tokens: costExtra.input_tokens ?? estimateTokens(instruction),
      output_tokens: costExtra.output_tokens ?? estimateTokens(stdout || ''),
      cache_creation_input_tokens: costExtra.cache_creation_input_tokens || 0,
      cache_read_input_tokens: costExtra.cache_read_input_tokens || 0
    };
    parsed._cost.optimization_cogs_usd = usageToCogsUsd(parsed._cost);
    process.stdout.write(JSON.stringify(parsed));
  };

  const onApi = async () => {
    try {
      const result = await runAnthropicApiForJson({
        label: 'orchestrator-brief',
        instruction,
        model,
        sharedContext,
        maxOutputTokens: 1200
      });
      writeParsed(result.parsed, result.stdout, result._cost || {});
    } catch (e) {
      console.error('orchestrator brief API failed; using fallback:', e.message);
      const fb = fallbackBrief(payload);
      fb._cost = {
        call_id: 'orchestrator-brief-api-fallback',
        model,
        input_tokens: estimateTokens(instruction),
        output_tokens: 0
      };
      process.stdout.write(JSON.stringify(fb));
    }
  };

  if (provider === 'api') {
    onApi();
    return;
  }

  const r = spawnSync('claude', buildClaudeArgs(instruction, model), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: ORCHESTRATOR_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024
  });
  if (r.status !== 0) {
    console.error('orchestrator brief LLM failed; using fallback');
    const fb = fallbackBrief(payload);
    fb._cost = {
      call_id: 'orchestrator-brief-fallback',
      model,
      input_tokens: estimateTokens(instruction),
      output_tokens: 0
    };
    process.stdout.write(JSON.stringify(fb));
    return;
  }
  try {
    const parsed = JSON.parse(extractJsonFromClaudeOutput(r.stdout || ''));
    writeParsed(parsed, r.stdout || '');
  } catch (e) {
    console.error('orchestrator parse error; using fallback:', e.message);
    const fb = fallbackBrief(payload);
    fb._cost = {
      call_id: 'orchestrator-brief-parse-fallback',
      model,
      input_tokens: estimateTokens(instruction),
      output_tokens: estimateTokens(r.stdout || '')
    };
    process.stdout.write(JSON.stringify(fb));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

module.exports = { fallbackBrief, buildInstruction };
