#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { TEAL_FLOW_V2_DIR, ensureFlowV2Dir } = require('./paths.cjs');

ensureFlowV2Dir();

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function main() {
  const step6 = readJsonSafe(path.join(TEAL_FLOW_V2_DIR, 'step-6-evidence.json'), {});
  const step7 = readJsonSafe(path.join(TEAL_FLOW_V2_DIR, 'step-7-evidence.json'), {});

  const addedJobs = Array.isArray(step6.added) ? step6.added.length : 0;
  const createdResumes = Array.isArray(step7.created)
    ? step7.created.filter((r) => r && r.resumeId).length
    : 0;
  const failedResumes = Number(step7.failed || 0);

  const report = {
    variant: 'applicator',
    completed: {
      step6_jobs_created: addedJobs,
      step7_resumes_created: createdResumes,
      step7_resumes_failed: failedResumes
    },
    implemented: [
      'Step 6 switched from Teal UI automation to Applicator DB insert (jobs).',
      'Step 7 switched from Teal resume copy to Applicator resume clone from template.',
      'Resume-to-job mapping saved in full-flow-v2/resume-to-job.json with localhost resume links.',
      'Step 8 readiness report (gap vs Teal match-score; no Applicator ATS loop yet).',
      'Step 9: Claude JD review + mandatory extended eval (same runStep9Eval gates as Full Flow v1).',
      'Step 10: full section apply + PDF export + mandatory extended eval (same runStep10Eval as v1).'
    ],
    missing_for_full_parity: [
      'No Applicator analogue for Teal Job Matcher score optimization loop (Step 8 legacy behavior).',
      'Step 10 target-title preview evidence is Applicator/PDF-only (no Teal preview DOM capture).'
    ],
    recommended_next_actions: [
      'Build Applicator Step 8 adapter: ATS score + richer fit signals from job description.',
      'Optional: capture target-title preview from Applicator UI for step-10-eval parity with Teal.'
    ]
  };

  const jsonOut = path.join(TEAL_FLOW_V2_DIR, 'step-8-evidence.json');
  const mdOut = path.join(TEAL_FLOW_V2_DIR, 'step-8-applicator-gap-report.md');
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    '# Step 8 — Applicator readiness report',
    '',
    `- Jobs created in Applicator: ${addedJobs}`,
    `- Resumes created in Applicator: ${createdResumes}`,
    `- Resume clone failures: ${failedResumes}`,
    '',
    '## Done',
    ...report.implemented.map((x) => `- ${x}`),
    '',
    '## Missing for full parity',
    ...report.missing_for_full_parity.map((x) => `- ${x}`),
    '',
    '## Recommended next actions',
    ...report.recommended_next_actions.map((x) => `- ${x}`),
    ''
  ].join('\n');
  fs.writeFileSync(mdOut, md, 'utf8');

  console.log(`Applicator Step 8 report created: ${jsonOut}`);
  console.log(`Applicator Step 8 markdown: ${mdOut}`);
}

main();
