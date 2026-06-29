'use strict';

const { ALL_WB_GATE_IDS } = require('./work-experience-bullets-gates.cjs');
const { ALL_SK_GATE_IDS } = require('./skills-gates.cjs');
const { ALL_LY_GATE_IDS } = require('./resume-layout-gates.cjs');
const { ALL_BL_GATE_IDS } = require('./blurbs-gates.cjs');
const { ALL_PR_GATE_IDS } = require('./projects-gates.cjs');
const { ALL_CT_GATE_IDS } = require('./certifications-gates.cjs');
const { ALL_IN_GATE_IDS } = require('./interests-gates.cjs');
const { ALL_ED_GATE_IDS } = require('./education-gates.cjs');
const { ALL_MD_GATE_IDS } = require('./manual-deferred-gates.cjs');
const { createBlockLiveResolve, createBlockLiveReport, createBlockLiveHarness } = require('./block-live-teal-kit.cjs');

/** Slug → block live dedicated suite (not T / PS / CH / WE — those have their own runners). */
const BLOCK_LIVE_SUITES = {
  'work-experience-bullets': {
    blockId: 'preview.workExperience.bullets',
    envVar: 'WORK_EXPERIENCE_BULLETS_E2E_LIVE',
    reportDir: 'work-experience-bullets-gates-live',
    gateIds: ALL_WB_GATE_IDS,
    liveOrder: ['WB1', 'WB2', 'WB3', 'WB4', 'WB5', 'WB6', 'WB7', 'WB99']
  },
  skills: {
    blockId: 'preview.skills',
    envVar: 'SKILLS_E2E_LIVE',
    reportDir: 'skills-gates-live',
    gateIds: ALL_SK_GATE_IDS,
    liveOrder: [
      'SK1',
      'SK2',
      'SK3',
      'SK4',
      'SK5',
      'SK6',
      'SK7',
      'SK8',
      'SK9',
      'SK10',
      'SK11',
      'SK13',
      'SK14',
      'SK15',
      'SK12',
      'SK16',
      'SK17',
      'SK19',
      'SK20',
      'SK99'
    ]
  },
  'resume-layout': {
    blockId: 'preview.resumeLayout',
    envVar: 'RESUME_LAYOUT_E2E_LIVE',
    reportDir: 'resume-layout-gates-live',
    gateIds: ALL_LY_GATE_IDS,
    liveOrder: ['LY1', 'LY2', 'LY3', 'LY4', 'LY5', 'LY99']
  },
  blurbs: {
    blockId: 'preview.blurbs',
    envVar: 'BLURBS_E2E_LIVE',
    reportDir: 'blurbs-gates-live',
    gateIds: ALL_BL_GATE_IDS,
    liveOrder: ['BL1', 'BL2', 'BL3', 'BL4', 'BL99']
  },
  projects: {
    blockId: 'preview.projects',
    envVar: 'PROJECTS_E2E_LIVE',
    reportDir: 'projects-gates-live',
    gateIds: ALL_PR_GATE_IDS,
    liveOrder: ['PR1', 'PR2', 'PR3', 'PR99']
  },
  certifications: {
    blockId: 'preview.certifications',
    envVar: 'CERTIFICATIONS_E2E_LIVE',
    reportDir: 'certifications-gates-live',
    gateIds: ALL_CT_GATE_IDS,
    liveOrder: ['CT1', 'CT2', 'CT3', 'CT99']
  },
  interests: {
    blockId: 'preview.interests',
    envVar: 'INTERESTS_E2E_LIVE',
    reportDir: 'interests-gates-live',
    gateIds: ALL_IN_GATE_IDS,
    liveOrder: ['IN1', 'IN2', 'IN3', 'IN99']
  },
  education: {
    blockId: 'preview.education',
    envVar: 'EDUCATION_E2E_LIVE',
    reportDir: 'education-gates-live',
    gateIds: ALL_ED_GATE_IDS,
    liveOrder: ['ED1', 'ED2', 'ED99']
  },
  'manual-deferred': {
    blockId: 'manual.deferred',
    envVar: 'MANUAL_DEFERRED_E2E_LIVE',
    reportDir: 'manual-deferred-gates-live',
    gateIds: ALL_MD_GATE_IDS,
    liveOrder: ['MD1', 'MD2', 'MD3', 'MD4', 'MD5', 'MD99']
  }
};

function getBlockLiveSuite(slug) {
  const key = String(slug || '').trim();
  const suite = BLOCK_LIVE_SUITES[key];
  if (!suite) {
    throw new Error(
      `Unknown BLOCK_LIVE_SLUG="${key}". Known: ${Object.keys(BLOCK_LIVE_SUITES).join(', ')}`
    );
  }
  const resolve = createBlockLiveResolve(suite.envVar);
  const report = createBlockLiveReport(suite.reportDir, suite.blockId);
  const harness = createBlockLiveHarness(suite.gateIds);
  return { ...suite, slug: key, resolve, report, harness };
}

module.exports = {
  BLOCK_LIVE_SUITES,
  getBlockLiveSuite
};
