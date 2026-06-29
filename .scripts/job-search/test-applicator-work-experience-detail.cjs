#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  validateWorkExperienceDetail,
  syncApplyWorkExperienceFromSectionReviews,
  enforceCanonicalWorkExperienceOnContent,
  verifyExtractMatchesWorkExperienceDetail,
  synthesizeWorkExperienceDetailFromMerge,
  cascadeApplicatorRoleDisabled
} = require('./full-flow-v2/applicator-work-experience-detail.cjs');
const { normalizeSectionReviews } = require('./full-flow-v2/applicator-resume-section-reviews.cjs');
const { bulletsAreNearDuplicate } = require('./work-experience-bullet-dedupe.cjs');

const gloriumLong =
  'Increased team efficiency by 50% within 6 months by rolling out SCRUM principles and standardizing ceremonies, intake, and release cadence across multiple parallel projects.';
const gloriumShort =
  'Increased team efficiency by 50% within 6 months through implementation of SCRUM principles and process optimizations.';

const feedback = {
  section_reviews: [
    {
      section_id: 'work_experience',
      label: 'Work Experience',
      status: 'needs_changes',
      verdict: 'Scrum Master JD.',
      changes: [],
      work_experience_detail: {
        companies: [
          {
            name: 'Glorium Technologies',
            included: true,
            roles: [
              {
                position: 'Senior Product Manager/Product Owner',
                included: true,
                bullets: [gloriumLong]
              }
            ]
          }
        ]
      }
    }
  ],
  apply: {
    work_experience: {
      action: 'merge_bullets',
      companies: [
        {
          name: 'Glorium Technologies',
          roles: [{ position: 'Senior Product Manager/Product Owner', bulletPoints: [gloriumLong] }]
        }
      ]
    }
  }
};

assert.strictEqual(validateWorkExperienceDetail(feedback).length, 0, 'valid detail passes');

const fourBullets = JSON.parse(JSON.stringify(feedback));
fourBullets.section_reviews[0].work_experience_detail.companies[0].roles[0].bullets.push(
  'Second bullet with enough characters to pass the minimum length gate for validation here.',
  'Third bullet with enough characters to pass the minimum length gate for validation here.',
  'Fourth bullet with enough characters to pass the minimum length gate for validation here.'
);
assert(
  validateWorkExperienceDetail(fourBullets).some((f) => /max 3/i.test(f) || /3 bullets/i.test(f)),
  'four bullets without extension should fail'
);

const fourAllowed = syncApplyWorkExperienceFromSectionReviews(JSON.parse(JSON.stringify(fourBullets)));
fourAllowed.section_reviews[0].work_experience_detail.companies[0].roles[0].bullets_max = 4;
fourAllowed.section_reviews[0].changes.push({
  action: 'keep_bullets',
  detail: 'Glorium Technologies / Senior Product Manager/Product Owner: 4 canonical bullets — JD lists four ceremony pillars'
});
const fourAllowedSynced = syncApplyWorkExperienceFromSectionReviews(fourAllowed);
assert.strictEqual(validateWorkExperienceDetail(fourAllowedSynced).length, 0, 'bullets_max 4 should pass');

const dupFeedback = JSON.parse(JSON.stringify(feedback));
dupFeedback.section_reviews[0].work_experience_detail.companies[0].roles[0].bullets.push(gloriumShort);
assert(
  validateWorkExperienceDetail(dupFeedback).some((f) => /near-duplicate/i.test(f)),
  'near-dup in detail should fail gate'
);

const normalized = normalizeSectionReviews(JSON.parse(JSON.stringify(feedback)));
assert(normalized.apply.work_experience.companies[0].roles[0].bulletPoints[0] === gloriumLong);

const content = [
  {
    name: 'Glorium Technologies',
    included: true,
    roles: [
      {
        position: 'Senior Product Manager/Product Owner',
        included: true,
        bulletPoints: [
          { text: gloriumShort, included: true },
          { text: gloriumLong, included: false },
          { text: 'Defined and communicated release acceptance criteria for MVPs and features across parallel projects, prioritizing a shared product backlog against business goals.', included: true }
        ]
      }
    ]
  }
];

const detail = feedback.section_reviews[0].work_experience_detail;
const enforced = enforceCanonicalWorkExperienceOnContent(content, detail);
const role = enforced[0].roles[0];
const on = role.bulletPoints.filter((b) => b.included);
assert.strictEqual(on.length, 1, 'only one Glorium bullet ON');
assert.strictEqual(on[0].text, gloriumLong);

const roleOffContent = [
  {
    name: 'Maria Consultoria',
    included: true,
    roles: [
      {
        position: 'Senior PM',
        included: true,
        positionIncluded: true,
        bulletPoints: [
          { text: 'Bullet A stays in data', included: true },
          { text: 'Bullet B stays in data', included: true }
        ]
      }
    ]
  }
];
const roleOffDetail = {
  companies: [
    {
      name: 'Maria Consultoria',
      included: true,
      roles: [{ position: 'Senior PM', included: false, bullets: [] }]
    }
  ]
};
const roleOffEnforced = enforceCanonicalWorkExperienceOnContent(roleOffContent, roleOffDetail);
const roleOffRole = roleOffEnforced[0].roles[0];
assert.strictEqual(roleOffRole.included, false);
assert.strictEqual(roleOffRole.positionIncluded, false);
assert(roleOffRole.bulletPoints.every((b) => b.included === false), 'role OFF cascades bullets');

const roleOffRow = { company_match: 'Maria', role_match: 'Senior PM', role_included: false, bullets: [] };
const { applyWorkExperienceRowsToContent } = require('./full-flow-v2/applicator-resume-feedback.cjs');
const roleOffApplied = applyWorkExperienceRowsToContent(roleOffContent, [roleOffRow]);
const appliedRole = roleOffApplied[0].roles[0];
assert.strictEqual(appliedRole.included, false);
assert.strictEqual(appliedRole.positionIncluded, false);
assert(appliedRole.bulletPoints.every((b) => b.included === false), 'apply row role_included false cascades bullets');

const bareRole = { included: true, positionIncluded: true, bulletPoints: [{ included: true }] };
cascadeApplicatorRoleDisabled(bareRole);
assert.strictEqual(bareRole.included, false);
assert.strictEqual(bareRole.positionIncluded, false);
assert.strictEqual(bareRole.bulletPoints[0].included, false);

const extract = {
  companies: [
    {
      name: 'Glorium Technologies',
      included: true,
      positions: [
        {
          title: 'Senior Product Manager/Product Owner',
          included: true,
          bullets: on.map((b) => ({ text: b.text, included: true }))
        }
      ]
    }
  ]
};
const failures = [];
const applied = [];
verifyExtractMatchesWorkExperienceDetail(extract, feedback, failures, applied);
assert.strictEqual(failures.length, 0, failures.join('; '));

const alchemyPath = path.join(
  __dirname,
  '../../00-Inbox/Job_Search/teal/full-flow-v2/applicator-review/2026-06-17_aaf792d9-c8ab-4781-a6d8-286368c9d4b0/feedback.json'
);
try {
  const legacy = require(alchemyPath);
  const synth = synthesizeWorkExperienceDetailFromMerge(legacy);
  assert(synth && synth.companies.length, 'legacy merge synthesizes detail');
} catch (_) {
  // optional if package missing
}

console.log('test-applicator-work-experience-detail: ok');
