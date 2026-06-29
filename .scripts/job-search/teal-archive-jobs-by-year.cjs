#!/usr/bin/env node
/**
 * Archive all jobs from a given year in Teal Job Tracker.
 * Uses your Chrome profile (same as other Teal scripts). Close Chrome before running, or use TEAL_CHROME_PROFILE.
 *
 * Usage:
 *   node teal-archive-jobs-by-year.cjs [--year 2025]
 *   npm run job-search:teal-archive-by-year -- [--year 2025]
 *
 * Default --year: 2025
 */

'use strict';

const path = require('path');
const fs = require('fs');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, getTealProfileCandidates, isProfileInUseError } = require('./teal-chrome-profile.cjs');

function log(msg) {
  console.log(typeof msg === 'string' ? msg : String(msg));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const JOB_TRACKER_URL = 'https://app.tealhq.com/job-tracker';

/** Parse year from API job: created_at, date_added, createdAt, added_at, etc. */
function getYearFromJob(job) {
  const raw =
    job.created_at ||
    job.date_added ||
    job.createdAt ||
    job.added_at ||
    job.dateAdded ||
    job.inserted_at;
  if (!raw) return null;
  const str = String(raw).trim();
  const isoMatch = str.match(/^(\d{4})-\d{2}-\d{2}/);
  if (isoMatch) return parseInt(isoMatch[1], 10);
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getFullYear();
  return null;
}

async function main() {
  ensureDirs();
  const argv = process.argv.slice(2);
  let year = 2025;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--year' && argv[i + 1]) {
      year = parseInt(argv[i + 1], 10);
      break;
    }
  }
  if (isNaN(year) || year < 2000 || year > 2100) {
    log('Invalid --year. Use e.g. --year 2025');
    process.exit(1);
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    log('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const profileCandidates = getTealProfileCandidates();
  if (!profileCandidates.length) {
    log('No Chrome profile found. Set TEAL_CHROME_PROFILE or use default Chrome.');
    process.exit(1);
  }

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
    log('[Teal archive] Using profile: ' + result.profileDir);
  } catch (e) {
    if (isProfileInUseError(e)) {
      log('Chrome profile is in use. Close Chrome (or the other Teal window) and run again.');
    } else {
      log('Launch error: ' + (e && e.message ? e.message : String(e)));
    }
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());

  const jobsFromApi = [];
  const apiIds = new Set();
  const responseHandler = async (response) => {
    const url = response.url();
    if (!url.includes('tealhq') || (!url.includes('job') && !url.includes('api') && !url.includes('graphql')))
      return;
    try {
      const json = await response.json().catch(() => null);
      if (!json) return;
      const list = Array.isArray(json) ? json : json.jobs || json.data || json.items || (json.results && json.results.data);
      if (!Array.isArray(list) || list.length === 0) return;
      const first = list[0];
      if (!first || (first.id == null && first.uuid == null && first.job_id == null)) return;
      for (const j of list) {
        const id = (j.id || j.uuid || j.job_id || '').toString();
        if (!id) continue;
        const createdYear = getYearFromJob(j);
        const entry = {
          id,
          title: (j.title || j.job_title || j.name || '').trim(),
          company: (j.company_name || j.company || j.organization || '').trim(),
          year: createdYear
        };
        if (apiIds.has(id)) {
          const idx = jobsFromApi.findIndex((x) => x.id === id);
          if (idx >= 0) jobsFromApi[idx] = entry;
        } else {
          apiIds.add(id);
          jobsFromApi.push(entry);
        }
      }
    } catch (_) {}
  };
  page.on('response', responseHandler);

  log('[Teal archive] Opening job tracker…');
  await page.goto(JOB_TRACKER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  await Promise.race([
    page.waitForSelector('button:has-text("Add a new job"), button:has-text("Add a New Job")', { state: 'visible', timeout: 45000 }),
    page.getByPlaceholder(/Filter/i).first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {})
  ]).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
  await sleep(4000);

  log('[Teal archive] Waiting for job table…');
  try {
    await Promise.race([
      page.waitForSelector('.job-tracker-table.tabulator .tabulator-row, .tabulator[role="grid"] .tabulator-row', { state: 'visible', timeout: 60000 }),
      page.waitForFunction(
        () => document.querySelectorAll('a[href*="/job-tracker/"]').length > 0,
        { timeout: 60000, polling: 2000 }
      )
    ]);
  } catch (e) {
    log('[Teal archive] Table or job links not found: ' + (e.message || '').slice(0, 80));
  }
  await sleep(2000);

  for (let s = 0; s < 60; s++) {
    await page.evaluate(() => {
      const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
      if (grid) {
        const body = grid.querySelector('.tabulator-tablebody');
        if (body) {
          body.scrollTop = body.scrollHeight;
          body.scrollBy && body.scrollBy(0, 400);
        }
      }
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
    });
    await sleep(300);
  }
  let prevCount = 0;
  for (let stable = 0; stable < 5; stable++) {
    const now = await page.locator('.tabulator-tablebody .tabulator-row').count().catch(() => 0);
    if (now === prevCount && now > 0) break;
    prevCount = now;
    await page.evaluate(() => {
      const body = document.querySelector('.tabulator-tablebody');
      if (body) body.scrollTop = body.scrollHeight;
    });
    await sleep(600);
  }
  await sleep(1500);

  let jobsFromTable = await page.evaluate(() => {
    const jobLinkRe = /job-tracker\/([a-f0-9-]{36})/i;
    const result = [];
    const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
    const body = grid ? grid.querySelector('.tabulator-tablebody') : null;
    const rows = (body || grid) ? (body || grid).querySelectorAll('.tabulator-row') : [];
    const dateFieldNames = ['dateAdded', 'createdAt', 'created_at', 'date', 'appliedDate', 'updatedAt'];
    for (const row of rows) {
      if (row.closest && row.closest('.tabulator-header')) continue;
      const link = row.querySelector('a[href*="/job-tracker/"]');
      if (!link) continue;
      const href = (link.getAttribute('href') || '').trim();
      const m = href.match(jobLinkRe);
      if (!m) continue;
      let yearFromCell = null;
      const cells = row.querySelectorAll('.tabulator-cell[tabulator-field], [role="gridcell"][tabulator-field]');
      for (const cell of cells) {
        const field = (cell.getAttribute('tabulator-field') || '').trim();
        if (!dateFieldNames.some((f) => field.toLowerCase().includes(f.toLowerCase()))) continue;
        const text = (cell.textContent || '').trim();
        const yMatch = text.match(/\b(202\d)\b/);
        if (yMatch) yearFromCell = parseInt(yMatch[1], 10);
        const dMatch = text.match(/(\w{3})\s+(\d{1,2}),?\s*(202\d)/i) || text.match(/(\d{1,2})\/(\d{1,2})\/(202\d)/);
        if (dMatch) yearFromCell = parseInt(dMatch[3], 10);
        if (yearFromCell != null) break;
      }
      result.push({ id: m[1], title: (link.textContent || '').trim().slice(0, 200), yearFromCell });
    }
    if (result.length > 0) return result;
    const allLinks = document.querySelectorAll('a[href*="/job-tracker/"]');
    const seen = new Set();
    for (const link of allLinks) {
      const href = (link.getAttribute('href') || '').trim();
      const m = href.match(jobLinkRe);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      result.push({ id: m[1], title: (link.textContent || '').trim().slice(0, 200), yearFromCell: null });
    }
    return result;
  }).catch(() => []);

  if (jobsFromTable.length === 0) {
    try {
      const html = await page.content();
      const debugPath = path.join(TEAL_DIR, 'teal-archive-debug.html');
      fs.writeFileSync(debugPath, html, 'utf8');
      log('[Teal archive] 0 jobs from table; saved DOM to ' + debugPath);
    } catch (_) {}
  }

  const jobsWithYear = jobsFromTable.map((j) => {
    const fromApi = jobsFromApi.find((a) => a.id === j.id);
    const y = (fromApi && fromApi.year != null ? fromApi.year : null) ?? j.yearFromCell ?? null;
    return { id: j.id, title: j.title, year: y };
  });

  const toArchive = jobsWithYear.filter((j) => j.year === year);
  if (toArchive.length === 0) {
    const withYear = jobsWithYear.filter((j) => j.year != null);
    const from2025 = jobsWithYear.filter((j) => j.year === 2025);
    log('[Teal archive] Jobs in table: ' + jobsWithYear.length + ', with date from API: ' + withYear.length);
    log('[Teal archive] Jobs from ' + year + ': ' + from2025.length + '. Nothing to archive.');
    await context.close();
    return;
  }

  log('[Teal archive] Jobs from ' + year + ' to archive: ' + toArchive.length);

  const menuSelectors = [
    'button[aria-label="Job Menu"]',
    'button[aria-label="Job menu"]',
    'button[aria-label*="Job" i]',
    'button[aria-label*="menu" i]',
    '[role="button"][aria-haspopup="menu"]',
    '.tabulator-row button[aria-label]',
    '.tabulator-row [role="button"]'
  ];

  let archived = 0;
  for (const job of toArchive) {
    const { id, title } = job;
    let container = page.locator('.tabulator-row').filter({ has: page.locator('a[href*="/job-tracker/' + id + '"]') }).first();
    if ((await container.count()) === 0) {
      container = page.locator('a[href*="/job-tracker/' + id + '"]').locator('xpath=ancestor::*[contains(@class,"tabulator-row")][1]').first();
    }
    if ((await container.count()) === 0 || !(await container.isVisible().catch(() => false))) {
      log('[Teal archive] Row not found: ' + title.slice(0, 50) + '…');
      continue;
    }
    await container.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);

    let menuBtn = null;
    for (const sel of menuSelectors) {
      const btn = container.locator(sel).first();
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
        menuBtn = btn;
        break;
      }
    }
    if (!menuBtn) {
      const anyBtn = container.locator('button').last();
      if ((await anyBtn.count()) > 0 && (await anyBtn.isVisible().catch(() => false))) menuBtn = anyBtn;
    }
    if (!menuBtn || (await menuBtn.count()) === 0) {
      log('[Teal archive] Menu button not found for: ' + title.slice(0, 50));
      continue;
    }
    await menuBtn.click();
    await sleep(700);

    const archiveItem = page.locator('[role="menuitem"]').filter({ hasText: /Archive/i }).first();
    if ((await archiveItem.count()) === 0 || !(await archiveItem.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      await sleep(200);
      log('[Teal archive] "Archive" not in menu for: ' + title.slice(0, 50) + '. Skip.');
      continue;
    }
    await archiveItem.click();
    await sleep(600);
    archived++;
    log('[Teal archive] Archived ' + archived + '/' + toArchive.length + ': ' + title.slice(0, 55));
  }

  log('[Teal archive] Done. Archived ' + archived + ' job(s) from ' + year + '.');
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
