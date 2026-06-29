#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv } = require('./teal-login-helper.cjs');
try { require('dotenv').config({ path: path.join(VAULT, '.env') }); } catch (_) {}
const RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function main() {
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
  await page.goto(`https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`, {
    waitUntil: 'domcontentloaded',
    timeout: 25000
  });
  await sleep(3000);
  const data = await page.evaluate(() => {
    const block = document.querySelector('#interests');
    if (!block) return { error: 'no interests' };
    const items = [];
    block.querySelectorAll('[role="button"][aria-roledescription="sortable"], li, [data-testid]').forEach((el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (t && t.length < 80) items.push(t);
    });
    return { text: (block.innerText || '').slice(0, 2000), items: [...new Set(items)].slice(0, 40) };
  });
  console.log(JSON.stringify(data, null, 2));
  await context.close().catch(() => {});
}
main();
