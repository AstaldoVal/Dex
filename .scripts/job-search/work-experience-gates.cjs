'use strict';

/**
 * WE1–WE8 work experience gates: pure/simulated (no Teal Playwright).
 * Contract: teal/feedback-block-rules.yaml → preview.workExperience
 */
const { normalizeBlocksToApply, getOpRule } = require('./resume-feedback-blocks.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
const {
  CANONICAL_LOCATION,
  evaluateCanonicalLocationValue,
  canonicalLocationTarget,
  evaluateCanonicalLocationsOnExtract,
  evaluateExtractMetadataInclusion
} = require('./teal-resume-experience-position-metadata.cjs');

const ALL_WE_GATE_IDS = [
  'WE1',
  'WE2',
  'WE3',
  'WE4',
  'WE5',
  'WE6',
  'WE7',
  'WE8',
  'WE9',
  'WE10',
  'WE11',
  'WE12',
  'WE13',
  'WE14',
  'WE15',
  'WE16',
  'WE17',
  'WE18',
  'WE19',
  'WE20',
  'WE99'
];

const SAMPLE_COMPANY = 'Glorium Technologies';
const SAMPLE_ROLE = 'Senior Product Manager/Product Owner';
const SAMPLE_BULLET_PREFIX = 'Delivered a Redshift';

function findWxRow(feedback, company, role) {
  const wx = (feedback.apply && feedback.apply.work_experience) || [];
  return wx.find(
    (r) =>
      String(r.company_match || r.company || '').toLowerCase() === String(company).toLowerCase() &&
      String(r.role_match || r.role || '').toLowerCase() === String(role || '').toLowerCase()
  );
}

function runWEGateUnit(gateId) {
  const errors = [];

  switch (gateId) {
    case 'WE1': {
      const excludeFb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleCompany',
                company_match: SAMPLE_COMPANY,
                included: false
              }
            ]
          }
        ]
      };
      const { feedback: exFb, coverage: exCov } = normalizeBlocksToApply(excludeFb);
      const exRow = findWxRow(exFb, SAMPLE_COMPANY, '');
      if (!exRow) {
        errors.push('WE1 exclude: work_experience row missing');
      } else {
        if (exRow.company_included !== false) {
          errors.push('WE1 exclude: company_included must be false');
        }
        if (exRow.role_included !== false) {
          errors.push('WE1 exclude: excluding company must set role_included false');
        }
      }
      if (exCov.apply_actions !== 1 || exCov.deferred_actions !== 0) {
        errors.push(`WE1 exclude: coverage apply=${exCov.apply_actions} deferred=${exCov.deferred_actions}`);
      }

      const includeFb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleCompany',
                company_match: SAMPLE_COMPANY,
                included: true
              }
            ]
          }
        ]
      };
      const { feedback: inFb, coverage: inCov } = normalizeBlocksToApply(includeFb);
      const inRow = findWxRow(inFb, SAMPLE_COMPANY, '');
      if (!inRow || inRow.company_included !== true) {
        errors.push('WE1 include: company_included must be true');
      }
      if (inCov.apply_actions !== 1 || inCov.deferred_actions !== 0) {
        errors.push(`WE1 include: coverage apply=${inCov.apply_actions} deferred=${inCov.deferred_actions}`);
      }

      const opRule = getOpRule('preview.workExperience', 'toggleCompany');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WE1: yaml toggleCompany must be routable apply');
      }
      break;
    }

    case 'WE2': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleRole',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                included: false
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!row) {
        errors.push('WE2: matching company+role row missing');
      } else if (row.role_included !== false) {
        errors.push('WE2: role_included must be false when included false');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WE2: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience', 'toggleRole');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WE2: yaml toggleRole must be routable apply');
      }
      break;
    }

    case 'WE3': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleBullet',
                company_match: 'Route4Me',
                role_match: 'Lead Product Manager',
                text_match_prefix: 'Shipped web improvements for the marketplace',
                included: true
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, 'Route4Me', 'Lead Product Manager');
      if (!row) {
        errors.push('WE3: wx row missing for Route4Me Lead PM');
      } else if (!Array.isArray(row.bullets) || row.bullets.length !== 1) {
        errors.push('WE3: exactly one bullet expected on row');
      } else {
        const b = row.bullets[0];
        if (b.text_match_prefix !== 'Shipped web improvements for the marketplace') {
          errors.push('WE3: text_match_prefix mismatch');
        }
        if (b.included !== true) {
          errors.push('WE3: bullet included must be true');
        }
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WE3: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience', 'toggleBullet');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WE3: yaml toggleBullet must be routable apply');
      }
      break;
    }

    case 'WE4': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'patchBullets',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                bullets: [
                  { text_match_prefix: SAMPLE_BULLET_PREFIX, included: true },
                  { text_match_prefix: 'Revamped Commercial Real Estate', included: false }
                ]
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!row) {
        errors.push('WE4: wx row missing');
      } else if (!Array.isArray(row.bullets) || row.bullets.length !== 2) {
        errors.push(`WE4: expected 2 bullets, got ${(row.bullets || []).length}`);
      } else {
        const prefixes = row.bullets.map((b) => b.text_match_prefix);
        if (!prefixes.includes(SAMPLE_BULLET_PREFIX)) {
          errors.push('WE4: first bullet prefix missing');
        }
        if (!prefixes.includes('Revamped Commercial Real Estate')) {
          errors.push('WE4: second bullet prefix missing');
        }
        const redshift = row.bullets.find((b) => b.text_match_prefix === SAMPLE_BULLET_PREFIX);
        const revamp = row.bullets.find((b) => b.text_match_prefix === 'Revamped Commercial Real Estate');
        if (!redshift || redshift.included !== true) {
          errors.push('WE4: Redshift bullet must be included true');
        }
        if (!revamp || revamp.included !== false) {
          errors.push('WE4: Revamped bullet must be included false');
        }
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WE4: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience', 'patchBullets');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WE4: yaml patchBullets must be routable apply');
      }
      break;
    }

    case 'WE5': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'editDates',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                dates: '09/2022 - 07/2024',
                suggestion: 'Update dates in Teal UI'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.work_experience && feedback.apply.work_experience.length > 0) {
        errors.push('WE5: editDates must not populate apply.work_experience');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WE5: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1 || other[0].op !== 'editDates') {
        errors.push('WE5: exactly one deferred_v1.other entry with op editDates expected');
      }
      const opRule = getOpRule('preview.workExperience', 'editDates');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE5: yaml editDates must be routable deferred');
      }
      break;
    }

    case 'WE6': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'addRole',
                company_match: 'AlphaPrompt',
                role_match: 'Senior Product Owner',
                suggestion: 'Add missing role in Teal'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.work_experience && feedback.apply.work_experience.length > 0) {
        errors.push('WE6: addRole must not populate apply.work_experience');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WE6: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1 || other[0].op !== 'addRole') {
        errors.push('WE6: exactly one deferred_v1.other entry with op addRole expected');
      }
      const opRule = getOpRule('preview.workExperience', 'addRole');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE6: yaml addRole must be routable deferred');
      }
      break;
    }

    case 'WE7': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'reorderRoles',
                suggestion: 'Drag Glorium above Route4Me in Teal'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.work_experience && feedback.apply.work_experience.length > 0) {
        errors.push('WE7: reorderRoles must not populate apply.work_experience');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WE7: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1 || other[0].op !== 'reorderRoles') {
        errors.push('WE7: exactly one deferred_v1.other entry with op reorderRoles expected');
      }
      const opRule = getOpRule('preview.workExperience', 'reorderRoles');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE7: yaml reorderRoles must be routable deferred');
      }
      break;
    }

    case 'WE8': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'mergeCompanies',
                companies: ['INXY', 'Earlier experience'],
                suggestion: 'Collapse INXY into Earlier experience'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if (feedback.apply.work_experience && feedback.apply.work_experience.length > 0) {
        errors.push('WE8: mergeCompanies must not populate apply.work_experience');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WE8: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const other = feedback.deferred_v1 && feedback.deferred_v1.other;
      if (!Array.isArray(other) || other.length !== 1 || other[0].op !== 'mergeCompanies') {
        errors.push('WE8: exactly one deferred_v1.other entry with op mergeCompanies expected');
      }
      const opRule = getOpRule('preview.workExperience', 'mergeCompanies');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE8: yaml mergeCompanies must be routable deferred');
      }
      break;
    }

    case 'WE10': {
      if (evaluateCanonicalLocationValue('Lisbon, Portugal').pass !== true) {
        errors.push('WE10: Lisbon canonical must pass');
      }
      if (evaluateCanonicalLocationValue('Lisboa').pass !== false) {
        errors.push('WE10: Lisboa must fail');
      }
      if (evaluateCanonicalLocationValue('Kyiv, Ukraine').pass !== true) {
        errors.push('WE10: Kyiv canonical must pass');
      }
      if (evaluateCanonicalLocationValue('Kiev, Ukraine').pass !== false) {
        errors.push('WE10: Kiev spelling must fail');
      }
      if (evaluateCanonicalLocationValue('Remote').pass !== true) {
        errors.push('WE10: Remote canonical must pass');
      }
      if (evaluateCanonicalLocationValue('Remote, Portugal').pass !== false) {
        errors.push('WE10: Remote with country must fail');
      }
      const extractOk = {
        companies: [
          {
            name: 'Acme',
            positions: [
              {
                title: 'PM',
                metadata: { location: { value: CANONICAL_LOCATION.lisbon, included: true } }
              }
            ]
          }
        ]
      };
      const ev = evaluateCanonicalLocationsOnExtract(extractOk);
      if (!ev.pass) errors.push(`WE10 extract eval: ${ev.errors.join('; ')}`);
      break;
    }

    case 'WE17': {
      if (canonicalLocationTarget('Lisboa') !== CANONICAL_LOCATION.lisbon) {
        errors.push('WE17: Lisboa must map to Lisbon, Portugal');
      }
      if (canonicalLocationTarget('Lisbon, Portugal') !== null) {
        errors.push('WE17: already-canonical must not need fix');
      }
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'setLocation',
                company_match: SAMPLE_COMPANY,
                role_match: SAMPLE_ROLE,
                value: 'Lisboa'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      const row = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
      if (!row || row.location_value !== 'Lisboa') {
        errors.push('WE17: setLocation must set location_value on wx row');
      }
      if (coverage.apply_actions !== 1 || coverage.deferred_actions !== 0) {
        errors.push(`WE17: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const opRule = getOpRule('preview.workExperience', 'setLocation');
      if (!opRule || opRule.routable !== 'apply') {
        errors.push('WE17: yaml setLocation must be routable apply');
      }
      break;
    }

    case 'WE18': {
      const {
        injectPolicyExcludesIntoFeedback,
        validatePolicyResumeExcludes,
        verifyPolicyRolesOffResume,
        matchesPolicyExclude,
        policyEntries
      } = require('./teal-resume-experience-policy.cjs');

      const rules = policyEntries();
      if (!rules.some((r) => r.id === 'mindera_technical_po_sep2025_jan2026')) {
        errors.push('WE18: roman-work-experience-policy.json must list mindera_technical_po_sep2025_jan2026');
      }

      const probeOk = {
        company: 'Mindera',
        role: 'Technical Product Owner',
        dates: '09/2025 - 01/2026',
        location: 'Portugal (Remote)',
        employment: 'Full-time'
      };
      if (!matchesPolicyExclude(probeOk, rules.find((r) => r.id === 'mindera_technical_po_sep2025_jan2026'))) {
        errors.push('WE18: Mindera Technical PO Sep2025–Jan2026 must match policy rule');
      }

      const fbBad = {
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
      };
      const s9 = validatePolicyResumeExcludes(fbBad);
      if (!s9.length) errors.push('WE18: step 9 must fail when Cowork enables Mindera on resume');

      const fbInject = injectPolicyExcludesIntoFeedback({
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
      const row = findWxRow(fbInject, 'Mindera', 'Technical Product Owner');
      if (!row || row.company_included !== false || row.role_included !== false) {
        errors.push('WE18: injectPolicyExcludesIntoFeedback must force company/role OFF');
      }
      const s9After = validatePolicyResumeExcludes(fbInject);
      if (s9After.length) errors.push(`WE18: after inject must pass step 9 policy: ${s9After.join('; ')}`);

      const failures = [];
      const applied = [];
      verifyPolicyRolesOffResume(
        {
          companies: [
            {
              name: 'Mindera',
              included: false,
              positions: [
                { title: 'Technical Product Owner', included: false, dates: '09/2025 - 01/2026' }
              ]
            }
          ]
        },
        failures,
        applied
      );
      if (failures.length) errors.push(`WE18: extract OFF must pass step 10: ${failures.join('; ')}`);

      const failuresOn = [];
      verifyPolicyRolesOffResume(
        {
          companies: [
            {
              name: 'Mindera',
              included: true,
              positions: [{ title: 'Technical Product Owner', included: true, dates: '09/2025 - 01/2026' }]
            }
          ]
        },
        failuresOn,
        []
      );
      if (!failuresOn.some((f) => /still ON on resume/i.test(f))) {
        errors.push('WE18: step 10 must fail when Mindera position still ON');
      }

      const failuresMissing = [];
      verifyPolicyRolesOffResume({ companies: [] }, failuresMissing, []);
      if (!failuresMissing.some((f) => /missing from resume extract/i.test(f))) {
        errors.push('WE18: step 10 must fail when policy company absent from extract');
      }
      break;
    }

    case 'WE19': {
      const {
        loadChronologyCutoff,
        findAnchorIndex,
        rowsDisableAtOrOlderThanAnchor,
        injectChronologyCutoffIntoFeedback,
        validateChronologyCutoff,
        verifyChronologyCutoffOnExtract,
        isChronologyOverrideRow
      } = require('./teal-resume-experience-chronology-cutoff.cjs');
      const { flattenExperiencePositions } = require('./teal-resume-experience-chronology.cjs');

      const cutoff = loadChronologyCutoff();
      if (!cutoff || cutoff.id !== 'cutoff_after_route4me_lead_pm') {
        errors.push('WE19: chronology_cutoff cutoff_after_route4me_lead_pm missing in policy JSON');
      }

      const flat = [
        { company: 'Mindera', title: 'Technical Product Owner', dates: '09/2025 - 01/2026' },
        { company: 'Glorium Technologies', title: 'Senior Product Manager', dates: '09/2022 - 04/2025' },
        { company: 'Glorium Technologies', title: 'Project Manager', dates: '03/2017 - 09/2017' },
        { company: 'Route4Me', title: 'Lead Product Manager', dates: '09/2020 - 04/2021' }
      ];
      const { idx: anchorIdx } = findAnchorIndex(flat, cutoff);
      if (anchorIdx !== 3) errors.push(`WE19: anchor index expected 3 got ${anchorIdx}`);

      const offRows = rowsDisableAtOrOlderThanAnchor(flat, anchorIdx, cutoff);
      if (offRows.length !== 2) {
        errors.push(`WE19: expected 2 OFF rows (legacy Glorium + anchor) got ${offRows.length}`);
      }
      if (!offRows.some((r) => /03\/2017/.test(r.dates_match || ''))) {
        errors.push('WE19: OFF rows must include Glorium 03/2017 legacy by dates_match');
      }

      const extract = {
        companies: [
          {
            name: 'Mindera',
            positions: [{ title: 'Technical Product Owner', included: true, dates: '09/2025 - 01/2026' }]
          },
          {
            name: 'Glorium Technologies',
            positions: [
              { title: 'Senior Product Manager', included: true, dates: '09/2022 - 04/2025' },
              { title: 'Project Manager', included: true, dates: '03/2017 - 09/2017' }
            ]
          },
          {
            name: 'Route4Me',
            positions: [{ title: 'Lead Product Manager', included: false, dates: '09/2020 - 04/2021' }]
          }
        ]
      };

      const legacyOnFailures = [];
      verifyChronologyCutoffOnExtract(extract, legacyOnFailures, [], null);
      if (!legacyOnFailures.some((f) => /still ON/i.test(f) && /Glorium|03\/2017/i.test(f))) {
        errors.push('WE19: step 10 must fail when legacy Glorium PM 03/2017 still ON in extract');
      }

      const fbBad = {
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
      };
      const s9 = validateChronologyCutoff(fbBad, extract);
      if (!s9.length) {
        errors.push('WE19: step 9 must fail when blocks enable legacy Glorium without chronology_override');
      }

      const fbOverride = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleRole',
                company: 'Glorium Technologies',
                role: 'Senior Product Manager',
                included: true,
                chronology_override: true
              }
            ]
          }
        ]
      };
      if (validateChronologyCutoff(fbOverride, extract).length) {
        errors.push('WE19: step 9 must pass with chronology_override on block action');
      }

      const extractOk = JSON.parse(JSON.stringify(extract));
      extractOk.companies
        .find((c) => /glorium/i.test(c.name))
        .positions.forEach((p) => {
          if (/senior product manager/i.test(p.title)) p.included = true;
          else p.included = false;
        });

      const fbInject = injectChronologyCutoffIntoFeedback(
        {
          apply: {
            work_experience: [
              {
                company_match: 'Glorium Technologies',
                role_match: 'Senior Product Manager',
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
      const gloriumSenior = findWxRow(fbInject, 'Glorium Technologies', 'Senior Product Manager');
      const gloriumLegacy = (fbInject.apply.work_experience || []).find(
        (r) => /glorium/i.test(r.company_match) && /project manager/i.test(r.role_match)
      );
      if (!gloriumSenior || gloriumSenior.role_included === false) {
        errors.push('WE19: inject must keep Glorium Senior ON');
      }
      if (!gloriumLegacy || gloriumLegacy.role_included !== false) {
        errors.push('WE19: injectChronologyCutoffIntoFeedback must force legacy Glorium OFF');
      }
      if (validateChronologyCutoff(fbInject, extractOk).length) {
        errors.push(`WE19: after inject step 9 chronology: ${validateChronologyCutoff(fbInject, extractOk).join('; ')}`);
      }

      const failures = [];
      const applied = [];
      verifyChronologyCutoffOnExtract(extractOk, failures, applied, fbInject);
      if (failures.length) {
        errors.push(`WE19: extract OFF must pass step 10: ${failures.join('; ')}`);
      }

      const failuresOn = [];
      verifyChronologyCutoffOnExtract(
        {
          companies: [
            {
              name: 'Route4Me',
              positions: [{ title: 'Lead Product Manager', included: true, dates: '06/2020 - 09/2020' }]
            }
          ]
        },
        failuresOn,
        [],
        null
      );
      if (!failuresOn.some((f) => /still ON/i.test(f))) {
        errors.push('WE19: step 10 must fail when anchor Lead PM still ON');
      }

      if (!isChronologyOverrideRow({ role_included: true, chronology_override: true })) {
        errors.push('WE19: isChronologyOverrideRow must accept chronology_override');
      }
      break;
    }

    case 'WE20': {
      const {
        hasCyrillic,
        scanExtractForCyrillicBullets,
        rowsDisableCyrillicBullets,
        injectCyrillicBulletsOffIntoFeedback,
        validateNoCyrillicBulletsEnabled,
        verifyCyrillicBulletsOffOnExtract,
        cyrillicBulletsPolicyEnabled,
        isCyrillicOverrideForStep9
      } = require('./teal-resume-experience-cyrillic-bullets.cjs');

      if (!cyrillicBulletsPolicyEnabled()) {
        errors.push('WE20: roman-work-experience-policy.json must set cyrillic_bullets_off / english_resume_rules');
      }
      if (!hasCyrillic('Управлял продуктовой командой')) {
        errors.push('WE20: hasCyrillic must detect Cyrillic letters');
      }
      if (hasCyrillic('Led cross-functional product delivery')) {
        errors.push('WE20: hasCyrillic must not flag Latin-only bullet');
      }

      const extract = {
        companies: [
          {
            name: 'Glorium Technologies',
            positions: [
              {
                title: 'Senior Product Manager',
                included: true,
                bullets: [
                  { text: 'Delivered roadmap outcomes for B2B SaaS.', included: true },
                  {
                    text: 'Управлял кросс-функциональной командой и приоритизацией бэклога.',
                    included: true
                  }
                ]
              }
            ]
          }
        ]
      };

      const scanned = scanExtractForCyrillicBullets(extract);
      if (scanned.length !== 1) {
        errors.push(`WE20: scanExtract expected 1 Cyrillic bullet got ${scanned.length}`);
      }

      const disableRows = rowsDisableCyrillicBullets(extract);
      if (!disableRows.length || !(disableRows[0].bullets || []).some((b) => b.included === false)) {
        errors.push('WE20: rowsDisableCyrillicBullets must emit included:false patches');
      }

      const fbBad = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleBullet',
                company: 'Glorium Technologies',
                role: 'Senior Product Manager',
                text_match_prefix: 'Управлял кросс-функциональной',
                included: true
              }
            ]
          }
        ]
      };
      const s9 = validateNoCyrillicBulletsEnabled(fbBad, extract);
      if (!s9.length) {
        errors.push('WE20: step 9 must fail when Cowork enables Cyrillic bullet without override');
      }

      const fbOverride = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'toggleBullet',
                company: 'Glorium Technologies',
                role: 'Senior Product Manager',
                text_match_prefix: 'Управлял кросс-функциональной',
                included: true,
                cyrillic_override: true
              }
            ]
          }
        ]
      };
      if (validateNoCyrillicBulletsEnabled(fbOverride, extract).length) {
        errors.push('WE20: step 9 must pass with cyrillic_override on block action');
      }

      const fbInject = injectCyrillicBulletsOffIntoFeedback(
        {
          apply: {
            work_experience: [
              {
                company_match: 'Glorium Technologies',
                role_match: 'Senior Product Manager',
                role_included: true,
                bullets: [
                  {
                    text_match_prefix: 'Управлял кросс-функциональной',
                    included: true
                  }
                ]
              }
            ]
          }
        },
        extract
      );
      const row = findWxRow(fbInject, 'Glorium Technologies', 'Senior Product Manager');
      const cyrBullet = (row && row.bullets || []).find((b) =>
        String(b.text_match_prefix || '').includes('Управлял')
      );
      if (!cyrBullet || cyrBullet.included !== false) {
        errors.push('WE20: injectCyrillicBulletsOffIntoFeedback must force Cyrillic bullet OFF');
      }
      if (validateNoCyrillicBulletsEnabled(fbInject, extract).length) {
        errors.push(`WE20: after inject step 9 cyrillic: ${validateNoCyrillicBulletsEnabled(fbInject, extract).join('; ')}`);
      }

      const failures = [];
      const applied = [];
      const extractOk = JSON.parse(JSON.stringify(extract));
      extractOk.companies[0].positions[0].bullets[1].included = false;
      verifyCyrillicBulletsOffOnExtract(extractOk, failures, applied);
      if (failures.length) {
        errors.push(`WE20: extract OFF must pass step 10: ${failures.join('; ')}`);
      }

      const failuresOn = [];
      verifyCyrillicBulletsOffOnExtract(extract, failuresOn, []);
      if (!failuresOn.some((f) => /still ON/i.test(f))) {
        errors.push('WE20: step 10 must fail when Cyrillic bullet still ON');
      }

      if (!isCyrillicOverrideForStep9({ cyrillic_override: true })) {
        errors.push('WE20: isCyrillicOverrideForStep9 must accept cyrillic_override');
      }
      break;
    }

    case 'WE11': {
      const extractBad = {
        companies: [
          {
            name: 'Co',
            positions: [
              {
                title: 'PM',
                included: true,
                metadata: {
                  remote: { value: 'Remote', included: false },
                  contractor: { value: '', included: null },
                  dates: { value: '', included: null },
                  location: { value: '', included: null }
                }
              }
            ]
          }
        ]
      };
      const ev = evaluateExtractMetadataInclusion(extractBad);
      if (ev.pass) errors.push('WE11: remote unchecked must fail inclusion eval');
      if (!/Remote flag unchecked/.test(ev.errors.join(' '))) {
        errors.push('WE11: expected remote unchecked error');
      }
      break;
    }

    case 'WE12': {
      const extractBad = {
        companies: [
          {
            name: 'Co',
            positions: [
              {
                title: 'PM',
                included: true,
                metadata: {
                  contractor: { value: 'Contractor', included: false },
                  remote: { value: '', included: null },
                  dates: { value: '', included: null },
                  location: { value: '', included: null }
                }
              }
            ]
          }
        ]
      };
      const ev = evaluateExtractMetadataInclusion(extractBad);
      if (ev.pass) errors.push('WE12: contractor unchecked must fail');
      break;
    }

    case 'WE13': {
      const extractBad = {
        companies: [
          {
            name: 'Co',
            positions: [
              {
                title: 'PM',
                included: true,
                dates: '01/2024 - Present',
                metadata: {
                  dates: { value: '01/2024 - Present', included: false },
                  remote: { value: '', included: null },
                  contractor: { value: '', included: null },
                  location: { value: '', included: null }
                }
              }
            ]
          }
        ]
      };
      const ev = evaluateExtractMetadataInclusion(extractBad);
      if (ev.pass) errors.push('WE13: dates unchecked must fail (PDF inclusion, not editDates)');
      const opRule = getOpRule('preview.workExperience', 'editDates');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE13: editDates stays deferred; WE13 is dates-on-resume checkbox only');
      }
      break;
    }

    case 'WE14': {
      const extractBad = {
        companies: [
          {
            name: 'Co',
            positions: [
              {
                title: 'PM',
                included: true,
                metadata: {
                  location: { value: CANONICAL_LOCATION.lisbon, included: false },
                  remote: { value: '', included: null },
                  contractor: { value: '', included: null },
                  dates: { value: '', included: null }
                }
              }
            ]
          }
        ]
      };
      const ev = evaluateExtractMetadataInclusion(extractBad);
      if (ev.pass) errors.push('WE14: location checkbox off must fail');
      break;
    }

    case 'WE15': {
      const extractBad = {
        companies: [
          {
            name: 'Co',
            positions: [
              {
                title: 'PM',
                included: false,
                metadata: {
                  remote: { value: '', included: null },
                  contractor: { value: '', included: null },
                  dates: { value: '', included: null },
                  location: { value: '', included: null }
                }
              }
            ]
          }
        ]
      };
      const ev = evaluateExtractMetadataInclusion(extractBad);
      if (ev.pass) errors.push('WE15: position header off must fail');
      break;
    }

    case 'WE16': {
      const wx = [
        { company_match: 'Glorium Technologies', role_match: 'Senior PM', dates_match: '09/2022' },
        { company_match: 'Glorium Technologies', role_match: 'Product Manager', dates_match: '03/2017' }
      ];
      const merged = prepareWorkExperienceForApply(wx);
      const withDates = merged.find(
        (r) => /glorium/i.test(r.company_match) && /senior pm/i.test(r.role_match)
      );
      if (!withDates || withDates.dates_match !== '09/2022') {
        errors.push('WE16: dates_match must survive prepareWorkExperienceForApply');
      }
      break;
    }

    case 'WE9': {
      const {
        buildChronologyReport,
        evaluateChronologyReport,
        parseDateRange
      } = require('./teal-resume-experience-chronology.cjs');
      const fixture = {
        companies: [
          {
            name: 'Roman & Mariia Consultoria LDA',
            positions: [{ title: 'AI PM', dates: '01/2026 - Present', bullets: [] }]
          },
          {
            name: 'Glorium Technologies',
            positions: [{ title: 'Senior PM', dates: '09/2022 - 07/2024', bullets: [] }]
          }
        ]
      };
      const report = buildChronologyReport(fixture, { minParseableDates: 2 });
      const ev = evaluateChronologyReport(report);
      if (!ev.pass) {
        errors.push(`WE9: chronology eval failed: ${ev.errors.join('; ')}`);
      }
      if (!parseDateRange('01/2026 - Present')) {
        errors.push('WE9: date parser broken for Present');
      }
      if (report.sortedByEndDate[0].company !== 'Roman & Mariia Consultoria LDA') {
        errors.push('WE9: expected most recent end first in sort');
      }
      const opRule = getOpRule('preview.workExperience', 'editDates');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE9: editDates in yaml must stay deferred (dates edited manually in Teal)');
      }
      break;
    }

    case 'WE99': {
      const fb = {
        blocks: [
          {
            block_id: 'preview.workExperience',
            actions: [
              {
                op: 'askUser',
                edge_id: 'WE99_novel_uncatalogued',
                situation: 'Collapse two employers into one custom block with shared bullets',
                value: 'n/a'
              }
            ]
          }
        ]
      };
      const { feedback, coverage } = normalizeBlocksToApply(fb);
      if ((feedback.apply.work_experience || []).length) {
        errors.push('WE99: novel work experience case must not apply');
      }
      if (coverage.apply_actions !== 0 || coverage.deferred_actions !== 1) {
        errors.push(`WE99: coverage apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`);
      }
      const entry = (feedback.deferred_v1.other || [])[0];
      if (!entry || entry.edge_id !== 'WE99_novel_uncatalogued' || entry.op !== 'askUser') {
        errors.push('WE99: deferred must record askUser + WE99_novel_uncatalogued');
      }
      const opRule = getOpRule('preview.workExperience', 'askUser');
      if (!opRule || opRule.routable !== 'deferred') {
        errors.push('WE99: yaml askUser must be routable deferred');
      }
      break;
    }

    default:
      errors.push(`unknown gate ${gateId}`);
  }

  return { gateId, pass: errors.length === 0, errors };
}

/** E2E sim: apply toggles + deferred structural ops in one feedback pass. */
function simulateWorkExperiencePipeline() {
  const pipelineErrors = [];
  const fb = {
    blocks: [
      {
        block_id: 'preview.workExperience',
        actions: [
          {
            op: 'toggleCompany',
            company_match: 'Route4Me',
            included: false
          },
          {
            op: 'toggleRole',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            included: true
          },
          {
            op: 'toggleBullet',
            company_match: 'Route4Me',
            role_match: 'Lead Product Manager',
            text_match_prefix: 'Shipped web improvements for the marketplace',
            included: true
          },
          {
            op: 'patchBullets',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            bullets: [{ text_match_prefix: SAMPLE_BULLET_PREFIX, included: true }]
          },
          {
            op: 'editDates',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            dates: '09/2022',
            suggestion: 'Fix dates manually'
          },
          {
            op: 'mergeCompanies',
            companies: ['INXY', 'Earlier experience'],
            suggestion: 'Merge INXY block'
          }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  const wx = feedback.apply.work_experience || [];

  const route4meCompany = wx.find(
    (r) => /route4me/i.test(r.company_match || '') && !(r.role_match || r.role)
  );
  if (!route4meCompany || route4meCompany.company_included !== false || route4meCompany.role_included !== false) {
    pipelineErrors.push('pipeline: toggleCompany exclude Route4Me missing or wrong flags');
  }

  const gloriumRole = findWxRow(feedback, SAMPLE_COMPANY, SAMPLE_ROLE);
  if (!gloriumRole || gloriumRole.role_included !== true) {
    pipelineErrors.push('pipeline: toggleRole include Glorium missing');
  }
  if (!gloriumRole || !Array.isArray(gloriumRole.bullets) || gloriumRole.bullets.length < 1) {
    pipelineErrors.push('pipeline: patchBullets must add bullets on Glorium row');
  }

  const leadRow = findWxRow(feedback, 'Route4Me', 'Lead Product Manager');
  if (!leadRow || !leadRow.bullets.some((b) => /shipped web/i.test(b.text_match_prefix))) {
    pipelineErrors.push('pipeline: toggleBullet on Lead PM row missing');
  }

  if (coverage.apply_actions !== 4 || coverage.deferred_actions !== 2) {
    pipelineErrors.push(
      `pipeline: expected apply=4 deferred=2, got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }

  const deferredOps = (feedback.deferred_v1.other || []).map((e) => e.op);
  if (!deferredOps.includes('editDates') || !deferredOps.includes('mergeCompanies')) {
    pipelineErrors.push('pipeline: editDates and mergeCompanies must be deferred');
  }

  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage };
}

/**
 * E2E sim: metadata PDF flags + canonical location + dates_match in one career pass.
 * Models step 10: apply toggles → ensure metadata checkboxes → extract eval (not editDates).
 */
function simulateWorkExperienceMetadataPipeline() {
  const pipelineErrors = [];

  const fb = {
    blocks: [
      {
        block_id: 'preview.workExperience',
        actions: [
          {
            op: 'toggleRole',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            included: true
          },
          {
            op: 'patchBullets',
            company_match: SAMPLE_COMPANY,
            role_match: 'Product Manager',
            dates_match: '03/2017',
            bullets: [{ text_match_prefix: 'Led platform roadmap', included: true }]
          },
          {
            op: 'editDates',
            company_match: SAMPLE_COMPANY,
            role_match: SAMPLE_ROLE,
            dates: '09/2022 - 07/2024',
            suggestion: 'Manual date edit in Teal'
          }
        ]
      }
    ]
  };
  const { feedback, coverage } = normalizeBlocksToApply(fb);
  const wx = prepareWorkExperienceForApply(feedback.apply.work_experience || []);

  const gloriumSenior = wx.find(
    (r) =>
      /glorium/i.test(r.company_match || '') &&
      /senior product manager/i.test(r.role_match || '')
  );
  const gloriumPm = wx.find(
    (r) =>
      /glorium/i.test(r.company_match || '') &&
      /^product manager$/i.test(String(r.role_match || '').trim())
  );
  if (!gloriumSenior || gloriumSenior.role_included !== true) {
    pipelineErrors.push('metadata pipeline: Glorium Senior PM row missing');
  }
  if (!gloriumPm || gloriumPm.dates_match !== '03/2017') {
    pipelineErrors.push('metadata pipeline: WE16 dates_match on second Glorium role missing');
  }
  if (coverage.apply_actions !== 2 || coverage.deferred_actions !== 1) {
    pipelineErrors.push(
      `metadata pipeline: expected apply=2 deferred=1 (editDates), got apply=${coverage.apply_actions} deferred=${coverage.deferred_actions}`
    );
  }
  const deferredOps = (feedback.deferred_v1.other || []).map((e) => e.op);
  if (!deferredOps.includes('editDates')) {
    pipelineErrors.push('metadata pipeline: editDates must stay deferred (WE5), separate from WE13 dates-on-PDF');
  }

  const extractHealthy = {
    companies: [
      {
        name: SAMPLE_COMPANY,
        positions: [
          {
            title: SAMPLE_ROLE,
            included: true,
            dates: '09/2022 - 07/2024',
            metadata: {
              location: { value: CANONICAL_LOCATION.lisbon, included: true },
              dates: { value: '09/2022 - 07/2024', included: true },
              remote: { value: 'Remote', included: true },
              contractor: { value: '', included: null }
            }
          },
          {
            title: 'Product Manager',
            included: true,
            dates: '03/2017 - 07/2018',
            metadata: {
              location: { value: CANONICAL_LOCATION.kyiv, included: true },
              dates: { value: '03/2017 - 07/2018', included: true },
              remote: { value: '', included: null },
              contractor: { value: 'Contractor', included: true }
            }
          }
        ]
      },
      {
        name: 'Remote Co',
        positions: [
          {
            title: 'Head of Product',
            included: true,
            dates: '01/2025 - Present',
            metadata: {
              location: { value: CANONICAL_LOCATION.remote, included: true },
              dates: { value: '01/2025 - Present', included: true },
              remote: { value: 'Remote', included: true },
              contractor: { value: '', included: null }
            }
          }
        ]
      }
    ]
  };

  const canonOk = evaluateCanonicalLocationsOnExtract(extractHealthy);
  if (!canonOk.pass) {
    pipelineErrors.push(`metadata pipeline WE10: ${canonOk.errors.join('; ')}`);
  }
  const inclOk = evaluateExtractMetadataInclusion(extractHealthy);
  if (!inclOk.pass) {
    pipelineErrors.push(`metadata pipeline inclusion: ${inclOk.errors.join('; ')}`);
  }

  const extractBroken = JSON.parse(JSON.stringify(extractHealthy));
  extractBroken.companies[0].positions[0].metadata.remote.included = false;
  extractBroken.companies[0].positions[0].metadata.dates.included = false;
  extractBroken.companies[1].positions[0].metadata.location.included = false;

  const inclBad = evaluateExtractMetadataInclusion(extractBroken);
  if (inclBad.pass) {
    pipelineErrors.push('metadata pipeline: broken extract must fail WE11–WE14 inclusion');
  }
  if (!/Remote flag unchecked/.test(inclBad.errors.join(' '))) {
    pipelineErrors.push('metadata pipeline: expected remote unchecked in broken extract');
  }
  if (!/dates on resume unchecked/.test(inclBad.errors.join(' '))) {
    pipelineErrors.push('metadata pipeline: expected dates unchecked in broken extract');
  }

  for (const c of extractBroken.companies) {
    for (const p of c.positions) {
      if (p.metadata.remote?.value && p.metadata.remote.included === false) {
        p.metadata.remote.included = true;
      }
      if (p.metadata.dates?.value && p.metadata.dates.included === false) {
        p.metadata.dates.included = true;
      }
      if (p.metadata.location?.value && p.metadata.location.included === false) {
        p.metadata.location.included = true;
      }
      if (p.included === false) p.included = true;
    }
  }
  const inclFixed = evaluateExtractMetadataInclusion(extractBroken);
  if (!inclFixed.pass) {
    pipelineErrors.push(`metadata pipeline: after ensure sim ${inclFixed.errors.join('; ')}`);
  }

  return { pass: pipelineErrors.length === 0, pipelineErrors, feedback, coverage, extractHealthy };
}

module.exports = {
  ALL_WE_GATE_IDS,
  runWEGateUnit,
  simulateWorkExperiencePipeline,
  simulateWorkExperienceMetadataPipeline,
  evaluateCanonicalLocationsOnExtract,
  evaluateExtractMetadataInclusion
};
