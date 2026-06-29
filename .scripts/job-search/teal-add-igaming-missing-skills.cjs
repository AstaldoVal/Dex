#!/usr/bin/env node
'use strict';
/** Add missing iGaming skills on Adwa resume (Game provider aggregator, Integration conversion). */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const {
  addSkillsToCategory,
  extractResumeSkillsFromPage,
  findSkillInCategory,
  saveResumeSkills,
  expandSkillsSection,
  dismissOverlays,
  IGAMING_COMPLIANCE_CATEGORY
} = require('./teal-resume-skills.cjs');

const RESUME_ID = process.argv[2] || '9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9';
const PACKAGE_DIR =
  process.argv[3] ||
  path.join(TEAL_DIR, 'cowork-review/2026-05-20_9bfa5f0f-e215-40e5-9d0b-0c9d8d11d1d9');
const MISSING = ['Game provider aggregator', 'Integration conversion'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(m) {
  console.log('[add-missing]', m);
}

async function main() {
  try {
    require('dotenv').config({ path: path.join(VAULT, '.env') });
  } catch (_) {}
  loadTealEnv();
  const playwright = require('playwright');
  let page;
  let context;
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
  await dismissOverlays(page);
  await expandSkillsSection(page);
  for (const skill of MISSING) {
    log(`adding ${skill}…`);
    const res = await addSkillsToCategory(page, IGAMING_COMPLIANCE_CATEGORY, [skill], log);
    log(`result: ${JSON.stringify(res)}`);
    await sleep(1500);
  }
  const extract = await extractResumeSkillsFromPage(page);
  for (const skill of MISSING) {
    const hit = findSkillInCategory(extract, IGAMING_COMPLIANCE_CATEGORY, skill, { exact: true });
    log(`${skill}: ${hit ? (hit.skill.included ? 'ON' : 'off') : 'missing'}`);
  }
  saveResumeSkills(TEAL_DIR, extract, RESUME_ID, [PACKAGE_DIR]);
  await context.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
