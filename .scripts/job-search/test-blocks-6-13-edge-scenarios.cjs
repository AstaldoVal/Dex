#!/usr/bin/env node
'use strict';

/**
 * Cross-block edge scenarios for feedback blocks 6–13 (skills + layout tail blocks).
 * Complements per-gate unit tests; no Teal browser.
 */
const { normalizeBlocksToApply } = require('./resume-feedback-blocks.cjs');
const { simulateResumeLayoutPipeline } = require('./resume-layout-gates.cjs');
const { simulateBlurbsPipeline } = require('./blurbs-gates.cjs');
const { simulateProjectsPipeline } = require('./projects-gates.cjs');
const { simulateCertificationsPipeline } = require('./certifications-gates.cjs');
const { simulateInterestsPipeline } = require('./interests-gates.cjs');
const { simulateEducationPipeline } = require('./education-gates.cjs');
const { simulateManualDeferredPipeline } = require('./manual-deferred-gates.cjs');
const { simulateSkillsDuplicateApplyPipeline } = require('./skills-gates.cjs');

const errors = [];

function check(name, ok, detail) {
  if (!ok) errors.push(`${name}: ${detail}`);
}

// Block 6: skills duplicate pipeline must not emit removeSkill for dupes
{
  const r = simulateSkillsDuplicateApplyPipeline();
  check('SK dup e2e', r.pass, (r.pipelineErrors || []).join('; '));
}

// Block 7+11: layout interestsRemoveAll + interests removeAll same feedback
{
  const fb = {
    blocks: [
      { block_id: 'preview.resumeLayout', actions: [{ op: 'interestsRemoveAll' }] },
      { block_id: 'preview.interests', actions: [{ op: 'removeAll' }] }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  check(
    'LY+IN cross-block',
    feedback.apply.layout?.interests?.remove_all === true && coverage.apply_actions === 2,
    `apply=${coverage.apply_actions} remove_all=${feedback.apply.layout?.interests?.remove_all}`
  );
}

// Block 7: full layout pipeline
check('LY pipeline', simulateResumeLayoutPipeline().pass, 'layout pipeline failed');

// Block 8: blurbs mixed apply/deferred
check('BL pipeline', simulateBlurbsPipeline().pass, 'blurbs pipeline failed');

// Block 9: projects toggle + trim
check('PR pipeline', simulateProjectsPipeline().pass, 'projects pipeline failed');

// Block 10: certs trim + deferred toggle
check('CT pipeline', simulateCertificationsPipeline().pass, 'certifications pipeline failed');

// Block 11: interests removeAll + deferred chip
check('IN pipeline', simulateInterestsPipeline().pass, 'interests pipeline failed');

// Block 12: education all deferred
check('ED pipeline', simulateEducationPipeline().pass, 'education pipeline failed');

// Block 13: manual bucket never applies
check('MD pipeline', simulateManualDeferredPipeline().pass, 'manual deferred pipeline failed');

// Block 9 vs 7: projectsTrim in both resumeLayout and projects blocks — last writer wins on max
{
  const fb = {
    blocks: [
      {
        block_id: 'preview.resumeLayout',
        actions: [{ op: 'projectsTrim', max_on_resume: 5, profile: 'generic' }]
      },
      {
        block_id: 'preview.projects',
        actions: [{ op: 'trimProjects', max_on_resume: 2, profile: 'data_product' }]
      }
    ]
  };
  const { feedback } = normalizeBlocksToApply(fb);
  check(
    'LY+PR trim conflict',
    feedback.apply.layout?.projects?.max_on_resume === 2,
    `max_on_resume=${feedback.apply.layout?.projects?.max_on_resume}`
  );
}

if (errors.length) {
  console.error('FAIL blocks 6–13 edge scenarios:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log('OK: blocks 6–13 edge scenario sim (8 cross-block checks)');
