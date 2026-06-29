#!/usr/bin/env node
'use strict';
/** Restore Glorium Senior PM ON only (legacy 2017 roles stay OFF per chronology_cutoff). */
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, TEAL_CHROME_PROFILE_RESUME, ensureDirs } = require('./job-search-paths.cjs');
const {
  launchPersistentContextGuarded,
  cleanupAllTealProfileLocks,
  removeStaleSingletonLock,
  removeDeadSingletonLock,
  getTealProfileCandidates,
  TEAL_CHROME_PROFILE_ALT
} = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  applyWorkExperienceProfile,
  extractResumeExperienceFromPage,
  saveResumeExperience
} = require('./teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');

const RESUME_ID = '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const PKG = path.join(
  TEAL_DIR,
  'cowork-review/2026-06-01_02964c6b-92e5-44e6-a1aa-3a71cbd407fd'
);

function log(m) {
  console.log('[restore-glorium] ' + m);
}

async function launchBrowser(playwright) {
  const launchOpts = {
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  };
  const profileOrder = [];
  if (process.env.TEAL_CHROME_PROFILE) {
    profileOrder.push(path.resolve(process.env.TEAL_CHROME_PROFILE.replace(/^~/, os.homedir())));
  }
  profileOrder.push(TEAL_CHROME_PROFILE_RESUME, TEAL_CHROME_PROFILE_ALT);
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
      return { context, page, profileDir };
    } catch (e) {
      log('launch fail ' + path.basename(profileDir) + ': ' + (e.message || e));
    }
  }
  return null;
}

async function syncGloriumSeniorOnLegacyOff(page, logFn = log) {
  const result = await page.evaluate(() => {
    const out = { senior: null, legacy: [] };
    for (const co of document.querySelectorAll('[data-testid="company"]')) {
      if (!/glorium/i.test(co.textContent || '')) continue;
      const h3 = co.querySelector('h3');
      if (h3) {
        const headerRow = h3.closest('div');
        const headerCb = headerRow && headerRow.querySelector('[role="checkbox"]');
        if (headerCb && headerCb.getAttribute('aria-checked') !== 'true') headerCb.click();
      }
      for (const pos of co.querySelectorAll('[data-testid="Position"]')) {
        const text = pos.textContent || '';
        const isLegacy = /2017/.test(text) && !/2022/.test(text);
        const isSenior = /09\/2022/.test(text) || /senior product manager/i.test(text);
        const cbs = [...pos.querySelectorAll('[role="checkbox"]')].filter(
          (cb) => !(cb.id || '').startsWith('achievement-')
        );
        const posCb = cbs[0];
        if (!posCb) continue;
        if (isSenior) {
          if (posCb.getAttribute('aria-checked') !== 'true') posCb.click();
          out.senior = text.slice(0, 80);
        } else if (isLegacy) {
          if (posCb.getAttribute('aria-checked') === 'true') posCb.click();
          out.legacy.push(text.match(/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{4}/)?.[0] || 'legacy');
        }
      }
    }
    return out;
  });
  logFn('glorium sync: senior=' + (result.senior || 'missing') + ' legacy_off=' + result.legacy.join(', '));
  return result;
}

async function forceCheckPositionByDates(page, companySub, datesSub, logFn = log) {
  const company = page
    .locator('[data-testid="company"]')
    .filter({ hasText: new RegExp(companySub, 'i') })
    .first();
  await company.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(400);
  const positions = company.locator('[data-testid="Position"]');
  const n = await positions.count();
  for (let i = 0; i < n; i++) {
    const pos = positions.nth(i);
    const text = await pos.innerText().catch(() => '');
    if (!new RegExp(datesSub, 'i').test(text)) continue;
    const posCb = pos.locator('[role="checkbox"]').first();
    if ((await posCb.getAttribute('aria-checked')) !== 'true') {
      await posCb.click({ timeout: 5000 });
      logFn(`playwright check ${companySub} (${datesSub})`);
    }
    return true;
  }
  return false;
}

async function main() {
  ensureDirs();
  loadTealEnv(VAULT);
  cleanupAllTealProfileLocks(log);
  process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_RESUME;
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  const companyOn = prepareWorkExperienceForApply([
    { company_match: 'Glorium Technologies', company_included: true, bullets: [] }
  ]);
  const seniorOn = prepareWorkExperienceForApply([
    {
      company_match: 'Glorium Technologies',
      role_match: 'Senior Product Manager/Product Owner',
      dates_match: '09/2022',
      company_included: true,
      role_included: true,
      bullets: []
    }
  ]);
  const pw = require('playwright');
  const launched = await launchBrowser(pw);
  if (!launched) throw new Error('no browser');
  const { context, page } = launched;
  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2500);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR, vaultPath: VAULT });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(3000);
    }
    await syncGloriumSeniorOnLegacyOff(page, log);
    await sleep(2000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3500);
    await page.locator('#work-experience').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(800);
    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, RESUME_ID, [PKG]);
    const g = (extract.companies || []).find((c) => /glorium/i.test(c.name || ''));
    const senior = (g && g.positions || []).find((p) =>
      /senior product manager/i.test(p.title || '')
    );
    const legacyOn = (g && g.positions || []).filter(
      (p) => /2017/.test(p.dates || '') && p.included === true
    );
    if (legacyOn.length) {
      console.error('Legacy Glorium still ON: ' + legacyOn.map((p) => p.title).join(', '));
      process.exit(3);
    }
    if (!senior || senior.included !== true) {
      console.error('Glorium Senior PM still not included=true');
      process.exit(2);
    }
    log('Glorium Senior PM included=true OK');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
