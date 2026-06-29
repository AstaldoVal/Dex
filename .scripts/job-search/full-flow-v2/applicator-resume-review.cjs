#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { COWORK_CLI_TIMEOUT_MS } = require('../job-search-timeouts.cjs');
const {
  TEAL_FLOW_V2_DIR,
  ensureFlowV2Dir
} = require('./paths.cjs');
const {
  getApplicatorConfig,
  assertApplicatorConfig,
  supabaseRest
} = require('./applicator-client.cjs');
const {
  buildApplicatorResumeMarkdown,
  asArray,
  extractProfessionalSummary,
  extractTargetTitle,
  extractSkills,
  extractWorkExperienceBullets,
  extractCertifications,
  extractProjects,
  extractLayout
} = require('./applicator-resume-feedback.cjs');
const { runApplicatorStep9Eval } = require('./applicator-feedback-eval-bridge.cjs');
const {
  validateSectionReviews,
  normalizeSectionReviews,
  renderSectionReviewsMarkdown,
  buildBaselineSectionReviews
} = require('./applicator-resume-section-reviews.cjs');
const { runParallelReviewRound } = require('./applicator-parallel-resume-review.cjs');
const { resolveReviewMaxRounds } = require('./applicator-cost-routing.cjs');

ensureFlowV2Dir();

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
}

function buildBaselineFeedback({ resumeId, jobId, company, jobTitle, sections }) {
  const skillsCategories = extractSkills(sections);
  const workCompanies = extractWorkExperienceBullets(sections);
  const { buildBaselineWorkExperienceDetailFromMergeCompanies } = require('./applicator-work-experience-detail.cjs');
  const feedback = {
    meta: {
      source: 'applicator-step9',
      resume_id: resumeId,
      job_id: jobId || null,
      company: company || null,
      job_title: jobTitle || null
    },
    section_reviews: buildBaselineSectionReviews(skillsCategories),
    apply: {
      target_title: {
        action: 'enable',
        mode: 'enable',
        value: extractTargetTitle(sections) || ''
      },
      professional_summary: {
        action: 'replace',
        text: extractProfessionalSummary(sections) || ''
      },
      skills: {
        action: 'merge',
        categories: skillsCategories
      },
      work_experience: {
        action: 'merge_bullets',
        companies: extractWorkExperienceBullets(sections)
      },
      certifications: {
        action: 'merge',
        items: extractCertifications(sections)
      },
      projects: {
        action: 'merge',
        items: extractProjects(sections)
      },
      layout: {
        action: 'patch',
        value: extractLayout(sections)
      }
    },
    deferred_v1: {
      new_sections: [],
      other: []
    }
  };
  const wxRow = feedback.section_reviews.find((r) => r && r.section_id === 'work_experience');
  if (wxRow) {
    wxRow.work_experience_detail = buildBaselineWorkExperienceDetailFromMergeCompanies(workCompanies);
  }
  return feedback;
}

function runExternalReviewCommand({ cmd, payload }) {
  return new Promise((resolve, reject) => {
    console.log(
      `[step9] LLM review round ${payload.round || 1}/${payload.maxRounds || 3} (limit ${Math.round(COWORK_CLI_TIMEOUT_MS / 60000)} min)…`
    );
    const child = spawn(cmd, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    const heartbeat = setInterval(() => {
      console.log('[step9] waiting for Claude review…');
    }, 60_000);

    const timer = setTimeout(() => {
      clearInterval(heartbeat);
      child.kill('SIGKILL');
      reject(new Error(`external review command timed out after ${COWORK_CLI_TIMEOUT_MS}ms`));
    }, COWORK_CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on('error', (err) => {
      clearInterval(heartbeat);
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearInterval(heartbeat);
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`external review command failed (${code}): ${(stderr || stdout || '').trim().slice(0, 800)}`)
        );
        return;
      }
      const out = stdout.trim();
      if (!out) {
        reject(new Error('external review command returned empty output'));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`external review output is not JSON: ${e.message}`));
      }
    });
  });
}

function ensureSummaryCoversKeywords(feedback, jdText) {
  const jdKeywords = normalizeList(
    String(jdText || '')
      .match(/\b[A-Za-z][A-Za-z0-9+\-]{3,}\b/g)
  ).slice(0, 200);
  const uniqueKeywords = [];
  const seen = new Set();
  for (const kw of jdKeywords) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueKeywords.push(kw);
  }
  const summaryObj = feedback && feedback.apply ? feedback.apply.professional_summary : null;
  const summaryText = summaryObj && typeof summaryObj.text === 'string' ? summaryObj.text.trim() : '';
  if (!summaryText) return feedback;
  const matched = uniqueKeywords.filter((kw) => summaryText.toLowerCase().includes(kw.toLowerCase()));
  if (matched.length >= 4 || uniqueKeywords.length < 4) return feedback;
  const toAppend = uniqueKeywords.filter((kw) => !matched.includes(kw)).slice(0, 4 - matched.length);
  if (!toAppend.length) return feedback;
  const suffix = ` Relevant keywords: ${toAppend.join(', ')}.`;
  summaryObj.text = `${summaryText}${suffix}`.trim();
  return feedback;
}

function qualityGate(feedback) {
  const normalized = normalizeSectionReviews(feedback);
  const failures = [];
  const apply = (normalized && normalized.apply) || {};
  const targetTitle = apply.target_title && typeof apply.target_title.value === 'string' ? apply.target_title.value.trim() : '';
  const summary = apply.professional_summary && typeof apply.professional_summary.text === 'string' ? apply.professional_summary.text.trim() : '';
  const skillsCategories = asArray(apply.skills && apply.skills.categories);
  const workCompanies = asArray(apply.work_experience && apply.work_experience.companies);

  if (!targetTitle || targetTitle.length < 4) failures.push('target_title too short');
  if (!summary || summary.length < 120) failures.push('professional_summary too short');
  if (!skillsCategories.length) failures.push('skills categories missing');
  const hasAnySkills = skillsCategories.some((c) => asArray(c && c.skills).length > 0);
  if (!hasAnySkills) failures.push('skills list empty');
  if (!workCompanies.length) failures.push('work_experience missing');
  const hasAnyBullets = workCompanies.some((company) =>
    asArray(company && company.roles).some((role) => asArray(role && role.bulletPoints).length > 0)
  );
  if (!hasAnyBullets) failures.push('work_experience bullets missing');

  failures.push(...validateSectionReviews(normalized));

  return {
    pass: failures.length === 0,
    failures,
    feedback: normalized
  };
}

function buildFeedbackMarkdown(finalFeedback, roundsMeta) {
  const lines = ['# Applicator Step 9 review', ''];
  lines.push('## Quality Gate');
  const finalRound = roundsMeta[roundsMeta.length - 1] || { round: 0, gate: { pass: false, failures: [] } };
  lines.push(`- pass: ${finalRound.gate.pass ? 'true' : 'false'}`);
  lines.push(`- rounds: ${roundsMeta.length}`);
  lines.push(`- failures: ${(finalRound.gate.failures || []).join('; ') || 'none'}`);
  lines.push('');
  lines.push('## Proposed Changes');
  lines.push(`- target_title: ${(finalFeedback.apply && finalFeedback.apply.target_title && finalFeedback.apply.target_title.value) || 'N/A'}`);
  lines.push(
    `- professional_summary chars: ${
      ((finalFeedback.apply && finalFeedback.apply.professional_summary && finalFeedback.apply.professional_summary.text) || '').length
    }`
  );
  lines.push(
    `- skills categories: ${asArray(finalFeedback.apply && finalFeedback.apply.skills && finalFeedback.apply.skills.categories).length}`
  );
  lines.push('');
  const sectionMd = renderSectionReviewsMarkdown(finalFeedback);
  if (sectionMd) {
    lines.push(sectionMd);
  }
  return lines.join('\n');
}

async function main() {
  const step7 = readJsonSafe(path.join(TEAL_FLOW_V2_DIR, 'step-7-evidence.json'), {});
  const created = Array.isArray(step7.created) ? step7.created : [];
  if (!created.length) {
    throw new Error('Step 9 Applicator review: no resumes in step-7-evidence.json');
  }

  const target = created[0];
  const resumeId = target.resumeId;
  const jobId = target.jobId;
  if (!resumeId) throw new Error('Step 9 Applicator review: resumeId missing');

  const cfg = getApplicatorConfig();
  assertApplicatorConfig(cfg);

  const sections = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
    method: 'GET',
    query:
      `resume_id=eq.${encodeURIComponent(resumeId)}` +
      '&select=id,section_type,content,display_order' +
      '&order=display_order.asc'
  });
  if (!Array.isArray(sections) || !sections.length) {
    throw new Error(`Step 9 Applicator review: resume_content empty for ${resumeId}`);
  }

  let jdText = '';
  if (jobId) {
    const jobs = await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'jobs', {
      method: 'GET',
      query: `id=eq.${encodeURIComponent(jobId)}&select=id,title,company,description&limit=1`
    });
    if (Array.isArray(jobs) && jobs[0] && typeof jobs[0].description === 'string') {
      jdText = jobs[0].description;
    }
  }

  const packageDir = path.join(TEAL_FLOW_V2_DIR, 'applicator-review', `${new Date().toISOString().slice(0, 10)}_${resumeId}`);
  fs.mkdirSync(packageDir, { recursive: true });

  fs.writeFileSync(path.join(packageDir, 'resume.md'), buildApplicatorResumeMarkdown(sections), 'utf8');
  fs.writeFileSync(path.join(packageDir, 'job-description.md'), jdText || '', 'utf8');

  const maxRounds = resolveReviewMaxRounds();
  const reviewMode = (process.env.APPLICATOR_REVIEW_MODE || 'parallel').toLowerCase();
  const defaultMonolithicCmd = `node ${path.join(__dirname, 'applicator-claude-resume-review.cjs')}`;
  const defaultParallelCmd = `node ${path.join(__dirname, 'applicator-parallel-resume-review.cjs')}`;
  const externalReviewCmd =
    process.env.APPLICATOR_REVIEW_SKIP_LLM === '1'
      ? ''
      : (process.env.APPLICATOR_REVIEW_LLM_COMMAND || '').trim() ||
        (reviewMode === 'monolithic' ? defaultMonolithicCmd : defaultParallelCmd);
  const rounds = [];
  let feedback = buildBaselineFeedback({
    resumeId,
    jobId,
    company: target.company,
    jobTitle: target.title,
    sections
  });
  let finalGate = qualityGate(feedback);
  feedback = finalGate.feedback || feedback;
  let finalStep9Eval = null;
  let gateFailures = finalGate.failures || [];
  let evalFailures = [];

  for (let round = 1; round <= maxRounds; round++) {
    let candidate = feedback;
    if (externalReviewCmd) {
      const reviewPayload = {
        round,
        maxRounds,
        resumeId,
        jobId,
        company: target.company || '',
        vacancyCompany: target.company || '',
        jobTitle: target.title || '',
        currentFeedback: feedback,
        gateFailures,
        evalFailures,
        jdText: jdText || '',
        resumeMarkdown: buildApplicatorResumeMarkdown(sections)
      };
      if (reviewMode === 'parallel' && !process.env.APPLICATOR_REVIEW_LLM_COMMAND) {
        const parallel = await runParallelReviewRound(reviewPayload);
        candidate = parallel.feedback;
        const costTelemetry = (parallel.feedback.meta && parallel.feedback.meta.cost_telemetry) || null;
        fs.writeFileSync(
          path.join(packageDir, 'step-9-orchestrator-brief.json'),
          JSON.stringify(
            {
              orchestrator_brief: parallel.orchestratorBrief,
              task_count: parallel.taskCount,
              parallel_tasks: (parallel.feedback.meta && parallel.feedback.meta.parallel_tasks) || [],
              used_monolithic: parallel.usedMonolithic || false,
              optimization_cogs_usd:
                (parallel.feedback.meta && parallel.feedback.meta.optimization_cogs_usd) || null,
              cost_telemetry: costTelemetry
            },
            null,
            2
          ),
          'utf8'
        );
        if (costTelemetry) {
          fs.writeFileSync(
            path.join(packageDir, 'step-9-cost-telemetry.json'),
            JSON.stringify(costTelemetry, null, 2),
            'utf8'
          );
        }
      } else {
        candidate = await runExternalReviewCommand({
          cmd: externalReviewCmd,
          payload: reviewPayload
        });
        if (candidate._cost) {
          fs.writeFileSync(
            path.join(packageDir, 'step-9-cost-telemetry.json'),
            JSON.stringify({ calls: [candidate._cost], optimization_cogs_usd: null }, null, 2),
            'utf8'
          );
          delete candidate._cost;
        }
      }
    }
    candidate = ensureSummaryCoversKeywords(candidate, jdText);
    const gate = qualityGate(candidate);
    candidate = gate.feedback || candidate;
    const step9Eval = runApplicatorStep9Eval(packageDir, {
      feedback: candidate,
      sections,
      reviewRound: round,
      jdText: jdText || ''
    });
    rounds.push({
      round,
      gate,
      step9_eval: {
        pass: step9Eval.pass,
        failures: step9Eval.failures || [],
        jd_alignment_score: step9Eval.jd_alignment_score
      },
      usedExternalLlm: Boolean(externalReviewCmd)
    });
    feedback = candidate;
    finalGate = gate;
    finalStep9Eval = step9Eval;
    if (step9Eval.pass) break;
    gateFailures = gate.failures || [];
    evalFailures = step9Eval.failures || [];
  }

  const mdLines = [buildFeedbackMarkdown(feedback, rounds), ''];
  if (finalStep9Eval) {
    mdLines.push('## Step 9 extended eval (Cowork parity)');
    mdLines.push(`- pass: ${finalStep9Eval.pass ? 'true' : 'false'}`);
    mdLines.push(`- jd_alignment_score: ${finalStep9Eval.jd_alignment_score != null ? finalStep9Eval.jd_alignment_score : 'N/A'}`);
    mdLines.push(`- failures: ${(finalStep9Eval.failures || []).join('; ') || 'none'}`);
    mdLines.push('');
  }
  fs.writeFileSync(path.join(packageDir, 'feedback.md'), mdLines.join('\n'), 'utf8');

  const step9EvalPath = path.join(packageDir, 'step-9-eval.json');
  if (finalStep9Eval && fs.existsSync(step9EvalPath)) {
    fs.copyFileSync(step9EvalPath, path.join(TEAL_FLOW_V2_DIR, 'step-9-eval.json'));
  }

  const optimizationCogsUsd =
    (feedback.meta && feedback.meta.optimization_cogs_usd) != null
      ? feedback.meta.optimization_cogs_usd
      : null;

  const evidence = {
    variant: 'applicator',
    packageDir,
    resumeId,
    jobId: jobId || null,
    method: externalReviewCmd
      ? reviewMode === 'parallel' && !process.env.APPLICATOR_REVIEW_LLM_COMMAND
        ? 'applicator-parallel-subagents'
        : 'applicator-claude-jd-review'
      : 'applicator-baseline-only',
    reviewMode: externalReviewCmd ? reviewMode : 'baseline-only',
    maxRounds,
    optimization_cogs_usd: optimizationCogsUsd,
    cost_telemetry: (feedback.meta && feedback.meta.cost_telemetry) || null,
    rounds,
    eval: finalStep9Eval || {
      pass: false,
      failures: ['step9 eval did not run'],
      jd_alignment_score: null
    },
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(TEAL_FLOW_V2_DIR, 'step-9-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
  fs.writeFileSync(path.join(packageDir, 'step-9-evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

  if (!finalStep9Eval || !finalStep9Eval.pass) {
    const failMsg = (finalStep9Eval && finalStep9Eval.failures && finalStep9Eval.failures.length)
      ? finalStep9Eval.failures.join('; ')
      : (finalGate.failures || []).join('; ') || 'unknown';
    console.error(`Applicator Step 9 extended eval failed: ${failMsg}`);
    process.exit(1);
  }

  console.log(`Applicator Step 9 done: ${resumeId}`);
  console.log(`Package: ${packageDir}`);
  if (externalReviewCmd) {
    console.log(`Review LLM: ${externalReviewCmd.split(/\s+/).slice(0, 3).join(' ')}…`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  buildBaselineFeedback,
  qualityGate,
  ensureSummaryCoversKeywords
};
