#!/usr/bin/env node
/**
 * Report: список резюме с https://app.tealhq.com/resume-builder/resumes
 * — всего, привязанных (в ячейке название вакансии), непривязанных (в ячейке Connect Job).
 *
 * Usage: node teal-unlinked-resumes-report.cjs
 *   or:  npm run job-search:teal-unlinked-report
 */
'use strict';

const path = require('path');
const os = require('os');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const fs = require('fs');
const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');

function log(msg) {
  console.log(typeof msg === 'string' ? msg : String(msg));
}

function resolveChromeProfileDir() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const expanded = env.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);
    if (fs.existsSync(resolved)) return [resolved];
  }
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fresume-builder%2Fresumes';
const { launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');

async function tealLoginIfNeeded(page) {
  const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
  const tealPassword = process.env.TEAL_PASSWORD;
  if (!tealEmail || !tealPassword) return false;
  log('[Teal unlinked-report] Logging in …');
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
      context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOptions);
      log('[Teal unlinked-report] Using Chrome profile: ' + profileDir);
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

  try {
    const listUrl = 'https://app.tealhq.com/resume-builder/resumes';
    log('[Teal unlinked-report] Opening resume list …');
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(2000);

    let resumeRowCount = await page.locator('tr').filter({ has: page.locator('a[href*="/resumes/"]') }).count().catch(() => 0);
    if (resumeRowCount > 0) {
      log('[Teal unlinked-report] Resume list visible: ' + resumeRowCount + ' rows.');
    } else {
      let currentUrl = page.url();
      if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
        const loggedIn = await tealLoginIfNeeded(page);
        if (!loggedIn) {
          log('Not logged in. Log in manually and run again.');
          await context.close();
          process.exit(1);
        }
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
      }
      try {
        await page.waitForSelector('a[href*="/resumes/"]', { state: 'visible', timeout: 15000 });
        await sleep(1000);
        resumeRowCount = await page.locator('tr').filter({ has: page.locator('a[href*="/resumes/"]') }).count().catch(() => 0);
        if (resumeRowCount > 0) log('[Teal unlinked-report] Resume list visible: ' + resumeRowCount + ' rows.');
      } catch (e) {
        log('[Teal unlinked-report] Resume list not found: ' + (e.message || e).slice(0, 50));
      }
    }

    const resumes = await page.evaluate(() => {
      const result = [];
      const rows = document.querySelectorAll('tr');
      for (const tr of rows) {
        const link = tr.querySelector('a[href*="/resumes/"]');
        if (!link) continue;
        const href = link.getAttribute('href');
        const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
        if (!m) continue;
        const fullText = (tr.innerText || '').trim();
        const firstLine = fullText.split('\n')[0] || '';
        const hasConnectJob = /Connect\s*Job|Match\s*a\s*job/i.test(fullText);
        const linked = !hasConnectJob;
        result.push({
          id: m[1],
          title: firstLine.trim().slice(0, 300),
          linked,
          unlinked: hasConnectJob,
          hasConnectJob
        });
      }
      if (result.length === 0) {
        const links = document.querySelectorAll('a[href*="/resumes/"]');
        const seen = new Set();
        for (const link of links) {
          let el = link.closest('div');
          while (el) {
            const tr = el.closest('tr');
            if (tr) {
              const href = link.getAttribute('href');
              const m = href && href.match(/\/resumes\/([a-f0-9-]+)/);
              if (m && !seen.has(m[1])) {
                seen.add(m[1]);
                const fullText = (tr.innerText || '').trim();
                const firstLine = fullText.split('\n')[0] || '';
                const hasConnectJob = /Connect\s*Job|Match\s*a\s*job/i.test(fullText);
                result.push({
                  id: m[1],
                  title: firstLine.trim().slice(0, 300),
                  linked: !hasConnectJob,
                  unlinked: hasConnectJob,
                  hasConnectJob
                });
              }
              break;
            }
            el = el.parentElement;
          }
        }
      }
      return result;
    }).catch(() => []);


    const linkedResumes = resumes.filter((r) => r.linked);
    const unlinkedResumes = resumes.filter((r) => r.unlinked);
    log('[Teal unlinked-report] Resumes total: ' + resumes.length + ' | Привязаны (в ячейке название вакансии): ' + linkedResumes.length + ' | Не привязаны (в ячейке Connect Job): ' + unlinkedResumes.length);

    log('');
    log('--- Список резюме (https://app.tealhq.com/resume-builder/resumes) ---');
    log('Всего резюме: ' + resumes.length);
    log('Привязаны (в ячейке отображается название вакансии): ' + linkedResumes.length);
    log('Не привязаны (в ячейке кнопка Connect Job): ' + unlinkedResumes.length);
    log('');

    const jobTrackerUrl = 'https://app.tealhq.com/job-tracker';
    let jobsFromApi = [];
    let apiTotalCount = 0;
    let userJobPostsBaseUrl = '';
    const apiIds = new Set();
    const responseHandler = async (response) => {
      const url = response.url();
      if (!url.includes('tealhq')) return;
      try {
        const json = await response.json().catch(() => null);
        if (!json) return;
        const total = json.total ?? json.totalCount ?? json.total_count ?? json.meta?.total ?? (json.results && json.results.total) ?? (json.data && json.data.total);
        if (typeof total === 'number' && total > apiTotalCount) apiTotalCount = total;
        if (url.includes('user_job_posts') && json.meta) {
          const pagination = json.meta.pagination;
          const metaTotal = pagination && typeof pagination.count === 'number' ? pagination.count : json.meta.total ?? json.meta.totalCount ?? json.meta.count;
          if (typeof metaTotal === 'number' && metaTotal > apiTotalCount) {
            apiTotalCount = metaTotal;
            log('[Teal unlinked-report] API total (meta.pagination.count): ' + apiTotalCount);
          }
        }
        let list = Array.isArray(json) ? json : json.jobs || json.data || json.items
          || (json.results && json.results.data) || (json.data && Array.isArray(json.data) ? json.data : json.data && json.data.jobs);
        if (!Array.isArray(list) && url.includes('user_job_posts')) {
          list = (json.results && Array.isArray(json.results)) ? json.results : (json.data && Array.isArray(json.data)) ? json.data : [];
          if (list.length === 0 && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) list = [json.data];
        }
        if (!Array.isArray(list)) return;
        if (list.length === 0) return;
        const first = list[0];
        if (!first || (first.id == null && first.uuid == null && first.job_id == null)) return;
        const prevLen = jobsFromApi.length;
        for (const j of list) {
          const id = (j.id || j.uuid || j.job_id || '').toString();
          if (!id) continue;
          const status = (j.status || j.state || j.status_name || j.statusName || j.application_status || (j.attributes && (j.attributes.status || j.attributes.state)) || '').toString().trim().toLowerCase();
          const position = (j.title || j.role || j.position || j.name || (j.attributes && (j.attributes.title || j.attributes.role)) || '').toString().trim();
          const company = (j.company || j.company_name || j.organization || (j.attributes && (j.attributes.company || j.attributes.company_name)) || '').toString().trim();
          if (!apiIds.has(id)) {
            apiIds.add(id);
            jobsFromApi.push({ id, position, company, status: status || 'other' });
          }
        }
        if (jobsFromApi.length > prevLen && list.length > 10) log('[Teal unlinked-report] API: captured ' + list.length + ' jobs from ' + url.slice(0, 60) + '…');
        if (url.includes('user_job_posts')) {
          if (!userJobPostsBaseUrl && list.length > 10) userJobPostsBaseUrl = url.split('&per_page=')[0] || url;
          const total = json.total ?? json.totalCount ?? json.total_count ?? (json.meta && json.meta.total) ?? (json.results && json.results.total);
          if (typeof total === 'number' && total > 0) {
            apiTotalCount = Math.max(apiTotalCount, total);
            if (total > list.length) log('[Teal unlinked-report] API total (meta): ' + total);
          }
        }
      } catch (_) {}
    };
    page.on('response', responseHandler);

    log('[Teal unlinked-report] Opening job tracker…');
    await page.goto(jobTrackerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(4000);
    try {
      await page.waitForSelector('.tabulator-row, .tabulator-tablebody', { state: 'visible', timeout: 20000 });
    } catch (_) {}
    await sleep(2000);

    const scrollIterations = 200;
    const scrollPauseMs = 350;
    const jobIdToStatus = new Map();
    const jobDetailsMap = new Map();
    const collectVisibleJobs = () => {
      return page.evaluate(() => {
        const out = [];
        const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
        const body = grid ? grid.querySelector('.tabulator-tablebody') : null;
        const rows = (body || document).querySelectorAll('.tabulator-row');
        for (const row of rows) {
          if (row.closest && row.closest('.tabulator-header')) continue;
          let id = '';
          const link = row.querySelector('a[href*="job-tracker"]');
          if (link) {
            const href = (link.getAttribute('href') || '').trim();
            const uuidMatch = href.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (uuidMatch) id = uuidMatch[1];
          }
          let position = '';
          let company = '';
          let status = '';
          const cells = row.querySelectorAll('.tabulator-cell[tabulator-field], [role="gridcell"][tabulator-field], .tabulator-cell, [class*="cell"], td');
          for (const cell of cells) {
            const field = (cell.getAttribute('tabulator-field') || '').toLowerCase();
            const text = (cell.textContent || '').trim();
            const textLower = text.toLowerCase();
            if (field === 'role') position = text;
            else if (field === 'company' || field === 'companyname') company = text;
            else if (field === 'statusname' || field === 'status') status = textLower;
            else if (/^(bookmarked|applied|interviewing|saved|offered|rejected|archived|declined|no response)$/.test(textLower)) status = textLower;
          }
          if (!company && cells.length >= 2) {
            const idx1 = Array.from(cells).findIndex((c) => (c.getAttribute('tabulator-field') || '').toLowerCase().includes('company'));
            if (idx1 >= 0) company = (cells[idx1].textContent || '').trim();
            else if (cells.length >= 3) company = (cells[1].textContent || '').trim();
          }
          const roleCell = row.querySelector('[tabulator-field="role"]');
          if (!position && roleCell) position = (roleCell.textContent || '').trim();
          if (!position && link) position = (link.textContent || '').trim();
          if (!position) continue;
          out.push({ id: id || null, position, company, status: status || 'other' });
        }
        return out;
      }).catch(() => []);
    };

    log('[Teal unlinked-report] Scrolling job list to end (' + scrollIterations + ' steps, ~' + Math.round((scrollIterations * scrollPauseMs) / 1000) + ' s)…');
    const tableBody = page.locator('.tabulator-tablebody').first();
    const tableBodyBox = await tableBody.boundingBox().catch(() => null);
    for (let s = 0; s < scrollIterations; s++) {
      if (tableBodyBox) {
        await page.mouse.move(tableBodyBox.x + tableBodyBox.width / 2, tableBodyBox.y + tableBodyBox.height / 2);
        await page.mouse.wheel(0, 500);
      }
      await page.evaluate(() => {
        const body = document.querySelector('.tabulator-tablebody');
        if (body) {
          body.scrollTop = body.scrollHeight;
          if (body.scrollBy) body.scrollBy(0, 500);
        }
        const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
        if (grid && grid.querySelector('.tabulator-tablebody')) {
          const tb = grid.querySelector('.tabulator-tablebody');
          tb.scrollTop = tb.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(scrollPauseMs);
      const batch = await collectVisibleJobs();
      for (const rec of batch) {
        if (!rec.position && !rec.company) continue;
        const key = rec.id || ('pos:' + (rec.position || '').replace(/\|/g, ',') + '|' + (rec.company || '').replace(/\|/g, ','));
        if (!jobDetailsMap.has(key)) {
          jobDetailsMap.set(key, { id: rec.id || '', position: rec.position || '', company: rec.company || '', status: rec.status || 'other' });
          if (rec.id) jobIdToStatus.set(rec.id, rec.status || 'other');
        }
      }
      if (s > 0 && s % 25 === 0) {
        log('[Teal unlinked-report] Scroll step ' + (s + 1) + '/' + scrollIterations + ', jobs collected: ' + jobDetailsMap.size);
      }
    }
    log('[Teal unlinked-report] Scroll done. Unique jobs in list: ' + jobDetailsMap.size);
    await sleep(2000);

    const seenKey = new Set();
    const jobsList = [];
    for (const [key, d] of jobDetailsMap.entries()) {
      const rowKey = (d.position || '') + '|' + (d.company || '');
      if (seenKey.has(rowKey)) continue;
      seenKey.add(rowKey);
      jobsList.push({ id: d.id || '', position: d.position || '', company: d.company || '', status: d.status || 'other' });
    }
    for (const j of jobsFromApi) {
      const key = j.id || ((j.position || '') + '|' + (j.company || ''));
      if (!key || seenKey.has(key)) continue;
      seenKey.add(key);
      jobsList.push({ id: j.id || '', position: j.position || '', company: j.company || '', status: (j.status || 'other').toLowerCase() });
    }
    jobsList.sort((a, b) => {
      const aHas = (a.position || a.company) ? 1 : 0;
      const bHas = (b.position || b.company) ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return (a.position || '').localeCompare(b.position || '');
    });
    ensureDirs();
    const listJsonPath = path.join(TEAL_DIR, 'job-tracker-list.json');
    const listMdPath = path.join(TEAL_DIR, 'job-tracker-list.md');
    fs.writeFileSync(listJsonPath, JSON.stringify(jobsList, null, 2), 'utf8');
    const mdLines = ['# Job Tracker — список вакансий', '', 'Источник: https://app.tealhq.com/job-tracker', 'Дата: ' + new Date().toISOString().slice(0, 10), '', 'Всего: ' + jobsList.length, ''];
    for (const j of jobsList) {
      mdLines.push('- **' + (j.position || '—').replace(/\|/g, ',') + '**');
      mdLines.push(' - Компания: ' + (j.company || '—').replace(/\n/g, ' '));
      mdLines.push(' - Статус: ' + (j.status || '—'));
      mdLines.push(' - ID: `' + j.id + '`');
      mdLines.push('');
    }
    fs.writeFileSync(listMdPath, mdLines.join('\n'), 'utf8');
    log('[Teal unlinked-report] Saved job list: ' + jobsList.length + ' jobs → ' + listJsonPath);
    log('[Teal unlinked-report] Markdown: ' + listMdPath);

    const statusCountsFromScroll = {};
    for (const status of jobIdToStatus.values()) {
      const key = status || 'other';
      statusCountsFromScroll[key] = (statusCountsFromScroll[key] || 0) + 1;
    }

    const statusCountsFromApi = {};
    for (const j of jobsFromApi) {
      const s = (j.status || 'other').toLowerCase();
      statusCountsFromApi[s] = (statusCountsFromApi[s] || 0) + 1;
    }

    const uiStatusCounts = await page.evaluate(() => {
      const out = { bookmarked: null, applied: null, interviewing: null };
      const setIfBetter = (key, n) => { if (n >= 0 && n < 10000 && (out[key] == null || n > out[key])) out[key] = n; };
      const text = (document.body && document.body.innerText) || '';
      const lower = text.toLowerCase();
      const mBook = lower.match(/(\d+)\s*bookmarked|bookmarked\s*[\(\[]?\s*(\d+)\s*[\)\]]?/);
      const mApp = lower.match(/(\d+)\s*applied|applied\s*[\(\[]?\s*(\d+)\s*[\)\]]?/);
      const mInt = lower.match(/(\d+)\s*interviewing|interviewing\s*[\(\[]?\s*(\d+)\s*[\)\]]?/);
      if (mBook) setIfBetter('bookmarked', parseInt(mBook[1] || mBook[2], 10));
      if (mApp) setIfBetter('applied', parseInt(mApp[1] || mApp[2], 10));
      if (mInt) setIfBetter('interviewing', parseInt(mInt[1] || mInt[2], 10));
      const tabs = document.querySelectorAll('[role="tab"], [class*="tab"], [class*="filter"], [class*="segment"]');
      tabs.forEach((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.length > 50) return;
        const nBook = t.match(/(\d+)\s*bookmarked|(\d+)bookmarked/);
        const nApp = t.match(/(\d+)\s*applied|(\d+)applied/);
        const nInt = t.match(/(\d+)\s*interviewing|(\d+)interviewing/);
        if (nBook) setIfBetter('bookmarked', parseInt(nBook[1] || nBook[2], 10));
        if (nApp) setIfBetter('applied', parseInt(nApp[1] || nApp[2], 10));
        if (nInt) setIfBetter('interviewing', parseInt(nInt[1] || nInt[2], 10));
      });
      return out;
    }).catch(() => ({ bookmarked: null, applied: null, interviewing: null }));

    const tabulatorTotal = jobIdToStatus.size;
    const hasApiStatuses = Object.keys(statusCountsFromApi).filter((k) => k !== 'other').length > 0 || (statusCountsFromApi.other || 0) < jobsFromApi.length;
    let statusCounts = hasApiStatuses ? statusCountsFromApi : (tabulatorTotal > 0 ? statusCountsFromScroll : statusCountsFromApi);
    const bookmarked = (uiStatusCounts.bookmarked != null ? uiStatusCounts.bookmarked : null) ?? (statusCounts.bookmarked || 0);
    const applied = (uiStatusCounts.applied != null ? uiStatusCounts.applied : null) ?? (statusCounts.applied || 0);
    const interviewing = (uiStatusCounts.interviewing != null ? uiStatusCounts.interviewing : null) ?? (statusCounts.interviewing || 0);

    const totalFromPage = await page.evaluate(() => {
      const text = (document.body && document.body.innerText) || '';
      const patterns = [
        /(\d+)\s*(?:jobs?|вакансий|applications?)/gi,
        /of\s*(\d+)/gi,
        /(\d+)\s*results?/gi,
        /(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/i,
        /showing\s*(\d+)\s*of\s*(\d+)/gi,
        /(\d+)\s*of\s*(\d+)/gi,
        /total[:\s]*(\d+)/gi
      ];
      let best = 0;
      for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) !== null) {
          for (let i = 1; i < m.length; i++) {
            const n = parseInt(m[i], 10);
            if (n > best && n < 10000) best = n;
          }
        }
      }
      return best;
    }).catch(() => 0);

    let jobCount = Math.max(jobsFromApi.length, totalFromPage, apiTotalCount, tabulatorTotal);
    const bodyRowCount = await page.locator('.tabulator-tablebody .tabulator-row').count().catch(() => 0);
    const rowCount = await page.locator('.tabulator-row').count().catch(() => 0);
    const domRows = bodyRowCount > 0 ? bodyRowCount : rowCount;
    if (domRows > jobCount) jobCount = domRows;

    if (tabulatorTotal > 0) log('[Teal unlinked-report] Total from Tabulator (getDataCount): ' + tabulatorTotal);
    if (apiTotalCount > 0) log('[Teal unlinked-report] Total from API (total count): ' + apiTotalCount);
    if (jobsFromApi.length > 0) log('[Teal unlinked-report] Jobs from API (items captured): ' + jobsFromApi.length);
    if (totalFromPage > 0) log('[Teal unlinked-report] Total from page text: ' + totalFromPage);
    if (domRows > 0) log('[Teal unlinked-report] Rows visible in table: ' + domRows);

    log('');
    log('--- Список вакансий (https://app.tealhq.com/job-tracker) ---');
    log('Всего вакансий: ' + jobCount);
    if (jobsList.length > 0) {
      const withDetails = jobsList.filter((j) => j.position || j.company).length;
      log('Полный список: ' + listJsonPath + ' (' + jobsList.length + ' записей, из них ' + withDetails + ' с названием позиции/компании)');
      log('Тот же список в Markdown: ' + listMdPath);
    }
    const usedUiCounts = uiStatusCounts.bookmarked != null || uiStatusCounts.applied != null || uiStatusCounts.interviewing != null;
    if (tabulatorTotal > 0 || usedUiCounts || Object.keys(statusCounts).length > 0) {
      if (usedUiCounts) log('(как на странице: вкладки фильтра по статусу)');
      else if (tabulatorTotal > 0 && tabulatorTotal < jobCount) log('(по ' + tabulatorTotal + ' вакансиям, проскролленным в таблице)');
      log('Bookmarked: ' + bookmarked);
      log('Applied: ' + applied);
      log('Interviewing: ' + interviewing);
      if (!usedUiCounts) {
        const otherKeys = Object.keys(statusCounts).filter((k) => k !== 'bookmarked' && k !== 'applied' && k !== 'interviewing' && k !== 'other');
        for (const k of otherKeys) {
          if (statusCounts[k] > 0) log(k + ': ' + statusCounts[k]);
        }
        if (statusCounts.other > 0) log('Other: ' + statusCounts.other);
      }
    }
    log('');

    await context.close();
  } catch (err) {
    log('Error: ' + (err.message || err));
    if (context) await context.close().catch(() => {});
    process.exit(1);
  }
}

main();
