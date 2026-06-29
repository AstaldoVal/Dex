'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { verifySkillsStep10CanonicalGates } = require('./full-flow-v2/applicator-skills-step10-eval.cjs');
const { runStep10Eval } = require('./step-10-eval.cjs');

const pkg = path.join(
  process.cwd(),
  '00-Inbox/Job_Search/teal/full-flow-v2/applicator-review/2026-06-17_aaf792d9-c8ab-4781-a6d8-286368c9d4b0'
);
const feedback = JSON.parse(fs.readFileSync(path.join(pkg, 'feedback.json'), 'utf8'));
const skills = JSON.parse(fs.readFileSync(path.join(pkg, 'teal-resume-skills.json'), 'utf8'));
const exp = JSON.parse(fs.readFileSync(path.join(pkg, 'teal-resume-experience.json'), 'utf8'));

const failures = [];
const applied = [];
verifySkillsStep10CanonicalGates(skills, feedback, failures, applied);
const skDup = failures.filter((f) => /SK19|SK20/.test(f) && /дубликат/i.test(f));
assert.strictEqual(skDup.length, 0, `SK19/SK20 must pass on applied snapshot: ${skDup.join('; ')}`);

const eval10 = runStep10Eval(pkg, {
  extract: exp,
  skillsExtract: skills,
  applyEvidence: { applied: ['skills'], failed: [] },
  skipSkills: false,
  applicatorSourceOfTruth: true
});
const skGateFails = (eval10.failures || []).filter((f) => /^SK19|^SK20|^SK21/.test(f));
assert.strictEqual(skGateFails.length, 0, `step10 must not fail SK gates: ${skGateFails.join('; ')}`);

console.log('test-step-10-skills-canonical-gates: OK');
