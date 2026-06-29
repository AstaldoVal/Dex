#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
try { require('dotenv').config({ path: path.join(VAULT, '.env') }); } catch (_) {}
const RESUME_ID = '608d280d-0f27-4340-968a-19786d23ee3a';

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
  const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(3000);
  await page.locator('#skills button[aria-expanded="false"]').first().click().catch(() => {});
  await sleep(1000);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  const addSkillsBtn = page.locator('#skills h3').locator('button[aria-label="Add Skills"]').first();
  await addSkillsBtn.click({ force: true });
  await sleep(800);
  await page.getByRole('menuitem', { name: 'Add Skills', exact: true }).click({ force: true });
  await sleep(2000);
  const dump = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [data-state="open"]')].map((d) => ({
      role: d.getAttribute('role'),
      text: (d.innerText || '').slice(0, 2000),
      html: (d.innerHTML || '').slice(0, 4000)
    }));
    const inputs = [...document.querySelectorAll('input, textarea, [role="combobox"]')].map((el) => ({
      type: el.tagName,
      placeholder: el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      name: el.getAttribute('name'),
      id: el.id
    }));
    return { dialogs, inputs };
  });
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-skills-add-dialog.json'), JSON.stringify(dump, null, 2));
  console.log('dialogs', dump.dialogs.length, 'inputs', dump.inputs.length);
  await context.close().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
