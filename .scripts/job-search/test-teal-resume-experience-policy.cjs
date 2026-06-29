'use strict';

const assert = require('assert');
const {
  injectPolicyExcludesIntoFeedback,
  validatePolicyResumeExcludes,
  verifyPolicyRolesOffResume,
  matchesPolicyExclude,
  policyEntries
} = require('./teal-resume-experience-policy.cjs');

function run() {
  const rule = policyEntries().find((r) => r.id === 'mindera_technical_po_sep2025_jan2026');
  assert(rule, 'mindera policy rule missing');

  assert(
    matchesPolicyExclude(
      {
        company: 'Mindera',
        role: 'Technical Product Owner',
        dates: '09/2025 - 01/2026',
        location: 'Portugal (Remote)',
        employment: 'Full-time'
      },
      rule
    ),
    'Mindera probe must match'
  );

  const bad = validatePolicyResumeExcludes({
    apply: {
      work_experience: [
        {
          company_match: 'Mindera',
          role_match: 'Technical Product Owner',
          role_included: true
        }
      ]
    }
  });
  assert(bad.length >= 1, 'enable must fail step 9');

  const fixed = injectPolicyExcludesIntoFeedback({
    apply: {
      work_experience: [
        {
          company_match: 'Mindera',
          role_match: 'Technical Product Owner',
          company_included: true,
          role_included: true
        }
      ]
    }
  });
  const row = (fixed.apply.work_experience || []).find((r) => /mindera/i.test(r.company_match));
  assert(row && row.company_included === false && row.role_included === false, 'inject must force OFF');
  assert(validatePolicyResumeExcludes(fixed).length === 0, 'after inject step 9 policy pass');

  const failures = [];
  verifyPolicyRolesOffResume(
    {
      companies: [
        {
          name: 'Mindera',
          positions: [{ title: 'Technical Product Owner', included: true }]
        }
      ]
    },
    failures,
    []
  );
  assert(failures.some((f) => /still ON on resume/i.test(f)), 'step 10 must fail when ON');

  const missing = [];
  verifyPolicyRolesOffResume({ companies: [] }, missing, []);
  assert(
    missing.some((f) => /missing from resume extract/i.test(f)),
    'step 10 must fail when policy row missing from extract'
  );

  console.log('test-teal-resume-experience-policy: ok');
}

run();
