#!/usr/bin/env node
'use strict';

const { buildBaselineFeedback } = require('./full-flow-v2/applicator-resume-review.cjs');
const { planParallelReviewTasks } = require('./full-flow-v2/applicator-parallel-review-lib.cjs');
const {
  resolveModelForTask,
  selectWorkExperienceCompanies,
  shouldUseMonolithicPath,
  resolveReviewMaxRounds,
  createTelemetryCollector,
  buildSharedOptimizationContext,
  assignModelsToTasks
} = require('./full-flow-v2/applicator-cost-routing.cjs');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function makeSectionsManyCompanies() {
  const work = {
    id: 'work',
    section_type: 'work_experience',
    content: []
  };
  for (let i = 1; i <= 5; i++) {
    work.content.push({
      id: `co${i}`,
      name: `Company ${i}`,
      roles: [
        {
          id: `r${i}`,
          position: 'PM',
          bulletPoints: [{ id: `b${i}`, text: `Impact at company ${i}.`, included: true }]
        }
      ]
    });
  }
  return [
    { id: 'title', section_type: 'target_title', content: ['Senior PM'] },
    {
      id: 'summary',
      section_type: 'professional_summary',
      content: [{ id: 's1', text: 'Product leader with delivery experience.', included: true }]
    },
    {
      id: 'skills',
      section_type: 'skills',
      content: [{ id: 'c1', name: 'Product', skills: [{ id: 'sk1', name: 'Roadmap', included: true }] }]
    },
    work,
    { id: 'certs', section_type: 'certifications', content: [] },
    { id: 'projects', section_type: 'projects', content: [] }
  ];
}

function testModelRouting() {
  assert(resolveModelForTask({ sectionId: 'skills' }) === 'haiku', 'skills → haiku');
  assert(resolveModelForTask({ sectionId: 'professional_summary' }) === 'sonnet', 'summary → sonnet');
  assert(
    resolveModelForTask({ taskType: 'work_experience_company', sectionId: 'work_experience' }) === 'sonnet',
    'wx company → sonnet'
  );
}

function testCompanyCap() {
  const baseline = buildBaselineFeedback({
    resumeId: 'r1',
    jobId: 'j1',
    company: 'HireCo',
    jobTitle: 'PM',
    sections: makeSectionsManyCompanies()
  });
  const priority = ['Company 4', 'Company 1', 'Company 5', 'Company 2'];
  const tasks = planParallelReviewTasks(baseline, {
    wxCompanyCap: 3,
    companyPriority: priority
  });
  const wxTasks = tasks.filter((t) => t.taskType === 'work_experience_company');
  assert(wxTasks.length === 3, `wx cap 3, got ${wxTasks.length}`);
  assert(wxTasks[0].companyName === 'Company 4', 'first wx by JD priority');
  assert(wxTasks.every((t) => t.model === 'sonnet'), 'wx tasks sonnet');
  const skills = tasks.find((t) => t.sectionId === 'skills');
  assert(skills && skills.model === 'haiku', 'skills task haiku');
}

function testSelectCompanies() {
  const picked = selectWorkExperienceCompanies(
    ['A', 'B', 'C', 'D'],
    ['D', 'B'],
    2
  );
  assert(picked.join(',') === 'D,B', 'priority order + cap');
}

function testShortCvMonolithic() {
  assert(shouldUseMonolithicPath(2) === true, '<3 companies → monolithic');
  assert(shouldUseMonolithicPath(3) === false, '3 companies → parallel');
}

function testMaxRoundsDefault() {
  const prev = process.env.APPLICATOR_REVIEW_MAX_ROUNDS;
  const prevCap = process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP;
  delete process.env.APPLICATOR_REVIEW_MAX_ROUNDS;
  delete process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP;
  assert(resolveReviewMaxRounds() === 1, 'default max rounds 1');
  process.env.APPLICATOR_REVIEW_MAX_ROUNDS = '5';
  process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP = '2';
  assert(resolveReviewMaxRounds() === 2, 'hard cap 2');
  if (prev != null) process.env.APPLICATOR_REVIEW_MAX_ROUNDS = prev;
  else delete process.env.APPLICATOR_REVIEW_MAX_ROUNDS;
  if (prevCap != null) process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP = prevCap;
  else delete process.env.APPLICATOR_REVIEW_MAX_ROUNDS_CAP;
}

function testTelemetryCogs() {
  const t = createTelemetryCollector();
  t.record({ call_id: 'a', model: 'haiku', input_tokens: 10_000, output_tokens: 2_000 });
  t.record({ call_id: 'b', model: 'sonnet', input_tokens: 5_000, output_tokens: 1_000 });
  const usd = t.optimizationCogsUsd();
  assert(usd > 0 && usd < 1, `cogs in sane range: ${usd}`);
  assert(t.toJSON().calls.length === 2, 'two calls logged');
}

function testSharedContext() {
  const block = buildSharedOptimizationContext('JD text', 'Resume md');
  assert(block.includes('SHARED OPTIMIZATION CONTEXT'), 'shared block header');
  assert(block.includes('JD text'), 'jd in shared block');
}

function testAssignModels() {
  const tasks = assignModelsToTasks([
    { sectionId: 'education', taskType: 'section' },
    { sectionId: 'professional_summary', taskType: 'section' }
  ]);
  assert(tasks[0].model === 'haiku' && tasks[1].model === 'sonnet', 'assignModelsToTasks');
}

testModelRouting();
testCompanyCap();
testSelectCompanies();
testShortCvMonolithic();
testMaxRoundsDefault();
testTelemetryCogs();
testSharedContext();
testAssignModels();
console.log('OK: applicator cost routing tests');
