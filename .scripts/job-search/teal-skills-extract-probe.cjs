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
  await sleep(1500);
  const data = await page.evaluate(() => {
    const block = document.querySelector('#skills');
    if (!block) return { error: 'no #skills' };
    const categories = [];
    const tagBlocks = block.querySelectorAll('[data-testid="resume-tags"]');
    tagBlocks.forEach((tb) => {
      const catLabel = tb.querySelector('label.text-sm');
      if (!catLabel) return;
      const name = (catLabel.textContent || '').trim();
      const skills = [];
      tb.querySelectorAll('[role="button"][aria-roledescription="sortable"]').forEach((chip) => {
        const spans = chip.querySelectorAll('span');
        let skillName = '';
        for (const s of spans) {
          const t = (s.textContent || '').trim();
          if (t && t.length < 120 && !skillName) skillName = t;
        }
        const cb = chip.querySelector('[role="checkbox"]');
        skills.push({
          name: skillName,
          included: cb ? cb.getAttribute('aria-checked') === 'true' : null
        });
      });
      if (name) categories.push({ name, skills });
    });
    return { categories };
  });
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-skills-current.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 2).slice(0, 4000));
  await context.close().catch(() => {});
}
main().catch((e) => { console.error(e); process.exit(1); });
