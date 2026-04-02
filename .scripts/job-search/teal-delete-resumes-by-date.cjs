#!/usr/bin/env node
/**
 * Delete Teal resumes created on or before a given date. Never deletes the two reference templates.
 *
 * Usage:
 *   node teal-delete-resumes-by-date.cjs [--before YYYY-MM-DD]
 *   npm run job-search:teal-delete-by-date -- [--before 2025-02-08]
 *
 * Default --before: 2025-02-08 (delete resumes created on or before 8 Feb 2025).
 * Requires: Playwright, Chrome. Same profile as other Teal scripts. Be logged into Teal.
 */
'use strict';

const path = require('path');
const os = require('os');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const fs = require('fs');
const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates } = require('./teal-chrome-profile.cjs');

const LOG_FILE = path.join(TEAL_DIR, 'teal-delete-by-date.log');

/** Reference templates — never delete. */
const PROTECTED_IDS = new Set([
  '296be353-ba11-4ee7-a827-cb7985cbfa26', // iGaming & compliance
  'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9'  // AI & Other
]);

function log(msg) {
  const line = typeof msg === 'string' ? msg : String(msg);
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n');
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fresume-builder%2Fresumes';

async function tealLoginIfNeeded(page) {
  const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
  const tealPassword = process.env.TEAL_PASSWORD;
  if (!tealEmail || !tealPassword) {
    log('[Teal delete-by-date] No TEAL_EMAIL/TEAL_PASSWORD in .env.');
    return false;
  }
  log('[Teal delete-by-date] Logging in …');
  await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(2000);
  const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), a:has-text("Continue with email")').first();
  if ((await emailLink.count()) > 0) {
    await emailLink.click().catch(() => {});
    await sleep(1500);
  }
  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) {
    log('[Teal delete-by-date] Email/password form not found.');
    return false;
  }
  await emailInput.fill(tealEmail);
  await sleep(300);
  await passwordInput.fill(tealPassword);
  await sleep(300);
  const submitBtn = page.locator('button[type="submit"]').first();
  const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
  const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
  if ((await submitBtn.count()) > 0) await submitBtn.click();
  else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
  else if ((await altBtn.count()) > 0) await altBtn.click();
  else await page.locator('form').first().evaluate((f) => f.submit()).catch(() => {});
  await sleep(5000);
  const afterUrl = page.url();
  const ok = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login');
  if (ok) log('[Teal delete-by-date] Login successful.');
  return ok;
}

/**
 * Parse date from row/card text. Teal often shows "Created on Feb 8, 2025" or "Updated Feb 5, 2025".
 * Returns Date or null if unparseable.
 */
function parseDateFromText(fullText) {
  if (!fullText || typeof fullText !== 'string') return null;
  const t = fullText.trim();
  // "Created on Feb 8, 2025" or "Created on February 8, 2025"
  let m = t.match(/(?:Created on|Updated|Modified)\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (m) {
    const d = new Date(m[1] + ' ' + m[2] + ', ' + m[3]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  m = t.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (m) {
    const d = new Date(m[1] + ' ' + m[2] + ', ' + m[3]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // YYYY-MM-DD
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let beforeDate = '2026-02-08';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--before' && args[i + 1]) {
      beforeDate = args[i + 1];
      break;
    }
  }
  const cutoff = new Date(beforeDate + 'T23:59:59.999Z');
  if (Number.isNaN(cutoff.getTime())) {
    log('[Teal delete-by-date] Invalid --before date: ' + beforeDate);
    process.exit(1);
  }
  return { beforeDate, cutoff };
}

async function main() {
  ensureDirs();
  const { beforeDate, cutoff } = parseArgs();
  log('[Teal delete-by-date] Log: ' + LOG_FILE);
  log('[Teal delete-by-date] Delete resumes created on or before: ' + beforeDate + ' (cutoff end of day UTC)');
  log('[Teal delete-by-date] Protected IDs (never delete): ' + [...PROTECTED_IDS].join(', '));

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    log('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const profileCandidates = getTealProfileCandidates();
  if (!profileCandidates.length) {
    log('Chrome profile not found.');
    process.exit(1);
  }

  const launchOptions = {
    headless: false,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
  };
  launchOptions.channel = 'chrome';

  let context;
  let profileDir = null;
  for (const p of profileCandidates) {
    try {
      context = await playwright.chromium.launchPersistentContext(p, launchOptions);
      profileDir = p;
      log('[Teal delete-by-date] Using Chrome profile: ' + profileDir);
      break;
    } catch (e) {
      const locked = /ProcessSingleton|profile is already in use|SingletonLock|already in use/i.test(e.message);
      if (locked && profileCandidates.indexOf(p) < profileCandidates.length - 1) {
        log('[Teal delete-by-date] Profile in use, trying next.');
        continue;
      }
      log('Failed to launch Chrome: ' + (e.message || e));
      process.exit(1);
    }
  }
  if (!context) {
    log('No Chrome profile available.');
    process.exit(1);
  }

  await sleep(2000);
  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  const listUrl = 'https://app.tealhq.com/resume-builder/resumes';
  const menuSelector = 'button[aria-label="Resume Menu"]';

  try {
    log('[Teal delete-by-date] Opening resume list …');
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const listReadyTimeout = 50000;
    const listReadyStart = Date.now();
    let listVisible = false;
    while (Date.now() - listReadyStart < listReadyTimeout) {
      const linkCount = await page.locator('a[href*="/resumes/"]').count();
      const linkVisible = linkCount > 0 && (await page.locator('a[href*="/resumes/"]').first().isVisible().catch(() => false));
      if (linkVisible) {
        listVisible = true;
        break;
      }
      await sleep(2000);
    }
    if (!listVisible) log('[Teal delete-by-date] List may not be fully loaded.');
    await sleep(4000);

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
      const loggedIn = await tealLoginIfNeeded(page);
      if (!loggedIn) {
        await context.close();
        process.exit(1);
      }
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      for (let w = 0; w < 20; w++) {
        if ((await page.locator('a[href*="/resumes/"]').count()) > 0) break;
        await sleep(2000);
      }
      await sleep(4000);
      currentUrl = page.url();
      if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
        log('[Teal delete-by-date] Still on login page.');
        await context.close();
        process.exit(1);
      }
    }

    /** Collect id, title, fullText for each row/card. */
    log('[Teal delete-by-date] Scanning resume list (id, title, date from row text) …');
    const resumes = await page.evaluate((menuAria) => {
      const result = [];
      const rows = document.querySelectorAll('tr');
      for (const tr of rows) {
        const link = tr.querySelector('a[href*="/resumes/"]');
        const menu = tr.querySelector('button[aria-label="' + menuAria + '"]');
        if (!link || !menu) continue;
        const href = link.getAttribute('href');
        const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
        if (!m) continue;
        const fullText = (tr.innerText || '').trim();
        const title = fullText.split('\n')[0] || '';
        result.push({ id: m[1], title: title.slice(0, 200), fullText: fullText.slice(0, 500) });
      }
      if (result.length === 0) {
        const links = document.querySelectorAll('a[href*="/resumes/"]');
        const seen = new Set();
        for (const link of links) {
          let el = link.closest('div');
          while (el) {
            if (el.querySelector('button[aria-label="' + menuAria + '"]')) {
              const href = link.getAttribute('href');
              const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
              if (m && !seen.has(m[1])) {
                seen.add(m[1]);
                const fullText = (el.innerText || '').trim();
                const title = fullText.split('\n')[0] || '';
                result.push({ id: m[1], title: title.slice(0, 200), fullText: fullText.slice(0, 500) });
              }
              break;
            }
            el = el.parentElement;
          }
        }
      }
      return result;
    }, 'Resume Menu').catch((e) => {
      if (/Target page, context or browser has been closed/i.test(e.message)) throw e;
      return [];
    });

    if (resumes.length === 0) {
      log('[Teal delete-by-date] No resumes found in list.');
      await context.close();
      return;
    }

    const toDeleteIds = new Set();
    const skippedNoDate = [];
    const skippedProtected = [];
    const skippedAfterCutoff = [];

    for (const r of resumes) {
      if (PROTECTED_IDS.has(r.id)) {
        skippedProtected.push(r.id);
        continue;
      }
      const created = parseDateFromText(r.fullText);
      if (created === null) {
        skippedNoDate.push({ id: r.id, title: r.title.slice(0, 50) });
        continue;
      }
      if (created.getTime() <= cutoff.getTime()) {
        toDeleteIds.add(r.id);
      } else {
        skippedAfterCutoff.push({ id: r.id, title: r.title.slice(0, 50), date: created.toISOString().slice(0, 10) });
      }
    }

    // If list had no dates, fetch created date from each resume's detail page
    if (toDeleteIds.size === 0 && skippedNoDate.length > 0) {
      log('[Teal delete-by-date] No dates in list; fetching from detail pages (' + skippedNoDate.length + ' resumes) …');
      let fetched = 0;
      for (const item of skippedNoDate) {
        try {
          const detailUrl = 'https://app.tealhq.com/resume-builder/resumes/' + item.id;
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(1500);
          const bodyText = await page.evaluate(() => (document.body && document.body.innerText) ? document.body.innerText : '').catch(() => '');
          const created = parseDateFromText(bodyText);
          if (created !== null) {
            if (created.getTime() <= cutoff.getTime()) {
              toDeleteIds.add(item.id);
            } else {
              skippedAfterCutoff.push({ id: item.id, title: item.title, date: created.toISOString().slice(0, 10) });
            }
          }
          fetched++;
          if (fetched % 50 === 0) log('[Teal delete-by-date] Fetched date for ' + fetched + '/' + skippedNoDate.length + ' …');
        } catch (e) {
          log('[Teal delete-by-date] Skip fetch for ' + item.id + ': ' + (e.message || '').slice(0, 60));
        }
        await sleep(600);
      }
      log('[Teal delete-by-date] Fetched dates. To delete: ' + toDeleteIds.size + ', after cutoff: ' + skippedAfterCutoff.length);
    }

    log('[Teal delete-by-date] Resumes on page: ' + resumes.length);
    log('[Teal delete-by-date] Protected (skipped): ' + skippedProtected.length);
    log('[Teal delete-by-date] No parseable date (skipped): ' + (toDeleteIds.size === 0 && skippedNoDate.length > 0 ? '0 (fetched from detail)' : skippedNoDate.length));
    log('[Teal delete-by-date] After cutoff (kept): ' + skippedAfterCutoff.length);
    log('[Teal delete-by-date] To delete (created on or before ' + beforeDate + '): ' + toDeleteIds.size);

    if (toDeleteIds.size === 0) {
      log('[Teal delete-by-date] Nothing to delete.');
      await context.close();
      return;
    }

    let deletedCount = 0;
    let noItemCount = 0;
    while (toDeleteIds.size > 0) {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      for (let w = 0; w < 15; w++) {
        const linkVisible = await page.locator('a[href*="/resumes/"]').first().isVisible().catch(() => false);
        if (linkVisible) break;
        await sleep(2000);
      }
      await sleep(3000);

      const nextId = toDeleteIds.values().next().value;
      if (!nextId) break;
      let container = page.locator('tr').filter({ has: page.locator('a[href*="/resumes/' + nextId + '"]') }).filter({ has: page.locator(menuSelector) }).first();
      if ((await container.count()) === 0 || !(await container.isVisible().catch(() => false))) {
        container = page.locator('xpath=//a[contains(@href,"/resumes/' + nextId + '")]/ancestor::div[.//button[@aria-label="Resume Menu"]][1]').first();
      }
      if ((await container.count()) === 0 || !(await container.isVisible().catch(() => false))) {
        noItemCount++;
        if (noItemCount >= 2) {
          log('[Teal delete-by-date] Could not find row twice; stopping.');
          break;
        }
        toDeleteIds.delete(nextId);
        await sleep(1000);
        continue;
      }
      noItemCount = 0;
      const id = nextId;
      const title = (await container.innerText().catch(() => '')).trim().split('\n')[0] || id;
      log('[Teal delete-by-date] Deleting: ' + title.slice(0, 60) + ' | ' + id);

      const menuButton = container.locator(menuSelector).first();
      if ((await menuButton.count()) === 0 || !(await menuButton.isVisible().catch(() => false))) {
        log('[Teal delete-by-date] Skip: menu not found for ' + id);
        toDeleteIds.delete(id);
        continue;
      }
      await container.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(400);
      await menuButton.click();
      await sleep(800);

      const deleteItem = page.locator('[role="menuitem"]').filter({ hasText: /Delete|Remove/i }).first();
      if ((await deleteItem.count()) === 0 || !(await deleteItem.isVisible().catch(() => false))) {
        log('[Teal delete-by-date] Skip: Delete menu item not found.');
        await page.keyboard.press('Escape');
        await sleep(300);
        toDeleteIds.delete(id);
        continue;
      }
      await deleteItem.click();
      await sleep(1200);

      const confirmButton = page.locator('button').filter({ hasText: /Delete|Remove|Confirm|Yes|Ok/i }).first();
      if ((await confirmButton.count()) > 0 && (await confirmButton.isVisible().catch(() => false))) {
        await confirmButton.click();
        await sleep(1500);
      }

      toDeleteIds.delete(id);
      deletedCount++;
    }

    log('[Teal delete-by-date] Done. Deleted ' + deletedCount + ' resume(s).');
  } catch (err) {
    const closed = /Target page, context or browser has been closed/i.test(err.message);
    if (closed) {
      log('[Teal delete-by-date] Browser closed. Run again to delete remaining.');
    } else {
      log('[Teal delete-by-date] Error: ' + err.message);
      try {
        if (page && !page.isClosed()) fs.writeFileSync(path.join(TEAL_DIR, 'teal-delete-by-date-debug.html'), await page.content(), 'utf8');
      } catch (_) {}
    }
  } finally {
    try {
      if (context) await context.close();
    } catch (_) {}
  }
}

main();
