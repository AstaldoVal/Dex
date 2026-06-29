#!/usr/bin/env node
'use strict';

/**
 * Unit: step-10 Target Title presence (T14 / verifyResumeTargetTitleRequired).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  pdfHasDedicatedTargetTitleLine,
  verifyResumeTargetTitleRequired,
  resolveExpectedJobTitle
} = require('./step-10-target-title-verify.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');

const goodHeader = [
  'Roman Matsukatov',
  'AI Product Owner (Healthcare)',
  'Lisbon • +351919191596',
  'Short summary.'
].join('\n');

const emptyTitleHeader = [
  'Roman Matsukatov',
  'Lisbon • +351919191596',
  'AI Product Owner and Senior Product Manager with 12+ years in B2B SaaS and regulated environments.'
].join('\n');

const ok = pdfHasDedicatedTargetTitleLine(goodHeader, 'AI Product Owner (Healthcare)');
assert.ok(ok.ok, 'dedicated line present');

const bad = pdfHasDedicatedTargetTitleLine(emptyTitleHeader, 'AI Product Owner (Healthcare)');
assert.ok(!bad.ok, 'paragraph must not count as target title');
assert.match(bad.reason || '', /target_title: missing or empty/i);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dex-step10-tt-'));
const feedback = {
  meta: {
    job_title: 'AI Product Owner (Healthcare)',
    company: 'Opinov8'
  },
  apply: {
    target_title: { action: 'skip' },
    professional_summary: { action: 'skip' }
  },
  deferred_v1: { other: [] }
};
fs.writeFileSync(path.join(tmpDir, 'feedback.json'), JSON.stringify(feedback, null, 2), 'utf8');
fs.writeFileSync(
  path.join(tmpDir, 'context.json'),
  JSON.stringify({ jobTitle: 'AI Product Owner (Healthcare)', company: 'Opinov8' }, null, 2),
  'utf8'
);

const resolved = resolveExpectedJobTitle(tmpDir, feedback);
assert.strictEqual(resolved, 'AI Product Owner (Healthcare)');

const failures = [];
const applied = [];
verifyResumeTargetTitleRequired(tmpDir, feedback, { pdfPath: null, previewEvidence: { enabled_title: null } }, failures, applied);
assert.ok(
  failures.some((f) => /target_title: missing or empty/i.test(f)),
  'preview empty must fail'
);

const eval10 = runStep10Eval(tmpDir, {
  extract: { companies: [] },
  skillsExtract: { categories: [] },
  applyEvidence: { applied: [], failed: [] },
  pdfPath: null,
  previewEvidence: { enabled_title: null },
  verifyPdfSkills: false,
  skipSkills: true
});
assert.ok(!eval10.pass, 'step-10-eval must fail when target title empty');
assert.ok(
  (eval10.failures || []).some((f) => /target_title: missing or empty/i.test(f)),
  'step-10-eval failures must include target_title missing'
);

console.log('OK: step-10 target title eval (T14 dedicated PDF line + skip apply still fails)');
