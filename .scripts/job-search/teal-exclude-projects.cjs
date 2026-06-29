#!/usr/bin/env node
/**
 * Exclude all Projects from a Teal resume (checkbox off per project).
 */
'use strict';

const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function log(m) {
  console.log('[exclude-projects] ' + m);
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
 */
async function excludeAllProjectsOnPreview(page, logFn = log) {
  await page.evaluate(() => {
    const root = document.querySelector('#projects');
    if (!root) return;
    const btn = root.querySelector('button[aria-expanded="false"]');
    if (btn) btn.click();
  });
  await sleep(800);

  const result = await page.evaluate(() => {
    const disabled = [];
    document.querySelectorAll('#projects [data-testid="Project"]').forEach((row) => {
      const title = (row.querySelector('label.resume-label')?.textContent || '').trim();
      const cb = row.querySelector('button[role="checkbox"]');
      if (cb && cb.getAttribute('aria-checked') === 'true') {
        cb.click();
        disabled.push(title);
      }
    });
    const stillOn = [...document.querySelectorAll('#projects [data-testid="Project"]')].filter(
      (row) => row.querySelector('button[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
    ).length;
    return { disabled, stillOn };
  });
  await sleep(500);

  logFn(`disabled ${result.disabled.length}: ${result.disabled.join('; ') || '(none were on)'}`);
  return {
    ok: result.stillOn === 0,
    disabled: result.disabled,
    stillOn: result.stillOn
  };
}

function verifyNoProjectsInPdf(pdfPath) {
  const { execSync } = require('child_process');
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const hasSection = /\nPROJECTS\s*\n/i.test(text);
  const gloriumProjects = /Telehealth Project|Commercial Real Estate Project \(CRE\)|Capital Renovation Management Platform|Hybrid of telemedicine/i.test(
    text
  );
  return { ok: !hasSection && !gloriumProjects, hasSection, gloriumProjects };
}

async function main() {
  const resumeId = process.argv.includes('--resume-id')
    ? process.argv[process.argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';

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
    const r = await excludeAllProjectsOnPreview(page, log);
    log('result=' + JSON.stringify(r));
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { excludeAllProjectsOnPreview, verifyNoProjectsInPdf };

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
