#!/usr/bin/env node
'use strict';
const os = require('os');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv } = require('./teal-login-helper.cjs');
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
    document.querySelector('#skills button[aria-expanded="false"]')?.click();
  });
  await sleep(1000);
  await page.evaluate(() => {
    const block = document.querySelector('#skills');
    const label = [...block.querySelectorAll('label.text-sm')].find((l) => (l.textContent || '').trim() === 'AI');
    label.closest('[data-testid="resume-tags"]').querySelector('button[aria-label="Add Skills"]').click();
  });
  await sleep(1500);
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll('input, textarea')].map((el) => ({
      ph: el.getAttribute('placeholder'),
      visible: el.offsetParent !== null,
      id: el.id
    }))
  );
  console.log(inputs.filter((i) => i.ph || i.visible));
  await context.close().catch(() => {});
}
main();
