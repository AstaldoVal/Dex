#!/usr/bin/env node
'use strict';
const path = require('path');
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
  const RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';
  await page.goto(`https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`, {
    waitUntil: 'domcontentloaded',
    timeout: 25000
  });
  await sleep(3000);
  await page.evaluate(() => {
    const block = document.querySelector('#skills');
    const closed = block && block.querySelector('button[aria-expanded="false"]');
    if (closed) closed.click();
  });
  await sleep(1000);

  const opened = await page.evaluate((catName) => {
    const block = document.querySelector('#skills');
    if (!block) return false;
    const labels = [...block.querySelectorAll('label.text-sm')];
    const label = labels.find((l) => (l.textContent || '').trim() === catName);
    if (!label) return false;
    const row = label.closest('[data-testid="resume-tags"]');
    if (!row) return false;
    const btn = row.querySelector('button[aria-label="Add Skills"]');
    if (!btn) return false;
    btn.click();
    return true;
  }, 'AI');
  await sleep(800);
  await page.getByRole('menuitem', { name: 'Add Skills', exact: true }).click({ force: true });
  await sleep(1200);
  const input = page.locator('input[placeholder*="Skill 1"]').first();
  await input.fill('OpenAI API');
  await sleep(400);
  const saved = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const save = btns.find((b) => /^save$/i.test((b.textContent || '').trim()));
    if (save) {
      save.click();
      return save.textContent;
    }
    return null;
  });
  console.log('save btn', saved);
  await sleep(2500);
  const found = await page.evaluate(() => {
    const block = document.querySelector('#skills');
    return (block.innerText || '').includes('OpenAI API');
  });
  console.log('has OpenAI API', found);
  await context.close().catch(() => {});
}
main().catch((e) => { console.error(e); process.exit(1); });
