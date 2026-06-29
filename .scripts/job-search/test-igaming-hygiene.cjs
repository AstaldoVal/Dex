#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  enrichApplyForStep10,
  feedbackIsIgamingJob,
  IGAMING_SKILLS_JUNK_REMOVE
} = require('./resume-feedback-utils.cjs');
const { canonicalSkillNormKey, findDuplicateSkillIssues } = require('./teal-resume-skills.cjs');

const adwaPath = path.join(
  __dirname,
  '../../00-Inbox/Job_Search/teal/cowork-review/2026-05-20_9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9/feedback.json'
);
const fb = enrichApplyForStep10(JSON.parse(require('fs').readFileSync(adwaPath, 'utf8')));

if (!feedbackIsIgamingJob(fb)) {
  console.error('Adwa must be iGaming job');
  process.exit(1);
}
if (!fb.apply.skills_remove.includes('Figma')) {
  console.error('enrich must add Figma to skills_remove');
  process.exit(1);
}
const heldOff = (fb.apply.work_experience || []).some(
  (r) =>
    /pin-up/i.test(r.company_match || '') &&
    (r.bullets || []).some((b) => /held vertical performance/i.test(b.text_match_prefix || ''))
);
const ownedAdd = (fb.apply.bullets_add || []).some((b) =>
  /owned vertical performance/i.test(b.text || '')
);
if (!heldOff || !ownedAdd) {
  console.error('enrich must add Held off + Owned bullets_add');
  process.exit(1);
}

if (canonicalSkillNormKey('Curaçao') !== canonicalSkillNormKey('Curacao')) {
  console.error('canonicalSkillNormKey must unify Curacao spellings');
  process.exit(1);
}

const dup = findDuplicateSkillIssues({
  categories: [
    {
      name: 'iGaming & Compliance',
      skills: [
        { name: 'Curacao', normalized: 'Curacao', included: true },
        { name: 'Curaçao', normalized: 'Curaçao', included: true }
      ]
    }
  ]
});
if (!dup.failures.length) {
  console.error('findDuplicateSkillIssues must flag Curacao/Curaçao pair');
  process.exit(1);
}

console.log('OK: iGaming hygiene', { junkRemove: IGAMING_SKILLS_JUNK_REMOVE.length });
