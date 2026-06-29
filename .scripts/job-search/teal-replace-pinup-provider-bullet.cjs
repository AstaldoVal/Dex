#!/usr/bin/env node
'use strict';

/** One-off: Pin-Up Senior PM — Acted as → Owned (20-30 providers bullet). */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, releaseTealProfile } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  extractResumeExperienceFromPage,
  saveResumeExperience,
  replaceAchievementBulletContaining
} = require('./teal-resume-experience.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const RESUME_ID = '9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9';
const NEW_TEXT =
  'Owned 20-30 live-content provider integrations as primary product owner, including API specs, certification flow, and provider performance dashboards across a 12,000+ title catalog.';

function log(m) {
  console.log('[pinup-provider-bullet] ' + m);
}

async function main() {
  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchTealContext(playwright, {
    runKey: 'adwa',
    log,
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  });
  const { context, profileHandle } = launched;
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45000);

  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3500);
    }

    const r = await replaceAchievementBulletContaining(
      page,
      {
        companySubstring: 'Pin-Up',
        roleSubstring: '',
        contains: 'Acted as primary product owner for 20-30 live-content provider integrations',
        newText: NEW_TEXT
      },
      log
    );

    const extract = await extractResumeExperienceFromPage(page);
    const pkg = path.join(
      TEAL_DIR,
      'cowork-review/2026-05-20_9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9'
    );
    saveResumeExperience(TEAL_DIR, extract, RESUME_ID, [pkg]);

    log('result=' + r);
    process.exit(r === 'replaced' || r === 'unchanged' ? 0 : 1);
  } finally {
    await context.close().catch(() => {});
    releaseTealProfile(profileHandle);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
