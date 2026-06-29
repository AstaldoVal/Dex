'use strict';

/**
 * Coverage index for feedback block gate suites (sim-only unless noted).
 * Used by docs and npm aggregate script job-search:test-feedback-block-gates-all
 */

const BLOCK_COVERAGE = {
  'preview.targetTitles': {
    gateIds: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T99'],
    npmUnit: 'job-search:test-target-title-gates',
    npmE2e: 'job-search:test-target-title-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-target-title-gates-live',
    status: 'live_optional'
  },
  'preview.professionalSummary': {
    gateIds: [
      'PS1',
      'PS2',
      'PS3',
      'PS4',
      'PS5',
      'PS6',
      'PS7',
      'PS8',
      'PS9',
      'PS10',
      'PS11',
      'PS12',
      'PS13',
      'PS14',
      'PS15',
      'PS99',
      'REGEN-1',
      'REGEN-2',
      'REGEN-3',
      'REGEN-4'
    ],
    npmUnit: 'job-search:test-ps-gates',
    npmE2e: 'job-search:test-ps-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-ps-gates-live',
    status: 'live_optional'
  },
  'preview.contactHeader': {
    gateIds: ['CH1', 'CH2', 'CH99'],
    npmUnit: 'job-search:test-contact-header-gates',
    npmE2e: 'job-search:test-contact-header-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-contact-header-gates-live',
    npmAll: 'job-search:test-contact-header-gates-all',
    status: 'live_optional'
  },
  'preview.workExperience': {
    gateIds: [
      'WE1',
      'WE2',
      'WE3',
      'WE4',
      'WE9',
      'WE10',
      'WE17',
      'WE18',
      'WE19',
      'WE20',
      'WE99',
      'WE11',
      'WE12',
      'WE13',
      'WE14',
      'WE15',
      'WE16',
      'WE5',
      'WE6',
      'WE7',
      'WE8'
    ],
    npmUnit: 'job-search:test-work-experience-gates',
    npmE2e: 'job-search:test-work-experience-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-work-experience-gates-live',
    npmAll: 'job-search:test-work-experience-gates-all',
    status: 'live_optional'
  },
  'preview.workExperience.bullets': {
    gateIds: ['WB1', 'WB2', 'WB3', 'WB4', 'WB5', 'WB6', 'WB7', 'WB99'],
    npmUnit: 'job-search:test-work-experience-bullets-gates',
    npmE2e: 'job-search:test-work-experience-bullets-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-work-experience-bullets-gates-live',
    status: 'live_optional'
  },
  'preview.skills': {
    gateIds: [
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
      'SK12',
      'SK13',
      'SK14',
      'SK15',
      'SK16',
      'SK17',
      'SK18',
      'SK19',
      'SK20',
      'SK21',
      'SK99'
    ],
    npmUnit: 'job-search:test-skills-gates',
    npmE2e: 'job-search:test-skills-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-skills-gates-live',
    status: 'live_optional'
  },
  'preview.resumeLayout': {
    gateIds: ['LY1', 'LY2', 'LY3', 'LY4', 'LY5', 'LY99'],
    npmUnit: 'job-search:test-resume-layout-gates',
    npmE2e: 'job-search:test-resume-layout-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-resume-layout-gates-live',
    status: 'live_optional'
  },
  'preview.blurbs': {
    gateIds: ['BL1', 'BL2', 'BL3', 'BL4', 'BL99'],
    npmUnit: 'job-search:test-blurbs-gates',
    npmE2e: 'job-search:test-blurbs-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-blurbs-gates-live',
    status: 'live_optional'
  },
  'preview.projects': {
    gateIds: ['PR1', 'PR2', 'PR3', 'PR99'],
    npmUnit: 'job-search:test-projects-gates',
    npmE2e: 'job-search:test-projects-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-projects-gates-live',
    status: 'live_optional'
  },
  'preview.certifications': {
    gateIds: ['CT1', 'CT2', 'CT3', 'CT99'],
    npmUnit: 'job-search:test-certifications-gates',
    npmE2e: 'job-search:test-certifications-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-certifications-gates-live',
    status: 'live_optional'
  },
  'preview.interests': {
    gateIds: ['IN1', 'IN2', 'IN3', 'IN99'],
    npmUnit: 'job-search:test-interests-gates',
    npmE2e: 'job-search:test-interests-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-interests-gates-live',
    status: 'live_optional'
  },
  'preview.education': {
    gateIds: ['ED1', 'ED2', 'ED99'],
    npmUnit: 'job-search:test-education-gates',
    npmE2e: 'job-search:test-education-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-education-gates-live',
    status: 'live_optional'
  },
  'manual.deferred': {
    gateIds: ['MD1', 'MD2', 'MD3', 'MD4', 'MD5', 'MD99'],
    npmUnit: 'job-search:test-manual-deferred-gates',
    npmE2e: 'job-search:test-manual-deferred-gates-e2e',
    npmLiveAggregate: 'job-search:test-feedback-blocks-gates-live',
    npmLiveDedicated: 'job-search:test-manual-deferred-gates-live',
    status: 'live_optional'
  }
};

/** npm script names for aggregate test (unit + e2e per block, sim only). */
const AGGREGATE_SIM_SCRIPTS = [
  'job-search:test-target-title-gates',
  'job-search:test-target-title-gates-e2e',
  'job-search:test-ps-gates',
  'job-search:test-ps-gates-e2e',
  'job-search:test-contact-header-gates',
  'job-search:test-contact-header-gates-e2e',
  'job-search:test-work-experience-gates',
  'job-search:test-work-experience-gates-e2e',
  'job-search:test-work-experience-bullets-gates',
  'job-search:test-work-experience-bullets-gates-e2e',
  'job-search:test-skills-gates',
  'job-search:test-skills-gates-e2e',
  'job-search:test-resume-layout-gates',
  'job-search:test-resume-layout-gates-e2e',
  'job-search:test-blurbs-gates',
  'job-search:test-blurbs-gates-e2e',
  'job-search:test-projects-gates',
  'job-search:test-projects-gates-e2e',
  'job-search:test-certifications-gates',
  'job-search:test-certifications-gates-e2e',
  'job-search:test-interests-gates',
  'job-search:test-interests-gates-e2e',
  'job-search:test-education-gates',
  'job-search:test-education-gates-e2e',
  'job-search:test-manual-deferred-gates',
  'job-search:test-manual-deferred-gates-e2e'
];

module.exports = {
  BLOCK_COVERAGE,
  AGGREGATE_SIM_SCRIPTS
};
