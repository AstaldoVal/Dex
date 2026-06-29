#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  fuzzyRoleMatch,
  fuzzyDatesMatch
} = require('./teal-resume-experience.cjs');
const {
  normalizeWorkExperienceForApply,
  prepareWorkExperienceForApply,
  enrichApplyForStep10
} = require('./resume-feedback-utils.cjs');

assert.strictEqual(fuzzyRoleMatch('Lead Product Manager', 'Product Manager'), false);
assert.strictEqual(fuzzyRoleMatch('Product Manager', 'Product Manager'), true);
assert.strictEqual(
  fuzzyRoleMatch('Senior Product Manager/Product Owner', 'Senior Product Manager/Product Owner'),
  true
);
assert.strictEqual(fuzzyRoleMatch('Senior Product Manager', 'Product Manager'), false);
assert.strictEqual(fuzzyDatesMatch('09/2022 - 07/2024', '09/2022'), true);
assert.strictEqual(fuzzyDatesMatch('03/2017 - 07/2018', '09/2022'), false);

const adwaWx = [
  { company_match: 'Route4Me', role_match: 'Product Manager', role_included: false },
  {
    company_match: 'Glorium Technologies',
    role_match: 'Senior Product Manager/Product Owner',
    dates_match: '09/2022',
    bullets: [{ text_match_prefix: 'Delivered a Redshift', included: false }]
  },
  { company_match: 'Glorium Technologies', role_match: 'Senior Product Manager/Product Owner', bullets: [{ text_match_prefix: 'Revamped Commercial Real Estate', included: false }] },
  { company_match: 'AlphaPrompt', role_match: 'Senior Product Owner', bullets: [{ text_match_prefix: 'Dived deep into user', included: false }] },
  {
    company_match: 'Route4Me',
    role_match: 'Lead Product Manager',
    role_included: true,
    bullets: [{ text_match_prefix: 'Shipped web improvements for the marketplace', included: true }]
  }
];
const merged = prepareWorkExperienceForApply(adwaWx);
const mergedHighlightStripped = prepareWorkExperienceForApply([
  {
    company_match: 'Route4Me',
    role_match: 'Lead Product Manager',
    role_included: true,
    bullets: [{ text_match_prefix: 'Shipped web improvements for the marketplace', included: true }]
  }
]);
const leadStripped = mergedHighlightStripped.find((r) => /route4me/i.test(r.company_match) && /lead/i.test(r.role_match));
assert.ok(leadStripped);
assert.strictEqual(leadStripped.bullets.length, 0, 'highlight-only bullets must not whitelist');
assert.strictEqual(leadStripped.role_included, true);
assert.strictEqual(merged.length, 4);
const glorium = merged.find((r) => /glorium/i.test(r.company_match));
assert.ok(glorium);
assert.strictEqual(glorium.role_included, true);
assert.strictEqual(glorium.company_included, true);
assert.strictEqual(glorium.dates_match, '09/2022');
assert.strictEqual(glorium.bullets.length, 2);
const alpha = merged.find((r) => /alpha/i.test(r.company_match));
assert.ok(alpha);
assert.strictEqual(alpha.role_included, true);
assert.strictEqual(alpha.company_included, true);
const lead = merged.find((r) => /route4me/i.test(r.company_match) && /lead/i.test(r.role_match));
assert.ok(lead);
assert.strictEqual(lead.role_included, true);
assert.strictEqual(lead.bullets.length, 0);

const fb = enrichApplyForStep10({
  meta: { jd_themes: ['igaming'] },
  apply: {
    skills_add: ['KYC', 'AML', 'Curacao'],
    work_experience: adwaWx
  },
  deferred_v1: {
    other: ['collapse INXY into Earlier experience'],
    new_sections: [{ name: 'Languages', purpose: "One line: 'English C1, Russian native, Portuguese A2'" }]
  }
});
assert.ok(fb.apply.skills_add.some((r) => r.category === 'iGaming & Compliance'));
assert.ok(fb.apply.work_experience.some((r) => /inxy/i.test(r.company_match)));
assert.ok((fb.apply.resume_sections || []).length >= 1);

console.log('OK: work experience apply unit tests');
