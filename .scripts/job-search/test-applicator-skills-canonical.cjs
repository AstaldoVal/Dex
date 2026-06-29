'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pruneSkillsContentToDetail } = require('./full-flow-v2/applicator-skills-feedback-lib.cjs');
const { findDuplicateSkillIssues } = require('./teal-resume-skills.cjs');

const pkg = path.join(
  process.cwd(),
  '00-Inbox/Job_Search/teal/full-flow-v2/applicator-review/2026-06-17_aaf792d9-c8ab-4781-a6d8-286368c9d4b0'
);
const feedback = JSON.parse(fs.readFileSync(path.join(pkg, 'feedback.json'), 'utf8'));

const content = [
  {
    name: 'Agile & Scrum Delivery',
    skills: [
      { name: 'Roadmap development', included: true },
      { name: 'Cross-functional leadership', included: true }
    ]
  },
  {
    name: 'Product & Cross-functional Leadership',
    skills: [
      { name: 'Roadmap development', included: true },
      { name: 'Cross-functional leadership', included: true }
    ]
  },
  {
    name: 'Web3, Blockchain & AI Gaming',
    skills: [
      { name: 'Multi-agent orchestration', included: true },
      { name: 'Workflow Automation', included: true }
    ]
  },
  {
    name: 'AI',
    skills: [
      { name: 'Multi-agent orchestration', included: true },
      { name: 'Workflow Automation', included: true },
      { name: 'Dex SK3 1780246532813 Ed', included: true }
    ]
  },
  {
    name: 'iGaming & Compliance',
    skills: [{ name: 'MGA', included: true }]
  }
];

const pruned = pruneSkillsContentToDetail(feedback, content);
const extract = {
  categories: pruned.map((c) => ({
    name: c.name,
    skills: c.skills.map((s) => ({ name: s.name, included: s.included !== false, normalized: s.name }))
  }))
};
const dup = findDuplicateSkillIssues(extract);
assert.strictEqual(dup.duplicateGroups, 0, `expected 0 duplicate groups, got ${dup.failures.join('; ')}`);

const agile = pruned.find((c) => c.name.includes('Agile'));
const product = pruned.find((c) => c.name.includes('Product &'));
assert.ok(agile.skills.find((s) => s.name === 'Roadmap development' && s.included !== false));
assert.ok(!product.skills.find((s) => s.name === 'Roadmap development' && s.included !== false));

const web3 = pruned.find((c) => c.name.includes('Web3'));
const ai = pruned.find((c) => c.name.includes('AI') && !c.name.includes('Web3'));
assert.ok(web3.skills.find((s) => s.name === 'Multi-agent orchestration' && s.included !== false));
assert.ok(!ai.skills.find((s) => s.name === 'Multi-agent orchestration' && s.included !== false));

const igaming = pruned.find((c) => c.name.includes('iGaming'));
assert.ok(!igaming.skills.some((s) => s.included !== false));

console.log('test-applicator-skills-canonical: OK');
