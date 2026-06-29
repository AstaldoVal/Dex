#!/usr/bin/env node
'use strict';
/** One-off: ensure iGaming & Compliance category on Adwa resume via UI/UX rename. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const {
  ensureIgamingComplianceCategory,
  getCategoryOrder,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  disableGeographicLicensingInProductManagement,
  disableMisplacedIgamingChipsInAiPm,
  relocateMisplacedIgamingSkills,
  buildSkillsPlanFromFeedback,
  applySkillsProfile
} = require('./teal-resume-skills.cjs');
const { parseFeedbackJsonFile } = require('./resume-feedback-utils.cjs');

const RESUME_ID = process.argv[2] || '9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9';
const PACKAGE_DIR =
  process.argv[3] ||
  path.join(
    TEAL_DIR,
    'cowork-review/2026-05-20_9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9'
  );

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(m) {
  console.log('[igaming-fix]', m);
}

async function main() {
  loadTealEnv();
  const playwright = require('playwright');
  let page, context;
  for (const dir of getTealProfileCandidates()) {
    try {
      context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      page = context.pages()[0] || (await context.newPage());
      break;
    } catch (_) {}
  }
  if (!page) throw new Error('no browser');
  const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
  }
  if (page.isClosed()) throw new Error('browser closed before skills');
  const order0 = await getCategoryOrder(page).catch(() => []);
  const existingIg = order0.find((n) => /igaming/i.test(n));
  let cat = existingIg || null;
  if (!cat) {
    cat = await ensureIgamingComplianceCategory(page, log);
  } else {
    log('category already present: ' + cat);
  }
  log('category: ' + (cat || '(missing)'));
  if (cat) {
    await relocateMisplacedIgamingSkills(page, cat, log);
  } else {
    await disableMisplacedIgamingChipsInAiPm(page, log);
  }
  await disableGeographicLicensingInProductManagement(page, log);
  const parsed = parseFeedbackJsonFile(PACKAGE_DIR, { writeSanitized: false });
  if (parsed.ok) {
    const plan = buildSkillsPlanFromFeedback(parsed.data);
    const applied = await applySkillsProfile(page, plan, log, { skipEnsureOnResume: !!cat });
    log('applySkillsProfile: ' + applied.join('; '));
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await sleep(3500);
  const extract = await extractResumeSkillsFromPage(page);
  const out = saveResumeSkills(TEAL_DIR, extract, RESUME_ID, [PACKAGE_DIR]);
  log('saved: ' + out);
  const names = (extract.categories || []).map((c) => c.name).join(' | ');
  log('categories: ' + names);
  await context.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
