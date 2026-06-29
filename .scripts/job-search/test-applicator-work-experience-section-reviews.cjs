'use strict';

const assert = require('assert');
const path = require('path');
const {
  matchPositionsFromChangeDetail,
  syncChronologyOverridesFromWorkExperienceSectionReviews
} = require('./full-flow-v2/applicator-work-experience-section-reviews.cjs');
const {
  injectChronologyCutoffIntoFeedback,
  validateChronologyCutoff
} = require('./teal-resume-experience-chronology-cutoff.cjs');
const { flattenExperiencePositions } = require('./teal-resume-experience-chronology.cjs');

const ALCHEMY_LIKE_EXTRACT = JSON.parse(
  require('fs').readFileSync(
    path.join(
      __dirname,
      '../../00-Inbox/Job_Search/teal/full-flow-v2/applicator-review/2026-06-17_aaf792d9-c8ab-4781-a6d8-286368c9d4b0/teal-resume-experience.json'
    ),
    'utf8'
  )
);

function run() {
  const flat = flattenExperiencePositions(ALCHEMY_LIKE_EXTRACT);

  const perenio = matchPositionsFromChangeDetail(
    'Perenio IoT Scrum Master role: lead with Scrum cadence facilitation',
    flat
  );
  assert(perenio.some((r) => /perenio/i.test(r.company) && /scrum master/i.test(r.title)), 'Perenio SM match');

  const route4me = matchPositionsFromChangeDetail(
    'Route4Me Lead PM: lead with PM practices rebuild',
    flat
  );
  assert(route4me.some((r) => /route4me/i.test(r.company) && /lead product manager/i.test(r.title)), 'Route4Me Lead PM match');

  const feedback = {
    section_reviews: [
      {
        section_id: 'work_experience',
        changes: [
          {
            action: 'reorder',
            detail:
              'Perenio IoT Scrum Master role: lead with Scrum cadence facilitation (40-person org, quarterly milestones)'
          },
          {
            action: 'reorder',
            detail: 'Route4Me Lead PM: lead with PM practices rebuild'
          }
        ]
      }
    ],
    apply: {}
  };

  syncChronologyOverridesFromWorkExperienceSectionReviews(feedback, ALCHEMY_LIKE_EXTRACT);
  const wx = feedback.apply.work_experience || [];
  assert(
    wx.some(
      (r) =>
        r.chronology_override === true &&
        /perenio/i.test(r.company_match) &&
        /scrum master/i.test(r.role_match)
    ),
    'Perenio override row'
  );
  assert(
    wx.some(
      (r) =>
        r.chronology_override === true &&
        /route4me/i.test(r.company_match) &&
        /lead product manager/i.test(r.role_match)
    ),
    'Route4Me override row'
  );

  injectChronologyCutoffIntoFeedback(feedback, ALCHEMY_LIKE_EXTRACT);
  const perenioRow = wx.find((r) => /perenio/i.test(r.company_match) && /scrum master/i.test(r.role_match));
  assert(perenioRow && perenioRow.chronology_override === true, 'inject must keep override');
  assert(perenioRow.role_included !== false, 'inject must not force Perenio SM OFF');

  const step9fail = validateChronologyCutoff(
    {
      section_reviews: feedback.section_reviews,
      blocks: [
        {
          block_id: 'preview.workExperience',
          actions: [
            {
              op: 'toggleRole',
              company: 'Perenio IoT',
              role: 'Scrum Master',
              included: true
            }
          ]
        }
      ]
    },
    ALCHEMY_LIKE_EXTRACT
  );
  assert(step9fail.length === 0, 'section_reviews relevance must pass step 9 chronology gate');

  console.log('test-applicator-work-experience-section-reviews: ok');
}

run();
