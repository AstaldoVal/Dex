#!/usr/bin/env node
'use strict';
/** One-shot probe: Edit category → dump inputs/buttons after click. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const playwright = require('playwright');
const { TEAL_DIR, VAULT } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, ensureTealAuthenticated } = require('./teal-login-helper.cjs');
const { expandSkillsSection, getCategoryOrder } = require('./teal-resume-skills.cjs');
const { sleep } = require('./teal-target-title.cjs');

const RESUME_ID = process.argv[2] || '02964c6b-92e5-44e6-a1aa-3a71cbd407fd';
const TARGET =
  process.argv[3] || 'Управление проектами и бизнес-анализ';

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
  if (!page) throw new Error('no chrome profile');
  const out = path.join(TEAL_DIR, 'teal-skills-category-rename-probe.json');
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${RESUME_ID}/preview`;
    await ensureTealAuthenticated(page, { tealDir: TEAL_DIR, targetUrl: url, log: console.log, sleepMs: 3000 });
    await expandSkillsSection(page);
    await sleep(1500);
    const before = await getCategoryOrder(page);
    const row = page
      .locator('#skills [data-testid="resume-tags"]')
      .filter({ has: page.locator('label.text-sm', { hasText: TARGET }) })
      .first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.hover().catch(() => {});
    await sleep(500);
    const preButtons = await row.evaluate((el) =>
      [...el.querySelectorAll('button')].map((b) => ({
        aria: b.getAttribute('aria-label'),
        text: (b.textContent || '').trim().slice(0, 50)
      }))
    );
    const steps = [];
    const edit = row.locator('button[aria-label="Edit category"]').first();
    if ((await edit.count()) > 0) await edit.click({ force: true, timeout: 8000 });
    await sleep(300);
    steps.push({
      step: 'after_edit_click_300ms',
      rowInputs: await row.locator('input, [contenteditable="true"]').count(),
      labelHtml: await row.locator('label.text-sm').first().innerHTML().catch(() => '')
    });
    try {
      await row.locator('label.text-sm input, input[type="text"]').first().waitFor({ state: 'visible', timeout: 5000 });
      steps.push({ step: 'row_input_visible', ok: true });
    } catch (e) {
      steps.push({ step: 'row_input_visible', ok: false, err: String(e.message || e).slice(0, 120) });
    }
    const label = row.locator('label.text-sm').first();
    await label.dblclick({ force: true, timeout: 8000 }).catch(() => {});
    await sleep(500);
    steps.push({
      step: 'after_label_dblclick',
      rowInputs: await row.locator('input, [contenteditable="true"]').count(),
      labelHtml: await label.innerHTML().catch(() => '')
    });
    await sleep(700);
    const dump = await page.evaluate(() => {
      const skills = document.querySelector('#skills');
      const inputs = [...document.querySelectorAll('#skills input, #skills [contenteditable="true"], [role="dialog"] input')]
        .filter((el) => el.offsetParent !== null || el.closest('[role="dialog"]'))
        .map((el) => ({
          tag: el.tagName,
          type: el.getAttribute('type'),
          value: 'value' in el ? el.value : (el.textContent || '').slice(0, 80),
          placeholder: el.getAttribute('placeholder'),
          aria: el.getAttribute('aria-label'),
          parent: el.closest('[data-testid="resume-tags"]')
            ? 'resume-tags'
            : el.closest('[role="dialog"]')
              ? 'dialog'
              : 'other'
        }));
      const labels = skills
        ? [...skills.querySelectorAll('label.text-sm')].map((l) => ({
            text: (l.textContent || '').trim(),
            html: l.innerHTML.slice(0, 200),
            hasInput: !!l.querySelector('input, [contenteditable="true"]')
          }))
        : [];
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) => ({
        text: (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
      }));
      const active = document.activeElement;
      const contentEditable = [...document.querySelectorAll('[contenteditable="true"]')].map((el) => ({
        tag: el.tagName,
        text: (el.textContent || '').slice(0, 60),
        inSkills: !!el.closest('#skills')
      }));
      const popper = document.querySelector('[data-radix-popper-content-wrapper]');
      return {
        inputs,
        labels,
        dialogs,
        contentEditable,
        active: active
          ? {
              tag: active.tagName,
              aria: active.getAttribute('aria-label'),
              ce: active.isContentEditable,
              value: 'value' in active ? active.value : (active.textContent || '').slice(0, 80)
            }
          : null,
        popperHtml: popper ? popper.innerHTML.slice(0, 400) : null
      };
    });
    const after = await getCategoryOrder(page);
    fs.writeFileSync(
      out,
      JSON.stringify({ resumeId: RESUME_ID, target: TARGET, before, after, preButtons, steps, dump }, null, 2)
    );
    console.log('wrote', out);
    console.log(JSON.stringify({ before, after, dump }, null, 2).slice(0, 6000));
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
