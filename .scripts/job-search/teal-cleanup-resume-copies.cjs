#!/usr/bin/env node
/**
 * Delete duplicate resume copies in Teal. Never deletes protected (эталонные) resumes.
 *
 * Copy detection: resume title contains " copy" (e.g. "My Resume copy", "… copy 2"). Any such
 * resume is treated as a copy unless its ID is in the protected list.
 *
 * Protected resumes: IDs from TEAL_PROTECTED_RESUME_IDS in .env (comma-separated). If unset,
 * defaults to one ID so existing behavior is preserved. Add more UUIDs to protect other templates.
 *
 * Usage:
 *   node teal-cleanup-resume-copies.cjs
 *   npm run job-search:teal-cleanup-copies
 *
 * Requires: Playwright, Chrome. Uses same Chrome profile(s) as other Teal scripts.
 *
 * If Teal UI changes and selectors break: run skill /teal-ui-learn-custom (npm run job-search:teal-ui-learn),
 * then update selectors in this file and optionally in .claude/reference/teal-ui-map.md (Resumes — список резюме).
 */
'use strict';

const path = require('path');
const os = require('os');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const fs = require('fs');
const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');

const LOG_FILE = path.join(TEAL_DIR, 'teal-cleanup-copies.log');

function log(msg) {
  const line = typeof msg === 'string' ? msg : String(msg);
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n');
  } catch (_) {}
}

/** Default protected resume ID (эталон) if TEAL_PROTECTED_RESUME_IDS not set. */
const DEFAULT_PROTECTED_ID = 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';

/** Return Set of resume IDs that must never be deleted (эталонные резюме). */
function getProtectedIds() {
  const raw = process.env.TEAL_PROTECTED_RESUME_IDS;
  if (raw && String(raw).trim()) {
    const ids = String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (ids.length > 0) return new Set(ids);
  }
  return new Set([DEFAULT_PROTECTED_ID.toLowerCase()]);
}

/** Match copies: title ends with " copy" or " copy 2", " copy 3" etc. (Teal duplicate naming). */
function isCopyTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.trim();
  return /\s+copy(\s+\d+)?$/i.test(t);
}

/** Normalize title for duplicate grouping (exact same name = duplicate). */
function normalizeTitle(title) {
  return (title && String(title).trim()) || '';
}

/**
 * From full resume list, compute IDs to delete:
 * 1) Resumes with " copy" in title (except protected).
 * 2) Same-title duplicates: keep the one without Job Matcher link (unlinked); delete the rest (except protected).
 */
function computeIdsToDelete(resumes, protectedIds) {
  const toDelete = new Set();
  const protectedSet = protectedIds;

  for (const r of resumes) {
    const idLower = (r.id || '').toLowerCase();
    if (protectedSet.has(idLower)) continue;
    if (isCopyTitle(r.title)) toDelete.add(r.id);
  }

  const byTitle = new Map();
  for (const r of resumes) {
    const key = normalizeTitle(r.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(r);
  }

  for (const [, group] of byTitle) {
    if (group.length <= 1) continue;
    group.sort((a, b) => (a.linked === b.linked ? 0 : a.linked ? 1 : -1));
    const toKeep = group[0];
    for (let i = 1; i < group.length; i++) {
      const idLower = (group[i].id || '').toLowerCase();
      if (!protectedSet.has(idLower)) toDelete.add(group[i].id);
    }
  }

  return toDelete;
}

/** Return list of Chrome profile dirs to try (first = default). Used to fallback when one is locked. */
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
  return list.filter((dir) => require('fs').existsSync(dir));
}

function resolveChromeProfileDir() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const expanded = env.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);
    if (require('fs').existsSync(resolved)) return [resolved];
  }
  return getChromeProfileCandidates();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fresume-builder%2Fresumes';
const { launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');

/** Log in to Teal via email form using TEAL_EMAIL/TEAL_PASSWORD from .env. Returns true if we end up on app. */
async function tealLoginIfNeeded(page) {
  const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
  const tealPassword = process.env.TEAL_PASSWORD;
  if (!tealEmail || !tealPassword) {
    log('[Teal cleanup] Not logged in and no TEAL_EMAIL/TEAL_PASSWORD in .env. Add them for auto-login when using Profile 1/2.');
    return false;
  }
  log('[Teal cleanup] Logging in with TEAL_EMAIL from .env …');
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
    log('[Teal cleanup] Email/password form not found on sign-in page.');
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
  const ok = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login');
  if (ok) log('[Teal cleanup] Login successful.');
  return ok;
}

async function main() {
  ensureDirs();
  log('[Teal cleanup] Log file: ' + LOG_FILE);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    log('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const profileCandidates = resolveChromeProfileDir();
  if (profileCandidates.length === 0) {
    log('Chrome profile not found. Set TEAL_CHROME_PROFILE or use default Chrome.');
    process.exit(1);
  }
  const protectedIds = getProtectedIds();
  log('[Teal cleanup] Protected resume IDs (never delete): ' + [...protectedIds].join(', '));

  const launchOptions = {
    headless: false,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
  };
  launchOptions.channel = 'chrome';

  let context;
  let chromeProfileDir = null;
  for (const profileDir of profileCandidates) {
    try {
      context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOptions);
      chromeProfileDir = profileDir;
      log('[Teal cleanup] Using Chrome profile: ' + chromeProfileDir);
      break;
    } catch (e) {
      const isProfileLocked =
        /ProcessSingleton|profile is already in use|SingletonLock/i.test(e.message) ||
        (e.message && e.message.includes('already in use'));
      if (isProfileLocked && profileCandidates.indexOf(profileDir) < profileCandidates.length - 1) {
        log('[Teal cleanup] Profile in use, trying next: ' + profileDir);
        continue;
      }
      if (isProfileLocked) {
        log('Chrome profile is in use (another script or window). For parallel run, use another profile: log into Teal in Chrome Profile 1 (or create it), then run again; or set TEAL_CHROME_PROFILE to that profile path.');
      } else {
        log('Failed to launch Chrome: ' + e.message);
      }
      process.exit(1);
    }
  }
  if (!context) {
    log('No Chrome profile available (all in use?). Close another Teal/Chrome window or use TEAL_CHROME_PROFILE.');
    process.exit(1);
  }

  await sleep(2000);
  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  const listUrl = 'https://app.tealhq.com/resume-builder/resumes';
  const menuSelector = 'button[aria-label="Resume Menu"]';

  try {
    log('[Teal cleanup] Opening resume list …');
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    log('[Teal cleanup] Waiting for list to render (up to 50s; auth may still be connecting) …');
    const listReadyTimeout = 50000;
    const listReadyStart = Date.now();
    let listVisible = false;
    while (Date.now() - listReadyStart < listReadyTimeout) {
      const linkCount = await page.locator('a[href*="/resumes/"]').count();
      const linkVisible = linkCount > 0 && (await page.locator('a[href*="/resumes/"]').first().isVisible().catch(() => false));
      if (linkVisible) {
        listVisible = true;
        log('[Teal cleanup] List visible (' + linkCount + ' link(s)), letting it settle …');
        break;
      }
      await sleep(2000);
    }
    if (!listVisible) log('[Teal cleanup] List may not be fully loaded; continuing anyway.');
    await sleep(4000);
    log('[Teal cleanup] Page ready, checking auth …');

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
      const loggedIn = await tealLoginIfNeeded(page);
      if (!loggedIn) {
        await context.close();
        process.exit(1);
      }
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      log('[Teal cleanup] Waiting for list after login (up to 40s) …');
      for (let w = 0; w < 20; w++) {
        const linkCount = await page.locator('a[href*="/resumes/"]').count();
        if (linkCount > 0) break;
        await sleep(2000);
      }
      await sleep(4000);
      currentUrl = page.url();
      if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
        log('[Teal cleanup] Still on login page after auto-login.');
        await context.close();
        process.exit(1);
      }
    }

    /** Build list of resumes in one evaluate() to avoid hundreds of locator calls (stale elements / browser closed). */
    log('[Teal cleanup] Scanning resume list …');
    let resumes = await page.evaluate((menuAria) => {
      const result = [];
      const rows = document.querySelectorAll('tr');
      for (const tr of rows) {
        const link = tr.querySelector('a[href*="/resumes/"]');
        const menu = tr.querySelector('button[aria-label="' + menuAria + '"]');
        if (!link || !menu) continue;
        const href = link.getAttribute('href');
        const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
        if (!m) continue;
        const title = ((tr.innerText || '').trim().split('\n')[0] || '').slice(0, 200);
        const linked = tr.querySelector('a[href*="/job-tracker/"]') !== null;
        result.push({ id: m[1], title, linked });
      }
      if (result.length === 0) {
        const links = document.querySelectorAll('a[href*="/resumes/"]');
        const seen = new Set();
        for (const link of links) {
          let el = link.closest('div');
          while (el) {
            const tr = el.closest('tr');
            if (tr && tr.querySelector('button[aria-label="' + menuAria + '"]')) {
              const href = link.getAttribute('href');
              const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
              if (m && !seen.has(m[1])) {
                seen.add(m[1]);
                const title = ((tr.innerText || '').trim().split('\n')[0] || '').slice(0, 200);
                const linked = tr.querySelector('a[href*="/job-tracker/"]') !== null;
                result.push({ id: m[1], title, linked });
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
      const anyLinks = await page.locator('a[href*="/resumes/"]').count().catch(() => 0);
      log('[Teal cleanup] No rows/cards with menu found. Links with /resumes/ on page: ' + anyLinks + ' (UI may have changed; run /teal-ui-learn-custom to update selectors).');
    }

    const toDeleteIds = computeIdsToDelete(resumes, protectedIds);

    log('[Teal cleanup] Resumes on page: ' + resumes.length + ' | to delete (copies + same-title duplicates, keep unlinked): ' + toDeleteIds.size);

    if (toDeleteIds.size === 0) {
      log('[Teal cleanup] Nothing to delete (no " copy" titles and no same-title duplicates, or all protected).');
      await context.close();
      return;
    }

    log('[Teal cleanup] Deleting ' + toDeleteIds.size + ' resume(s) (copies by title and/or same-name duplicates; keeping unlinked when same name).');

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
          log('[Teal cleanup] Could not find resume row twice in a row; stopping.');
          break;
        }
        toDeleteIds.delete(nextId);
        await sleep(1000);
        continue;
      }
      noItemCount = 0;
      const id = nextId;
      const title = (await container.innerText().catch(() => '')).trim().split('\n')[0] || id;
      log('[Teal cleanup] Deleting: ' + title.slice(0, 60) + ' | ' + id);

      const menuButton = container.locator(menuSelector).first();
      if ((await menuButton.count()) === 0 || !(await menuButton.isVisible().catch(() => false))) {
        log('[Teal cleanup] Skip: menu button not found for ' + id);
        toDeleteIds.delete(id);
        continue;
      }
      await container.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(400);
      await menuButton.click();
      await sleep(800);

      const deleteItem = page
        .locator('[role="menuitem"]')
        .filter({ hasText: /Delete|Remove/i })
        .first();
      if ((await deleteItem.count()) === 0 || !(await deleteItem.isVisible().catch(() => false))) {
        log('[Teal cleanup] Skip: Delete menu item not found. Close menu and continue.');
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

    log('[Teal cleanup] Done. Deleted ' + deletedCount + ' copy/copies.');
  } catch (err) {
    const closed = /Target page, context or browser has been closed/i.test(err.message);
    if (closed) {
      log('[Teal cleanup] Browser or page was closed. Run the script again to delete remaining copies.');
    } else {
      log('[Teal cleanup] Error: ' + err.message);
      const debugPath = path.join(TEAL_DIR, 'teal-cleanup-debug.html');
      try {
        if (page && !page.isClosed()) fs.writeFileSync(debugPath, await page.content(), 'utf8');
        if (page && !page.isClosed()) log('[Teal cleanup] Page HTML saved to: ' + debugPath);
      } catch (_) {}
    }
  } finally {
    try {
      if (context) await context.close();
    } catch (_) {}
  }
}

main();
