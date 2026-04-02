#!/usr/bin/env node
/**
 * Delete duplicate Teal resumes by title: for each title that has multiple resumes, keep one, delete the rest.
 * Never deletes the protected template resume (⭐ Roman Matsukatov - CV AI Last).
 *
 * Usage: node teal-delete-duplicate-resumes.cjs
 *   or:  npm run job-search:teal-delete-duplicates
 */
'use strict';

const path = require('path');
const os = require('os');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const fs = require('fs');
const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');

const LOG_FILE = path.join(TEAL_DIR, 'teal-delete-duplicates.log');
function log(msg) {
  const line = typeof msg === 'string' ? msg : String(msg);
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n');
  } catch (_) {}
}

const PROTECTED_RESUME_ID = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';

function getChromeProfileCandidates() {
  const home = os.homedir();
  const platform = os.platform();
  let list = [];
  if (platform === 'darwin') {
    const base = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    list = [path.join(base, 'Default'), path.join(base, 'Profile 1'), path.join(base, 'Profile 2')];
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const base = path.join(localAppData, 'Google', 'Chrome', 'User Data');
    list = [path.join(base, 'Default'), path.join(base, 'Profile 1'), path.join(base, 'Profile 2')];
  } else {
    const base = path.join(home, '.config', 'google-chrome');
    list = [path.join(base, 'Default'), path.join(base, 'Profile 1'), path.join(base, 'Profile 2')];
  }
  return list.filter((dir) => fs.existsSync(dir));
}

function resolveChromeProfileDir() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const expanded = env.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);
    if (fs.existsSync(resolved)) return [resolved];
  }
  return getChromeProfileCandidates();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fresume-builder%2Fresumes';

async function tealLoginIfNeeded(page) {
  const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
  const tealPassword = process.env.TEAL_PASSWORD;
  if (!tealEmail || !tealPassword) return false;
  log('[Teal delete-duplicates] Logging in …');
  await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(2000);
  const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), a:has-text("Continue with email")').first();
  if ((await emailLink.count()) > 0) {
    await emailLink.click().catch(() => {});
    await sleep(1500);
  }
  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) return false;
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
  return afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login');
}

async function main() {
  ensureDirs();
  log('[Teal delete-duplicates] Log file: ' + LOG_FILE);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    log('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const profileCandidates = resolveChromeProfileDir();
  if (profileCandidates.length === 0) {
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
  for (const profileDir of profileCandidates) {
    try {
      context = await playwright.chromium.launchPersistentContext(profileDir, launchOptions);
      log('[Teal delete-duplicates] Using Chrome profile: ' + profileDir);
      break;
    } catch (e) {
      const isProfileLocked = /ProcessSingleton|profile is already in use|SingletonLock/i.test(e.message);
      if (isProfileLocked && profileCandidates.indexOf(profileDir) < profileCandidates.length - 1) continue;
      log('Chrome profile in use or launch failed: ' + (e.message || e));
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
  const menuAria = 'Resume Menu';

  try {
    log('[Teal delete-duplicates] Opening resume list …');
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const listReadyStart = Date.now();
    while (Date.now() - listReadyStart < 50000) {
      const linkVisible = (await page.locator('a[href*="/resumes/"]').count()) > 0 && (await page.locator('a[href*="/resumes/"]').first().isVisible().catch(() => false));
      if (linkVisible) break;
      await sleep(2000);
    }
    await sleep(4000);

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
      const loggedIn = await tealLoginIfNeeded(page);
      if (!loggedIn) {
        log('Not logged in and no TEAL_EMAIL/TEAL_PASSWORD. Log in manually and run again.');
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
        log('Still on login page.');
        await context.close();
        process.exit(1);
      }
    }

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
        const title = ((tr.innerText || '').trim().split('\n')[0] || '').trim().slice(0, 300);
        result.push({ id: m[1], title });
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
                const title = ((el.innerText || '').trim().split('\n')[0] || '').trim().slice(0, 300);
                result.push({ id: m[1], title });
              }
              break;
            }
            el = el.parentElement;
          }
        }
      }
      return result;
    }, menuAria).catch(() => []);

    if (resumes.length === 0) {
      log('[Teal delete-duplicates] No resumes found.');
      await context.close();
      return;
    }

    const byTitle = new Map();
    for (const r of resumes) {
      const key = r.title || '(no title)';
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(r);
    }

    const toDeleteIds = new Set();
    for (const [, list] of byTitle.entries()) {
      if (list.length <= 1) continue;
      for (let i = 1; i < list.length; i++) {
        const id = list[i].id;
        if (id !== PROTECTED_RESUME_ID) toDeleteIds.add(id);
      }
    }

    log('[Teal delete-duplicates] Resumes on page: ' + resumes.length + ' | duplicates to delete (keep one per title): ' + toDeleteIds.size);

    if (toDeleteIds.size === 0) {
      log('[Teal delete-duplicates] No duplicate titles found.');
      await context.close();
      return;
    }

    let deletedCount = 0;
    let noItemCount = 0;
    while (toDeleteIds.size > 0) {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      for (let w = 0; w < 15; w++) {
        if (await page.locator('a[href*="/resumes/"]').first().isVisible().catch(() => false)) break;
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
          log('[Teal delete-duplicates] Could not find row twice; stopping.');
          break;
        }
        toDeleteIds.delete(nextId);
        await sleep(1000);
        continue;
      }
      noItemCount = 0;
      const id = nextId;
      const title = (await container.innerText().catch(() => '')).trim().split('\n')[0] || id;
      log('[Teal delete-duplicates] Deleting: ' + title.slice(0, 70) + ' | ' + id);

      const menuButton = container.locator(menuSelector).first();
      if ((await menuButton.count()) === 0 || !(await menuButton.isVisible().catch(() => false))) {
        log('[Teal delete-duplicates] Skip: menu not found for ' + id);
        toDeleteIds.delete(id);
        continue;
      }
      await container.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(400);
      await menuButton.click();
      await sleep(800);

      const deleteItem = page.locator('[role="menuitem"]').filter({ hasText: /Delete|Remove/i }).first();
      if ((await deleteItem.count()) === 0 || !(await deleteItem.isVisible().catch(() => false))) {
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

    log('[Teal delete-duplicates] Done. Deleted ' + deletedCount + ' duplicate(s).');
  } catch (err) {
    log('[Teal delete-duplicates] Error: ' + (err.message || err));
    if (context) await context.close().catch(() => {});
    process.exit(1);
  } finally {
    try {
      if (context) await context.close();
    } catch (_) {}
  }
}

main();
