#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  TEAL_FLOW_V2_DIR,
  ensureFlowV2Dir
} = require('./paths.cjs');
const {
  getApplicatorConfig,
  assertApplicatorConfig,
  supabaseRest,
  applicatorResumeUrl
} = require('./applicator-client.cjs');
const { applyFeedbackToSections } = require('./applicator-resume-feedback.cjs');
const { exportApplicatorPackage } = require('./applicator-export-package.cjs');
const {
  runApplicatorStep10Eval,
  enrichApplicatorFeedbackForStep10Apply
} = require('./applicator-feedback-eval-bridge.cjs');

ensureFlowV2Dir();

async function main() {
  const evidencePath = path.join(TEAL_FLOW_V2_DIR, 'step-9-evidence.json');
  if (!fs.existsSync(evidencePath)) {
    throw new Error('Step 10 Applicator apply: missing step-9-evidence.json');
  }
  const step9 = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const packageDir = step9.packageDir;
  const resumeId = step9.resumeId;
  if (!packageDir || !resumeId) {
    throw new Error('Step 10 Applicator apply: step-9 evidence missing packageDir/resumeId');
  }

  const feedbackPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(feedbackPath)) {
    throw new Error(`Step 10 Applicator apply: feedback.json missing in ${packageDir}`);
  }
  let feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));

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
    throw new Error(`Step 10 Applicator apply: resume_content empty for ${resumeId}`);
  }

  feedback = enrichApplicatorFeedbackForStep10Apply(feedback, sections);
  fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  const nextSections = applyFeedbackToSections(sections, feedback);
  const changedRows = [];
  const nextById = new Map(nextSections.map((section) => [section.id, section]));
  for (const prev of sections) {
    const next = nextById.get(prev.id);
    if (!prev || !next) continue;
    const prevJson = JSON.stringify(prev.content);
    const nextJson = JSON.stringify(next.content);
    if (prevJson !== nextJson) {
      changedRows.push({ id: prev.id, section_type: prev.section_type, content: next.content });
    }
  }

  for (const row of changedRows) {
    await supabaseRest(cfg.supabaseUrl, cfg.serviceRoleKey, 'resume_content', {
      method: 'PATCH',
      query: `id=eq.${encodeURIComponent(row.id)}`,
      body: { content: row.content }
    });
  }

  let exportResult = null;
  if (process.env.APPLICATOR_SKIP_EXPORT !== '1') {
    exportResult = await exportApplicatorPackage({
      packageDir,
      resumeId,
      company: ((feedback || {}).meta || {}).company || '',
      jobTitle: ((feedback || {}).meta || {}).job_title || '',
      feedback,
      resumeUrl: applicatorResumeUrl(resumeId),
      log: (msg) => console.log(`[step10-export] ${msg}`)
    });
  }

  const applyEvidence = {
    resumeId,
    packageDir,
    applied: changedRows.map((r) => r.section_type),
    failed: [],
    completedAt: new Date().toISOString()
  };

  const skipStep10Eval = process.env.APPLICATOR_SKIP_STEP10_EVAL === '1';
  let evalResult = { pass: true, failures: [] };
  if (!skipStep10Eval) {
    evalResult = runApplicatorStep10Eval(packageDir, {
      feedback,
      sections: nextSections,
      exportResult,
      applyEvidence
    });
    const step10EvalPath = path.join(packageDir, 'step-10-eval.json');
    if (fs.existsSync(step10EvalPath)) {
      fs.copyFileSync(step10EvalPath, path.join(TEAL_FLOW_V2_DIR, 'step-10-eval.json'));
    }
  }

  const { writeTraceabilityReport } = require('./applicator-feedback-traceability-report.cjs');
  const traceabilityPath = writeTraceabilityReport(packageDir);
  console.log(`Traceability report: ${traceabilityPath}`);

  const out = {
    variant: 'applicator',
    resumeId,
    packageDir,
    applied: applyEvidence.applied,
    failed: applyEvidence.failed,
    export: exportResult,
    completedAt: new Date().toISOString(),
    eval: evalResult
  };
  fs.writeFileSync(path.join(TEAL_FLOW_V2_DIR, 'step-10-evidence.json'), JSON.stringify(out, null, 2), 'utf8');
  fs.writeFileSync(path.join(packageDir, 'step-10-evidence.json'), JSON.stringify(out, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(packageDir, 'step-10-manual-report.md'),
    [
      '# Step 10 manual report',
      '',
      'Applicator apply completed.',
      exportResult ? 'Export package generated (PDF + Cover Letter).' : 'Export skipped (APPLICATOR_SKIP_EXPORT=1).',
      '',
      '## Step 10 extended eval',
      `- pass: ${evalResult.pass ? 'true' : 'false'}`,
      `- failures: ${(evalResult.failures || []).join('; ') || 'none'}`,
      ''
    ].join('\n'),
    'utf8'
  );

  console.log(`Applicator Step 10 done: ${resumeId}`);
  console.log(`Updated sections: ${changedRows.map((r) => r.section_type).join(', ') || 'none'}`);
  if (!skipStep10Eval) {
    console.log(`Step 10 eval: ${evalResult.pass ? 'PASS' : 'FAIL'}`);
    if (!evalResult.pass && evalResult.failures && evalResult.failures.length) {
      console.error(evalResult.failures.join('; '));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
