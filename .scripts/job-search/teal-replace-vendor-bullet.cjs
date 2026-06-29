#!/usr/bin/env node
/**
 * One-off: replace Consultoria vendor-agnostic bullet (remove [X]% / refresh final copy).
 *
 * Usage:
 *   node teal-replace-vendor-bullet.cjs --resume-id <uuid>
 *   node teal-replace-vendor-bullet.cjs --package-dir <cowork-package>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  extractResumeExperienceFromPage,
  saveResumeExperience,
  replaceAchievementBulletContaining
} = require('./teal-resume-experience.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

/** Aligns with professional summary (30%+ manual workload / automation); scoped to workload + LLM run cost. */
const FINAL_TEXT =
  'Architected vendor-agnostic AI workflows that swap between OpenAI, Claude, and open-source models behind a single orchestration layer, eliminating lock-in and cutting manual workload and LLM run cost by 30%+ through prompt and model routing.';

function log(m) {
  console.log('[replace-vendor-bullet] ' + m);
}

function parseArgs(argv) {
  let resumeId = '';
  let packageDir = '';
  let debug = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) resumeId = argv[++i].trim();
    else if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i].trim();
    else if (argv[i] === '--debug') debug = true;
  }
  if (packageDir && !resumeId) {
    const ctxPath = path.join(packageDir, 'context.json');
    if (fs.existsSync(ctxPath)) {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      resumeId = ctx.resumeId || resumeId;
    }
  }
  return { resumeId, packageDir, debug };
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

async function main() {
  const { resumeId, packageDir, debug } = parseArgs(process.argv);
  if (!resumeId) {
    console.error('Usage: --resume-id <uuid> | --package-dir <dir> with context.json');
    process.exit(1);
  }
  loadTealEnv();

  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome for Teal');
    process.exit(1);
  }
  const { context, page } = launched;

  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }

    if (debug) {
      const dump = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('[data-testid="company"]').forEach((companyEl) => {
          const h3 = companyEl.querySelector('h3');
          const name = h3 ? (h3.textContent || '').trim() : '';
          if (!/consultoria/i.test(name)) return;
          const rows = [];
          companyEl.querySelectorAll('[data-testid="Position"]').forEach((posEl) => {
            posEl.querySelectorAll('[data-testid="Achievement"]').forEach((achEl) => {
              const ed = achEl.querySelector('[contenteditable="true"], [data-slate-editor="true"]');
              const t = ed ? (ed.textContent || '').trim() : (achEl.textContent || '').trim();
              rows.push(t.slice(0, 200));
            });
          });
          out.push({ name: name.slice(0, 120), bullets: rows });
        });
        return out;
      });
      log('DEBUG company/achievements: ' + JSON.stringify(dump, null, 2));
    }

    const r = await replaceAchievementBulletContaining(
      page,
      {
        companySubstring: 'Consultoria',
        roleSubstring: '',
        contains: 'llm cost per task by [x]%',
        newText: FINAL_TEXT
      },
      log
    );

    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, resumeId);

    const evidence = {
      resumeId,
      packageDir,
      result: r,
      finalText: FINAL_TEXT,
      completedAt: new Date().toISOString()
    };
    if (packageDir) {
      fs.writeFileSync(
        path.join(packageDir, 'step-10b-vendor-bullet-replace-evidence.json'),
        JSON.stringify(evidence, null, 2),
        'utf8'
      );
    }
    log('result=' + r);
    if (r === 'not_found' || r === 'failed') process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
