#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv } = require('./teal-login-helper.cjs');
try { require('dotenv').config({ path: path.join(VAULT, '.env') }); } catch (_) {}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function main() {
  loadTealEnv();
  const playwright = require('playwright');
  let page, context;
  for (const dir of getTealProfileCandidates()) {
    try {
      context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      page = context.pages()[0] || (await context.newPage());
      break;
    } catch (_) {}
  }
  const id = '608d280d-0f27-4340-968a-19786d23ee3a';
  await page.goto(`https://app.tealhq.com/resume-builder/resumes/${id}/preview`, {
    waitUntil: 'domcontentloaded',
    timeout: 25000
  });
  await sleep(3000);
  await page.evaluate(() => {
    const b = document.querySelector('#skills button[aria-expanded="false"]');
    if (b) b.click();
  });
  await sleep(1000);
  await page.evaluate(() => {
    const block = document.querySelector('#skills');
    const label = [...block.querySelectorAll('label.text-sm')].find((l) => (l.textContent || '').trim() === 'AI');
    const row = label.closest('[data-testid="resume-tags"]');
    row.querySelector('button[aria-label="Add Skills"]').click();
  });
  await sleep(1000);
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"], [data-radix-collection-item]')].map((el) => ({
      role: el.getAttribute('role'),
      text: (el.textContent || '').trim()
    }))
  );
  console.log(menu.filter((m) => m.text));
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-skills-menu.json'), JSON.stringify(menu, null, 2));
  await context.close().catch(() => {});
}
main();
