'use strict';

const assert = require('assert');
const path = require('path');
const {
  validateBulletsPerCompanyCuration,
  buildSmartTrimPlan,
  scoreBulletRelevance,
  MAX_ENABLED_BULLETS_PER_COMPANY
} = require('./work-experience-bullets-curation.cjs');

const feedback = {
  meta: {
    job_title: 'AI Product Owner (Healthcare)',
    company: 'Opinov8',
    vacancy_profile: 'ai',
    jd_themes: ['healthcare', 'llm', 'clinical']
  },
  apply: {
    work_experience: [
      {
        company_match: 'Glorium Technologies',
        bullets: [
          { text_match_prefix: 'Revamped CRE product pipelines', included: false, reason: 'CRE not healthcare' },
          { text_match_prefix: 'Supported Yardi and RealPage', included: false, reason: 'real estate' }
        ]
      }
    ]
  }
};

const extract = {
  companies: [
    {
      name: 'Pin-Up Entertainment',
      positions: [
        {
          title: 'Compliance Product Manager',
          bullets: Array.from({ length: 11 }, (_, i) => ({
            text: `Bullet ${i} roadmap stakeholder compliance`,
            included: true
          }))
        }
      ]
    },
    {
      name: 'Glorium Technologies',
      positions: [
        {
          title: 'Senior PM',
          bullets: Array.from({ length: 13 }, (_, i) => ({
            text: `Achievement ${i} clinical healthcare AI`,
            included: true
          }))
        }
      ]
    }
  ]
};

const failures = validateBulletsPerCompanyCuration(feedback, extract);
assert(failures.some((f) => f.includes('Pin-Up')), 'Pin-Up should fail curation');
assert(failures.some((f) => f.includes('Glorium')), 'Glorium should fail curation');

const plan = buildSmartTrimPlan(extract, feedback);
assert(plan.get('pin-up entertainment'), 'plan for pin-up');
assert(
  plan.get('pin-up entertainment').disable.length === 3,
  '11 - 8 = 3 disables'
);

const sweepstakes = scoreBulletRelevance(
  'Familiar with sweepstakes mechanics in B2C gaming',
  feedback.meta.jd_themes,
  'ai'
);
const roadmap = scoreBulletRelevance(
  'Defined processes liaison compliance product roadmap',
  feedback.meta.jd_themes,
  'ai'
);
assert(sweepstakes < roadmap, 'sweepstakes scores lower than roadmap for AI healthcare');

assert.strictEqual(MAX_ENABLED_BULLETS_PER_COMPANY, 8);

const pkg = path.join(
  __dirname,
  '../00-Inbox/Job_Search/teal/cowork-review/2026-06-01_02964c6b-92e5-44e6-a1aa-3a71cbd407fd'
);
const fs = require('fs');
if (fs.existsSync(path.join(pkg, 'teal-resume-experience.json'))) {
  const real = JSON.parse(
    fs.readFileSync(path.join(pkg, 'teal-resume-experience.json'), 'utf8')
  );
  const realFailures = validateBulletsPerCompanyCuration(
    JSON.parse(fs.readFileSync(path.join(pkg, 'feedback.json'), 'utf8')),
    real
  );
  assert(realFailures.length >= 1, 'Opinov8 package feedback should fail bullets_curation');
}

// simulate: 13 on, 2 off in feedback, +1 add => still 12 — plan must disable 4 more
const afterPatch = JSON.parse(JSON.stringify(extract));
const glorium = afterPatch.companies.find((c) => /glorium/i.test(c.name));
if (glorium) {
  glorium.positions[0].bullets[0].included = false;
  glorium.positions[0].bullets[1].included = false;
  glorium.positions[0].bullets.push({
    text: 'Partnered with engineering on AI feasibility for clinical healthcare LLM',
    included: true
  });
}
const plan2 = buildSmartTrimPlan(afterPatch, feedback);
assert(
  plan2.get('glorium technologies').disable.length >= 4,
  'after 2 off + 1 add still need >=4 disables'
);

console.log('test-work-experience-bullets-curation: ok');
