#!/usr/bin/env node
'use strict';
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');

const resumeId = process.argv[2] || '608d280d-0f27-4340-968a-19786d23ee3a';

async function main() {
  loadTealEnv();
  const pw = require('playwright');
  let context;
  let page;
  for (const dir of getTealProfileCandidates()) {
    try {
      context = await launchPersistentContextGuarded(pw.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        timeout: 45000
      });
      page = context.pages()[0] || (await context.newPage());
      break;
    } catch (_) {}
  }
  if (!page) process.exit(1);
  const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
  }
  const dump = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[data-testid="company"]').forEach((companyEl, ci) => {
      const h3 = companyEl.querySelector('h3');
      const pos0 = companyEl.querySelector('[data-testid="Position"]');
      const label = pos0 && pos0.querySelector('[aria-label="Position"]');
      const dateEl = pos0 && pos0.querySelector('[aria-label="Start Date / End Date"]');
      rows.push({
        ci,
        h3Text: h3 ? (h3.innerText || '').slice(0, 120) : '',
        posLabelAria: label
          ? {
              tc: label.textContent,
              inner: label.innerText,
              childCount: label.children.length,
              html: label.innerHTML.slice(0, 300)
            }
          : null,
        dateAria: dateEl
          ? { tc: dateEl.textContent, inner: dateEl.innerText, html: dateEl.innerHTML.slice(0, 300) }
          : null,
        pos0Lines: pos0 ? (pos0.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 14) : [],
        inputs: pos0
          ? [...pos0.querySelectorAll('input')].map((i) => ({
              ph: i.placeholder,
              val: i.value,
              aria: i.getAttribute('aria-label'),
              type: i.type
            }))
          : [],
        editables: pos0
          ? [...pos0.querySelectorAll('[contenteditable="true"]')].slice(0, 6).map((e) => ({
              aria: e.getAttribute('aria-label'),
              t: (e.innerText || '').slice(0, 100)
            }))
          : []
      });
    });
    return rows.slice(0, 2);
  });
  console.log(JSON.stringify(dump, null, 2));
  await context.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
