#!/usr/bin/env node
'use strict';

/**
 * Fast path: only iGaming skills hygiene (Figma off, Curacao dedupe) on an existing resume.
 * Usage: node teal-skills-igaming-hygiene-only.cjs --resume-id <uuid> [--package-dir rel/path]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const playwright = require('playwright');
const { launchTealContext } = require('./teal-chrome-profile.cjs');
const { releaseTealProfile } = require('./teal-chrome-profile.cjs');
const {
  expandSkillsSection,
  dismissOverlays,
  finalizeIgamingCategoryHygiene,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  setSkillIncluded,
  setSkillIncludedInCategory,
  listSkillChipsFromPage,
  clickSkillCheckboxAtIndex,
  categoryNameMatches,
  IGAMING_COMPLIANCE_CATEGORY,
  getCategoryOrder,
  findCategoryNameInOrder
} = require('./teal-resume-skills.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const { TEAL_CHROME_PROFILE_RESUME } = require('./job-search-paths.cjs');
const { exportAndMirrorAppliedPdf } = require('./teal-applied-paths.cjs');

const TEAL_DIR = path.join(__dirname, '../../00-Inbox/Job_Search/teal');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const FORCE_OFF_SKILLS = ['Figma', 'Lucidchart', 'Zeplin'];

/** Uncheck one skill inside a category row (locator → DOM evaluate → global index). */
async function disableSkillInCategoryRow(page, categoryName, skillName, log) {
  const escaped = String(categoryName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const row = page
    .locator('#skills [data-testid="resume-tags"]')
    .filter({ has: page.locator('label.text-sm', { hasText: new RegExp(escaped, 'i') }) })
    .first();
  if ((await row.count()) > 0) {
    await row.scrollIntoViewIfNeeded().catch(() => {});
    const chip = row
      .locator('[role="button"][aria-roledescription="sortable"]')
      .filter({ hasText: new RegExp(`^\\s*${skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') })
      .first();
    if ((await chip.count()) > 0) {
      const cb = chip.locator('[role="checkbox"]').first();
      if ((await cb.getAttribute('aria-checked').catch(() => null)) === 'true') {
        await cb.click({ force: true, timeout: 8000 });
        await sleep(450);
      }
    }
  }
  const domClicked = await page.evaluate(
    ({ catWant, skill }) => {
      const block = document.querySelector('#skills');
      if (!block) return false;
      const norm = (s) =>
        String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      const wantCat = norm(catWant);
      for (const tb of block.querySelectorAll('[data-testid="resume-tags"]')) {
        const cat = norm(tb.querySelector('label.text-sm')?.textContent || '');
        if (cat !== wantCat && !cat.includes(wantCat) && !wantCat.includes(cat)) continue;
        for (const chip of tb.querySelectorAll('[role="button"][aria-roledescription="sortable"]')) {
          let name = '';
          for (const s of chip.querySelectorAll('span')) {
            const t = (s.textContent || '').trim();
            if (t && t.length < 120) name = t;
          }
          if (norm(name) !== norm(skill)) continue;
          const cb = chip.querySelector('[role="checkbox"]');
          if (!cb) return false;
          if (cb.getAttribute('aria-checked') === 'true') cb.click();
          return cb.getAttribute('aria-checked') !== 'true';
        }
      }
      return false;
    },
    { catWant: categoryName, skill: skillName }
  );
  if (domClicked) {
    log(`  skills: disabled ${skillName} in ${categoryName} (DOM)`);
    await sleep(400);
    return true;
  }
  const { items } = await listSkillChipsFromPage(page);
  const hits = items.filter(
    (it) => categoryNameMatches(it.category, categoryName) && normSkill(it.name) === normSkill(skillName)
  );
  for (const h of hits) {
    if (h.included !== true) continue;
    const res = await clickSkillCheckboxAtIndex(page, h.index, false);
    if (res.ok && res.changed) {
      log(`  skills: disabled ${skillName} at index ${h.index}`);
      return true;
    }
  }
  if (await setSkillIncludedInCategory(page, categoryName, skillName, false, log, { exact: true })) {
    return true;
  }
  if (await setSkillIncluded(page, skillName, false, log, { exact: true })) {
    return true;
  }
  return false;
}

function normSkill(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function figmaIncludedInIgaming(extract, igCat) {
  const cat = (extract.categories || []).find((c) =>
    new RegExp(igCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c.name || '')
  );
  const sk = (cat && cat.skills || []).find((s) => /^figma$/i.test(s.name || s.normalized || ''));
  return sk ? sk.included === true : null;
}

function parseArgs() {
  const o = { resumeId: '', packageDir: '' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) o.resumeId = argv[++i];
    else if (argv[i] === '--package-dir' && argv[i + 1]) o.packageDir = argv[++i];
  }
  return o;
}

async function main() {
  const args = parseArgs();
  if (!args.resumeId) {
    console.error('Usage: --resume-id <uuid> [--package-dir ...]');
    process.exit(1);
  }
  const log = (m) => console.log(m);
  loadTealEnv(VAULT);
  const pkgAbs = args.packageDir
    ? path.resolve(process.cwd(), args.packageDir)
    : TEAL_DIR;
  if (!process.env.TEAL_CHROME_PROFILE) {
    process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_RESUME;
  }
  const runKey = args.packageDir || args.resumeId;
  const launched = await launchTealContext(playwright, {
    runKey,
    log,
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 30000
  });
  const page = launched.context.pages()[0] || (await launched.context.newPage());
  const profileHandle = launched.profileHandle;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${args.resumeId}/preview`;
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: url, log, sleepMs: 3000 });
    await dismissOverlays(page);
    await expandSkillsSection(page);
    await page.locator('#skills').scrollIntoViewIfNeeded().catch(() => {});
    await page
      .locator('#skills [data-testid="resume-tags"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60000 });
    await sleep(2000);
    const order = await getCategoryOrder(page);
    const igCat =
      findCategoryNameInOrder(order, IGAMING_COMPLIANCE_CATEGORY) || IGAMING_COMPLIANCE_CATEGORY;
    const hy = await finalizeIgamingCategoryHygiene(page, igCat, log);
    let figmaOff = 0;
    for (const sk of FORCE_OFF_SKILLS) {
      if (await disableSkillInCategoryRow(page, igCat, sk, log)) figmaOff++;
    }
    log(`hygiene: ${JSON.stringify({ ...hy, locatorOff: figmaOff })}`);
    let extract = await extractResumeSkillsFromPage(page);
    if (figmaIncludedInIgaming(extract, igCat) === true) {
      await sleep(800);
      for (const sk of FORCE_OFF_SKILLS) {
        await disableSkillInCategoryRow(page, igCat, sk, log);
      }
      extract = await extractResumeSkillsFromPage(page);
    }
    saveResumeSkills(TEAL_DIR, extract, args.resumeId, [pkgAbs]);
    log('saved teal-resume-skills.json');
    if (figmaIncludedInIgaming(extract, igCat) === true) {
      throw new Error('Figma still included under iGaming after hygiene');
    }
    const pdf = await exportAndMirrorAppliedPdf(page, { packageDir: pkgAbs }, log);
    if (!pdf.ok) {
      throw new Error('Applied PDF export failed: ' + (pdf.error || 'unknown'));
    }
  } finally {
    await launched.context.close().catch(() => {});
    releaseTealProfile(profileHandle);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
