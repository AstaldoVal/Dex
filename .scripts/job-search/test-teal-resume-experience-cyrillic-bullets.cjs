'use strict';

const assert = require('assert');
const {
  hasCyrillic,
  scanExtractForCyrillicBullets,
  rowsDisableCyrillicBullets,
  injectCyrillicBulletsOffIntoFeedback,
  validateNoCyrillicBulletsEnabled,
  verifyCyrillicBulletsOffOnExtract,
  isCyrillicOverrideForStep9
} = require('./teal-resume-experience-cyrillic-bullets.cjs');

const EXTRACT = {
  companies: [
    {
      name: 'Acme Corp',
      positions: [
        {
          title: 'Product Manager',
          included: true,
          bullets: [
            { text: 'Shipped AI features for enterprise clients.', included: true },
            { text: 'Запустил пилот с LLM для внутренних команд.', included: true }
          ]
        }
      ]
    }
  ]
};

function run() {
  assert(!hasCyrillic('Led roadmap and delivery'), 'Latin-only must not match');
  assert(hasCyrillic('Запустил пилот'), 'Cyrillic must match');

  const scanned = scanExtractForCyrillicBullets(EXTRACT);
  assert(scanned.length === 1, 'one Cyrillic bullet in extract');
  assert(scanned[0].included === true, 'fixture ON');

  const bad = validateNoCyrillicBulletsEnabled(
    {
      apply: {
        work_experience: [
          {
            company_match: 'Acme Corp',
            role_match: 'Product Manager',
            bullets: [{ text_match_prefix: 'Запустил пилот', included: true }]
          }
        ]
      }
    },
    EXTRACT
  );
  assert(bad.length >= 1, 'enable Cyrillic bullet must fail step 9');

  const fixed = injectCyrillicBulletsOffIntoFeedback(
    {
      apply: {
        work_experience: [
          {
            company_match: 'Acme Corp',
            role_match: 'Product Manager',
            bullets: [{ text_match_prefix: 'Запустил пилот', included: true }]
          }
        ]
      }
    },
    EXTRACT
  );
  const row = (fixed.apply.work_experience || []).find((r) => /acme/i.test(r.company_match));
  const b = (row.bullets || []).find((x) => String(x.text_match_prefix).includes('Запустил'));
  assert(b && b.included === false, 'inject must force Cyrillic bullet OFF');
  assert(validateNoCyrillicBulletsEnabled(fixed, EXTRACT).length === 0, 'after inject step 9 pass');

  const overrideOk = validateNoCyrillicBulletsEnabled(
    {
      blocks: [
        {
          block_id: 'preview.workExperience',
          actions: [
            {
              op: 'toggleBullet',
              company: 'Acme Corp',
              role: 'Product Manager',
              text_match_prefix: 'Запустил пилот',
              included: true,
              cyrillic_override: true
            }
          ]
        }
      ]
    },
    EXTRACT
  );
  assert(overrideOk.length === 0, 'cyrillic_override must pass step 9');
  assert(isCyrillicOverrideForStep9({ cyrillic_override: true }), 'override helper');

  const failures = [];
  verifyCyrillicBulletsOffOnExtract(EXTRACT, failures, []);
  assert(failures.some((f) => /still ON/i.test(f)), 'step 10 must fail when Cyrillic ON');

  const extractOff = JSON.parse(JSON.stringify(EXTRACT));
  extractOff.companies[0].positions[0].bullets[1].included = false;
  const failures2 = [];
  verifyCyrillicBulletsOffOnExtract(extractOff, failures2, []);
  assert(failures2.length === 0, 'step 10 pass when Cyrillic OFF');

  const rows = rowsDisableCyrillicBullets(EXTRACT);
  assert(rows.length >= 1 && rows[0].bullets.some((x) => x.included === false), 'disable rows');

  console.log('test-teal-resume-experience-cyrillic-bullets: ok');
}

run();
