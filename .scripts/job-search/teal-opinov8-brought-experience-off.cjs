#!/usr/bin/env node
'use strict';
/**
 * Opinov8 one-off: uncheck work experience from anchor PM @ Brought* and all older (lower on resume).
 * Usage: node teal-opinov8-brought-experience-off.cjs --package-dir <cowork-review package>
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
const { doTealLogin } = require('./teal-login-helper.cjs');
const { loadTealEnv } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  applyWorkExperienceProfile,
  extractResumeExperienceFromPage,
  saveResumeExperience,
  fuzzyCompanyMatch,
  fuzzyRoleMatch,
  ensureRoute4MeLeadPmShowcaseBullet,
  disableRoute4MeLeadPmNoiseBullets
} = require('./teal-resume-experience.cjs');
const { flattenExperiencePositions } = require('./teal-resume-experience-chronology.cjs');
const { prepareWorkExperienceForApply } = require('./resume-feedback-utils.cjs');
const { injectPolicyExcludesIntoFeedback } = require('./teal-resume-experience-policy.cjs');
const {
  findAnchorIndex: findChronologyAnchorIndex,
  rowsDisableAtOrOlderThanAnchor,
  injectChronologyCutoffIntoFeedback
} = require('./teal-resume-experience-chronology-cutoff.cjs');

const RESUME_ID = '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const COMPANY_FUZZY = ['brought', 'brought for me', 'broughttome', 'brought to me'];
const BROUGHT_ANCHOR_ROLE = 'Product Manager';

function log(m) {
  console.log('[opinov8-brought-off] ' + m);
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function companyMatchesBrought(name) {
  const n = norm(name);
  if (!n) return false;
  for (const needle of COMPANY_FUZZY) {
    if (n.includes(needle.replace(/\s+/g, ' '))) return true;
  }
  if (/brought/.test(n) && /me/.test(n)) return true;
  return fuzzyCompanyMatch(name, 'Brought');
}

function parseArgs() {
  let packageDir = path.join(
    TEAL_DIR,
    'cowork-review/2026-06-01_02964c6b-92e5-44e6-a1aa-3a71cbd407fd'
  );
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = path.resolve(argv[++i]);
  }
  return packageDir;
}

function companyMatchesRoute4Me(name) {
  const n = norm(name);
  return n.includes('route4me') || n.includes('route 4 me') || fuzzyCompanyMatch(name, 'Route4Me');
}

function findAnchorIndex(flat, opts = {}) {
  const chron = findChronologyAnchorIndex(flat);
  if (chron.idx >= 0) return chron;

  let best = -1;
  for (let i = 0; i < flat.length; i++) {
    const r = flat[i];
    if (!companyMatchesBrought(r.company)) continue;
    if (fuzzyRoleMatch(r.title, BROUGHT_ANCHOR_ROLE)) return { idx: i, reason: 'brought_company_pm' };
    if (best < 0 && norm(r.title).includes('product manager')) best = i;
  }
  if (best >= 0) return { idx: best, reason: 'brought_company_any_pm' };
  for (let i = 0; i < flat.length; i++) {
    if (companyMatchesBrought(flat[i].company)) return { idx: i, reason: 'brought_company_first' };
  }
  if (opts.allowRoute4MeFallback !== false) {
    for (let i = 0; i < flat.length; i++) {
      const r = flat[i];
      if (!companyMatchesRoute4Me(r.company)) continue;
      if (fuzzyRoleMatch(r.title, 'Lead Product Manager')) {
        return { idx: i, reason: 'route4me_lead_pm_fallback' };
      }
    }
  }
  return { idx: -1, reason: 'not_found' };
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
      log(`Teal profile: ${profileDir}`);
      return { context, page, profileDir };
    } catch (e) {
      log('browser launch failed (' + path.basename(profileDir) + '): ' + (e.message || e));
    }
  }
  return null;
}

function rowsFromAnchor(flat, anchorIdx) {
  const out = rowsDisableAtOrOlderThanAnchor(flat, anchorIdx).map((row) => ({
    ...row,
    opinov8_brought_off: true
  }));
  for (const row of out) {
    if (!companyMatchesRoute4Me(row.company_match)) continue;
    if (!fuzzyRoleMatch(row.role_match, 'Lead Product Manager')) continue;
    row.bullets = [
      {
        text_match_prefix: 'spearheaded the Product Managers department',
        included: true,
        reason: 'Canonical Lead PM showcase; visible when role is turned on'
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
  }
  return out;
}

function verifyOff(extract, rows) {
  const flat = flattenExperiencePositions(extract);
  const failures = [];
  for (const row of rows) {
    let hit = false;
    for (const r of flat) {
      if (!fuzzyCompanyMatch(r.company, row.company_match)) continue;
      if (row.role_match && !fuzzyRoleMatch(r.title, row.role_match)) continue;
      if (row.dates_match && r.dates && !norm(r.dates).includes(norm(row.dates_match))) continue;
      hit = true;
      if (r.positionIncluded !== false) {
        failures.push(`${r.company} / ${r.title} (${r.dates}) still included=true`);
      }
    }
    if (!hit) failures.push(`not in extract: ${row.company_match} / ${row.role_match}`);
  }
  return failures;
}

function appendFeedbackWorkExperience(packageDir, rows) {
  const fbPath = path.join(packageDir, 'feedback.json');
  if (!fs.existsSync(fbPath)) return;
  const feedback = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
  injectPolicyExcludesIntoFeedback(feedback);
  injectChronologyCutoffIntoFeedback(feedback, null);
  if (!feedback.apply) feedback.apply = {};
  const wx = Array.isArray(feedback.apply.work_experience) ? [...feedback.apply.work_experience] : [];
  for (const row of rows) {
    const idx = wx.findIndex(
      (r) =>
        fuzzyCompanyMatch(r.company_match || r.company, row.company_match) &&
        (!row.role_match || fuzzyRoleMatch(r.role_match || r.role, row.role_match))
    );
    const merged = { ...row };
    delete merged.opinov8_brought_off;
    delete merged.chronology_older_than_anchor;
    if (idx >= 0) {
      wx[idx] = { ...wx[idx], ...merged, company_included: false, role_included: false };
    } else {
      wx.push(merged);
    }
  }
  feedback.apply.work_experience = prepareWorkExperienceForApply(wx);
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.opinov8_brought_experience_off = {
    at: new Date().toISOString(),
    anchor: { company_fuzzy: COMPANY_FUZZY, role: BROUGHT_ANCHOR_ROLE },
    rows_off: rows.length
  };
  fs.writeFileSync(fbPath, JSON.stringify(feedback, null, 2), 'utf8');
  log('Updated feedback.json work_experience (' + rows.length + ' rows)');
}

async function forceUncheckPositionByDates(page, companySub, datesSub, logFn = log, opts = {}) {
  const skipAchievementUncheck = opts.skipAchievementUncheck === true;
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
    if (!skipAchievementUncheck) {
      const ach = pos.locator('[data-testid="Achievement"] [role="checkbox"]');
      const ac = await ach.count();
      for (let j = 0; j < ac; j++) {
        const cb = ach.nth(j);
        if ((await cb.getAttribute('aria-checked')) === 'true') await cb.click({ timeout: 5000 });
      }
    }
    const posCb = pos.locator('[role="checkbox"]').first();
    if ((await posCb.getAttribute('aria-checked')) === 'true') {
      await posCb.click({ timeout: 5000 });
      logFn(`playwright uncheck ${companySub} (${datesSub})`);
    }
    return true;
  }
  return false;
}

async function listDomCompanies(page) {
  return page.evaluate(() => {
    const names = [];
    for (const el of document.querySelectorAll('[data-testid="company"]')) {
      const h3 = el.querySelector('h3');
      const t = (h3 && h3.textContent) || '';
      if (t.trim()) names.push(t.trim().slice(0, 120));
    }
    return names;
  });
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
    await sleep(2500);
    await page.locator('#work-experience').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(800);
    await page.waitForSelector('[data-testid="company"]', { timeout: 25000 }).catch(() => {});
    await sleep(500);

    let extract = await extractResumeExperienceFromPage(page);
    const flat = flattenExperiencePositions(extract);
    log('Extract companies: ' + (extract.companies || []).map((c) => c.name).join(' | '));

    let anchor = findAnchorIndex(flat);
    let anchorIdx = anchor.idx;
    if (anchorIdx < 0) {
      const domNames = await listDomCompanies(page);
      log('DOM company headers: ' + domNames.join(' | '));
      const domHit = domNames.findIndex((n) => companyMatchesBrought(n));
      if (domHit >= 0) {
        log('Brought-like company in DOM but missing from extract — re-scroll and re-extract');
        await page.evaluate(() => {
          const els = document.querySelectorAll('[data-testid="company"]');
          const last = els[els.length - 1];
          if (last) last.scrollIntoView({ block: 'center' });
        });
        await sleep(1500);
        extract = await extractResumeExperienceFromPage(page);
        anchor = findAnchorIndex(flattenExperiencePositions(extract));
        anchorIdx = anchor.idx;
      }
    }

    if (anchorIdx < 0) {
      console.error(
        'Anchor not found (Product Manager @ Brought*). Companies in extract:\n' +
          flattenExperiencePositions(extract)
            .map((r, i) => `  ${i}: ${r.company} — ${r.title} (${r.dates})`)
            .join('\n')
      );
      process.exit(2);
    }

    const flat2 = flattenExperiencePositions(extract);
    const anchorRow = flat2[anchorIdx];
    log(
      `Anchor [${anchorIdx}] (${anchor.reason}): ${anchorRow.company} / ${anchorRow.title} (${anchorRow.dates})`
    );
    if (anchor.reason === 'route4me_lead_pm_fallback') {
      log('Note: no Brought* company on resume; using Route4Me Lead Product Manager fallback');
    }
    if (anchor.reason === 'anchor_match' || anchor.reason === 'anchor_lead_pm_fuzzy') {
      log('Note: using policy chronology anchor Route4Me Lead Product Manager');
    }

    const wxRows = prepareWorkExperienceForApply(rowsFromAnchor(flat2, anchorIdx));
    log('Turning OFF ' + wxRows.length + ' position(s):');
    for (const r of wxRows) {
      log(`  - ${r.company_match} / ${r.role_match} (${r.dates_match || 'any dates'})`);
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      await applyWorkExperienceProfile(page, wxRows, log);
      await forceUncheckPositionByDates(page, 'Route4Me', '06/2020\\s*-\\s*09/2020').catch(() => {});
      await disableRoute4MeLeadPmNoiseBullets(page, log);
      await ensureRoute4MeLeadPmShowcaseBullet(page, log);
      await forceUncheckPositionByDates(page, 'Route4Me', '09/2020\\s*-\\s*04/2021', log, {
        skipAchievementUncheck: true
      }).catch(() => {});
      await forceUncheckPositionByDates(page, 'Route4Me', '06/2020\\s*-\\s*09/2020').catch(() => {});
      await sleep(2000);
      const mid = await extractResumeExperienceFromPage(page);
      const midFail = verifyOff(mid, wxRows);
      if (!midFail.length) {
        log('Apply verify OK on attempt ' + attempt);
        break;
      }
      if (attempt === 2) log('Apply verify still failing after retry: ' + midFail.join('; '));
      await sleep(1000);
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3500);
    await page.locator('#work-experience').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(800);

    const after = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, after, ctx.resumeId || RESUME_ID, [packageDir]);

    const failures = verifyOff(after, wxRows);
    if (failures.length) {
      console.error('Verify FAIL:\n' + failures.join('\n'));
      process.exit(3);
    }
    log('Verify pass: all targeted positions included=false');

    appendFeedbackWorkExperience(packageDir, wxRows);
    log('DONE resume ' + (ctx.resumeId || RESUME_ID));
  } finally {
    await context.close().catch(() => {});
    log('closed Chrome (' + path.basename(profileDir) + ')');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
