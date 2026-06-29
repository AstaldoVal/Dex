#!/usr/bin/env node
'use strict';

/**
 * Rename Teal resume skill category labels (e.g. Russian → English) without moving chips.
 *
 * Usage:
 *   node teal-rename-skill-categories.cjs --resume-id <uuid> [--package-dir rel/path]
 *   node teal-rename-skill-categories.cjs --resume-id <uuid> --rename "Old" "New" [--rename ...]
 *   node teal-rename-skill-categories.cjs --resume-id <uuid> --dry-run
 *   node teal-rename-skill-categories.cjs --resume-id <uuid> --finish --company Opinov8 --job-title "AI Product Owner (Healthcare)"
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const playwright = require('playwright');
const {
  launchPersistentContextGuarded,
  removeStaleSingletonLock,
  killChromeForProfile,
  cleanupAllTealProfileLocks
} = require('./teal-chrome-profile.cjs');
const { TEAL_CHROME_PROFILE_RESUME, TEAL_DIR } = require('./job-search-paths.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedWritePath, syncExportedPdf } = require('./teal-applied-paths.cjs');
const {
  expandSkillsSection,
  dismissOverlays,
  extractResumeSkillsFromPage,
  saveResumeSkills,
  renameCategoryByLabelPlaywright,
  findSkillsCategoryRowLocator,
  getCategoryOrder,
  getCyrillicCategoryNamesOnPage,
  saveSkillsForm,
  moveSkillToCategory,
  disableAllSkillsInCategory,
  deleteSkillsCategoryRow
} = require('./teal-resume-skills.cjs');

function exactCategoryInOrder(order, wanted) {
  const w = String(wanted || '')
    .toLowerCase()
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    (order || []).find((c) => {
      const x = String(c || '')
        .toLowerCase()
        .replace(/\band\b/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      return x === w;
    }) || null
  );
}
const { sleep } = require('./teal-target-title.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');

/** Longer / more specific Russian labels first to avoid partial label collisions. */
const DEFAULT_CATEGORY_RENAMES = [
  { from: 'Управление проектами и бизнес-анализ', to: 'Project Management & Business Analysis' },
  { from: 'Инструменты управления проектами', to: 'Project Management Tools' },
  { from: 'Управление Продуктом', to: 'Product Management' },
  { from: 'iGaming и Комплаенс', to: 'iGaming & Compliance' },
  { from: 'Аналитические инструменты', to: 'Analytics Tools' },
  { from: 'Технологии и инструменты', to: 'Technologies & Tools' }
];

function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(String(s || ''));
}

function parseArgs() {
  const o = {
    resumeId: '',
    packageDir: '',
    dryRun: false,
    finish: false,
    exportPdf: false,
    detachChrome: false,
    company: '',
    jobTitle: '',
    renames: []
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) o.resumeId = argv[++i];
    else if (argv[i] === '--package-dir' && argv[i + 1]) o.packageDir = argv[++i];
    else if (argv[i] === '--company' && argv[i + 1]) o.company = argv[++i];
    else if (argv[i] === '--job-title' && argv[i + 1]) o.jobTitle = argv[++i];
    else if (argv[i] === '--dry-run') o.dryRun = true;
    else if (argv[i] === '--finish') {
      o.finish = true;
      o.exportPdf = true;
      o.detachChrome = true;
    } else if (argv[i] === '--export-pdf') o.exportPdf = true;
    else if (argv[i] === '--detach-chrome') o.detachChrome = true;
    else if (argv[i] === '--rename' && argv[i + 2]) {
      o.renames.push({ from: argv[++i], to: argv[++i] });
    }
  }
  if (o.finish && !o.company) o.company = 'Opinov8';
  if (o.finish && !o.jobTitle) o.jobTitle = 'AI Product Owner (Healthcare)';
  return o;
}

function profileDirsToTry() {
  const preferred = [
    path.join(TEAL_DIR, '.chrome-profile'),
    path.join(TEAL_DIR, '.chrome-profile-hourly'),
    TEAL_CHROME_PROFILE_RESUME,
    path.join(TEAL_DIR, '.chrome-profile-matchscore')
  ];
  const env = process.env.TEAL_CHROME_PROFILE && String(process.env.TEAL_CHROME_PROFILE).trim();
  if (env) {
    const resolved = path.resolve(env.replace(/^~/, os.homedir()));
    return [resolved, ...preferred.filter((d) => path.resolve(d) !== resolved)];
  }
  return preferred;
}

async function launchTealPage(log) {
  for (const dir of profileDirsToTry()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (fs.existsSync(path.join(dir, 'SingletonLock'))) removeStaleSingletonLock(dir);
        if (attempt > 0) {
          await sleep(2500);
          log(`  chrome: retry profile ${path.basename(dir)}`);
        }
        const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
          channel: os.platform() === 'darwin' ? 'chrome' : undefined,
          headless: false,
          args: ['--no-first-run'],
          timeout: 60000
        });
        const page = context.pages()[0] || (await context.newPage());
        log(`Chrome profile: ${dir}`);
        return { context, page, profileDir: dir };
      } catch (e) {
        log(`profile skip ${dir}: ${(e.message || e).slice(0, 80)}`);
      }
    }
  }
  return null;
}

function buildRenamePlan(extract, explicitRenames) {
  const names = new Set(
    (extract.categories || []).map((c) => (c.name || '').trim()).filter(Boolean)
  );
  const order = [...names];
  const rows = explicitRenames.length
    ? explicitRenames.filter((r) => r.from && r.to && r.from !== r.to && names.has(r.from))
    : DEFAULT_CATEGORY_RENAMES.filter((r) => names.has(r.from));
  return rows.map((r) => ({
    ...r,
    mergeIntoExisting: Boolean(exactCategoryInOrder(order, r.to))
  }));
}

/** English category already on resume — remove duplicate Cyrillic row (Delete Category), not rename-in-place. */
async function mergeCategoryWhenEnglishExists(page, from, to, log = () => {}) {
  if (page.isClosed()) return null;
  const order = await getCategoryOrder(page);
  const toCat = exactCategoryInOrder(order, to);
  if (!toCat) return renameSkillCategoryOnPage(page, from, to, log);

  const fromRow = await findSkillsCategoryRowLocator(page, from);
  if (fromRow.row) {
    const rowText = ((await fromRow.row.innerText().catch(() => '')) || '').toLowerCase();
    if (!/drag skills into this section/i.test(rowText)) {
      await disableAllSkillsInCategory(page, fromRow.matchName || from, log);
      await sleep(400);
    }
    const deleted = await deleteSkillsCategoryRow(page, from, log);
    const orderAfterDelete = await getCategoryOrder(page);
    if (
      deleted &&
      !categoryNamesWithCyrillic(orderAfterDelete).some((n) => exactCategoryInOrder([n], from))
    ) {
      log(`  skills: removed duplicate Cyrillic row "${from}" (kept "${toCat}")`);
      return toCat;
    }
  }

  const renamed = await renameSkillCategoryOnPage(page, from, to, log);
  let orderAfterRename = await getCategoryOrder(page);
  if (
    renamed &&
    !categoryNamesWithCyrillic(orderAfterRename).some((n) =>
      exactCategoryInOrder([n], from)
    )
  ) {
    return renamed;
  }

  let extract = await extractResumeSkillsFromPage(page);
  const fromCat = (extract.categories || []).find(
    (c) => (c.name || '').trim() === from.trim() || exactCategoryInOrder([c.name], from)
  );
  if (!fromCat) {
    log(`  skills: merge skip — source "${from}" not in extract`);
    return toCat;
  }
  const fromLabel = (fromCat.name || '').trim();
  const skillNames = [
    ...new Set((fromCat.skills || []).map((s) => (s.name || '').trim()).filter(Boolean))
  ];
  let moved = 0;
  for (const skillName of skillNames) {
    if (page.isClosed()) break;
    const res = await moveSkillToCategory(page, skillName, fromLabel, toCat, log);
    if (res && res.ok !== false) moved++;
    await sleep(320);
  }
  if (moved) log(`  skills: merged ${moved} skill(s) "${fromLabel}" → "${toCat}"`);
  await disableAllSkillsInCategory(page, fromLabel, log);
  await sleep(500);
  const renamedAgain = await renameSkillCategoryOnPage(page, fromLabel, toCat, log);
  const orderAfter = await getCategoryOrder(page);
  const cyrillic = categoryNamesWithCyrillic(orderAfter);
  if (!cyrillic.includes(fromLabel) && exactCategoryInOrder(orderAfter, to)) {
    log(`  skills: Cyrillic row cleared after merge (${fromLabel})`);
    return toCat;
  }
  if (renamedAgain) return renamedAgain;

  if (categoryNamesWithCyrillic(orderAfter).some((n) => exactCategoryInOrder([n], from))) {
    const deleted = await deleteSkillsCategoryRow(page, fromLabel, log);
    const orderFinal = await getCategoryOrder(page);
    if (deleted && !categoryNamesWithCyrillic(orderFinal).some((n) => exactCategoryInOrder([n], from))) {
      return toCat;
    }
  }

  return exactCategoryInOrder(orderAfter, to) ? toCat : null;
}

async function renameSkillCategoryOnPage(page, from, to, log = () => {}) {
  return renameCategoryByLabelPlaywright(page, from, to, log);
}

async function main() {
  const args = parseArgs();
  if (!args.resumeId) {
    console.error(
      'Usage: --resume-id <uuid> [--package-dir path] [--rename "from" "to"] [--dry-run]'
    );
    process.exit(1);
  }
  const log = (m) => console.log(m);
  loadTealEnv(VAULT);
  cleanupAllTealProfileLocks(log);
  const pkgAbs = args.packageDir
    ? path.resolve(process.cwd(), args.packageDir)
    : path.join(TEAL_DIR, `cowork-review/2026-06-01_${args.resumeId}`);
  const launched = await launchTealPage(log);
  if (!launched) throw new Error('no Teal Chrome profile available');
  let { context, page, profileDir } = launched;
  const results = [];
  let pdfPath = '';
  let evalReport = { resumeId: args.resumeId, packageDir: pkgAbs };
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

    let extract = await extractResumeSkillsFromPage(page);
    const plan = buildRenamePlan(extract, args.renames);
    log(`categories before: ${(await getCategoryOrder(page)).join(' | ')}`);
    log(`rename plan (${plan.length}): ${plan.map((p) => `${p.from} → ${p.to}`).join('; ')}`);

    if (args.dryRun) {
      console.log(JSON.stringify({ ok: true, dryRun: true, plan, resumeId: args.resumeId }, null, 2));
      return;
    }

    for (const row of plan) {
      if (row.from === row.to) {
        results.push({ from: row.from, to: row.to, ok: false, skip: 'needs_manual_english_label' });
        continue;
      }
      let hit = null;
      const maxAttempts = row.mergeIntoExisting ? 2 : 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (page.isClosed()) break;
        hit = row.mergeIntoExisting
          ? await mergeCategoryWhenEnglishExists(page, row.from, row.to, log)
          : await renameSkillCategoryOnPage(page, row.from, row.to, log);
        if (hit) break;
        if (attempt < maxAttempts) {
          log(`  skills: retry rename ${row.from} (attempt ${attempt + 1}/${maxAttempts})`);
          await dismissOverlays(page);
          await expandSkillsSection(page);
          await sleep(900);
        }
      }
      results.push({
        from: row.from,
        to: row.to,
        ok: Boolean(hit),
        hit: hit || null,
        method: hit ? 'edit_category_rename' : 'fail'
      });
      await sleep(600);
    }

    let cyrillicLeft = await getCyrillicCategoryNamesOnPage(page);
    if (cyrillicLeft.length) {
      log(`  skills: cyrillic categories remain after pass 1: ${cyrillicLeft.join(' | ')} — second pass`);
      for (const name of [...cyrillicLeft]) {
        const target =
          DEFAULT_CATEGORY_RENAMES.find((r) => r.from === name)?.to ||
          args.renames.find((r) => r.from === name)?.to;
        if (!target) continue;
        const merge = Boolean(exactCategoryInOrder(await getCategoryOrder(page), target));
        const hit = merge
          ? await mergeCategoryWhenEnglishExists(page, name, target, log)
          : await renameSkillCategoryOnPage(page, name, target, log);
        results.push({
          from: name,
          to: target,
          ok: Boolean(hit),
          hit: hit || null,
          method: hit ? 'edit_category_rename_pass2' : 'fail_pass2'
        });
        await sleep(600);
      }
    }

    await expandSkillsSection(page);
    const saved = await saveSkillsForm(page);
    if (saved) log('  skills: resume Save after all category renames');
    await sleep(2000);

    extract = await extractResumeSkillsFromPage(page);
    saveResumeSkills(TEAL_DIR, extract, args.resumeId, [pkgAbs]);
    const orderAfter = await getCategoryOrder(page);
    cyrillicLeft = categoryNamesWithCyrillic(orderAfter);
    log(`categories after: ${orderAfter.join(' | ')}`);
    log('saved teal-resume-skills.json');

    evalReport = {
      resumeId: args.resumeId,
      packageDir: pkgAbs,
      categoriesAfter: orderAfter,
      cyrillicCategories: cyrillicLeft,
      renameResults: results,
      skillsSaveClicked: Boolean(saved)
    };

    if (cyrillicLeft.length) {
      throw new Error(`cyrillic category names remain: ${cyrillicLeft.join(', ')}`);
    }

    if (args.exportPdf && args.company && args.jobTitle) {
      pdfPath = resolveAppliedWritePath(args.company, args.jobTitle);
      const pkgPdf = path.join(pkgAbs, 'Roman Matsukatov - CV.pdf');
      const exp = await exportResumePdfFromPreview(page, pdfPath, { force: true, log });
      if (!exp.ok) throw new Error(`pdf export failed: ${exp.error || 'unknown'}`);
      syncExportedPdf(pdfPath, pkgPdf, log);
      evalReport.pdfPath = pdfPath;
      evalReport.packagePdf = pkgPdf;
      log(`  pdf: ${pdfPath}`);
    }

    const evalPath = path.join(pkgAbs, 'skills-category-rename-eval.json');
    fs.writeFileSync(
      evalPath,
      JSON.stringify({ ok: true, ...evalReport, at: new Date().toISOString() }, null, 2)
    );
    log(`  eval: ${evalPath}`);

    const failed = results.filter((r) => !r.ok && !r.skip);
    if (failed.length) {
      throw new Error(`rename failed: ${failed.map((f) => f.from).join(', ')}`);
    }
    console.log(
      JSON.stringify(
        { ok: true, results, resumeId: args.resumeId, packageDir: pkgAbs, pdfPath, categoriesAfter: orderAfter },
        null,
        2
      )
    );
  } finally {
    if (context && !page.isClosed()) {
      await context.close().catch(() => {});
    } else if (context) {
      await context.close().catch(() => {});
    }
    if (args.detachChrome && profileDir) {
      killChromeForProfile(profileDir, log);
      log('  chrome: automation profile stopped (detached)');
    }
  }
}

function categoryNamesWithCyrillic(names) {
  return (names || []).filter((n) => /[\u0400-\u04FF]/.test(String(n || '')));
}

module.exports = { renameSkillCategoryOnPage, DEFAULT_CATEGORY_RENAMES };

main().catch((e) => {
  console.error(e);
  try {
    const argv = process.argv.slice(2);
    let resumeId = '';
    let packageDir = '';
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--resume-id' && argv[i + 1]) resumeId = argv[++i];
      else if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i];
    }
    if (resumeId) {
      const pkgAbs = packageDir
        ? path.resolve(process.cwd(), packageDir)
        : path.join(TEAL_DIR, `cowork-review/2026-06-01_${resumeId}`);
      const evalPath = path.join(pkgAbs, 'skills-category-rename-eval.json');
      fs.writeFileSync(
        evalPath,
        JSON.stringify(
          { ok: false, error: e.message || String(e), resumeId, at: new Date().toISOString() },
          null,
          2
        )
      );
      console.error(`  eval (fail): ${evalPath}`);
    }
  } catch (_) {}
  process.exit(1);
});
