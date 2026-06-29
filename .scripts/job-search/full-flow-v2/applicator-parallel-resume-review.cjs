#!/usr/bin/env node
'use strict';

/**
 * Applicator Step 9 — parallel sub-agent review (orchestrator + fan-out + merge).
 */
const path = require('path');
const { spawn } = require('child_process');
const { COWORK_CLI_TIMEOUT_MS } = require('../job-search-timeouts.cjs');
const {
  planParallelReviewTasks,
  buildSubagentPayload,
  mergeSubagentOutputs,
  runPool,
  normalizeWorkExperienceCompanyOutput
} = require('./applicator-parallel-review-lib.cjs');
const { fallbackBrief } = require('./applicator-claude-orchestrator-brief.cjs');
const {
  buildSharedOptimizationContext,
  createTelemetryCollector,
  shouldUseMonolithicPath,
  DEFAULT_WX_COMPANY_CAP
} = require('./applicator-cost-routing.cjs');

const DEFAULT_MONOLITHIC_CMD = `node ${path.join(__dirname, 'applicator-claude-resume-review.cjs')}`;

const DEFAULT_SUBAGENT_CMD = `node ${path.join(__dirname, 'applicator-claude-section-subagent.cjs')}`;
const DEFAULT_ORCHESTRATOR_CMD = `node ${path.join(__dirname, 'applicator-claude-orchestrator-brief.cjs')}`;

/** Sections where LLM JSON flake should not fail the whole step 9 round. */
const SUBAGENT_FALLBACK_SECTION_IDS = new Set(['interests', 'projects', 'education', 'certifications']);

function fallbackSubagentSectionResult(task, subPayload, errorMessage) {
  const baseline = subPayload && subPayload.baseline_section_review;
  const sectionReview =
    baseline && baseline.section_id
      ? {
          ...baseline,
          status: 'ok',
          changes: [],
          verdict: 'Sub-agent returned no JSON; kept baseline for this low-priority block.'
        }
      : {
          section_id: task.sectionId,
          label: task.label || task.sectionId,
          status: 'ok',
          verdict: 'Sub-agent returned no JSON; no JD-specific edits for this block.',
          changes: []
        };
  return {
    section_review: sectionReview,
    _cost: {
      call_id: task.taskId,
      model: task.model || 'haiku',
      input_tokens: 0,
      output_tokens: 0,
      optimization_cogs_usd: 0,
      fallback_reason: asString(errorMessage).slice(0, 200)
    }
  };
}

function fallbackSubagentWorkExperienceResult(task, subPayload, errorMessage) {
  const baseline = (subPayload && (subPayload.company_inventory || subPayload.baseline_company_detail)) || null;
  const company = normalizeWorkExperienceCompanyOutput(null, baseline);
  return {
    task_id: task.taskId,
    work_experience_company:
      company ||
      {
        name: task.companyName || '',
        included: true,
        roles: []
      },
    changes: [],
    _cost: {
      call_id: task.taskId,
      model: task.model || 'sonnet',
      input_tokens: 0,
      output_tokens: 0,
      optimization_cogs_usd: 0,
      fallback_reason: asString(errorMessage).slice(0, 200)
    }
  };
}

function sanitizeWorkExperienceSubagentResult(result, subPayload) {
  const baseline = (subPayload && (subPayload.company_inventory || subPayload.baseline_company_detail)) || null;
  const normalized = normalizeWorkExperienceCompanyOutput(
    result && result.work_experience_company,
    baseline
  );
  if (!normalized) return result;
  return {
    ...result,
    work_experience_company: normalized
  };
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function runJsonCommand(cmd, payload, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} timed out after ${COWORK_CLI_TIMEOUT_MS}ms`));
    }, COWORK_CLI_TIMEOUT_MS);
    child.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
      process.stderr.write(c);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${label} failed (${code}): ${(stderr || stdout).slice(0, 600)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`${label} invalid JSON: ${e.message}`));
      }
    });
  });
}

async function fetchOrchestratorBrief(payload, orchestratorCmd) {
  const merge = (payload.currentFeedback && payload.currentFeedback.apply && payload.currentFeedback.apply.work_experience) || {};
  const companyNames = asArray(merge.companies).map((c) => asString(c.name)).filter(Boolean);
  const briefPayload = {
    resumeId: payload.resumeId,
    jobId: payload.jobId,
    company: payload.company,
    jobTitle: payload.jobTitle,
    jdText: payload.jdText,
    resumeMarkdown: payload.resumeMarkdown,
    companyNames,
    round: payload.round
  };
  if (!orchestratorCmd) {
    return fallbackBrief(briefPayload);
  }
  try {
    return await runJsonCommand(orchestratorCmd, briefPayload, 'orchestrator-brief');
  } catch (e) {
    console.error(`[step9-parallel] orchestrator brief fallback: ${e.message}`);
    return fallbackBrief(briefPayload);
  }
}

/**
 * One parallel review round: orchestrator brief → N sub-agents → merged feedback.
 * Short CV (<3 companies): delegates to monolithic single-call path.
 */
async function runParallelReviewRound(payload, options = {}) {
  const subagentCmd = options.subagentCmd || DEFAULT_SUBAGENT_CMD;
  const orchestratorCmd =
    options.orchestratorCmd === false
      ? null
      : options.orchestratorCmd || DEFAULT_ORCHESTRATOR_CMD;
  const concurrency = Math.max(
    1,
    Number(process.env.APPLICATOR_PARALLEL_CONCURRENCY || options.concurrency || 8)
  );
  const telemetry = options.telemetry || createTelemetryCollector();
  const merge = (payload.currentFeedback && payload.currentFeedback.apply && payload.currentFeedback.apply.work_experience) || {};
  const companyNames = asArray(merge.companies).map((c) => asString(c.name)).filter(Boolean);

  if (shouldUseMonolithicPath(companyNames.length)) {
    const monolithicCmd = options.monolithicCmd || DEFAULT_MONOLITHIC_CMD;
    console.log(
      `[step9-parallel] short-CV fallback: ${companyNames.length} companies < threshold — monolithic`
    );
    const sharedContext = buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown);
    const monoPayload = {
      ...payload,
      shared_context: sharedContext,
      cost_telemetry_parent: true
    };
    const feedback = await runJsonCommand(monolithicCmd, monoPayload, 'monolithic-short-cv');
    if (feedback._cost) telemetry.record(feedback._cost);
    delete feedback._cost;
    if (!feedback.meta) feedback.meta = {};
    feedback.meta.review_mode = 'monolithic_short_cv';
    feedback.meta.shared_context_chars = sharedContext.length;
    feedback.meta.optimization_cogs_usd = telemetry.optimizationCogsUsd();
    feedback.meta.cost_telemetry = telemetry.toJSON();
    return {
      feedback,
      orchestratorBrief: '(monolithic short-CV path)',
      taskCount: 0,
      subagentResults: [],
      usedMonolithic: true
    };
  }

  const briefResult = await fetchOrchestratorBrief(payload, orchestratorCmd);
  if (briefResult._cost) telemetry.record(briefResult._cost);
  const orchestratorBrief = asString(briefResult.orchestrator_brief) || fallbackBrief({}).orchestrator_brief;
  const companyPriority = asArray(briefResult.company_priority).map(asString).filter(Boolean);

  const sharedContext = buildSharedOptimizationContext(payload.jdText, payload.resumeMarkdown);
  const routingOptions = {
    wxCompanyCap: Number(process.env.APPLICATOR_WX_COMPANY_CAP || options.wxCompanyCap || DEFAULT_WX_COMPANY_CAP),
    companyPriority,
    wxCompanyAllowlist: null
  };
  const tasks = planParallelReviewTasks(payload.currentFeedback, routingOptions);
  console.log(
    `[step9-parallel] round ${payload.round || 1}: ${tasks.length} sub-agents (concurrency ${concurrency}, wx cap ${routingOptions.wxCompanyCap})`
  );

  const base = {
    ...payload,
    orchestratorBrief,
    sharedContext
  };

  const subagentResults = await runPool(tasks, concurrency, async (task) => {
    const subPayload = buildSubagentPayload(base, task);
    console.log(`[step9-parallel] start ${task.taskId} model=${task.model || 'haiku'}`);
    try {
      let result = await runJsonCommand(subagentCmd, subPayload, task.taskId);
      if (task.taskType === 'work_experience_company') {
        result = sanitizeWorkExperienceSubagentResult(result, subPayload);
      }
      if (result._cost) telemetry.record(result._cost);
      console.log(`[step9-parallel] done ${task.taskId}`);
      return result;
    } catch (e) {
      if (task.taskType === 'work_experience_company') {
        console.error(`[step9-parallel] WARN ${task.taskId}: ${e.message} — baseline WX fallback`);
        const fallback = fallbackSubagentWorkExperienceResult(task, subPayload, e.message);
        if (fallback._cost) telemetry.record(fallback._cost);
        return fallback;
      }
      if (task.taskType === 'section' && SUBAGENT_FALLBACK_SECTION_IDS.has(task.sectionId)) {
        console.error(`[step9-parallel] WARN ${task.taskId}: ${e.message} — baseline ok fallback`);
        const fallback = fallbackSubagentSectionResult(task, subPayload, e.message);
        if (fallback._cost) telemetry.record(fallback._cost);
        return fallback;
      }
      console.error(`[step9-parallel] FAIL ${task.taskId}: ${e.message}`);
      throw e;
    }
  });

  const merged = mergeSubagentOutputs(payload.currentFeedback, subagentResults);
  if (!merged.meta) merged.meta = {};
  merged.meta.orchestrator_brief = orchestratorBrief;
  merged.meta.orchestrator_priorities = briefResult.priorities || [];
  merged.meta.orchestrator_company_priority = companyPriority;
  merged.meta.parallel_tasks = tasks.map((t) => t.taskId);
  merged.meta.parallel_task_models = tasks.map((t) => ({ task_id: t.taskId, model: t.model }));
  merged.meta.shared_context_chars = sharedContext.length;
  merged.meta.wx_company_cap = routingOptions.wxCompanyCap;
  merged.meta.optimization_cogs_usd = telemetry.optimizationCogsUsd();
  merged.meta.cost_telemetry = telemetry.toJSON();

  return {
    feedback: merged,
    orchestratorBrief,
    taskCount: tasks.length,
    subagentResults,
    usedMonolithic: false
  };
}

module.exports = {
  runParallelReviewRound,
  DEFAULT_SUBAGENT_CMD,
  DEFAULT_ORCHESTRATOR_CMD
};

if (require.main === module) {
  const fs = require('fs');
  const raw = fs.readFileSync(0, 'utf8');
  runParallelReviewRound(JSON.parse(raw))
    .then((out) => {
      process.stdout.write(JSON.stringify(out.feedback));
    })
    .catch((err) => {
      console.error(err && err.stack ? err.stack : String(err));
      process.exit(1);
    });
}
