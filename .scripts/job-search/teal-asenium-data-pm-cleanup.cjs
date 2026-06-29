#!/usr/bin/env node
'use strict';
/**
 * Asenium Product Data Manager — Teal hotfix after Cowork step-10 bleed.
 * Usage: node .scripts/job-search/teal-asenium-data-pm-cleanup.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, isRetriableBrowserError } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { parseFeedbackJsonFile } = require('./resume-feedback-utils.cjs');
const {
  applyWorkExperienceProfile,
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('./teal-resume-experience.cjs');
const {
  applySkillsProfile,
  buildSkillsPlanFromFeedback,
  forceDataProductSkillCleanup,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  dedupeSkillDuplicates
} = require('./teal-resume-skills.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf, CV_FILENAME } = require('./teal-applied-paths.cjs');

const RESUME_ID = '98a9852c-c971-430f-a49b-6e45b9a72c88';
const PACKAGE_DIR = path.join(TEAL_DIR, 'cowork-review/2026-05-21_98a9852c-c971-430f-a49b-6e45b9a72c88');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[asenium-cleanup] ' + m);
}

async function openPreview(page, previewUrl) {
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(3000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
  }
}

async function main() {
  const parsed = parseFeedbackJsonFile(PACKAGE_DIR, { writeSanitized: true });
  if (!parsed.ok) throw new Error(parsed.error || 'feedback.json invalid');
  const feedback = parsed.data;

  loadTealEnv();
  const playwright = require('playwright');
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  const applied = [];
  let lastErr;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let context;
    try {
      const launched = await launchTealContext(playwright, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run']
      });
      context = launched.context;
      const page = context.pages()[0] || (await context.newPage());
      page.setDefaultTimeout(20000);
      await openPreview(page, previewUrl);

    log('1: hide Route4Me junior PM (Jun 2020)');
    await applyWorkExperienceProfile(
      page,
      [
        {
          company_match: 'Route4Me',
          role_match: 'Product Manager',
          dates_match: '06/2020',
          role_included: false
        }
      ],
      log
    );

    log('2: Glorium — turn off duplicate / stray bullets');
    await applyWorkExperienceProfile(
      page,
      [
        {
          company_match: 'Glorium Technologies',
          role_match: 'Senior Product Manager',
          bullets: [
            { text_match_prefix: 'Scaled team efficiency by 50%', included: false },
            {
              text_match_prefix: 'Led product delivery and team development across multiple parallel',
              included: false
            },
            {
              text_match_prefix: 'Drove BA execution for Capital Renovation Management Platform',
              included: false
            }
          ]
        }
      ],
      log
    );

    log('3: skills — data PM cleanup + Cowork skills_add');
    const plan = buildSkillsPlanFromFeedback(feedback);
    const skillsResult = await applySkillsProfile(page, plan, log, {
      skipEnsureOnResume: true,
      skipCollateralLibrary: true
    });
    applied.push(...(skillsResult.applied || []));
    await forceDataProductSkillCleanup(page, feedback, applied, log);
    await dedupeSkillDuplicates(page, log);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3500);

    const skillsExtract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, skillsExtract, RESUME_ID, [PACKAGE_DIR]);
    const exp = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, exp, RESUME_ID, [PACKAGE_DIR]);

    const pkgPdf = path.join(PACKAGE_DIR, CV_FILENAME);
    const appliedPdf = resolveAppliedPdf('Asenium', 'Product Data Manager');
    await exportResumePdfFromPreview(page, pkgPdf, { force: true, log });
    fs.copyFileSync(pkgPdf, appliedPdf);
    log('PDF: ' + appliedPdf);
    log('Applied log: ' + applied.slice(0, 12).join('; ') + (applied.length > 12 ? '…' : ''));
      await context.close().catch(() => {});
      return;
    } catch (e) {
      lastErr = e;
      await context.close().catch(() => {});
      if (attempt < 3 && isRetriableBrowserError(e)) {
        log(`attempt ${attempt} failed (${e.message}) — retry`);
        await sleep(4000);
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('cleanup failed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
