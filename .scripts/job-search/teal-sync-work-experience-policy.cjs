#!/usr/bin/env node
'use strict';

/**
 * Turn OFF roman-work-experience-policy roles on one Teal resume (preview).
 * Usage: node teal-sync-work-experience-policy.cjs --package-dir <cowork-review package>
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const {
  TEAL_DIR,
  VAULT,
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_RESUME
} = require('./job-search-paths.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const {
  getTealProfileCandidates,
  cleanupAllTealProfileLocks,
  removeStaleSingletonLock,
  removeDeadSingletonLock,
  launchPersistentContextGuarded
} = require('./teal-chrome-profile.cjs');
const {
  applyWorkExperienceProfile,
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('./teal-resume-experience.cjs');
const {
  injectPolicyExcludesIntoFeedback,
  policyRowsForApply,
  excludePolicyRolesOnPreview,
  verifyPolicyRolesOffResume
} = require('./teal-resume-experience-policy.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
const { sleep } = require('./teal-target-title.cjs');

function log(m) {
  console.log(m);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let packageDir = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i];
  }
  if (!packageDir) {
    console.error('Usage: node teal-sync-work-experience-policy.cjs --package-dir <dir>');
    process.exit(1);
  }
  return path.resolve(packageDir);
}

async function launchBrowser(playwright) {
  const launchOpts = {
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  };
  loadTealEnv();
  cleanupAllTealProfileLocks(log);

  const profileOrder = [];
  if (process.env.TEAL_CHROME_PROFILE) {
    profileOrder.push(path.resolve(process.env.TEAL_CHROME_PROFILE.replace(/^~/, os.homedir())));
  }
  profileOrder.push(TEAL_CHROME_PROFILE_ALT, TEAL_CHROME_PROFILE_RESUME);
  for (const d of getTealProfileCandidates()) profileOrder.push(d);

  const seen = new Set();
  for (const profileDir of profileOrder) {
    if (!profileDir || seen.has(profileDir)) continue;
    seen.add(profileDir);
    removeStaleSingletonLock(profileDir);
    removeDeadSingletonLock(profileDir, log);
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOpts, {
        log
      });
      const page = context.pages()[0] || (await context.newPage());
      log(`[policy-sync] Teal profile: ${profileDir}`);
      return { context, page, profileDir };
    } catch (e) {
      log('browser launch failed (' + path.basename(profileDir) + '): ' + (e.message || e));
    }
  }
  return null;
}

async function main() {
  const packageDir = parseArgs();
  const ctxPath = path.join(packageDir, 'context.json');
  const fbPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(ctxPath)) {
    console.error('Missing context.json in package');
    process.exit(1);
  }
  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const previewUrl =
    ctx.tealPreviewUrl ||
    `https://app.tealhq.com/resume-builder/resumes/${ctx.resumeId}/preview`;

  if (fs.existsSync(fbPath)) {
    const feedback = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
    injectPolicyExcludesIntoFeedback(feedback);
    fs.writeFileSync(fbPath, JSON.stringify(feedback, null, 2), 'utf8');
    log('Updated feedback.json with policy excludes');
  }

  const wxRows = prepareWorkExperienceForApply(policyRowsForApply());
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome for Teal');
    process.exit(1);
  }
  const { context, page, profileDir } = launched;
  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR, vaultPath: VAULT });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(3000);
    }
    await page.locator('#work-experience').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(800);
    await page
      .waitForSelector('[data-testid="company"]', { timeout: 20000 })
      .catch(() => {});
    await sleep(500);

    const policyR = await excludePolicyRolesOnPreview(page, log);
    log('policy preview clicks: ' + JSON.stringify(policyR.disabled || []));

    await sleep(1000);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, ctx.resumeId, [packageDir]);

    const failures = [];
    const applied = [];
    verifyPolicyRolesOffResume(extract, failures, applied);
    for (const a of applied) log('OK: ' + a);
    if (failures.length) {
      console.error('Policy verify FAIL:\n' + failures.join('\n'));
      process.exit(2);
    }
    log('Policy verify pass for resume ' + ctx.resumeId);
  } finally {
    await context.close().catch(() => {});
    log('[policy-sync] closed Chrome (' + path.basename(profileDir) + ')');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
