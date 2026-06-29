#!/usr/bin/env node
'use strict';
/**
 * Adwa: disable Route4Me orphan first-person bullet; enable Pin-Up 20-30 provider integrations.
 * Usage: node teal-adwa-experience-hotfix.cjs [--package-dir path]
 */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, TEAL_CHROME_PROFILE_RESUME, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, releaseTealProfile } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  applyWorkExperienceProfile,
  replaceAchievementBulletContaining,
  extractResumeExperienceFromPage,
  saveResumeExperience,
  disableRoute4MeOrphanMarketplaceBullet,
  ensurePinUpAggregatorIntegrationsBullet
} = require('./teal-resume-experience.cjs');
const { parseFeedbackJsonFile, prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
const { exportAndMirrorAppliedPdf } = require('./teal-applied-paths.cjs');

const RESUME_ID = '9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9';
const DEFAULT_PKG = path.join(
  TEAL_DIR,
  'cowork-review/2026-05-20_9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9'
);

function log(m) {
  console.log('[adwa-hotfix] ' + m);
}

function parseArgs() {
  const o = { packageDir: DEFAULT_PKG };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--package-dir' && argv[i + 1]) o.packageDir = path.resolve(process.cwd(), argv[++i]);
  }
  return o;
}

async function main() {
  ensureDirs();
  loadTealEnv(VAULT);
  const args = parseArgs();
  const parsed = parseFeedbackJsonFile(args.packageDir, { writeSanitized: false });
  if (!parsed.ok) throw new Error(parsed.error);
  const feedback = parsed.data;
  const apply = feedback.apply || {};

  if (!process.env.TEAL_CHROME_PROFILE) {
    process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_RESUME;
  }

  const playwright = require('playwright');
  const launched = await launchTealContext(playwright, {
    runKey: args.packageDir,
    log,
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  });
  const page = launched.context.pages()[0] || (await launched.context.newPage());
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;

  try {
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: previewUrl, log, sleepMs: 3500 });

    log('1. work_experience rows from feedback');
    const wxRows = prepareWorkExperienceForApply(apply.work_experience);
    await applyWorkExperienceProfile(page, wxRows, log);

    log('2. bullets_rewrite (Pin-Up aggregator)');
    for (const row of apply.bullets_rewrite || []) {
      const r = await replaceAchievementBulletContaining(
        page,
        {
          companySubstring: row.company,
          roleSubstring: row.role,
          contains: row.text_match_prefix,
          newText: row.new_text
        },
        log
      );
      log(`   rewrite ${row.company}: ${r}`);
      await sleep(500);
    }

    log('3. Route4Me orphan off + Pin-Up aggregator on');
    await disableRoute4MeOrphanMarketplaceBullet(page, log);
    const agg = await ensurePinUpAggregatorIntegrationsBullet(page, log);
    log('   aggregator: ' + agg);
    if (agg === 'failed') process.exitCode = 1;

    await sleep(2000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3500);

    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, RESUME_ID, [args.packageDir]);

    const orphanOn = JSON.stringify(extract).includes('I was responsible for improving the web part');
    const aggOn = (() => {
      for (const c of extract.companies || []) {
        if (!/pin-up/i.test(c.name || '')) continue;
        for (const p of c.positions || []) {
          for (const b of p.bullets || []) {
            if (/owned 20-30 live-content provider/i.test(b.text || '') && b.included === true) {
              return true;
            }
          }
        }
      }
      return false;
    })();

    log(`verify: orphan text in extract=${orphanOn} (off if included:false only)`);
    log(`verify: aggregator bullet on resume=${aggOn}`);

    const pdf = await exportAndMirrorAppliedPdf(page, { packageDir: args.packageDir }, log);
    if (!pdf.ok) {
      log('PDF export failed: ' + (pdf.error || ''));
      process.exitCode = 1;
    }

    if (!aggOn) process.exitCode = 1;
  } finally {
    await launched.context.close().catch(() => {});
    releaseTealProfile(launched.profileHandle);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
