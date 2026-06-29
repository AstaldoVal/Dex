#!/usr/bin/env node
/**
 * Удаляет в Teal Job Tracker вакансии со статусом Bookmarked, у которых дата добавления
 * строго раньше заданной границы (по умолчанию: до 1 марта 2026).
 *
 * Usage:
 *   node teal-delete-bookmarked-jobs-before-date.cjs [--before YYYY-MM-DD] [--dry-run]
 *   npm run job-search:teal-delete-bookmarked-before-date -- [--before 2026-03-01] [--dry-run]
 *
 * Default --before: 2026-03-01 (удаляются bookmarked с датой добавления 2026-02-28 и раньше).
 * Требуется залогиненный Teal в Chrome (тот же профиль, что у других Teal-скриптов).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(VAULT, '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { launchTealContext, getTealProfileCandidates, isProfileInUseError } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin, isTealAuthenticated } = require('./teal-login-helper.cjs');

loadTealEnv(VAULT);

function log(msg) {
  console.log(typeof msg === 'string' ? msg : String(msg));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const JOB_TRACKER_URL = 'https://app.tealhq.com/job-tracker';

/** ISO date string YYYY-MM-DD in UTC, or null */
function dateToYyyyMmDdUtc(isoOrMs) {
  if (isoOrMs == null) return null;
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractCreatedRaw(job) {
  if (!job || typeof job !== 'object') return null;
  const a = job.attributes && typeof job.attributes === 'object' ? job.attributes : null;
  return (
    job.created_at ||
    job.date_added ||
    job.createdAt ||
    job.added_at ||
    job.dateAdded ||
    job.inserted_at ||
    (a &&
      (a.added_at ||
        a.created_at ||
        a.createdAt ||
        a.date_added ||
        a.inserted_at)) ||
    null
  );
}

function extractStatusRaw(job) {
  if (!job || typeof job !== 'object') return '';
  const a = job.attributes && typeof job.attributes === 'object' ? job.attributes : null;
  const s =
    job.status ||
    job.state ||
    job.status_name ||
    job.statusName ||
    job.application_status ||
    job.stage ||
    (a &&
      (a.status ||
        a.state ||
        a.application_status ||
        a.status_name ||
        a.stage_name ||
        a.pipeline_stage ||
        a.stage ||
        a.job_status ||
        a.application_stage)) ||
    '';
  const str = String(s).trim().toLowerCase();
  if (!str) return '';
  if (/^\d+$/.test(str)) return str;
  return str.replace(/\s+/g, ' ');
}

const TEAL_API_DELETE_URLS = (jobId) => [
  `/api/v1/user_job_posts/${jobId}`,
  `https://app.tealhq.com/api/v1/user_job_posts/${jobId}`
];

/**
 * Prefer JSON:API DELETE after loading job page (session + optional Bearer from network).
 * Fallback: job detail overflow menu.
 */
async function deleteUserJobPost(page, jobId) {
  const url = `https://app.tealhq.com/job-tracker/${jobId}`;
  let capturedAuth = null;
  const onReq = (req) => {
    try {
      const u = req.url();
      if (!u.includes('app.tealhq.com') || !u.includes('/api/')) return;
      const h = req.headers();
      const a = h['authorization'] || h['Authorization'];
      if (a && String(a).length > 12) capturedAuth = a;
    } catch (_) {}
  };
  page.on('request', onReq);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  page.off('request', onReq);

  for (const apiUrl of TEAL_API_DELETE_URLS(jobId)) {
    try {
      const abs = apiUrl.startsWith('http') ? apiUrl : `https://app.tealhq.com${apiUrl}`;
      let st = 0;
      if (apiUrl.startsWith('/')) {
        const apiResult = await page.evaluate(
          async ({ path, auth }) => {
            const csrf =
              document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
              document.querySelector('meta[name="csrf-token"]')?.content ||
              '';
            const headers = {
              Accept: 'application/vnd.api+json',
              'Content-Type': 'application/vnd.api+json',
              'X-Requested-With': 'XMLHttpRequest'
            };
            if (csrf) headers['X-CSRF-Token'] = csrf;
            if (auth) headers['Authorization'] = auth;
            const r = await fetch(path, {
              method: 'DELETE',
              credentials: 'include',
              headers
            });
            const text = await r.text();
            return { status: r.status, body: text.slice(0, 400) };
          },
          { path: apiUrl, auth: capturedAuth || '' }
        );
        st = apiResult.status;
        if (st !== 204 && st !== 200 && st !== 202) {
          log(
            '[Teal delete bookmarked] API DELETE ' +
              apiUrl +
              ' -> HTTP ' +
              st +
              (apiResult.body ? ' ' + apiResult.body.replace(/\s+/g, ' ').slice(0, 120) : '')
          );
        }
      } else {
        const hdr = {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json'
        };
        if (capturedAuth) hdr.Authorization = capturedAuth;
        const res = await page.request.delete(abs, { headers: hdr });
        st = res.status();
        if (st !== 204 && st !== 200 && st !== 202) {
          log('[Teal delete bookmarked] API DELETE ' + abs + ' -> HTTP ' + st);
        }
      }
      if (st === 204 || st === 200 || st === 202) return { ok: true, method: 'api' };
      if (st === 404) continue;
    } catch (e) {
      log('[Teal delete bookmarked] API DELETE error: ' + (e && e.message ? e.message : String(e)));
    }
  }

  const menuCandidates = [
    page.locator('#archiveDropdown, button:has-text("Close Job")').first(),
    page.locator('button[aria-label="Job Menu"]'),
    page.locator('button[aria-label="Job menu"]'),
    page.locator('button[aria-label*="Open menu" i]'),
    page.getByRole('button', { name: /^(Open menu|Menu|More)$/i }),
    page.locator('header button[aria-haspopup="menu"]').first(),
    page.locator('[class*="job"] button[aria-label*="menu" i]').first()
  ];
  let opened = false;
  for (const loc of menuCandidates) {
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
      await loc.first().click();
      opened = true;
      break;
    }
  }
  if (!opened) {
    const kebab = page.locator('button').filter({ has: page.locator('svg') }).last();
    if ((await kebab.count()) > 0) {
      await kebab.click();
      opened = true;
    }
  }
  if (!opened) return { ok: false, reason: 'menu_button' };
  await sleep(1200);

  const menuRoot = page.locator('[role="menu"]:visible').last();
  const strategies = [
    () => page.locator('.ant-dropdown-menu-item.delete-job-btn').first(),
    () => page.locator('.ant-dropdown-menu-item').filter({ hasText: /delete job/i }).first(),
    () => page.getByRole('menuitem', { name: /delete/i }).first(),
    () => menuRoot.getByRole('menuitem', { name: /delete/i }).first(),
    () => page.getByText(/delete\s+job/i).first(),
    () =>
      page
        .locator('[role="menuitem"], [role="option"]')
        .filter({ hasText: /delete|remove/i })
        .first(),
    () => page.locator('[data-radix-collection-item]').filter({ hasText: /delete/i }).first(),
    () => menuRoot.locator('button, div, span, a').filter({ hasText: /^Delete/i }).first(),
    () => page.getByText(/^Delete$/i).first()
  ];
  let clicked = false;
  for (const make of strategies) {
    const deleteItem = make();
    if ((await deleteItem.count()) === 0) continue;
    const el = deleteItem.first();
    if (!(await el.isVisible().catch(() => false))) continue;
    try {
      await el.click({ timeout: 5000 });
      clicked = true;
      break;
    } catch (_) {
      /* try next strategy */
    }
  }
  if (!clicked) {
    // New Teal UI may hide deletion inside "Edit job post information" modal.
    const editButton = page
      .locator('button[aria-label="Edit job post information"], button[aria-label*="Edit job" i]')
      .first();
    if ((await editButton.count()) > 0 && (await editButton.isVisible().catch(() => false))) {
      await editButton.click().catch(() => {});
      await sleep(800);
      const dialog = page.locator('[role="dialog"]:visible').last();
      const modalDeleteStrategies = [
        () => dialog.getByRole('button', { name: /delete job|delete/i }).first(),
        () => dialog.locator('button').filter({ hasText: /delete job|delete/i }).first(),
        () => page.getByRole('button', { name: /delete job|delete/i }).first()
      ];
      for (const make of modalDeleteStrategies) {
        const el = make();
        if ((await el.count()) === 0) continue;
        if (!(await el.first().isVisible().catch(() => false))) continue;
        try {
          await el.first().click({ timeout: 5000 });
          clicked = true;
          break;
        } catch (_) {
          /* try next strategy */
        }
      }
    }
  }
  if (!clicked) {
    try {
      const debugPath = path.join(TEAL_DIR, `teal-delete-bookmarked-detail-${jobId}.html`);
      fs.writeFileSync(debugPath, await page.content(), 'utf8');
      log('[Teal delete bookmarked] Saved detail DOM to ' + debugPath);
    } catch (_) {}
    await page.keyboard.press('Escape');
    return { ok: false, reason: 'delete_menuitem' };
  }
  await sleep(600);

  const confirmButton = page.locator('button').filter({ hasText: /Delete|Remove|Confirm/i }).first();
  if ((await confirmButton.count()) > 0 && (await confirmButton.isVisible().catch(() => false))) {
    await confirmButton.click().catch(() => {});
    await sleep(1200);
  }
  return { ok: true, method: 'ui' };
}

/** Teal UI column "Bookmarked" — обычно bookmarked / bookmark в API. */
function isBookmarkedStatus(s) {
  const t = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return t === 'bookmarked' || t === 'bookmark';
}

async function main() {
  ensureDirs();
  const argv = process.argv.slice(2);
  let beforeDate = '2026-03-01';
  let dryRun = false;
  let dumpSample = false;
  let limit = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--before' && argv[i + 1]) {
      beforeDate = argv[i + 1].trim();
      i++;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--dump-sample') {
      dumpSample = true;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[i + 1], 10) || 0);
      i++;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    log('Invalid --before. Use YYYY-MM-DD, e.g. 2026-03-01');
    process.exit(1);
  }

  if (!getTealProfileCandidates().length) {
    log('No Chrome profile found. Set TEAL_CHROME_PROFILE or use default Chrome.');
    process.exit(1);
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    log('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  let context;
  try {
    const result = await launchTealContext(playwright);
    context = result.context;
    log('[Teal delete bookmarked] Using profile: ' + result.profileDir);
  } catch (e) {
    if (isProfileInUseError(e)) {
      log('Chrome profile is in use. Close Chrome (or the other Teal window) and run again.');
    } else {
      log('Launch error: ' + (e && e.message ? e.message : String(e)));
    }
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());

  /** Видимый прогресс в вкладке + баннер (иначе кажется, что браузер «висит» на networkidle / длинных sleep). */
  async function uiProgress(line) {
    const full = 'Dex Teal delete: ' + line;
    log('[Teal delete bookmarked] ' + line);
    try {
      await page.evaluate((title) => {
        document.title = title;
        let el = document.getElementById('dex-teal-delete-banner');
        if (!el && document.body) {
          el = document.createElement('div');
          el.id = 'dex-teal-delete-banner';
          el.setAttribute(
            'style',
            'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;color:#e2e8f0;padding:12px 16px;font:14px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:none;'
          );
          document.body.prepend(el);
        }
        if (el) el.textContent = title;
      }, full);
    } catch (_) {}
  }
  async function uiProgressClear() {
    try {
      await page.evaluate(() => {
        document.getElementById('dex-teal-delete-banner')?.remove();
      });
    } catch (_) {}
  }

  /** id -> { status, yyyyMmDd, title } */
  const jobMap = new Map();
  const mergeJob = (id, partial) => {
    if (!id) return;
    const prev = jobMap.get(id) || {};
    const next = { ...prev, id };
    if (partial.status != null && String(partial.status).trim() !== '') {
      next.status = String(partial.status).trim().toLowerCase();
    }
    if (partial.yyyyMmDd != null && String(partial.yyyyMmDd).trim() !== '') {
      next.yyyyMmDd = partial.yyyyMmDd;
    }
    if (partial.title != null && String(partial.title).trim() !== '') {
      next.title = String(partial.title).trim().slice(0, 200);
    }
    jobMap.set(id, next);
  };

  /** Status id -> name from JSON:API `included` (Teal stores status as relationship, not a string on the job). */
  const statusIdToName = new Map();
  let sampleDumped = false;
  /** Первый перехваченный URL списка (не DELETE и не GET одной записи по uuid) — для пагинации. */
  let capturedUserJobPostsListUrl = null;

  function isUserJobPostsCollectionUrl(url) {
    if (!url || !url.includes('user_job_posts')) return false;
    try {
      const pathOnly = new URL(url).pathname;
      return !/\/user_job_posts\/[a-f0-9-]{36}$/i.test(pathOnly);
    } catch (_) {
      return !/\/user_job_posts\/[a-f0-9-]{36}/i.test(url);
    }
  }

  function ingestJsonApiUserJobPostsPayload(json) {
    if (!json || typeof json !== 'object') return 0;
    for (const inc of json.included || []) {
      if (inc && inc.type === 'Status' && inc.id && inc.attributes && inc.attributes.name != null) {
        statusIdToName.set(inc.id, String(inc.attributes.name).trim().toLowerCase());
      }
    }
    let list = Array.isArray(json)
      ? json
      : json.jobs ||
        json.data ||
        json.items ||
        (json.results && json.results.data) ||
        (json.data && Array.isArray(json.data) ? json.data : json.data && json.data.jobs);
    if (!Array.isArray(list)) {
      list = Array.isArray(json.results) ? json.results : Array.isArray(json.data) ? json.data : [];
      if (list.length === 0 && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) list = [json.data];
    }
    if (!Array.isArray(list) || list.length === 0) return 0;
    const first = list[0];
    if (!first || (first.id == null && first.uuid == null && first.job_id == null)) return 0;
    let n = 0;
    for (const j of list) {
      const id = (j.id || j.uuid || j.job_id || '').toString();
      if (!id) continue;
      let status = extractStatusRaw(j);
      const sid = j.relationships && j.relationships.status && j.relationships.status.data && j.relationships.status.data.id;
      if (sid && statusIdToName.has(sid)) status = statusIdToName.get(sid);
      const raw = extractCreatedRaw(j.attributes ? { ...j, ...j.attributes } : j);
      const yyyyMmDd = raw ? dateToYyyyMmDdUtc(raw) : null;
      const title = (j.title || j.job_title || j.name || j.role || (j.attributes && (j.attributes.title || j.attributes.role)) || '')
        .toString()
        .trim()
        .slice(0, 200);
      mergeJob(id, {
        status: status || undefined,
        yyyyMmDd: yyyyMmDd || undefined,
        title: title || undefined
      });
      n++;
    }
    return n;
  }

  /** Same list extraction as teal-unlinked-resumes-report (user_job_posts, JSON:API). */
  const responseHandler = async (response) => {
    const url = response.url();
    if (!url.includes('tealhq')) return;
    try {
      const json = await response.json().catch(() => null);
      if (!json) return;
      if (isUserJobPostsCollectionUrl(url) && !capturedUserJobPostsListUrl) {
        capturedUserJobPostsListUrl = url;
      }
      if (dumpSample && !sampleDumped && url.includes('user_job_posts')) {
        sampleDumped = true;
        try {
          const p = path.join(TEAL_DIR, 'teal-user-job-post-sample.json');
          fs.writeFileSync(p, JSON.stringify(json, null, 2).slice(0, 150000), 'utf8');
          log('[Teal delete bookmarked] Wrote API sample to ' + p);
        } catch (_) {}
      }
      if (!isUserJobPostsCollectionUrl(url)) return;
      ingestJsonApiUserJobPostsPayload(json);
    } catch (_) {}
  };
  page.on('response', responseHandler);

  async function fetchAllUserJobPostPagesViaApi() {
    await uiProgress('Загружаю список вакансий через API (страницы)…');
    let baseUrl = capturedUserJobPostsListUrl;
    if (!baseUrl) {
      baseUrl = 'https://app.tealhq.com/api/v1/user_job_posts?per_page=100&page=1';
      log('[Teal delete bookmarked] No user_job_posts list URL captured from network; using default: ' + baseUrl);
    } else {
      log('[Teal delete bookmarked] Paginating API from captured URL (first page params preserved)');
    }
    let totalPages = 1;
    let mergedTotal = 0;
    for (let pageNum = 1; pageNum <= totalPages && pageNum <= 500; pageNum++) {
      await uiProgress('API: страница ' + pageNum + (totalPages > 1 ? ' из ~' + totalPages : '') + '…');
      let requestUrl;
      try {
        const u = new URL(baseUrl);
        u.searchParams.set('page', String(pageNum));
        if (!u.searchParams.has('per_page')) u.searchParams.set('per_page', '100');
        requestUrl = u.toString();
      } catch (_) {
        requestUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'page=' + pageNum + '&per_page=100';
      }
      let json;
      try {
        json = await page.evaluate(async (u) => {
          const r = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
          const text = await r.text();
          if (!r.ok) return { __httpError: r.status, __body: text.slice(0, 200) };
          try {
            return JSON.parse(text);
          } catch (_) {
            return { __parseError: true, __body: text.slice(0, 200) };
          }
        }, requestUrl);
      } catch (e) {
        log('[Teal delete bookmarked] API fetch failed page ' + pageNum + ': ' + (e.message || '').slice(0, 120));
        break;
      }
      if (json && json.__httpError) {
        log('[Teal delete bookmarked] API page ' + pageNum + ' HTTP ' + json.__httpError);
        break;
      }
      if (json && json.__parseError) {
        log('[Teal delete bookmarked] API page ' + pageNum + ' not JSON');
        break;
      }
      if (!json) break;
      const n = ingestJsonApiUserJobPostsPayload(json);
      mergedTotal += n;
      const pag = json.meta && json.meta.pagination;
      if (pag && typeof pag.total_pages === 'number') {
        totalPages = Math.max(1, pag.total_pages);
      }
      log('[Teal delete bookmarked] API page ' + pageNum + '/' + totalPages + ': merged ' + n + ' job(s) (running total rows ' + mergedTotal + ')');
      if (!pag && (!json.data || !json.data.length)) break;
      if (pag && pag.next_page == null && pageNum >= totalPages) break;
      if (n === 0 && pageNum > 1) break;
    }
    log('[Teal delete bookmarked] API pagination done; jobMap size: ' + jobMap.size);
  }

  log('[Teal delete bookmarked] Opening job tracker…');
  await uiProgress('Открываю Job Tracker…');
  await page.goto(JOB_TRACKER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  const u = page.url();
  if (u.includes('sign-in') || u.includes('sign-up') || u.includes('/login') || !isTealAuthenticated(page)) {
    log('[Teal delete bookmarked] Session missing; logging in …');
    await uiProgress('Вход в Teal…');
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(JOB_TRACKER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
  }
  await Promise.race([
    page.waitForSelector('button:has-text("Add a new job"), button:has-text("Add a New Job")', { state: 'visible', timeout: 30000 }),
    page.getByPlaceholder(/Filter/i).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  ]).catch(() => {});
  await uiProgress('Жду интерфейс (без networkidle — он часто «висит» на SPA)…');
  await sleep(3000);

  try {
    await page.waitForResponse((r) => r.url().includes('user_job_posts') && isUserJobPostsCollectionUrl(r.url()), { timeout: 20000 });
  } catch (_) {}
  await sleep(1500);

  /** Показать только Bookmarked в пайплайне — подгружает нужный срез в сети. */
  try {
    await uiProgress('Фильтр Bookmarked…');
    const bookmarkedFilter = page
      .locator('button, a, [role="button"], [role="tab"], .ant-tabs-tab, [class*="pipeline"], [class*="stage"]')
      .filter({ hasText: /^Bookmarked(\s|:|\(|$)/i })
      .first();
    if ((await bookmarkedFilter.count()) > 0) {
      await bookmarkedFilter.click({ timeout: 8000 });
      log('[Teal delete bookmarked] Clicked Bookmarked pipeline filter');
      await sleep(2000);
    }
  } catch (e) {
    log('[Teal delete bookmarked] Bookmarked filter not clicked (continuing with full list): ' + (e.message || '').slice(0, 60));
  }

  await fetchAllUserJobPostPagesViaApi();

  await uiProgress('Догружаю таблицу (если есть) для сверки с DOM…');
  try {
    await Promise.race([
      page.waitForSelector('.job-tracker-table.tabulator .tabulator-row, .tabulator[role="grid"] .tabulator-row, a[href*="/job-tracker/"]', { state: 'visible', timeout: 20000 }),
      page.waitForFunction(() => document.querySelectorAll('a[href*="/job-tracker/"]').length > 0, null, { timeout: 20000, polling: 500 })
    ]);
  } catch (e) {
    log('[Teal delete bookmarked] List UI not ready (продолжаем по API): ' + (e.message || '').slice(0, 80));
    try {
      const debugPath = path.join(TEAL_DIR, 'teal-delete-bookmarked-debug.html');
      fs.writeFileSync(debugPath, await page.content(), 'utf8');
      log('[Teal delete bookmarked] Saved DOM to ' + debugPath);
    } catch (_) {}
  }
  await sleep(1500);

  log('[Teal delete bookmarked] Jobs captured from API (all pages) + DOM merge base: ' + jobMap.size);

  {
    const byStatus = new Map();
    let noStatus = 0;
    let noDate = 0;
    for (const [, info] of jobMap) {
      const st = (info.status || '').trim() || '(no status)';
      if (!(info.status || '').trim()) noStatus++;
      if (!info.yyyyMmDd) noDate++;
      byStatus.set(st, (byStatus.get(st) || 0) + 1);
    }
    const top = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    log(
      '[Teal delete bookmarked] Status histogram (top 25): ' +
        top.map(([k, v]) => k + '=' + v).join(', ')
    );
    log('[Teal delete bookmarked] Rows without status field: ' + noStatus + ', without date: ' + noDate);
  }

  const tabulatorRowCount = await page.locator('.tabulator-tablebody .tabulator-row').count().catch(() => 0);
  const scrollIters = tabulatorRowCount > 0 ? 45 : 8;
  await uiProgress('Прокрутка таблицы для DOM (' + scrollIters + ' шагов)…');
  for (let s = 0; s < scrollIters; s++) {
    if (s % 10 === 0) await uiProgress('Прокрутка ' + (s + 1) + '/' + scrollIters + '…');
    await page.evaluate(() => {
      const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
      if (grid) {
        const body = grid.querySelector('.tabulator-tablebody');
        if (body) {
          body.scrollTop = body.scrollHeight;
          if (body.scrollBy) body.scrollBy(0, 400);
        }
      }
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
    });
    await sleep(280);
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

  const rowsFromDom = await page
    .evaluate(() => {
      const jobLinkRe = /job-tracker\/([a-f0-9-]{36})/i;
      const result = [];
      const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
      const body = grid ? grid.querySelector('.tabulator-tablebody') : null;
      const rows = (body || grid) ? (body || grid).querySelectorAll('.tabulator-row') : [];
      const dateFieldNames = [
        'dateAdded',
        'createdAt',
        'created_at',
        'dateSaved',
        'datesaved',
        'date_added',
        'savedAt',
        'appliedDate',
        'updatedAt',
        'date'
      ];
      function parseVisibleDate(text) {
        if (!text) return null;
        const t = String(text).trim();
        const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
        if (slash) {
          const mm = String(slash[1]).padStart(2, '0');
          const dd = String(slash[2]).padStart(2, '0');
          return `${slash[3]}-${mm}-${dd}`;
        }
        const dMatch = t.match(/(\w{3})\s+(\d{1,2}),?\s*(202\d)/i);
        if (dMatch && dMatch[3]) {
          const mon = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
          if (dMatch[1].length >= 3 && mon[dMatch[1].slice(0, 3)]) {
            const mm = mon[dMatch[1].slice(0, 3)];
            const dd = String(dMatch[2]).padStart(2, '0');
            return `${dMatch[3]}-${mm}-${dd}`;
          }
        }
        return null;
      }
      for (const row of rows) {
        if (row.closest && row.closest('.tabulator-header')) continue;
        const link = row.querySelector('a[href*="/job-tracker/"]');
        if (!link) continue;
        const href = (link.getAttribute('href') || '').trim();
        const m = href.match(jobLinkRe);
        if (!m) continue;
        let status = '';
        let yyyyMmDd = null;
        const cells = row.querySelectorAll('.tabulator-cell[tabulator-field], [role="gridcell"][tabulator-field]');
        for (const cell of cells) {
          const field = (cell.getAttribute('tabulator-field') || '').trim();
          const text = (cell.textContent || '').trim();
          const textLower = text.toLowerCase();
          const fieldLower = field.toLowerCase();
          if (field === 'statusname' || field === 'status' || fieldLower.includes('status')) {
            if (/^(bookmarked|applied|interviewing|saved|offered|rejected|archived|declined|no response)$/.test(textLower)) status = textLower;
          }
          if (dateFieldNames.some((f) => fieldLower.includes(f.toLowerCase()))) {
            const parsed = parseVisibleDate(text);
            if (parsed) yyyyMmDd = parsed;
          }
        }
        for (const cell of cells) {
          const text = (cell.textContent || '').trim();
          const textLower = text.toLowerCase();
          if (!status && /^(bookmarked|applied|interviewing|saved|offered|rejected|archived|declined|no response)$/.test(textLower)) status = textLower;
          if (!yyyyMmDd) {
            const parsed = parseVisibleDate(text);
            if (parsed) yyyyMmDd = parsed;
          }
        }
        result.push({
          id: m[1],
          title: (link.textContent || '').trim().slice(0, 200),
          statusDom: status,
          yyyyMmDdDom: yyyyMmDd
        });
      }
      return result;
    })
    .catch(() => []);

  log('[Teal delete bookmarked] DOM rows parsed: ' + rowsFromDom.length);

  for (const r of rowsFromDom) {
    const prev = jobMap.get(r.id) || {};
    const domStatus = (r.statusDom && String(r.statusDom).trim()) ? String(r.statusDom).trim().toLowerCase() : '';
    const domDate = r.yyyyMmDdDom && String(r.yyyyMmDdDom).trim() ? String(r.yyyyMmDdDom).trim() : '';
    mergeJob(r.id, {
      status: domStatus || prev.status || undefined,
      yyyyMmDd: domDate || prev.yyyyMmDd || undefined,
      title: (r.title && r.title.trim()) || prev.title || undefined
    });
  }

  const toDelete = [];
  for (const [id, info] of jobMap) {
    if (!isBookmarkedStatus(info.status)) continue;
    const d = info.yyyyMmDd;
    if (!d) {
      log('[Teal delete bookmarked] Skip (no date): ' + (info.title || id).slice(0, 55) + ' — укажите дату в Teal или дождитесь загрузки API');
      continue;
    }
    if (d >= beforeDate) continue;
    toDelete.push({ id, title: info.title || id, yyyyMmDd: d });
  }

  log('[Teal delete bookmarked] Cutoff: delete Bookmarked jobs with date added < ' + beforeDate + ' (strict)');
  log('[Teal delete bookmarked] Candidates: ' + toDelete.length + (dryRun ? ' (dry-run, no deletes)' : ''));
  await uiProgress('Кандидатов на удаление: ' + toDelete.length + (dryRun ? ' (dry-run)' : ''));

  if (toDelete.length === 0) {
    log('[Teal delete bookmarked] Nothing to delete.');
    await uiProgressClear();
    await context.close();
    return;
  }

  for (const j of toDelete.slice(0, 30)) {
    log('  - ' + j.yyyyMmDd + ' | ' + j.title.slice(0, 70));
  }
  if (toDelete.length > 30) log('  … +' + (toDelete.length - 30) + ' more');

  if (limit != null && toDelete.length > limit) {
    log('[Teal delete bookmarked] --limit ' + limit + ': processing first ' + limit + ' only.');
    toDelete.splice(limit);
  }

  if (dryRun) {
    log('[Teal delete bookmarked] Dry-run finished.');
    await uiProgressClear();
    await context.close();
    return;
  }

  let deleted = 0;
  let idx = 0;
  for (const job of toDelete) {
    idx++;
    const label = (job.title || job.id).slice(0, 55);
    await uiProgress('Удаление ' + idx + '/' + toDelete.length + ': ' + label.slice(0, 42));
    log('[Teal delete bookmarked] Deleting via job page: ' + label + ' …');
    const result = await deleteUserJobPost(page, job.id);
    if (result.ok) {
      deleted++;
      log('[Teal delete bookmarked] Deleted ' + deleted + '/' + toDelete.length + ': ' + label);
    } else {
      log('[Teal delete bookmarked] Failed (' + result.reason + '): ' + job.id + ' — ' + label);
    }
  }

  log('[Teal delete bookmarked] Done. Deleted ' + deleted + ' of ' + toDelete.length + ' job(s).');
  await uiProgressClear();
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
