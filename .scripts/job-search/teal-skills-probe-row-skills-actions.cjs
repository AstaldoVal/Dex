#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const playwright = require('playwright');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { launchPersistentContextGuarded, removeStaleSingletonLock } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const {
  expandSkillsSection,
  findSkillsCategoryRowLocator,
  getCategoryOrder
} = require('./teal-resume-skills.cjs');
const { sleep } = require('./teal-target-title.cjs');

const RESUME_ID = process.argv[2] || '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const TARGET = process.argv[3] || 'Аналитические инструменты';

async function main() {
  loadTealEnv(VAULT);
  const dir = path.join(TEAL_DIR, '.chrome-profile');
  if (fs.existsSync(path.join(dir, 'SingletonLock'))) removeStaleSingletonLock(dir);
  const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
    channel: os.platform() === 'darwin' ? 'chrome' : undefined,
    headless: false,
    args: ['--no-first-run'],
    timeout: 45000
  });
  const page = context.pages()[0] || (await context.newPage());
  const out = path.join(TEAL_DIR, 'teal-skills-row-actions-probe.json');
  const log = [];
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: url, log: console.log, sleepMs: 3000 });
    await expandSkillsSection(page);
    await sleep(1200);
    log.push({ order: await getCategoryOrder(page) });
    const { row, matchName } = await findSkillsCategoryRowLocator(page, TARGET);
    if (!row) throw new Error('row not found');
    log.push({ matchName, rowText: ((await row.innerText().catch(() => '')) || '').slice(0, 200) });
    await row.hover().catch(() => {});
    await sleep(400);
    const btn = row.locator('button[aria-label="Skills Actions"]').first();
    await btn.click({ force: true, timeout: 8000 });
    await sleep(700);
    const menuLabels = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"], [data-radix-collection-item], [role="menu"] button')]
        .map((el) => ({
          text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(),
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label')
        }))
        .filter((x) => x.text && x.text.length < 80)
    );
    log.push({ menuLabels });
  } finally {
    fs.writeFileSync(out, JSON.stringify(log, null, 2));
    console.log('wrote', out);
    console.log(JSON.stringify(log, null, 2));
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
