#!/usr/bin/env node
/**
 * Apply Russian translations to all work-experience bullets on ArtHome Teal resume.
 * Usage: node teal-art-home-apply-ru-bullets.cjs [--resume-id uuid] [--export-pdf]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { replaceAchievementBulletContaining } = require('./teal-resume-experience.cjs');
const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
const { resolveAppliedPdf } = require('./teal-applied-paths.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const ART_HOME = path.join(VAULT, '00-Inbox/Job_Search/Art_Home');
const DEFAULT_RESUME_ID = '736bc1ca-ec39-485a-946c-e026f0f95a7d';
const MAP_FILE = path.join(ART_HOME, 'bullets-en-ru-map.json');
const LIST_FILE = path.join(ART_HOME, 'bullets-en-list.json');

function log(m) {
  console.log('[art-home-ru] ' + m);
}

function parseArgs() {
  let resumeId = DEFAULT_RESUME_ID;
  let exportPdf = true;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--resume-id' && a[i + 1]) resumeId = a[++i];
    else if (a[i] === '--no-export-pdf') exportPdf = false;
  }
  return { resumeId, exportPdf };
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 45000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

function companyKey(company) {
  const c = String(company || '').trim();
  if (/Roman\s*&\s*Mariia/i.test(c)) return 'Roman & Mariia';
  if (/Glorium/i.test(c)) return 'Glorium Technologies';
  if (/AlphaPrompt/i.test(c)) return 'AlphaPrompt';
  if (/EBET/i.test(c)) return 'EBET';
  if (/INXY/i.test(c)) return 'INXY';
  if (/Route4Me/i.test(c)) return 'Route4Me';
  if (/Perenio/i.test(c)) return 'Perenio';
  if (/Pin-Up/i.test(c)) return 'Pin-Up';
  if (/Information Technologies/i.test(c)) return 'Information Technologies';
  return c.split(/\s+/).slice(0, 2).join(' ');
}

function containsNeedle(enText) {
  const t = String(enText || '').trim();
  return t.length > 72 ? t.slice(0, 72) : t.slice(0, Math.max(24, Math.min(60, t.length)));
}

async function main() {
  const { resumeId, exportPdf } = parseArgs();
  if (!fs.existsSync(MAP_FILE) || !fs.existsSync(LIST_FILE)) {
    console.error('Missing', MAP_FILE, 'or', LIST_FILE);
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  const list = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'));

  const jobs = [];
  for (const row of list) {
    const ru = map[row.text];
    if (!ru) {
      console.error('No RU for:', row.text.slice(0, 60));
      process.exit(1);
    }
    jobs.push({
      companySubstring: companyKey(row.company),
      contains: containsNeedle(row.text),
      newText: ru,
      included: row.included
    });
  }
  log('Bullets to translate: ' + jobs.length);

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }

  const { context, page } = launched;
  const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;

  let ok = 0;
  let fail = 0;
  let skip = 0;

  try {
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
    }

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      log(`[${i + 1}/${jobs.length}] ${j.companySubstring} …`);
      const r = await replaceAchievementBulletContaining(
        page,
        {
          companySubstring: j.companySubstring,
          contains: j.contains,
          newText: j.newText,
          forceClipboard: true,
          skipReloadAfterDialog: true
        },
        log
      );
      if (r === 'replaced' || r === 'unchanged') ok++;
      else if (r === 'not_found') {
        fail++;
        log('  NOT FOUND: ' + j.contains.slice(0, 50));
      } else fail++;
      await sleep(350);
      if ((i + 1) % 15 === 0) {
        const saveBtn = page.locator('button[aria-label="Save"]').first();
        if ((await saveBtn.count()) > 0) await saveBtn.click().catch(() => {});
        await sleep(1500);
      }
    }

    const saveBtn = page.locator('button[aria-label="Save"]').first();
    if ((await saveBtn.count()) > 0) await saveBtn.click().catch(() => {});
    await sleep(2500);

    log(`Done: ok=${ok} fail=${fail} skip=${skip}`);

    if (exportPdf) {
      const pdf = resolveAppliedPdf('ArtHome International', 'Управляющий филиалом');
      fs.mkdirSync(path.dirname(pdf), { recursive: true });
      log('PDF → ' + pdf);
      const exp = await exportResumePdfFromPreview(page, pdf, { force: true, log });
      if (!exp.ok) process.exit(1);
    }

    log('Preview: ' + previewUrl);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
