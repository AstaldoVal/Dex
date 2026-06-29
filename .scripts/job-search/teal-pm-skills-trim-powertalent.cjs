#!/usr/bin/env node
'use strict';
/**
 * Trim Product Management to 15 Powertalent-relevant chips; move MGA/Curaçao from AI → PM.
 * Usage: node teal-pm-skills-trim-powertalent.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  normKey,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  setSkillIncludedInCategory,
  moveSkillToCategory,
  applySkillsProfile
} = require('./teal-resume-skills.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf, CV_FILENAME } = require('./teal-applied-paths.cjs');

const RESUME_ID = '219d1259-abc7-4747-b50a-6aba27709936';
const PM_CAT = 'Product Management';
const PACKAGE_DIR = path.join(
  TEAL_DIR,
  'cowork-review/2026-05-20_219d1259-abc7-4747-b50a-6aba27709936'
);

/** Exactly 15 chips on exported resume for Powertalent PM line. */
const PM_KEEP = [
  'A/B testing',
  'Live Casino',
  'Lottery',
  'TV Games',
  'iGaming compliance',
  'Regulatory readiness',
  'Curaçao',
  'MGA',
  'Product analytics and attribution',
  'Roadmap development',
  'Stakeholder management',
  'Data-driven decisions',
  'Cross-functional leadership',
  'Player retention',
  'Product Discovery'
];

const PM_KEEP_KEYS = new Set(PM_KEEP.map(normKey));

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[pm-trim] ' + m);
}

function isPmKeep(skillName) {
  const k = normKey(skillName);
  if (PM_KEEP_KEYS.has(k)) return true;
  if (k === 'curacao' && PM_KEEP_KEYS.has('curaçao')) return true;
  return false;
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

function countPmIncluded(extract) {
  const cat = (extract.categories || []).find((c) => /product management/i.test(c.name));
  if (!cat) return { count: 0, names: [] };
  const on = (cat.skills || []).filter((s) => s.included).map((s) => s.name);
  return { count: on.length, names: on };
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

    log('Move MGA and Curaçao from AI → Product Management');
    for (const sk of ['MGA', 'Curaçao']) {
      const r = await moveSkillToCategory(page, sk, 'AI', PM_CAT, log);
      log(`  ${sk}: ${JSON.stringify(r)}`);
    }

    log('Disable duplicate Curacao (ASCII) if Curaçao is in PM');
    await setSkillIncludedInCategory(page, PM_CAT, 'Curacao', false, log, { exact: true });

    log('Prune PM skills not in keep list');
    let extract = await extractResumeSkillsFromPage(page);
    const pmCat = (extract.categories || []).find((c) => /product management/i.test(c.name));
    if (!pmCat) throw new Error('Product Management category not found');

    for (const sk of pmCat.skills || []) {
      if (!sk.included) continue;
      if (isPmKeep(sk.name)) continue;
      await setSkillIncludedInCategory(page, PM_CAT, sk.name, false, log, { exact: true });
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);

    extract = await extractResumeSkillsFromPage(page);
    const { count, names } = countPmIncluded(extract);
    log(`PM included after trim: ${count} — ${names.join(', ')}`);

    if (count > 15) {
      log('Still >15; second pass off extras');
      for (const sk of pmCat.skills || []) {
        if (!sk.included) continue;
        if (isPmKeep(sk.name)) continue;
        await setSkillIncludedInCategory(page, PM_CAT, sk.name, false, log, { exact: true });
      }
    }

    for (const sk of PM_KEEP) {
      if (/^(mga|cura[cç]ao)$/i.test(sk)) continue;
      await setSkillIncludedInCategory(page, PM_CAT, sk, true, log, { exact: true });
    }
    for (const sk of ['MGA', 'Curaçao']) {
      await moveSkillToCategory(page, sk, 'AI', PM_CAT, log);
      await setSkillIncludedInCategory(page, PM_CAT, sk, true, log, { exact: true });
    }
    for (const noise of ['Games', 'Prioritization and sprint planning', 'Curacao']) {
      await setSkillIncludedInCategory(page, PM_CAT, noise, false, log, { exact: true });
    }
    for (const sk of ['MGA', 'Curaçao', 'Curacao']) {
      await setSkillIncludedInCategory(page, 'AI', sk, false, log, { exact: true });
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    extract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, extract, RESUME_ID);
    const final = countPmIncluded(extract);
    log(`Final PM count: ${final.count}`);
    if (final.count < 12 || final.count > 15) {
      log('WARN: PM count outside 12–15 target: ' + final.names.join(', '));
    }

    const packagePdf = path.join(PACKAGE_DIR, CV_FILENAME);
    const appliedPdf = resolveAppliedPdf('Powertalent', 'Product Manager');
    const exp = await exportResumePdfFromPreview(page, packagePdf, { force: true, log });
    if (exp.ok && appliedPdf) {
      fs.mkdirSync(path.dirname(appliedPdf), { recursive: true });
      fs.copyFileSync(packagePdf, appliedPdf);
      log('PDF: ' + appliedPdf);
    }

    fs.writeFileSync(
      path.join(PACKAGE_DIR, 'pm-trim-evidence.json'),
      JSON.stringify({ pmKeep: PM_KEEP, final, completedAt: new Date().toISOString() }, null, 2)
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
