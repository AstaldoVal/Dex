#!/usr/bin/env node
/**
 * Удалить дубликаты Target Title в резюме Teal: оставить только N штук с заданным названием.
 * Используется для очистки после бага, когда один и тот же тайтл добавлялся много раз.
 *
 * Usage:
 *   node teal-delete-duplicate-target-titles.cjs
 *   node teal-delete-duplicate-target-titles.cjs --resume-id <id> --title "Lead Product Manager AI" --keep 1
 *   npm run job-search:teal-delete-duplicate-target-titles
 *
 * --resume-id  Resume UUID (default: Williams Lea из full-flow или TEAL_RESUME_ID).
 * --title      Текст Target Title для дедупликации (default: "Lead Product Manager AI").
 * --keep       Сколько оставить (default: 1).
 */

const path = require('path');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR } = require('./job-search-paths.cjs');
const { launchTealContext, resolvePrimaryProfile, TEAL_CHROME_PROFILE_ALT } = require('./teal-chrome-profile.cjs');
const playwright = require('playwright');

const PREVIEW_BASE = 'https://app.tealhq.com/resume-builder/resumes';
const DEFAULT_RESUME_ID = process.env.TEAL_RESUME_ID || '5a0bbbd2-7a7b-4e7c-bd7c-e88d86d09f24';
const DEFAULT_TITLE = 'Lead Product Manager AI';
const DEFAULT_KEEP = 1;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let resumeId = process.env.TEAL_RESUME_ID || DEFAULT_RESUME_ID;
  let title = DEFAULT_TITLE;
  let keep = DEFAULT_KEEP;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--resume-id' && args[i + 1]) {
      resumeId = args[++i];
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--keep' && args[i + 1]) {
      keep = Math.max(0, parseInt(args[++i], 10));
    }
  }
  return { resumeId, title, keep };
}

/**
 * Expand #target-titles if collapsed.
 */
async function ensureTargetTitlesExpanded(page) {
  const block = page.locator('#target-titles').first();
  if ((await block.count()) === 0) return;
  const state = await block.getAttribute('data-state').catch(() => null);
  if (state === 'closed') {
    const trigger = block.locator('button[aria-expanded="false"]').first();
    if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(200);
      await trigger.click();
      await sleep(800);
    }
  }
}

/**
 * In #target-titles: count items that display exactly `titleText`.
 */
async function countTargetTitleItems(page, titleText) {
  return page.evaluate((text) => {
    const block = document.querySelector('#target-titles');
    if (!block) return 0;
    const addBtn = block.querySelector('button[aria-label="Add a Target Title"]');
    const nodes = block.querySelectorAll('button, li, [role="listitem"], [data-target-title], [class*="target-title"]');
    let n = 0;
    nodes.forEach((el) => {
      if (el === addBtn) return;
      const t = (el.innerText || el.textContent || '').trim();
      if (t === text) n++;
    });
    return n;
  }, titleText);
}

/**
 * Delete one occurrence of target title at index `deleteIndex` (0-based). Returns Promise<{ ok, reason }>.
 * Hover container, then click delete button (aria-label*="Delete" or "Remove").
 */
async function deleteOneTargetTitleAt(page, titleText, deleteIndex) {
  return page.evaluate(
    ({ text, index }) => {
      return new Promise((resolve) => {
        const block = document.querySelector('#target-titles');
        if (!block) {
          resolve({ ok: false, reason: '#target-titles not found' });
          return;
        }
        const addBtn = block.querySelector('button[aria-label="Add a Target Title"]');
        const candidates = [];
        block.querySelectorAll('button, li, [role="listitem"], [data-target-title], [class*="target-title"], div[class*="chip"], div[class*="tag"]').forEach((el) => {
          if (el === addBtn) return;
          const t = (el.innerText || el.textContent || '').trim();
          if (t === text) candidates.push(el);
        });
        if (candidates.length <= index) {
          resolve({ ok: false, reason: 'No item at index ' + index + ', count=' + candidates.length });
          return;
        }
        const item = candidates[index];
        const container = item.closest('li') || item.closest('[role="listitem"]') || item.parentElement || item;
        container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window }));
        setTimeout(() => {
          const deleteBtn =
            container.querySelector('button[aria-label*="Delete" i], button[aria-label*="Remove" i], [aria-label*="Delete" i], [aria-label*="Remove" i]') ||
            item.querySelector('button[aria-label*="Delete" i], button[aria-label*="Remove" i]') ||
            container.querySelector('button[type="button"]');
          if (deleteBtn) deleteBtn.click();
          resolve({ ok: true });
        }, 400);
      });
    },
    { text: titleText, index: deleteIndex }
  );
}

async function main() {
  const { resumeId, title, keep } = parseArgs();
  const url = `${PREVIEW_BASE}/${resumeId}/preview`;

  if (!resolvePrimaryProfile() && !TEAL_CHROME_PROFILE_ALT) {
    console.error('Chrome profile not found.');
    process.exit(1);
  }

  console.log('Resume:', resumeId);
  console.log('URL:', url);
  console.log('Target Title to dedupe:', title);
  console.log('Keep count:', keep);
  console.log('');

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
  } catch (e) {
    console.error('Failed to launch Chrome:', e && e.message ? e.message : String(e));
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await sleep(3000);

  await page.waitForSelector('#target-titles', { timeout: 15000 }).catch(() => {});
  await ensureTargetTitlesExpanded(page);
  await sleep(1000);

  let totalDeleted = 0;
  for (;;) {
    const count = await countTargetTitleItems(page, title);
    if (count <= keep) {
      console.log('Done. Count of "' + title + '" is', count, '(keep', keep + ')');
      break;
    }
    const deleteIndex = keep;
    const result = await deleteOneTargetTitleAt(page, title, deleteIndex);
    if (!result.ok) {
      console.error('Delete failed:', result.reason);
      break;
    }
    await sleep(600);
    try {
      await page.waitForSelector('button[type="submit"], [role="dialog"] button', { timeout: 4000 });
      const confirmBtn = page.locator('button:has-text("Delete on ALL resumes")').or(page.locator('button:has-text("Delete")').first());
      if ((await confirmBtn.count()) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
        await confirmBtn.first().click({ timeout: 3000 });
        await sleep(1000);
      }
    } catch (_) {}
    totalDeleted++;
    console.log('  Deleted', totalDeleted + '. Remaining "' + title + '":', count - 1);
  }

  console.log('');
  console.log('Total deleted:', totalDeleted);
  await context.close();
  process.exit(totalDeleted > 0 ? 0 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
