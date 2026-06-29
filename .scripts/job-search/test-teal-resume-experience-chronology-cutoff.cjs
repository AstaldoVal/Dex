'use strict';

const assert = require('assert');
const {
  loadChronologyCutoff,
  findAnchorIndex,
  rowsDisableAtOrOlderThanAnchor,
  injectChronologyCutoffIntoFeedback,
  validateChronologyCutoff,
  verifyChronologyCutoffOnExtract,
  isPositionNewerThanAnchor,
  shouldPositionDefaultOff
} = require('./teal-resume-experience-chronology-cutoff.cjs');
const { flattenExperiencePositions } = require('./teal-resume-experience-chronology.cjs');

const OPINOV8_LIKE_EXTRACT = {
  companies: [
    {
      name: 'Pin-Up Entertainment',
      positions: [{ title: 'Compliance Product Manager', included: true, dates: '12/2024 - Present' }]
    },
    {
      name: 'Glorium Technologies',
      positions: [
        {
          title: 'Senior Product Manager/Product Owner',
          included: true,
          dates: '09/2022 - 04/2025'
        },
        { title: 'Product Owner', included: true, dates: '09/2017 - 07/2018' },
        { title: 'Project Manager', included: true, dates: '03/2017 - 09/2017' }
      ]
    },
    {
      name: 'Route4Me',
      positions: [{ title: 'Lead Product Manager', included: false, dates: '09/2020 - 04/2021' }]
    }
  ]
};

function run() {
  const cutoff = loadChronologyCutoff();
  assert(cutoff && cutoff.id === 'cutoff_after_route4me_lead_pm', 'cutoff block missing');

  const flat = flattenExperiencePositions(OPINOV8_LIKE_EXTRACT);
  const { idx: anchorIdx } = findAnchorIndex(flat, cutoff);
  assert(anchorIdx >= 0, 'anchor must be found in Opinov8-like extract');
  const anchorRow = flat[anchorIdx];
  assert(/route4me/i.test(anchorRow.company), 'anchor company is Route4Me');

  const gloriumSenior = flat.find(
    (r) => /glorium/i.test(r.company) && /senior product manager/i.test(r.title)
  );
  const gloriumLegacy = flat.find(
    (r) => /glorium/i.test(r.company) && /project manager/i.test(r.title) && /03\/2017/.test(r.dates)
  );
  assert(gloriumSenior && gloriumLegacy, 'fixture must include Glorium Senior and legacy PM');
  assert(
    isPositionNewerThanAnchor(gloriumSenior, anchorRow),
    'Glorium Senior must count as newer than anchor by end date'
  );
  assert(
    !isPositionNewerThanAnchor(gloriumLegacy, anchorRow),
    'Glorium 03/2017 must count as older than anchor by end date'
  );
  assert(
    !shouldPositionDefaultOff(gloriumSenior, flat.indexOf(gloriumSenior), anchorIdx, anchorRow),
    'Senior above anchor in editor must stay default ON'
  );
  assert(
    shouldPositionDefaultOff(gloriumLegacy, flat.indexOf(gloriumLegacy), anchorIdx, anchorRow),
    'legacy Glorium above anchor must default OFF'
  );

  const offRows = rowsDisableAtOrOlderThanAnchor(flat, anchorIdx, cutoff);
  assert(
    offRows.some((r) => /project manager/i.test(r.role_match) && r.dates_match === '03/2017'),
    'OFF rows must include Glorium 03/2017 legacy'
  );
  assert(
    !offRows.some((r) => /senior product manager/i.test(r.role_match)),
    'OFF rows must not include Glorium Senior'
  );
  assert(
    offRows.some((r) => /lead product manager/i.test(r.role_match)),
    'OFF rows must include anchor Lead PM'
  );

  const legacyOnFailures = [];
  verifyChronologyCutoffOnExtract(OPINOV8_LIKE_EXTRACT, legacyOnFailures, [], null);
  assert(
    legacyOnFailures.some((f) => /03\/2017|Project Manager|09\/2017|Product Owner/i.test(f) && /still ON/i.test(f)),
    'step 10 must fail when legacy Glorium roles are ON in extract'
  );

  const extractOk = JSON.parse(JSON.stringify(OPINOV8_LIKE_EXTRACT));
  const gCo = extractOk.companies.find((c) => /glorium/i.test(c.name));
  for (const p of gCo.positions) {
    if (/senior product manager/i.test(p.title)) p.included = true;
    else p.included = false;
  }

  const bad = validateChronologyCutoff(
    {
      blocks: [
        {
          block_id: 'preview.workExperience',
          actions: [
            {
              op: 'toggleRole',
              company: 'Glorium Technologies',
              role: 'Project Manager',
              dates: '03/2017',
              included: true
            }
          ]
        }
      ]
    },
    extractOk
  );
  assert(bad.length >= 1, 'blocks toggle ON legacy Glorium without chronology_override must fail step 9');

  const fixed = injectChronologyCutoffIntoFeedback(
    {
      apply: {
        work_experience: [
          {
            company_match: 'Glorium Technologies',
            role_match: 'Senior Product Manager/Product Owner',
            company_included: true,
            role_included: true
          },
          {
            company_match: 'Route4Me',
            role_match: 'Lead Product Manager',
            role_included: true,
            company_included: true
          }
        ]
      }
    },
    extractOk
  );
  const gloriumSeniorRow = (fixed.apply.work_experience || []).find(
    (r) => /glorium/i.test(r.company_match) && /senior/i.test(r.role_match)
  );
  const gloriumLegacyRow = (fixed.apply.work_experience || []).find(
    (r) => /glorium/i.test(r.company_match) && /project manager/i.test(r.role_match)
  );
  const route4Lead = (fixed.apply.work_experience || []).find(
    (r) => /route4me/i.test(r.company_match) && /lead/i.test(r.role_match)
  );
  assert(gloriumSeniorRow && gloriumSeniorRow.role_included !== false, 'inject must keep Glorium Senior ON');
  assert(gloriumLegacyRow && gloriumLegacyRow.role_included === false, 'inject must force legacy Glorium OFF');
  assert(route4Lead && route4Lead.role_included === false, 'inject must force Route4Me Lead OFF');

  const failures = [];
  verifyChronologyCutoffOnExtract(extractOk, failures, [], fixed);
  assert.strictEqual(failures.length, 0, `step 10 verify after inject: ${failures.join('; ')}`);

  console.log('test-teal-resume-experience-chronology-cutoff: ok');
}

run();
