#!/usr/bin/env node
/**
 * Ensure exactly one Target Title checkbox is on for a Teal resume (Cowork apply.target_title).
 */
'use strict';

const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep, normalizeJobTitleForTeal, ensureExactlyOneTargetTitle } = require('./teal-target-title.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const DEFAULT_TITLE = 'AI Innovation Lead / AI Transformation Lead / AI Automation Lead';

function log(m) {
  console.log('[target-title] ' + m);
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

/**
 * @param {import('playwright').Page} page
 * @param {string} title
 */
async function ensureTargetTitleOnPreview(page, title, logFn = log) {
  const want = normalizeJobTitleForTeal(title || DEFAULT_TITLE);
  const r = await ensureExactlyOneTargetTitle(page, want, logFn, { mode: 'auto' });
  logFn(`title="${want}" ok=${r.ok} turnedOff=${(r.turnedOff || []).length}`);
  return {
    ok: r.ok,
    title: want,
    turnedOff: r.turnedOff || [],
    on: r.ok,
    othersOn: r.ok ? 1 : 0
  };
}

function verifyTargetTitleInPdf(pdfPath, expectedTitle) {
  const { execSync } = require('child_process');
  const want = normalizeJobTitleForTeal(expectedTitle || DEFAULT_TITLE);
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const header = text.split('\n').slice(0, 12).join('\n');
  const ok = header.includes(want);
  return { ok, want, headerPreview: header.slice(0, 500) };
}

async function main() {
  const resumeId = process.argv.includes('--resume-id')
    ? process.argv[process.argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';
  let title = DEFAULT_TITLE;
  const ti = process.argv.indexOf('--title');
  if (ti >= 0 && process.argv[ti + 1]) title = process.argv[ti + 1];

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }
  const { context, page } = launched;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }
    const r = await ensureTargetTitleOnPreview(page, title, log);
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { ensureTargetTitleOnPreview, verifyTargetTitleInPdf, DEFAULT_TITLE };

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
