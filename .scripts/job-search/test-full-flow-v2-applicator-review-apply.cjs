#!/usr/bin/env node
'use strict';

const {
  extractTargetTitle,
  extractProfessionalSummary,
  extractSkills,
  applyFeedbackToSections
} = require('./full-flow-v2/applicator-resume-feedback.cjs');
const {
  buildBaselineFeedback,
  qualityGate,
  ensureSummaryCoversKeywords
} = require('./full-flow-v2/applicator-resume-review.cjs');
const {
  resolveExportPaths,
  generateCoverLetterParagraphs
} = require('./full-flow-v2/applicator-export-package.cjs');

function assert(cond, msg) {
  if (!cond) {
    console.error(msg);
    process.exit(1);
  }
}

const sections = [
  {
    id: 's1',
    section_type: 'target_title',
    content: ['Old Title']
  },
  {
    id: 's2',
    section_type: 'professional_summary',
    content: [
      {
        id: 'sum1',
        text:
          'Experienced product leader driving roadmap execution, compliance collaboration, and measurable delivery outcomes across complex cross-functional programs.',
        included: true
      }
    ]
  },
  {
    id: 's3',
    section_type: 'skills',
    content: [
      {
        id: 'cat-1',
        name: 'Product',
        skills: [{ id: 'skill-1', name: 'Roadmap', included: true }]
      }
    ]
  },
  {
    id: 's4',
    section_type: 'work_experience',
    content: [
      {
        id: 'company-1',
        name: 'Acme',
        roles: [
          {
            id: 'role-1',
            position: 'PM',
            bulletPoints: [{ id: 'b-1', text: 'Built a product', included: true }]
          }
        ]
      }
    ]
  },
  {
    id: 's5',
    section_type: 'certifications',
    content: []
  },
  {
    id: 's6',
    section_type: 'projects',
    content: []
  }
];

assert(extractTargetTitle(sections) === 'Old Title', 'extractTargetTitle failed');
assert(extractProfessionalSummary(sections).startsWith('Experienced product leader'), 'extractProfessionalSummary failed');
assert(extractSkills(sections).length === 1, 'extractSkills failed');

const feedback = {
  apply: {
    target_title: { action: 'enable', value: 'New Title' },
    professional_summary: { action: 'replace', text: 'New summary text with Product Strategy and Leadership for growth teams.' },
    skills: {
      action: 'merge',
      categories: [{ name: 'Product', skills: ['Discovery', 'Roadmap'] }]
    },
    work_experience: {
      action: 'merge_bullets',
      companies: [{ name: 'Acme', roles: [{ position: 'PM', bulletPoints: ['Drove KPI improvements'] }] }]
    },
    certifications: {
      action: 'merge',
      items: [{ name: 'PM Cert', issuer: 'PMI', date: '2024' }]
    },
    projects: {
      action: 'merge',
      items: [{ title: 'Growth Project', summary: 'Scaled onboarding', bulletPoints: ['Raised conversion by 12%'] }]
    }
  }
};

const next = applyFeedbackToSections(sections, feedback);
assert(next[0].content[0] === 'New Title', 'target_title apply failed');
assert(
  next[1].content[0].text.startsWith('New summary text'),
  'professional_summary apply failed'
);
assert(
  next[2].content[0].skills.some((s) => s.name === 'Discovery'),
  'skills merge failed'
);
assert(
  next[3].content[0].roles[0].bulletPoints.some((b) => b.text === 'Drove KPI improvements'),
  'work_experience bullet merge failed'
);
assert(next[4].content.length === 1, 'certifications merge failed');
assert(next[5].content.length === 1, 'projects merge failed');

const repeated = applyFeedbackToSections(next, feedback);
assert(
  repeated[3].content[0].roles[0].bulletPoints.filter((b) => b.text === 'Drove KPI improvements').length === 1,
  'idempotency failed for work_experience bullets'
);

const baseline = buildBaselineFeedback({
  resumeId: 'resume-1',
  jobId: 'job-1',
  company: 'Opinov8',
  jobTitle: 'AI Product Owner',
  sections
});
const gated = ensureSummaryCoversKeywords(
  baseline,
  'Need Product Owner with healthcare, roadmap, compliance, delivery and analytics experience.'
);
const gateResult = qualityGate(gated);
assert(gateResult.pass === true, `quality gate should pass, got: ${gateResult.failures.join(', ')}`);

const paths = resolveExportPaths('Opinov8', 'AI Product Owner', '/tmp/package');
assert(paths.pdfPath.endsWith('Roman Matsukatov - CV.pdf'), 'export pdf path failed');
const letterParagraphs = generateCoverLetterParagraphs(
  { company: 'Opinov8', jobTitle: 'AI Product Owner' },
  feedback
);
assert(letterParagraphs.length >= 5, 'cover letter generation failed');

console.log('OK: full-flow-v2 applicator review/apply helpers');
