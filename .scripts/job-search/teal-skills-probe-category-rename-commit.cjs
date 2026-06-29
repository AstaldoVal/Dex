#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const playwright = require('playwright');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const {
  expandSkillsSection,
  getCategoryOrder,
  findSkillsCategoryRowLocator,
  clickEditCategoryButtonOnRow,
  fillFloatingCategoryEditor,
  waitForFloatingCategoryEditor
} = require('./teal-resume-skills.cjs');
const { sleep } = require('./teal-target-title.cjs');

const RESUME_ID = process.argv[2] || '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const FROM = process.argv[3] || 'Технологии и инструменты';
const TO = process.argv[4] || 'Technologies & Tools';

async function dumpEditorChrome(page) {
  return page.evaluate(() => {
    const editors = [...document.querySelectorAll('[contenteditable="true"]')].map((el) => {
      const rect = el.getBoundingClientRect();
      const host = el.parentElement;
      const buttons = host
        ? [...host.querySelectorAll('button')].map((b) => ({
            aria: b.getAttribute('aria-label'),
            text: (b.textContent || '').trim().slice(0, 30)
          }))
        : [];
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        buttons,
        rect: { w: rect.width, h: rect.height, y: rect.y }
      };
    });
    return editors;
  });
}

async function main() {
  loadTealEnv(VAULT);
  let context;
  let page;
  for (const dir of getTealProfileCandidates()) {
    try {
      context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 45000
      });
      page = context.pages()[0] || (await context.newPage());
      break;
    } catch (_) {}
  }
  const out = path.join(TEAL_DIR, 'teal-skills-category-rename-commit-probe.json');
  const log = [];
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: url, log: console.log, sleepMs: 3000 });
    await expandSkillsSection(page);
    await page
      .locator('#skills [data-testid="resume-tags"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60000 });
    await sleep(1500);
    const { row, matchName } = await findSkillsCategoryRowLocator(page, FROM);
    if (!row) throw new Error(`row not found for ${FROM}`);
    log.push({ step: 'before', order: await getCategoryOrder(page), matchName });
    await clickEditCategoryButtonOnRow(page, row, console.log);
    await row.locator('label.text-sm').first().dblclick({ force: true }).catch(() => {});
    await sleep(600);
    log.push({ step: 'editor_open', chrome: await dumpEditorChrome(page) });
    await fillFloatingCategoryEditor(page, matchName, TO, console.log);
    log.push({ step: 'after_fill', chrome: await dumpEditorChrome(page), order: await getCategoryOrder(page) });
    const editor = await waitForFloatingCategoryEditor(page, TO, 3000);
    if (editor && (await editor.count()) > 0) {
      await editor.press('Enter').catch(() => {});
      await editor.evaluate((el) => el.blur());
      await sleep(4000);
      log.push({ step: 'after_ce_blur_4s', order: await getCategoryOrder(page) });
      await clickEditCategoryButtonOnRow(page, row, console.log);
      await sleep(1500);
      log.push({ step: 'after_edit_toggle', order: await getCategoryOrder(page) });
    }
    for (const commit of ['Enter', 'Tab', 'Escape']) {
      await page.keyboard.press(commit, { timeout: 2000 }).catch(() => {});
      await sleep(1200);
      log.push({ step: `after_${commit}`, order: await getCategoryOrder(page) });
    }
    const check = page.locator('button[aria-label*="Check" i], button[aria-label*="Confirm" i], button[aria-label*="Save" i]').first();
    if ((await check.count()) > 0) {
      await check.click({ force: true }).catch(() => {});
      await sleep(1200);
      log.push({ step: 'after_check_button', order: await getCategoryOrder(page) });
    }
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
