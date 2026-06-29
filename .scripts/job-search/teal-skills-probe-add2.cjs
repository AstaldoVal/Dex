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

async function openAddSkillsForm(page, categoryLabel) {
  const block = page.locator('#skills');
  const catRow = block.locator('label').filter({ hasText: categoryLabel }).first();
  await catRow.scrollIntoViewIfNeeded().catch(() => {});
  const addBtn = catRow.locator('xpath=ancestor::motionless | ancestor::motion.div[1]').locator('button[aria-label="Add Skills"]').first();
  // fallback: row container
  const row = block.locator('motion.div').filter({ has: page.locator(`label:text-is("${categoryLabel}")`) }).first();
  await row.locator('button[aria-label="Add Skills"]').first().click({ force: true });
  await sleep(600);
  await page.getByRole('menuitem', { name: 'Add Skills', exact: true }).click({ force: true });
  await sleep(1200);
}

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

  await openAddSkillsForm(page, 'AI');
  const input = page.locator('input[placeholder*="Skill 1"]').first();
  await input.fill('OpenAI API');
  await sleep(500);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => t.length < 40)
  );
  fs.writeFileSync(path.join(TEAL_DIR, 'teal-skills-add-buttons.json'), JSON.stringify(buttons.slice(0, 80), null, 2));
  // try common save labels
  for (const name of ['Save', 'Add', 'Add Skills', 'Done']) {
    const btn = page.getByRole('button', { name, exact: true });
    if ((await btn.count()) > 0) {
      await btn.first().click({ force: true }).catch(() => {});
      break;
    }
  }
  await sleep(2000);
  const has = await page.locator('#skills').getByText('OpenAI API', { exact: true }).count();
  console.log('OpenAI API count after add attempt:', has);
  await context.close().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
