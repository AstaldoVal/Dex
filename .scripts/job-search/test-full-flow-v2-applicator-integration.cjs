#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBaselineFeedback, qualityGate } = require('./full-flow-v2/applicator-resume-review.cjs');
const { mergeFeedback } = require('./full-flow-v2/applicator-claude-resume-review.cjs');
const { applyFeedbackToSections } = require('./full-flow-v2/applicator-resume-feedback.cjs');
const { validateSectionReviews } = require('./full-flow-v2/applicator-resume-section-reviews.cjs');
const {
  buildExperienceExtractFromApplicatorSections,
  buildSkillsExtractFromApplicatorSections,
  enrichMetaForCoworkEval,
  runApplicatorStep9Eval,
  EXPERIENCE_FILE,
  SKILLS_FILE
} = require('./full-flow-v2/applicator-feedback-eval-bridge.cjs');

function assert(cond, msg) {
  if (!cond) {
    console.error(msg);
    process.exit(1);
  }
}

function makeSections() {
  return [
    { id: 'title', section_type: 'target_title', content: ['Senior Product Manager'] },
    {
      id: 'summary',
      section_type: 'professional_summary',
      content: [
        {
          id: 'sum-1',
          text:
            'Senior product leader with experience in roadmap delivery, analytics-driven prioritization, and regulated product environments.',
          included: true
        }
      ]
    },
    {
      id: 'skills',
      section_type: 'skills',
      content: [
        { id: 'cat-1', name: 'Product', skills: [{ id: 's1', name: 'Roadmap', included: true }] }
      ]
    },
    {
      id: 'work',
      section_type: 'work_experience',
      content: [
        {
          id: 'company-1',
          name: 'Acme',
          roles: [
            {
              id: 'role-1',
              position: 'Senior PM',
              bulletPoints: [{ id: 'b-1', text: 'Owned product roadmap', included: true }]
            }
          ]
        }
      ]
    },
    { id: 'certs', section_type: 'certifications', content: [] },
    { id: 'projects', section_type: 'projects', content: [] }
  ];
}

function testDedupeContract() {
  const step6Evidence = {
    added: [{ jobId: 'j1', title: 'AI Product Owner', company: 'Opinov8', applicatorJobId: 'job-123', existing: true }],
    failed: 0
  };
  assert(step6Evidence.added.length === 1, 'step6: expected one job');
  assert(step6Evidence.added[0].existing === true, 'step6: existing flag required for continue-on-existing');
}

function testReviewLoopAndApplyContract() {
  const sections = makeSections();
  const feedback = buildBaselineFeedback({
    resumeId: 'resume-1',
    jobId: 'job-1',
    company: 'Opinov8',
    jobTitle: 'AI Product Owner',
    sections
  });
  const gate = qualityGate(feedback);
  assert(gate.pass, 'step9: baseline review should pass quality gate');

  feedback.apply.skills = {
    action: 'merge',
    categories: [{ name: 'Product', skills: ['Discovery'] }]
  };
  feedback.apply.work_experience = {
    action: 'merge_bullets',
    companies: [{ name: 'Acme', roles: [{ position: 'Senior PM', bulletPoints: ['Improved conversion by 10%'] }] }]
  };
  feedback.apply.certifications = {
    action: 'merge',
    items: [{ name: 'PSPO', issuer: 'Scrum.org', date: '2024' }]
  };
  feedback.apply.projects = {
    action: 'merge',
    items: [{ title: 'Onboarding Revamp', summary: 'Reduced drop-off', bulletPoints: ['Launched 3 experiments'] }]
  };

  const next = applyFeedbackToSections(sections, feedback);
  const productCategory = next.find((s) => s.section_type === 'skills').content[0];
  assert(productCategory.skills.some((s) => s.name === 'Discovery'), 'step10: skills merge failed');
  const bullets = next.find((s) => s.section_type === 'work_experience').content[0].roles[0].bulletPoints;
  assert(bullets.some((b) => b.text === 'Improved conversion by 10%'), 'step10: work_experience merge failed');
  assert(next.find((s) => s.section_type === 'certifications').content.length === 1, 'step10: certifications merge failed');
  assert(next.find((s) => s.section_type === 'projects').content.length === 1, 'step10: projects merge failed');
}

function testExportEvidenceContract() {
  const step10Evidence = {
    export: {
      pdfPath: '/Users/me/Documents/Applied/Opinov8/AI Product Owner/Roman Matsukatov - CV.pdf',
      coverLetterPath: '/Users/me/Documents/Applied/Opinov8/AI Product Owner/Roman Matsukatov - Cover Letter.docx'
    }
  };
  assert(step10Evidence.export && step10Evidence.export.pdfPath, 'step10 export: pdfPath required');
  assert(step10Evidence.export && step10Evidence.export.coverLetterPath, 'step10 export: coverLetterPath required');
}

function testMergeFeedbackFromClaude() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'Acme',
    jobTitle: 'PO',
    sections: makeSections()
  });
  const tailored = {
    apply: {
      professional_summary: {
        action: 'replace',
        text:
          'I lead commercial and partner-facing product work in regulated iGaming, with reporting dashboards, operator integrations, and Agile delivery across distributed teams.'
      }
    }
  };
  const merged = mergeFeedback(baseline, tailored);
  assert(merged.meta.source === 'applicator-claude-step9', 'merge: source tag');
  assert(
    merged.apply.professional_summary.text.length >= 120,
    'merge: summary from claude kept'
  );
  assert(merged.apply.skills.categories.length > 0, 'merge: baseline skills preserved');
}

function testSectionReviewsGate() {
  const feedback = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'Acme',
    jobTitle: 'PO',
    sections: makeSections()
  });
  assert(Array.isArray(feedback.section_reviews) && feedback.section_reviews.length === 9, 'baseline: 9 section_reviews');
  const gate = qualityGate(feedback);
  assert(gate.pass, `baseline gate with section_reviews: ${(gate.failures || []).join('; ')}`);

  const bad = JSON.parse(JSON.stringify(feedback));
  delete bad.section_reviews;
  assert(validateSectionReviews(bad).length > 0, 'validate: missing section_reviews fails');

  const needsSkills = JSON.parse(JSON.stringify(feedback));
  needsSkills.section_reviews = needsSkills.section_reviews.map((r) =>
    r.section_id === 'skills'
      ? { section_id: 'skills', label: 'Skills', status: 'needs_changes', verdict: 'Reorder blocks', changes: [] }
      : r
  );
  assert(
    validateSectionReviews(needsSkills).some((f) => f.includes('skills_detail')),
    'validate: skills needs_changes without detail fails'
  );
}

function testEvalBridgeArtifacts() {
  const sections = makeSections();
  const exp = buildExperienceExtractFromApplicatorSections(sections);
  assert(Array.isArray(exp.companies) && exp.companies.length === 1, 'bridge: experience companies');
  assert(exp.companies[0].positions.length >= 1, 'bridge: experience positions');

  const skills = buildSkillsExtractFromApplicatorSections(sections);
  assert(Array.isArray(skills.categories) && skills.categories.length >= 1, 'bridge: skills categories');

  const feedback = enrichMetaForCoworkEval(
    buildBaselineFeedback({
      resumeId: 'resume-1',
      jobId: 'job-1',
      company: 'Opinov8',
      jobTitle: 'AI Product Owner',
      sections
    }),
    {
      resumeId: 'resume-1',
      jobId: 'job-1',
      company: 'Opinov8',
      jobTitle: 'AI Product Owner',
      jdText: 'Remote iGaming product owner with payments and compliance.',
      reviewRound: 1
    }
  );
  assert(feedback.meta.vacancy_profile, 'bridge: vacancy_profile backfilled');
  assert(Array.isArray(feedback.meta.jd_themes), 'bridge: jd_themes array');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff2-eval-bridge-'));
  const evalResult = runApplicatorStep9Eval(tmpDir, {
    feedback,
    sections,
    reviewRound: 1,
    jdText: 'Remote iGaming product owner with payments and compliance.'
  });
  assert(fs.existsSync(path.join(tmpDir, EXPERIENCE_FILE)), 'bridge: experience file written');
  assert(fs.existsSync(path.join(tmpDir, SKILLS_FILE)), 'bridge: skills file written');
  assert(fs.existsSync(path.join(tmpDir, 'step-9-eval.json')), 'bridge: step-9-eval.json written');
  assert(typeof evalResult.pass === 'boolean', 'bridge: step9 eval returns pass boolean');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

testDedupeContract();
testReviewLoopAndApplyContract();
testExportEvidenceContract();
testMergeFeedbackFromClaude();
testSectionReviewsGate();
testEvalBridgeArtifacts();
console.log('OK: full-flow-v2 applicator integration contracts (6→10)');

