#!/usr/bin/env node
/**
 * @deprecated Use teal-apply-resume-feedback.cjs (feedback.apply.bullets_add).
 * Add bullets_add to Teal /preview (Playwright + Chrome profile).
 *
 * Usage:
 *   node teal-add-deferred-bullets.cjs --resume-id <uuid>
 *   node teal-add-deferred-bullets.cjs --package-dir <cowork-package>   # reads context.json for resumeId
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
  positionHasBulletContaining,
  addAchievementBullet
} = require('./teal-resume-experience.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[add-bullets] ' + m);
}

function parseArgs(argv) {
  let resumeId = '';
  let packageDir = '';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--resume-id' && argv[i + 1]) resumeId = argv[++i].trim();
    else if (argv[i] === '--package-dir' && argv[i + 1]) packageDir = argv[++i].trim();
  }
  if (packageDir && !resumeId) {
    const ctxPath = path.join(packageDir, 'context.json');
    if (fs.existsSync(ctxPath)) {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      resumeId = ctx.resumeId || resumeId;
    }
  }
  return { resumeId, packageDir };
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

/** User-approved texts (2026-05-20): 1.1 Cowork draft; 1.2 PKM framing; 1.3 + regulated-market closing. */
const BULLETS = [
  {
    companySubstring: 'Consultoria',
    roleSubstring: 'AI Product Manager',
    skipIfContains: 'architected vendor-agnostic ai workflows that swap between openai',
    text:
      'Architected vendor-agnostic AI workflows that swap between OpenAI, Claude, and open-source models behind a single orchestration layer, eliminating lock-in and cutting manual workload and LLM run cost by 30%+ through prompt and model routing.'
  },
  {
    companySubstring: 'Consultoria',
    roleSubstring: 'AI Product Manager',
    skipIfContains: 'multi-agent orchestration layer (planner + retrieval + executor agents) within my personal knowledge management',
    text:
      'Designed and shipped a multi-agent orchestration layer (planner + retrieval + executor agents) within my personal knowledge management (PKM) practice—end-to-end automation that replaced repetitive manual handoffs across research, drafting, and review workflows.'
  },
  {
    companySubstring: 'AlphaPrompt',
    roleSubstring: 'Senior Product Owner',
    skipIfContains: 'regulated market auditability standards',
    text:
      'Established evaluation, observability, and audit logging for the LLM pipeline (prompt versioning, hallucination checks, retrieval quality scoring), aligning the system with regulated market auditability standards.'
  }
];

async function main() {
  const { resumeId, packageDir } = parseArgs(process.argv);
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
  const applied = [];
  const failed = [];

  try {
    const previewUrl = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }

    for (const row of BULLETS) {
      const has = await positionHasBulletContaining(
        page,
        row.companySubstring,
        row.roleSubstring,
        row.skipIfContains
      );
      if (has) {
        log(`skip (already present): ${row.skipIfContains.slice(0, 50)}…`);
        applied.push(`skipped: ${row.companySubstring} — already had similar bullet`);
        continue;
      }
      const r = await addAchievementBullet(
        page,
        {
          companySubstring: row.companySubstring,
          roleSubstring: row.roleSubstring,
          text: row.text
        },
        log
      );
      if (r === 'added') applied.push(`added: ${row.companySubstring} / ${row.roleSubstring}`);
      else failed.push({ bullet: row.text.slice(0, 60), message: r });
      await sleep(800);
    }

    const extract = await extractResumeExperienceFromPage(page);
    saveResumeExperience(TEAL_DIR, extract, resumeId);
    if (packageDir) {
      fs.writeFileSync(
        path.join(packageDir, 'step-10-bullets-add-evidence.json'),
        JSON.stringify({ resumeId, packageDir, applied, failed, completedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    }
    log('done. applied=' + JSON.stringify(applied));
    if (failed.length) {
      console.error('Failures:', failed);
      process.exit(1);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
