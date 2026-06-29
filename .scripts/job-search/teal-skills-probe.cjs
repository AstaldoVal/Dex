#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
try { require('dotenv').config({ path: path.join(VAULT, '.env') }); } catch (_) {}
const RESUME_ID = process.argv[2] || '608d280d-0f27-4340-968a-19786d23ee3a';

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
  if (!page) throw new Error('no browser');
  const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(3000);
  if (/sign-in|login/i.test(page.url())) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
  }
  await page.locator('#skills button[aria-expanded="false"]').first().click().catch(() => {});
  await sleep(1500);
  const addBtn = page.locator('button[aria-label="Add Skills"]').first();
  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  await addBtn.click();
  await sleep(1500);
  const dump = await page.evaluate(() => {
    const out = { labels: [], menus: [], skillsBlock: null };
    document.querySelectorAll('[role="menuitem"], [role="option"], button').forEach((el) => {
      const t = (el.textContent || '').trim();
      const a = el.getAttribute('aria-label') || '';
      if (/skill|category|add/i.test(t + a) && t.length < 80) out.menus.push({ t, a, role: el.getAttribute('role') });
    });
    const block = document.querySelector('#skills');
    if (block) {
      out.skillsBlock = (block.innerHTML || '').slice(0, 12000);
      block.querySelectorAll('[aria-label]').forEach((el) => {
        const l = el.getAttribute('aria-label');
        if (l) out.labels.push(l);
      });
    }
    return out;
  });
  const outPath = path.join(TEAL_DIR, 'teal-skills-probe.json');
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-skills-probe-labels.txt'), [...new Set(dump.labels)].join('\n'));
  console.log('Wrote', outPath, 'labels', dump.labels.length, 'menus', dump.menus.length);
  await context.close().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
