#!/usr/bin/env node
'use strict';
/**
 * Powertalent resume hotfixes (user review 2026-05-21).
 * Usage: node teal-powertalent-hotfix.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { pasteProfessionalSummaryOnPage } = require('./teal-paste-professional-summary.cjs');
const {
  applyWorkExperienceProfile,
  replaceAchievementBulletContaining,
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('./teal-resume-experience.cjs');
const {
  applySkillsProfile,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  setSkillIncludedInCategory
} = require('./teal-resume-skills.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf, CV_FILENAME } = require('./teal-applied-paths.cjs');

const RESUME_ID = '219d1259-abc7-4747-b50a-6aba27709936';
const PACKAGE_DIR = path.join(
  TEAL_DIR,
  'cowork-review/2026-05-20_219d1259-abc7-4747-b50a-6aba27709936'
);

const SUMMARY = `Product Manager with 12+ years in digital product development and 5+ years in iGaming at Pin-Up Entertainment and EBET, shipping across Live Casino, TV Games, Bingo, Lottery, Sports, and Esports. Lisbon-based and available for hybrid work in Parque das Nações (Mon/Tue on-site). Strong analytical skills and data-driven decision-making: lifted player retention by 10% and Live Casino conversion by 7% through A/B testing and product analytics in Mixpanel, Amplitude, Power BI, and Tableau. Focused on innovation and user experience across digital entertainment, with measurable outcomes including MGA pre-certification delivery, $10M handle scaled under Curaçao sublicense, and 9 payment integrations. Primary liaison for product, engineering, legal, and external auditors on regulated launches.`;

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[powertalent-hotfix] ' + m);
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

async function main() {
  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) throw new Error('Could not launch Chrome for Teal');
  const { context, page } = launched;
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;

  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }

    log('1–7: summary (no English B2, no fluff)');
    await pasteProfessionalSummaryOnPage(page, RESUME_ID, SUMMARY, { log, noAdd: false });
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(2500);

    log('4: remove duplicate LATAM Pin-Up bullet');
    await applyWorkExperienceProfile(
      page,
      [
        {
          company_match: 'Pin-Up Entertainment',
          role_match: 'Senior Product Manager',
          bullets: [
            {
              text_match_prefix:
                'Held vertical performance steady through sequential LATAM market contractions',
              included: false
            }
          ]
        }
      ],
      log
    );

    log('5: EBET Curaçao wording');
    await replaceAchievementBulletContaining(
      page,
      {
        companySubstring: 'EBET',
        roleSubstring: 'Product Manager',
        contains: 'Scaled the online wagering product past $10M',
        newText:
          'Scaled the online wagering product past $10M in handle while operating under Curaçao sublicense across 140+ markets, with active operations in LATAM and SEA.'
      },
      log
    );

    log('4b: shorten incentive bullet (drop embedded LATAM duplicate)');
    await replaceAchievementBulletContaining(
      page,
      {
        companySubstring: 'Pin-Up Entertainment',
        roleSubstring: 'Senior Product Manager',
        contains: 'Designed incentive and reward mechanics',
        newText:
          'Designed incentive and reward mechanics aligned with player behavior: structured engagement campaigns and promotional mechanics that preserved engagement KPIs under shifting market conditions.'
      },
      log
    );

    log('3: Glorium — enable 2 outcome bullets');
    await applyWorkExperienceProfile(
      page,
      [
        {
          company_match: 'Glorium Technologies',
          role_match: 'Senior Product Manager',
          bullets: [
            {
              text_match_prefix: 'Strategized product roadmaps for two products',
              included: true
            },
            {
              text_match_prefix: 'Scaled team efficiency by 50% within 6 months',
              included: true
            }
          ]
        }
      ],
      log
    );

    log('6: prune PM skills noise');
    const skillsPlan = {
      addByCategory: new Map(),
      remove: [
        'Bingo',
        'Games',
        'Business degree',
        'English B2',
        'Hybrid work',
        'Budgets',
        'Influencing skills',
        'Digital products'
      ].map((match) => ({ type: 'skill', match })),
      enable: [],
      moveAiCategoryFirst: false,
      moveCategoryFirst: 'Product Management',
      deactivateOnResume: []
    };
    const skillsResult = await applySkillsProfile(page, skillsPlan, log, {
      skipEnsureOnResume: true,
      skipCollateralLibrary: true
    });
    log('skills: ' + (skillsResult.applied || []).join('; '));

    log('2: MGA/Curaçao — off AI, on Product Management');
    for (const sk of ['MGA', 'Curaçao', 'Curacao']) {
      await setSkillIncludedInCategory(page, 'AI', sk, false, log, { exact: true });
      await setSkillIncludedInCategory(page, 'Product Management', sk, true, log, { exact: true });
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3500);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, RESUME_ID);
    const skillsExtract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, skillsExtract, RESUME_ID);

    const packagePdf = path.join(PACKAGE_DIR, CV_FILENAME);
    const appliedPdf = resolveAppliedPdf('Powertalent', 'Product Manager');
    const exp = await exportResumePdfFromPreview(page, packagePdf, { force: true, log });
    if (exp.ok && appliedPdf) {
      fs.mkdirSync(path.dirname(appliedPdf), { recursive: true });
      fs.copyFileSync(packagePdf, appliedPdf);
      log('PDF: ' + appliedPdf);
    }

    fs.writeFileSync(
      path.join(PACKAGE_DIR, 'powertalent-hotfix-evidence.json'),
      JSON.stringify({ summary: true, skillsResult, completedAt: new Date().toISOString() }, null, 2)
    );
    log('Done.');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
