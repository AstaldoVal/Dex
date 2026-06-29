#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  normKey,
  exactSkillMatch,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  setSkillIncludedInCategory,
  listSkillChipsFromPage,
  deleteSkillChipByIndex,
  addSkillsToCategory,
  findSkillInCategory
} = require('./teal-resume-skills.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf, CV_FILENAME } = require('./teal-applied-paths.cjs');

const RESUME_ID = '219d1259-abc7-4747-b50a-6aba27709936';
const PM_CAT = 'Product Management';
const PM_KEEP_KEYS = new Set(
  [
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
  ].map(normKey)
);

const PACKAGE_DIR = path.join(
  TEAL_DIR,
  'cowork-review/2026-05-20_219d1259-abc7-4747-b50a-6aba27709936'
);

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[pm-cleanup] ' + m);
}

function isKeep(name) {
  const k = normKey(name);
  return PM_KEEP_KEYS.has(k) || (k === 'curacao' && PM_KEEP_KEYS.has('curaçao'));
}

async function dedupePmSkill(page, skillName) {
  const { items } = await listSkillChipsFromPage(page);
  const hits = items.filter(
    (it) => /product management/i.test(it.category) && exactSkillMatch(it.name, skillName)
  );
  if (hits.length <= 1) {
    if (hits[0]) await setSkillIncludedInCategory(page, PM_CAT, skillName, true, log, { exact: true });
    return hits.length;
  }
  const keeper = hits.find((h) => h.included) || hits[0];
  for (const h of hits) {
    if (h.index === keeper.index) {
      await setSkillIncludedInCategory(page, PM_CAT, skillName, true, log, { exact: true });
      continue;
    }
    await deleteSkillChipByIndex(page, h.index, log);
    await sleep(500);
  }
  return hits.length;
}

async function main() {
  loadTealEnv();
  const pw = require('playwright');
  let ctx, page;
  for (const dir of getTealProfileCandidates()) {
    try {
      ctx = await launchPersistentContextGuarded(pw.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false
      });
      page = ctx.pages()[0] || (await ctx.newPage());
      break;
    } catch (_) {}
  }
  const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
  }

  for (const noise of [
    'Games',
    'Prioritization and sprint planning',
    'Curacao',
    'Acceptance criteria',
    'CJM',
    'Esports',
    'Interviewing and onboarding',
    'Software Product Management',
    'Sports betting',
    'Sportsbook',
    'Strategy development',
    'UI/UX',
    'Unit economics',
    'User stories',
    'Wire-framing/Prototyping'
  ]) {
    await setSkillIncludedInCategory(page, PM_CAT, noise, false, log, { exact: true });
  }

  for (const sk of ['MGA', 'Curaçao']) {
    let n = await dedupePmSkill(page, sk);
    log(`dedupe ${sk}: had ${n} chip(s)`);
    let extract = await extractResumeSkillsFromPage(page);
    if (!findSkillInCategory(extract, PM_CAT, sk, { exact: true })) {
      const res = await addSkillsToCategory(page, PM_CAT, [sk], log);
      log(`add ${sk}: ${JSON.stringify(res)}`);
      await sleep(1200);
    }
    await setSkillIncludedInCategory(page, PM_CAT, sk, true, log, { exact: true });
    await dedupePmSkill(page, sk);
  }

  let extract = await extractResumeSkillsFromPage(page);
  const pm = (extract.categories || []).find((c) => /product management/i.test(c.name));
  for (const sk of pm.skills || []) {
    if (!sk.included) continue;
    if (!isKeep(sk.name)) {
      await setSkillIncludedInCategory(page, PM_CAT, sk.name, false, log, { exact: true });
    }
  }

  for (const sk of [
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
  ]) {
    await setSkillIncludedInCategory(page, PM_CAT, sk, true, log, { exact: true });
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  extract = await extractResumeSkillsFromPage(page);
  saveResumeSkills(TEAL_DIR, extract, RESUME_ID);
  const pm2 = (extract.categories || []).find((c) => /product management/i.test(c.name));
  const on = (pm2.skills || []).filter((s) => s.included).map((s) => s.name);
  log(`Final PM (${on.length}): ${on.join(', ')}`);

  const pkg = path.join(PACKAGE_DIR, CV_FILENAME);
  const applied = resolveAppliedPdf('Powertalent', 'Product Manager');
  await exportResumePdfFromPreview(page, pkg, { force: true, log });
  fs.copyFileSync(pkg, applied);
  log('PDF: ' + applied);
  await ctx.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
