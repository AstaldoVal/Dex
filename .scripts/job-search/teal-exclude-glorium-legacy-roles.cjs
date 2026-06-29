#!/usr/bin/env node
/**
 * Exclude Glorium 2017–2018 positions from a Teal resume (keep 09/2022+ role).
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

const LEGACY_DATE_RE = /\b(03|09)\/2017\s*-\s*(09\/2017|07\/2018)\b/;

function log(m) {
  console.log('[glorium-legacy] ' + m);
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
async function excludeGloriumLegacyRolesOnPreview(page, logFn = log) {
  const result = await page.evaluate(() => {
    const disabled = [];
    const kept = [];
    document.querySelectorAll('[data-testid="company"]').forEach((co) => {
      if (!/glorium/i.test(co.textContent || '')) return;
      co.querySelectorAll('[data-testid="Position"]').forEach((pos) => {
        const text = pos.textContent || '';
        const dates = text.match(/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{4}/)?.[0] || '';
        const isLegacy = /2017/.test(dates) && !/2022/.test(dates);
        const cb = pos.querySelector('button[role="checkbox"]');
        if (isLegacy && cb && cb.getAttribute('aria-checked') === 'true') {
          cb.click();
          disabled.push(dates);
        } else if (!isLegacy && dates) {
          kept.push({ dates, on: cb?.getAttribute('aria-checked') });
        }
      });
    });
    const stillOn = [...document.querySelectorAll('[data-testid="company"]')]
      .filter((co) => /glorium/i.test(co.textContent || ''))
      .flatMap((co) => [...co.querySelectorAll('[data-testid="Position"]')])
      .filter((pos) => /2017/.test(pos.textContent || '') && !/2022/.test(pos.textContent || ''))
      .filter((pos) => pos.querySelector('button[role="checkbox"]')?.getAttribute('aria-checked') === 'true')
      .length;
    return { disabled, kept, stillOn };
  });
  await sleep(500);
  logFn(`disabled: ${result.disabled.join(', ') || '(none)'}`);
  return { ok: result.stillOn === 0, ...result };
}

function verifyNoGlorium2017InPdf(pdfPath) {
  const { execSync } = require('child_process');
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const gloriumBlock = text.split(/Glorium Technologies/i)[1]?.slice(0, 2500) || '';
  const has2017 = /\b03\/2017|\b09\/2017|\b07\/2018\b/.test(gloriumBlock) && /2017|07\/2018/.test(gloriumBlock);
  const has2022 = /09\/2022\s*-\s*(?:07\/2024|04\/2025)/.test(text);
  const hasCorrectEnd = /09\/2022\s*-\s*07\/2024/.test(text);
  return { ok: !has2017 && has2022 && hasCorrectEnd, has2017, has2022, hasCorrectEnd };
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
    const r = await excludeGloriumLegacyRolesOnPreview(page, log);
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = { excludeGloriumLegacyRolesOnPreview, verifyNoGlorium2017InPdf, LEGACY_DATE_RE };

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
