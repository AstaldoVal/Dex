#!/usr/bin/env node
'use strict';
/**
 * Opinov8: enable canonical Route4Me Lead PM showcase bullet; disable noise bullets.
 * Position stays OFF per chronology_cutoff (WE19); bullet ON for editor/PDF when role enabled.
 */
const fs = require('fs');
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
  extractResumeExperienceFromPage,
  saveResumeExperience,
  applyWorkExperienceProfile,
  ensureRoute4MeLeadPmShowcaseBullet,
  disableRoute4MeLeadPmNoiseBullets,
  ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX
} = require('./teal-resume-experience.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
const { flattenExperiencePositions } = require('./teal-resume-experience-chronology.cjs');

const RESUME_ID = '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const DEFAULT_PKG = path.join(
  TEAL_DIR,
  'cowork-review/2026-06-01_02964c6b-92e5-44e6-a1aa-3a71cbd407fd'
);

function log(m) {
  console.log('[route4me-lead-bullet] ' + m);
}

function parseArgs() {
  let packageDir = DEFAULT_PKG;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = path.resolve(argv[++i]);
  }
  return packageDir;
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

function findRoute4MeLeadPm(extract) {
  for (const c of extract.companies || []) {
    if (!/route4me/i.test(c.name || '')) continue;
    for (const p of c.positions || []) {
      if (!/lead product manager/i.test(p.title || '')) continue;
      return { company: c, position: p };
    }
  }
  return null;
}

function findShowcaseBullet(position) {
  const needles = [
    ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX.toLowerCase(),
    'as the lead product manager, i spearheaded'
  ];
  return (position.bullets || []).find((b) => {
    const t = String(b.text || '').toLowerCase();
    return needles.some((n) => t.includes(n.slice(0, Math.min(40, n.length))));
  });
}

function verifyLeadPmShowcase(extract) {
  const found = findRoute4MeLeadPm(extract);
  if (!found) return ['Route4Me Lead PM row missing from extract'];
  const hit = findShowcaseBullet(found.position);
  if (!hit) return ['showcase bullet text not found in extract'];
  if (hit.included !== true) {
    return [
      'showcase bullet included=false — Teal may clear bullets when position is OFF; enable Lead PM role to see on PDF'
    ];
  }
  return [];
}

function leadPmWxRow(roleIncluded) {
  return prepareWorkExperienceForApply([
    {
      company_match: 'Route4Me',
      role_match: 'Lead Product Manager',
      dates_match: '09/2020',
      role_included: roleIncluded,
      company_included: roleIncluded === true,
      bullets: [
        { text_match_prefix: ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX, included: true },
        { text_match_prefix: 'I was responsible for improving the web part', included: false },
        {
          text_match_prefix: 'Shipped web improvements for the marketplace platform',
          included: false
        }
      ]
    }
  ]);
}

function patchFeedback(packageDir) {
  const fbPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(fbPath)) return;
  const feedback = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
  const wx = feedback.apply?.work_experience;
  if (!Array.isArray(wx)) return;
  const idx = wx.findIndex(
    (r) =>
      /route4me/i.test(r.company_match || r.company || '') &&
      /lead product manager/i.test(r.role_match || r.role || '')
  );
  if (idx < 0) return;
  wx[idx].bullets = [
    {
      text_match_prefix: ROUTE4ME_LEAD_SHOWCASE_BULLET_PREFIX,
      included: true,
      reason: 'Canonical Lead PM showcase for healthcare/AI JD when role is enabled'
    },
    {
      text_match_prefix: 'I was responsible for improving the web part',
      included: false
    },
    {
      text_match_prefix: 'Shipped web improvements for the marketplace platform',
      included: false
    }
  ];
  feedback.apply.work_experience = wx;
  fs.writeFileSync(fbPath, JSON.stringify(feedback, null, 2), 'utf8');
  log('Updated feedback.json Route4Me Lead PM bullets');
}

async function main() {
  ensureDirs();
  loadTealEnv(VAULT);
  cleanupAllTealProfileLocks(log);
  const packageDir = parseArgs();
  const ctxPath = path.join(packageDir, 'context.json');
  if (!fs.existsSync(ctxPath)) throw new Error('Missing context.json');
  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  const previewUrl =
    ctx.tealPreviewUrl ||
    `https://app.tealhq.com/resume-builder/resumes/${ctx.resumeId || RESUME_ID}/preview`;

  if (!process.env.TEAL_CHROME_PROFILE) {
    process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_RESUME;
  }

  patchFeedback(packageDir);

  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) throw new Error('Could not launch Chrome for Teal');
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
    await page.waitForSelector('[data-testid="company"]', { timeout: 25000 }).catch(() => {});

    log('Step: position ON — set showcase bullet ON');
    await applyWorkExperienceProfile(page, leadPmWxRow(true), log);
    await disableRoute4MeLeadPmNoiseBullets(page, log);
    await ensureRoute4MeLeadPmShowcaseBullet(page, log);
    await sleep(1200);
    log('Step: position OFF (WE19) — keep bullet flags in feedback');
    await applyWorkExperienceProfile(page, leadPmWxRow(false), log);
    await ensureRoute4MeLeadPmShowcaseBullet(page, log);
    await sleep(1200);

    const after = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, after, ctx.resumeId || RESUME_ID, [packageDir]);

    const found = findRoute4MeLeadPm(after);
    const showcaseHit = found ? findShowcaseBullet(found.position) : null;
    const failures = verifyLeadPmShowcase(after);
    if (showcaseHit && showcaseHit.included === true) {
      log('Verify pass: showcase bullet included=true');
      if (found.position.included === true) {
        log('Note: Lead PM position still ON — run brought-experience-off for WE19 chronology');
      }
    } else if (showcaseHit && found.position.included === false) {
      log(
        'Verify partial: showcase text present, included=false while position OFF (enable Lead PM in Teal to show on PDF)'
      );
    } else if (failures.length) {
      console.error('Verify:\n' + failures.join('\n'));
      process.exit(3);
    }
    log('DONE');
  } finally {
    await context.close().catch(() => {});
    log('closed Chrome (' + path.basename(profileDir) + ')');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
