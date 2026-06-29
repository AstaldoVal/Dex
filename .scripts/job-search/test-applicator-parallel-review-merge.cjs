#!/usr/bin/env node
'use strict';

const { buildBaselineFeedback } = require('./full-flow-v2/applicator-resume-review.cjs');
const {
  planParallelReviewTasks,
  mergeSubagentOutputs,
  normalizeWorkExperienceCompanyOutput,
  resolveBaselineCompanyInventory
} = require('./full-flow-v2/applicator-parallel-review-lib.cjs');
const { validateSectionReviews } = require('./full-flow-v2/applicator-resume-section-reviews.cjs');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function makeSections() {
  return [
    { id: 'title', section_type: 'target_title', content: ['Senior PM'] },
    {
      id: 'summary',
      section_type: 'professional_summary',
      content: [{ id: 's1', text: 'Product leader with roadmap and analytics experience in regulated environments.', included: true }]
    },
    {
      id: 'skills',
      section_type: 'skills',
      content: [{ id: 'c1', name: 'Product', skills: [{ id: 'sk1', name: 'Roadmap', included: true }] }]
    },
    {
      id: 'work',
      section_type: 'work_experience',
      content: [
        {
          id: 'co1',
          name: 'Acme',
          roles: [
            {
              id: 'r1',
              position: 'Senior PM',
              bulletPoints: [{ id: 'b1', text: 'Owned product roadmap for B2B platform.', included: true }]
            }
          ]
        },
        {
          id: 'co2',
          name: 'Beta Corp',
          roles: [
            {
              id: 'r2',
              position: 'PM',
              bulletPoints: [{ id: 'b2', text: 'Shipped analytics dashboard used by leadership.', included: true }]
            }
          ]
        }
      ]
    },
    { id: 'certs', section_type: 'certifications', content: [] },
    { id: 'projects', section_type: 'projects', content: [] }
  ];
}

function testPlanIncludesCompanies() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSections()
  });
  const tasks = planParallelReviewTasks(baseline);
  assert(tasks.some((t) => t.taskId === 'section:skills'), 'skills section task');
  assert(tasks.some((t) => t.taskId === 'work_experience:acme'), 'Acme company task');
  assert(tasks.some((t) => t.taskId === 'work_experience:beta-corp'), 'Beta company task');
  assert(tasks.length === 8 + 2, `expected 10 tasks, got ${tasks.length}`);
}

function testMergeSubagents() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSections()
  });

  const bulletAcme =
    'Increased delivery predictability by standardizing intake and release cadence across three product squads.';
  const bulletBeta =
    'Launched analytics dashboard adopted by leadership for weekly revenue and retention reviews.';

  const merged = mergeSubagentOutputs(baseline, [
    {
      task_id: 'section:professional_summary',
      section_review: {
        section_id: 'professional_summary',
        label: 'Professional Summary',
        status: 'needs_changes',
        verdict: 'PM JD; summary needs JD keywords.',
        changes: [{ action: 'replace', detail: 'Rewrite summary for PM JD fit.' }]
      },
      apply: {
        professional_summary: {
          action: 'replace',
          text:
            'Senior product manager with roadmap ownership, analytics-driven prioritization, and cross-functional delivery in regulated B2B environments.'
        }
      }
    },
    {
      task_id: 'section:skills',
      section_review: {
        section_id: 'skills',
        label: 'Skills',
        status: 'ok',
        verdict: 'Skills block fits JD.',
        changes: [],
        skills_detail: baseline.section_reviews.find((r) => r.section_id === 'skills').skills_detail
      }
    },
    {
      task_id: 'work_experience:acme',
      work_experience_company: {
        name: 'Acme',
        included: true,
        roles: [{ position: 'Senior PM', included: true, bullets: [bulletAcme] }]
      },
      changes: [{ action: 'keep_bullets', detail: 'Acme / Senior PM: 1 canonical bullets' }]
    },
    {
      task_id: 'work_experience:beta-corp',
      work_experience_company: {
        name: 'Beta Corp',
        included: true,
        roles: [{ position: 'PM', included: true, bullets: [bulletBeta] }]
      },
      changes: [{ action: 'keep_bullets', detail: 'Beta Corp / PM: 1 canonical bullets' }]
    }
  ]);

  assert(merged.meta.review_mode === 'parallel_subagents', 'review_mode meta');
  assert(merged.apply.professional_summary.text.length > 80, 'summary apply merged');
  const wx = merged.section_reviews.find((r) => r.section_id === 'work_experience');
  assert(wx && wx.work_experience_detail, 'work_experience_detail present');
  assert(wx.work_experience_detail.companies.length === 2, 'two companies merged');
  const valFailures = validateSectionReviews(merged);
  assert(!valFailures.some((f) => f.includes('missing section_id')), `section gaps: ${valFailures.join('; ')}`);
}

function testEmptySubagentBulletsKeepBaseline() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSections()
  });

  const merged = mergeSubagentOutputs(baseline, [
    {
      task_id: 'work_experience:acme',
      work_experience_company: {
        name: 'Acme',
        included: true,
        roles: [{ position: 'Senior PM', included: true, bullets: [] }]
      },
      changes: []
    }
  ]);

  const wx = merged.section_reviews.find((r) => r.section_id === 'work_experience');
  const acme = wx.work_experience_detail.companies.find((c) => c.name === 'Acme');
  assert(acme && acme.roles[0].bullets.length === 1, 'empty subagent bullets restored from baseline');
}

function testDisabledCompanyWithEmptyInventoryKeepsBaseline() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSections()
  });

  const merged = mergeSubagentOutputs(baseline, [
    {
      task_id: 'work_experience:beta-corp',
      work_experience_company: {
        name: 'Beta Corp',
        included: false,
        roles: []
      },
      changes: []
    }
  ]);

  const wx = merged.section_reviews.find((r) => r.section_id === 'work_experience');
  const beta = wx.work_experience_detail.companies.find((c) => c.name === 'Beta Corp');
  assert(beta && beta.included !== false, 'company not disabled when subagent returned no bullets');
  assert(beta.roles[0].bullets.length === 1, 'baseline bullets kept');
}

function testNormalizeWorkExperienceCompanyOutput() {
  const baseline = {
    name: 'Acme',
    included: true,
    roles: [{ position: 'Senior PM', included: true, bullets: ['Owned product roadmap for B2B platform.'] }]
  };
  const out = normalizeWorkExperienceCompanyOutput(
    { name: 'Acme', included: true, roles: [{ position: 'Senior PM', included: true, bullets: [] }] },
    baseline
  );
  assert(out.roles[0].bullets.length === 1, 'normalize fills empty role bullets');
}

function testResolveInventoryFromDetailWhenMergeEmpty() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSections()
  });
  baseline.apply.work_experience.companies = [{ name: 'Acme', roles: [] }];
  const inv = resolveBaselineCompanyInventory(baseline, 'Acme');
  assert(inv && inv.roles[0].bullets.length === 1, 'inventory falls back to work_experience_detail');
}

testPlanIncludesCompanies();
testMergeSubagents();
testEmptySubagentBulletsKeepBaseline();
testDisabledCompanyWithEmptyInventoryKeepsBaseline();
testNormalizeWorkExperienceCompanyOutput();
testResolveInventoryFromDetailWhenMergeEmpty();
console.log('OK: applicator parallel review merge tests');
