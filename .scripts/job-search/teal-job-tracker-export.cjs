#!/usr/bin/env node
/**
 * Экспорт Job Tracker из Teal в JSON (источник правды по стадии воронки в Teal).
 * Забирает все страницы user_job_posts через сессию браузера (как teal-delete-bookmarked).
 *
 * Выход:
 *   00-Inbox/Job_Search/teal/teal-job-tracker-export.json  — вакансии + статус + title/company/url/linkedin_job_id
 *   00-Inbox/Job_Search/teal/teal-dex-sync-suggestions.json — при --suggest-dex: сопоставление с applications-tracker.json
 *
 * Usage:
 *   node teal-job-tracker-export.cjs
 *   node teal-job-tracker-export.cjs --suggest-dex
 *   node teal-job-tracker-export.cjs --apply-dex   # обновляет статусы в tracker только при совпадении по LinkedIn jobId
 *   node teal-job-tracker-export.cjs --strict-count # exit 1 если rows.length !== api total_count (TEAL_EXPORT_STRICT_COUNT=1)
 *   node teal-job-tracker-export.cjs --keep-since  # не удалять since= из URL (по умолчанию since убирается — иначе API даёт «дельту», не весь трекер)
 *   node teal-job-tracker-export.cjs --all-stages   # не кликать «Bookmarked» в пайплайне (весь трекер по умолчанию в UI)
 *   node teal-job-tracker-export.cjs --debug-urls   # все запросы user_job_posts → teal/teal-export-user-job-posts-urls.log
 *   node teal-job-tracker-export.cjs --status-filter-only  # только API status_teal=bookmarked (без среза по строкам таблицы как в колонке)
 *   node teal-job-tracker-export.cjs --include-closed-states # принудительно включить closed статусы (rejected/declined/i_withdrew/...)
 *   npm run job-search:teal-tracker-export -- [--suggest-dex|--apply-dex|--strict-count|--keep-since|--all-stages|--debug-urls|--status-filter-only|--include-closed-states]
 *
 * По умолчанию скрипт кликает колонку **Bookmarked** в пайплайне Job Tracker и выгружает тот же срез, что и счётчик «Bookmarked» в Teal (чтобы совпадало с цифрой в колонке).
 *
 * Требуется: Playwright, залогиненный Teal (Chrome профиль), опционально TEAL_EMAIL/TEAL_PASSWORD в .env.
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

const { loadTracker, updateStatus, STATUSES } = require('./track-application.js');

const JOB_TRACKER_URL = 'https://app.tealhq.com/job-tracker';
const EXPORT_JSON = path.join(TEAL_DIR, 'teal-job-tracker-export.json');
const SUGGEST_JSON = path.join(TEAL_DIR, 'teal-dex-sync-suggestions.json');

function log(msg) {
  console.log(typeof msg === 'string' ? msg : String(msg));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractLinkedInJobIdFromUrl(u) {
  if (!u || typeof u !== 'string') return null;
  const m = u.match(/linkedin\.com\/(?:jobs\/view|comm\/jobs\/view)\/(\d+)/i);
  return m ? m[1] : null;
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

function includedKey(type, id) {
  return `${String(type || '').toLowerCase()}:${String(id)}`;
}

function buildIncludedMap(included) {
  const m = new Map();
  for (const inc of included || []) {
    if (inc && inc.type && inc.id != null) {
      m.set(includedKey(inc.type, inc.id), inc);
    }
  }
  return m;
}

/** Map Teal status string -> Dex status or null (null = не трогаем автоматически) */
function tealStatusToDex(tealStatus) {
  const s = String(tealStatus || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!s || s === 'other') return null;
  if (s.includes('interview')) return STATUSES.INTERVIEW;
  if (s === 'offered' || s === 'offer') return STATUSES.OFFER;
  if (s === 'rejected' || s === 'declined') return s === 'declined' ? STATUSES.WITHDRAWN : STATUSES.REJECTED;
  if (s === 'withdrawn' || s === 'archived') return STATUSES.WITHDRAWN;
  if (s === 'applied' || s === 'bookmarked' || s === 'saved' || s.includes('bookmark')) return STATUSES.APPLIED;
  if (s.includes('respond') || s === 'contacted') return STATUSES.RESPONDED;
  return null;
}

function normalizeMatchKey(role, company) {
  const a = String(role || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const b = String(company || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${a}|${b}`;
}

function isUserJobPostsCollectionUrl(url) {
  if (!url || !url.includes('user_job_posts')) return false;
  try {
    const pathOnly = new URL(url).pathname;
    return !/\/user_job_posts\/[a-f0-9-]{36}$/i.test(pathOnly);
  } catch (_) {
    return !/\/user_job_posts\/[a-f0-9-]{36}/i.test(url);
  }
}

/** SPA шлёт user_job_posts с per_page=1 (иногда 2–5) для превью — не подменять им основной список. */
function isPrimaryTableUserJobPostsUrl(urlStr) {
  if (!urlStr || !isUserJobPostsCollectionUrl(urlStr)) return false;
  try {
    const u = new URL(urlStr);
    const pp = u.searchParams.get('per_page');
    if (pp != null && Number(pp) <= 5) return false;
    return true;
  } catch (_) {
    return true;
  }
}

/**
 * Первый XHR из SPA часто содержит since=… (инкрементальная подгрузка). Для полного списка как в колонке трекера
 * параметр since нужно убрать, иначе meta.total_count маленький (например 1 вместо сотен).
 */
function normalizeTealUserJobPostsUrl(urlStr, { keepSince, includeClosedStates }) {
  if (!urlStr || keepSince) return urlStr;
  try {
    const u = new URL(urlStr);
    if (u.searchParams.has('since')) {
      u.searchParams.delete('since');
    }
    if (includeClosedStates) {
      const toDrop = [];
      for (const key of u.searchParams.keys()) {
        if (key === 'exclude_states' || key === 'exclude_states[]') toDrop.push(key);
      }
      for (const key of toDrop) u.searchParams.delete(key);
    }
    return u.toString();
  } catch (_) {}
  return urlStr;
}

function extractListFromPayload(json) {
  if (!json || typeof json !== 'object') return [];
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
  return Array.isArray(list) ? list : [];
}

/** Из meta JSON:API / Rails — total_pages, total_count для проверки полноты выгрузки */
function extractPagination(json) {
  if (!json || typeof json !== 'object') {
    return { totalPages: null, totalCount: null, perPage: 100, currentPage: null };
  }
  const m = json.meta || {};
  const p = m.pagination || m.page || {};
  let totalPages = p.total_pages ?? p.totalPages ?? m.total_pages ?? m.totalPages;
  let totalCount =
    p.total_count ??
    p.total ??
    m.total_count ??
    m.total ??
    m.count ??
    null;
  /** Teal resume.service: иногда общее число записей только в pagination.count (см. teal-unlinked-resumes-report.cjs). */
  if (totalCount == null && p && typeof p.count === 'number' && p.count > 0) {
    totalCount = p.count;
  }
  const perPage = Number(p.per_page ?? p.perPage ?? p.limit ?? 100) || 100;
  const currentPage = p.current_page ?? p.currentPage ?? p.page ?? m.page;
  if (totalPages == null && totalCount != null && perPage > 0) {
    totalPages = Math.max(1, Math.ceil(Number(totalCount) / perPage));
  }
  return {
    totalPages: totalPages != null ? Number(totalPages) : null,
    totalCount: totalCount != null ? Number(totalCount) : null,
    perPage,
    currentPage: currentPage != null ? Number(currentPage) : null
  };
}

/** Для сниффера: максимум из нескольких полей meta (разные ответы Teal кладут total в разные ключи). */
function extractTotalCountForSniff(json) {
  if (!json || typeof json !== 'object') return null;
  const pg = extractPagination(json);
  const m = json.meta;
  const p = m && m.pagination;
  const nums = [
    pg.totalCount,
    p && p.total_count,
    p && p.total,
    p && typeof p.count === 'number' ? p.count : null,
    m && m.total_count,
    m && m.total,
    m && typeof m.count === 'number' ? m.count : null
  ].filter((x) => typeof x === 'number' && !Number.isNaN(x) && x > 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/**
 * Число в подписи колонки «Bookmarked (N)» — короткие тексты табов/кнопок, без всего body (там лишние цифры).
 */
async function readUiBookmarkedCountHintFromPage(page) {
  try {
    const n = await page.evaluate(() => {
      const tryBookmarkedNum = (t) => {
        if (!t || typeof t !== 'string') return null;
        const s = t.replace(/\s+/g, ' ').trim();
        if (s.length > 220) return null;
        let m = s.match(/Bookmarked\s*\(?\s*(\d+)/i);
        if (m) return parseInt(m[1], 10);
        m = s.match(/(\d+)\s*[\n\r]?\s*Bookmarked/i);
        return m ? parseInt(m[1], 10) : null;
      };
      const tabs = document.querySelectorAll('[role="tablist"] [role="tab"]');
      for (const el of tabs) {
        const v = tryBookmarkedNum(el.textContent || '');
        if (v != null && v > 0 && v < 1000000) return v;
      }
      const nums = [];
      const selectors = [
        '[role="tab"]',
        '[class*="Column"]',
        '[class*="column"]',
        '[class*="pipeline"]',
        '[class*="Pipeline"]',
        '[class*="kanban"]',
        '[class*="stage"]',
        'button',
        'a',
        '[role="button"]',
        'span'
      ];
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            const v = tryBookmarkedNum(el.textContent || '');
            if (v != null && v > 0 && v < 1000000) nums.push(v);
          });
        } catch (_) {}
      }
      if (!nums.length) return null;
      const uniq = [...new Set(nums)];
      return uniq.length === 1 ? uniq[0] : Math.max(...uniq);
    });
    return n;
  } catch (_) {
    return null;
  }
}

/**
 * Собирает пары (url, total_count) из ответов коллекции user_job_posts — чтобы выбрать запрос колонки Bookmarked,
 * а не перезаписанный позже «полный» список (другой total_count).
 */
function attachUserJobPostsTotalSniffer(page, bucket) {
  const handler = async (response) => {
    try {
      const url = response.url();
      if (!url.includes('user_job_posts') || !isUserJobPostsCollectionUrl(url)) return;
      if (response.status() < 200 || response.status() >= 500) return;
      const txt = await response.text();
      let json;
      try {
        json = JSON.parse(txt);
      } catch (_) {
        return;
      }
      const totalCount = extractTotalCountForSniff(json);
      if (totalCount == null || totalCount < 1) return;
      bucket.push({ url, totalCount, at: Date.now() });
    } catch (_) {}
  };
  page.on('response', handler);
  return () => page.off('response', handler);
}

/**
 * Выбор URL коллекции user_job_posts из сниффера:
 * 1) Точное совпадение total_count с подписью колонки (редко бывает).
 * 2) Иначе URL с максимальным total_count (полный инвентарь) — для пересечения с UUID из DOM колонки Bookmarked.
 */
function pickSniffedListUrlForBookmarkedExport(sniffBucket, uiHint, { logFn, useMaxTotalAsSuperset }) {
  if (!sniffBucket.length) return { url: null, reason: 'empty' };
  const byUrl = new Map();
  for (const x of sniffBucket) {
    byUrl.set(x.url, x);
  }
  const uniq = [...byUrl.values()];
  const countsSorted = [...new Set(uniq.map((x) => x.totalCount))].sort((a, b) => a - b);

  if (uiHint != null) {
    const exact = uniq.find((x) => x.totalCount === uiHint);
    if (exact) {
      if (logFn) {
        logFn('[Teal export] Sniff: using list URL with total_count=' + uiHint + ' (exact match to Bookmarked label).');
      }
      return { url: exact.url, reason: 'exact_ui_hint' };
    }
  }

  if (useMaxTotalAsSuperset && uniq.length) {
    const maxEntry = uniq.reduce((a, b) => (b.totalCount > a.totalCount ? b : a));
    if (maxEntry && maxEntry.url) {
      if (logFn) {
        logFn(
          '[Teal export] Sniff: no exact total_count=' +
            (uiHint != null ? uiHint : '?') +
            '; using URL with max total_count=' +
            maxEntry.totalCount +
            ' (superset for DOM intersect; seen counts: ' +
            countsSorted.join(', ') +
            ').'
        );
      }
      return { url: maxEntry.url, reason: 'max_total_superset' };
    }
  }

  if (logFn) {
    logFn(
      '[Teal export] Sniff: no matching URL (seen total_count: ' +
        countsSorted.join(', ') +
        '). Keeping last captured list URL for pagination.'
    );
  }
  return { url: null, reason: 'no_match' };
}

/**
 * Kanban vs table: в колонке часто нет tabulator-строк — переключаемся на список (как в teal-delete-bookmarked).
 */
async function ensureTealJobTrackerTableListView(page) {
  const tryClick = async (locator) => {
    try {
      if ((await locator.count()) === 0) return false;
      await locator.first().click({ timeout: 5000 });
      await sleep(1800);
      return true;
    } catch (_) {
      return false;
    }
  };
  try {
    if (
      (await tryClick(page.getByRole('button', { name: /^(List|Table)$/i }))) ||
      (await tryClick(page.locator('[aria-label*="List" i]'))) ||
      (await tryClick(page.locator('[aria-label*="Table" i]'))) ||
      (await tryClick(page.locator('button').filter({ hasText: /^List$/i })))
    ) {
      log('[Teal export] Tried List/Table view toggle so job rows expose /job-tracker/ links.');
    }
  } catch (_) {}
}

/**
 * Виртуализированный Tabulator держит мало DOM-строк; при прокрутке появляются новые UUID.
 * Собираем id из строк таблицы (как teal-delete-bookmarked) и дублируем глобальным поиском ссылок.
 */
async function collectTabulatorUserJobPostIdsWhileScrolling(page, { uiHint }) {
  const ordered = [];
  const seen = new Set();
  let noNewRounds = 0;
  const maxIters = 360;
  const stableStop = 28;

  function pushUuid(id) {
    const x = String(id || '')
      .toLowerCase()
      .trim();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)) return false;
    if (seen.has(x)) return false;
    seen.add(x);
    ordered.push(x);
    return true;
  }

  for (let i = 0; i < maxIters; i++) {
    const batch = await page
      .evaluate(() => {
        const out = [];
        const uuidRe = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        const jobLinkRe = /\/job-tracker\/([a-f0-9-]{36})/i;

        const pushFromHref = (href) => {
          if (!href || typeof href !== 'string') return;
          const h = href.trim();
          if (/sign-in|sign-up|settings|help\/|preferences/i.test(h)) return;
          const m = h.match(jobLinkRe);
          if (m && uuidRe.test(m[1])) out.push(m[1].toLowerCase());
        };

        const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"], .tabulator');
        const body = grid ? grid.querySelector('.tabulator-tablebody') : null;
        const rowRoot = body || grid;
        if (rowRoot) {
          for (const row of rowRoot.querySelectorAll('.tabulator-row')) {
            if (row.closest && row.closest('.tabulator-header')) continue;
            const link = row.querySelector('a[href*="/job-tracker/"], a[href*="user_job_post"]');
            if (link) pushFromHref(link.getAttribute('href') || '');
          }
        }

        const hrefLooksLikeJobPost = (href) => {
          if (!href || typeof href !== 'string') return false;
          const h = href.trim();
          if (/sign-in|sign-up|settings|help\/|preferences/i.test(h)) return false;
          return (
            /\/job-tracker\//i.test(h) ||
            /user_job_post/i.test(h) ||
            (/tealhq\.com/i.test(h) && /[a-f0-9-]{36}/i.test(h))
          );
        };
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = (a.getAttribute('href') || '').trim();
          if (!hrefLooksLikeJobPost(href)) return;
          const m = href.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          if (m && uuidRe.test(m[1])) out.push(m[1].toLowerCase());
        });
        return out;
      })
      .catch(() => []);

    let added = 0;
    for (const id of batch) {
      if (pushUuid(id)) added++;
    }
    if (added === 0) noNewRounds++;
    else noNewRounds = 0;

    if (noNewRounds >= stableStop) break;
    if (uiHint != null && ordered.length >= uiHint) break;

    await page.evaluate(() => {
      try {
        window.scrollBy(0, 700);
      } catch (e) {}
      const grid = document.querySelector('.job-tracker-table.tabulator, .tabulator[role="grid"]');
      if (grid) {
        const body = grid.querySelector('.tabulator-tablebody');
        const el = body || grid;
        try {
          el.scrollTop = el.scrollHeight;
          if (el.scrollBy) el.scrollBy(0, 500);
        } catch (e) {}
      }
      const scrollables = document.querySelectorAll(
        '.tabulator-tablebody, .job-tracker-table, [class*="job-tracker"], [class*="JobTracker"], [class*="kanban"], [class*="pipeline"], [class*="board"], main'
      );
      scrollables.forEach((el) => {
        try {
          el.scrollTop = el.scrollHeight;
          el.scrollLeft = el.scrollWidth;
          if (el.scrollBy) el.scrollBy(0, 400);
        } catch (e) {}
      });
    });
    await sleep(450);

    if (ordered.length > 0 && i > 0 && i % 35 === 0) {
      log('[Teal export] DOM scroll: pass ' + i + ', unique job ids so far ' + ordered.length + (uiHint != null ? ' (UI hint ' + uiHint + ')' : ''));
    }
  }

  return ordered;
}

async function httpGetJson(reqCtx, url) {
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await reqCtx.get(url, {
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 120000
      });
      const status = res.status();
      const text = await res.text();
      if (status >= 400) {
        lastErr = new Error('HTTP ' + status + ': ' + text.slice(0, 400));
        if (status === 429 || status >= 500) {
          await sleep(1500 * attempt);
          continue;
        }
        throw lastErr;
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        lastErr = new Error('Not JSON: ' + text.slice(0, 200));
        throw lastErr;
      }
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        log('[Teal export] Retry ' + attempt + '/' + maxAttempts + ' after: ' + (e.message || e).slice(0, 80));
        await sleep(1200 * attempt);
      }
    }
  }
  throw lastErr;
}

async function main() {
  const argv = process.argv.slice(2);
  const suggestDex = argv.includes('--suggest-dex');
  const applyDex = argv.includes('--apply-dex');
  /** Если API отдал total_count, завершить процесс с кодом 1 при несовпадении числа строк (полная выгрузка) */
  const strictCount =
    argv.includes('--strict-count') || String(process.env.TEAL_EXPORT_STRICT_COUNT || '').toLowerCase() === '1';
  const keepSince =
    argv.includes('--keep-since') || String(process.env.TEAL_EXPORT_KEEP_SINCE || '').toLowerCase() === '1';
  /** По умолчанию кликаем Bookmarked в пайплайне — тот же срез, что колонка в UI (769 и т.д.). --all-stages = без клика. */
  const useBookmarkedColumn =
    !argv.includes('--all-stages') && String(process.env.TEAL_EXPORT_ALL_STAGES || '').toLowerCase() !== '1';
  const debugUrls = argv.includes('--debug-urls');
  /** Только фильтр status_teal=bookmarked по данным API; без сбора UUID из таблицы (колонка UI может дать другое число). */
  const statusFilterOnly = argv.includes('--status-filter-only');
  /** Включить закрытые статусы (убрать exclude_states и добавить include_states). */
  const includeClosedStates =
    argv.includes('--include-closed-states') ||
    String(process.env.TEAL_EXPORT_INCLUDE_CLOSED_STATES || '').toLowerCase() === '1';

  ensureDirs();
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
    log('[Teal export] Using profile: ' + result.profileDir);
  } catch (e) {
    if (isProfileInUseError(e)) {
      log('Chrome profile is in use. Close Chrome (or the other Teal window) and run again.');
    } else {
      log('Launch error: ' + (e && e.message ? e.message : String(e)));
    }
    process.exit(1);
  }

  const page = context.pages()[0] || (await context.newPage());

  /** Ответы коллекции user_job_posts с meta.total_count — чтобы не путать колонку Bookmarked с полным списком. */
  const sniffBucket = [];
  let sniffPickedExact = false;
  let bookmarkedListFromSniff = false;
  let detachUserJobPostsSniffer = () => {};
  if (useBookmarkedColumn && !statusFilterOnly) {
    detachUserJobPostsSniffer = attachUserJobPostsTotalSniffer(page, sniffBucket);
  }

  const debugAllUserJobPostsUrls = [];
  if (debugUrls) {
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('user_job_posts') && isUserJobPostsCollectionUrl(u)) {
        debugAllUserJobPostsUrls.push(u);
      }
    });
  }

  const statusIdToName = new Map();
  /** @type {Array<object>} */
  const rows = [];
  const seenIds = new Set();

  function ingestJsonApiUserJobPostsPayload(json) {
    if (!json || typeof json !== 'object') return 0;
    for (const inc of json.included || []) {
      if (inc && inc.type === 'Status' && inc.id && inc.attributes && inc.attributes.name != null) {
        statusIdToName.set(inc.id, String(inc.attributes.name).trim().toLowerCase());
      }
    }
    const includedMap = buildIncludedMap(json.included);
    const list = extractListFromPayload(json);
    if (list.length === 0) return 0;
    const first = list[0];
    if (!first || (first.id == null && first.uuid == null && first.job_id == null)) return 0;

    let n = 0;
    for (const j of list) {
      const id = (j.id || j.uuid || j.job_id || '').toString();
      if (!id || seenIds.has(id)) continue;

      let status = extractStatusRaw(j);
      const sid = j.relationships && j.relationships.status && j.relationships.status.data && j.relationships.status.data.id;
      if (sid && statusIdToName.has(sid)) status = statusIdToName.get(sid);

      const attrs = j.attributes && typeof j.attributes === 'object' ? j.attributes : {};
      let title = (
        attrs.title ||
        attrs.role_name ||
        attrs.job_title ||
        j.title ||
        j.job_title ||
        j.name ||
        j.role ||
        ''
      )
        .toString()
        .trim()
        .slice(0, 300);

      let company = (attrs.company_name || attrs.company || attrs.employer_name || j.company || j.company_name || j.organization || '')
        .toString()
        .trim()
        .slice(0, 200);

      const relJob = j.relationships && j.relationships.job && j.relationships.job.data;
      if ((!title || !company) && relJob && relJob.id) {
        const jobRes = includedMap.get(includedKey(relJob.type || 'Job', relJob.id));
        if (jobRes && jobRes.attributes) {
          const ja = jobRes.attributes;
          if (!title) title = (ja.title || ja.name || ja.role || '').toString().trim().slice(0, 300);
          if (!company) company = (ja.company_name || ja.company || '').toString().trim().slice(0, 200);
        }
      }

      const relCo = j.relationships && j.relationships.company && j.relationships.company.data;
      if (!company && relCo && relCo.id) {
        const co = includedMap.get(includedKey(relCo.type || 'Company', relCo.id));
        if (co && co.attributes && co.attributes.name) {
          company = String(co.attributes.name).trim().slice(0, 200);
        }
      }

      const urlCandidates = [
        attrs.url,
        attrs.job_url,
        attrs.linkedin_url,
        attrs.source_url,
        attrs.application_url,
        attrs.posting_url
      ].filter(Boolean);
      let jobUrl = '';
      for (const u of urlCandidates) {
        const s = String(u).trim();
        if (s.startsWith('http')) {
          jobUrl = s;
          break;
        }
      }
      let linkedinJobId = extractLinkedInJobIdFromUrl(jobUrl);
      if (!linkedinJobId) {
        const ext = attrs.external_job_id || attrs.linkedin_job_id || attrs.source_job_id;
        if (ext && /^\d+$/.test(String(ext).trim())) linkedinJobId = String(ext).trim();
      }

      const addedAt =
        attrs.added_at ||
        attrs.created_at ||
        attrs.createdAt ||
        attrs.date_added ||
        j.created_at ||
        null;

      let notesSnippet = '';
      const notesField = attrs.notes || attrs.note || attrs.comments || attrs.rejection_reason;
      if (notesField && typeof notesField === 'string') {
        notesSnippet = notesField.trim().slice(0, 500);
      }

      seenIds.add(id);
      rows.push({
        teal_user_job_post_id: id,
        status_teal: status || 'other',
        title: title || '',
        company: company || '',
        job_url: jobUrl || null,
        linkedin_job_id: linkedinJobId || null,
        added_at: addedAt || null,
        notes_snippet: notesSnippet || null,
        dex_status_suggestion: tealStatusToDex(status || 'other')
      });
      n++;
    }
    return n;
  }

  let capturedUserJobPostsListUrl = null;
  /** Последний XHR user_job_posts (часто совпадает с текущей колонкой/фильтром таблицы) */
  let lastUserJobPostsCollectionUrl = null;
  /** Bearer с resume.service.tealhq.com — без него API отвечает 401 (кук из storageState недостаточно) */
  let capturedAuthHeader = null;
  /** Только фиксируем URL коллекции (как в SPA Teal), без ingest — строки берём только из API-цикла ниже */
  const responseHandler = async (response) => {
    const url = response.url();
    if (!url.includes('tealhq') || !isUserJobPostsCollectionUrl(url)) return;
    if (!isPrimaryTableUserJobPostsUrl(url)) return;
    const isFirst = !capturedUserJobPostsListUrl;
    capturedUserJobPostsListUrl = url;
    lastUserJobPostsCollectionUrl = url;
    if (isFirst) {
      let q = '';
      try {
        q = new URL(url).search || '';
      } catch (_) {}
      log('[Teal export] Captured collection URL (same query as UI): ' + url.split('?')[0] + (q ? ' ?' + q.slice(0, 200) : ''));
    }
    if (!capturedAuthHeader && response.status() >= 200 && response.status() < 400) {
      try {
        const h = response.request().headers();
        const auth = h['authorization'] || h['Authorization'];
        if (auth && /^Bearer\s+/i.test(String(auth))) {
          capturedAuthHeader = auth;
          log('[Teal export] Captured Authorization: Bearer … (len ' + String(auth).length + ')');
        }
      } catch (_) {}
    }
  };
  page.on('response', responseHandler);
  /** Authorization с первого подходящего запроса; URL — всегда обновляем последним (таблица догружает фильтры). */
  const requestHandler = (request) => {
    const url = request.url();
    if (url.includes('user_job_posts') && isUserJobPostsCollectionUrl(url) && isPrimaryTableUserJobPostsUrl(url)) {
      lastUserJobPostsCollectionUrl = url;
    }
    if (capturedAuthHeader) return;
    if (!url.includes('user_job_posts') || !isUserJobPostsCollectionUrl(url)) return;
    try {
      const h = request.headers();
      const auth = h['authorization'] || h['Authorization'];
      if (auth && /^Bearer\s+/i.test(String(auth))) {
        capturedAuthHeader = auth;
        log('[Teal export] Captured Authorization from request event (len ' + String(auth).length + ')');
      }
    } catch (_) {}
  };
  page.on('request', requestHandler);

  log('[Teal export] Opening job tracker…');
  await page.goto(JOB_TRACKER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  const u = page.url();
  if (u.includes('sign-in') || u.includes('sign-up') || u.includes('/login') || !isTealAuthenticated(page)) {
    log('[Teal export] Session missing; logging in …');
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(JOB_TRACKER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
  }

  try {
    await page.waitForSelector('button:has-text("Add a new job"), button:has-text("Add a New Job"), .tabulator', {
      state: 'visible',
      timeout: 30000
    });
  } catch (_) {}
  await sleep(2000);

  try {
    const r = await page.waitForResponse(
      (resp) =>
        resp.url().includes('user_job_posts') &&
        isUserJobPostsCollectionUrl(resp.url()) &&
        resp.status() >= 200 &&
        resp.status() < 400,
      { timeout: 25000 }
    );
    if (!capturedAuthHeader) {
      const h = r.request().headers();
      const auth = h['authorization'] || h['Authorization'];
      if (auth && /^Bearer\s+/i.test(String(auth))) {
        capturedAuthHeader = auth;
        log('[Teal export] Authorization from waitForResponse (len ' + String(auth).length + ')');
      }
    }
  } catch (_) {
    log('[Teal export] WARN: timeout waiting for user_job_posts (UI may still load)');
  }

  if (useBookmarkedColumn) {
    log('[Teal export] Applying pipeline filter: Bookmarked (same slice as Teal column counter)…');
    const urlBeforeBm = lastUserJobPostsCollectionUrl;
    try {
      /** Имя вкладки часто «Bookmarked (769)», не только «Bookmarked». */
      let bookmarkedFilter = page.locator('[role="tablist"]').getByRole('tab', { name: /Bookmarked/i }).first();
      if ((await bookmarkedFilter.count()) === 0) {
        bookmarkedFilter = page
          .locator('button, a, [role="button"], [role="tab"], .ant-tabs-tab, [class*="pipeline"], [class*="stage"]')
          .filter({ hasText: /^Bookmarked(\s|:|\(|$)/i })
          .first();
      }
      if ((await bookmarkedFilter.count()) > 0) {
        await bookmarkedFilter.scrollIntoViewIfNeeded().catch(() => {});
        await bookmarkedFilter.click({ timeout: 15000, force: true });
        log('[Teal export] Clicked Bookmarked pipeline control (no waitForResponse; SPA may reuse tab).');
        await sleep(7000);
        const after = lastUserJobPostsCollectionUrl;
        if (after && after !== urlBeforeBm) {
          log('[Teal export] Collection URL updated after Bookmarked click.');
        } else if (after === urlBeforeBm) {
          log(
            '[Teal export] NOTE: user_job_posts URL unchanged after click (often already on Bookmarked). Using latest captured URL.'
          );
        }
        if (after) {
          try {
            const q = new URL(after).search || '';
            if (q) log('[Teal export] Latest query (truncated): ?' + q.slice(0, 320));
          } catch (_) {}
        }
      } else {
        log('[Teal export] WARN: Bookmarked control not found in DOM — using last network URL.');
        await sleep(4000);
      }
    } catch (e) {
      log('[Teal export] WARN: Bookmarked click failed: ' + (e.message || String(e)).slice(0, 160));
      await sleep(4000);
    }
    if (lastUserJobPostsCollectionUrl) {
      capturedUserJobPostsListUrl = lastUserJobPostsCollectionUrl;
    }
  } else {
    log('[Teal export] --all-stages: not clicking Bookmarked; using last user_job_posts after load.');
    await sleep(4000);
    if (lastUserJobPostsCollectionUrl) {
      capturedUserJobPostsListUrl = lastUserJobPostsCollectionUrl;
      let q = '';
      try {
        q = new URL(lastUserJobPostsCollectionUrl).search || '';
      } catch (_) {}
      log(
        '[Teal export] Using last user_job_posts URL (latest table query): ' +
          lastUserJobPostsCollectionUrl.split('?')[0] +
          (q ? ' ?' + q.slice(0, 220) : '')
      );
    }
  }

  if (debugUrls && debugAllUserJobPostsUrls.length) {
    const logPath = path.join(TEAL_DIR, 'teal-export-user-job-posts-urls.log');
    fs.writeFileSync(logPath, debugAllUserJobPostsUrls.join('\n'), 'utf8');
    log('[Teal export] --debug-urls: wrote ' + debugAllUserJobPostsUrls.length + ' URLs → ' + logPath);
    debugAllUserJobPostsUrls
      .filter((u) => /bookmark|bookmarked|pipeline|stage|included_states|exclude_states/i.test(u))
      .slice(-12)
      .forEach((u) => log('[Teal export]   …' + u.slice(Math.max(0, u.length - 200))));
  }

  /** Срез колонки Bookmarked: UUID из ссылок таблицы после скролла (виртуализация Tabulator). */
  let domOrderedBookmarkIds = [];
  let uiBookmarkedCountHint = null;

  if (useBookmarkedColumn && !statusFilterOnly) {
    try {
      uiBookmarkedCountHint = await readUiBookmarkedCountHintFromPage(page);
      if (uiBookmarkedCountHint != null) {
        log('[Teal export] UI hint: Bookmarked column label → ' + uiBookmarkedCountHint);
      }
    } catch (e) {
      log('[Teal export] Could not read Bookmarked (N) from tab UI: ' + (e.message || '').slice(0, 70));
    }
    await ensureTealJobTrackerTableListView(page);
    try {
      await page.waitForSelector(
        'a[href*="/job-tracker/"], a[href*="user_job_post"], a[href*="job-tracker"], .tabulator-row',
        { state: 'visible', timeout: 120000 }
      );
    } catch (e) {
      log('[Teal export] WARN: no job detail links visible for DOM UUID pass — ' + (e.message || '').slice(0, 80));
    }
    await sleep(600);
    log('[Teal export] Scrolling Tabulator to collect job post UUIDs (Bookmarked column rows)…');
    domOrderedBookmarkIds = await collectTabulatorUserJobPostIdsWhileScrolling(page, { uiHint: uiBookmarkedCountHint });
    log(
      '[Teal export] DOM slice: ' +
        domOrderedBookmarkIds.length +
        ' unique UUIDs from table links' +
        (uiBookmarkedCountHint != null ? ' (UI label ' + uiBookmarkedCountHint + ')' : '')
    );
  }

  detachUserJobPostsSniffer();
  if (useBookmarkedColumn && !statusFilterOnly && sniffBucket.length) {
    const uniqCounts = [...new Set(sniffBucket.map((x) => x.totalCount))].sort((a, b) => a - b);
    log('[Teal export] Sniff: user_job_posts total_count sample: ' + uniqCounts.slice(0, 12).join(', ') + (uniqCounts.length > 12 ? ' …' : ''));
    const picked = pickSniffedListUrlForBookmarkedExport(sniffBucket, uiBookmarkedCountHint, {
      logFn: log,
      useMaxTotalAsSuperset: true
    });
    if (picked.url) {
      capturedUserJobPostsListUrl = picked.url;
      lastUserJobPostsCollectionUrl = picked.url;
      if (picked.reason === 'exact_ui_hint') {
        bookmarkedListFromSniff = true;
        sniffPickedExact = true;
      }
    }
  }

  /**
   * Полная пагинация через Playwright APIRequestContext + storageState (те же куки, что у открытого Chrome).
   * page.evaluate(fetch) давал TypeError: Failed to fetch — не используем.
   */
  async function fetchAllUserJobPostPagesViaApi() {
    let baseUrl = capturedUserJobPostsListUrl;
    if (!baseUrl) {
      baseUrl = 'https://app.tealhq.com/api/v1/user_job_posts?per_page=100&page=1';
      log('[Teal export] No list URL captured from network; using default: ' + baseUrl);
    } else {
      const beforeNorm = baseUrl;
      baseUrl = normalizeTealUserJobPostsUrl(baseUrl, { keepSince, includeClosedStates });
      if (baseUrl !== beforeNorm) {
        log(
          '[Teal export] Normalized collection URL for full export' +
            (includeClosedStates ? ' (+include closed states)' : '') +
            '. Use --keep-since to keep Teal delta query.'
        );
      }
    }

    let totalPagesKnown = null;
    let totalCountKnown = null;
    let perPageEff = 100;
    let pageNum = 1;
    let stoppedReason = 'complete';

    const storageState = await context.storageState();
    const hdrs = {
      Accept: 'application/json',
      Referer: 'https://app.tealhq.com/job-tracker',
      'X-Requested-With': 'XMLHttpRequest'
    };
    if (!capturedAuthHeader) {
      log(
        '[Teal export] FATAL: Bearer token not captured from Teal network. Job tracker must load the jobs list (user_job_posts) in this session.'
      );
      stoppedReason = 'no_auth';
      log('[Teal export] Pagination stopped: ' + stoppedReason + '; unique jobs: ' + rows.length);
      return;
    }
    hdrs.Authorization = capturedAuthHeader;
    const reqCtx = await playwright.request.newContext({
      storageState,
      extraHTTPHeaders: hdrs
    });

    try {
      while (pageNum <= 2000) {
        let requestUrl;
        try {
          const urlObj = new URL(baseUrl);
          urlObj.searchParams.set('page', String(pageNum));
          /** SPA иногда шлёт per_page=1 (ленивая подгрузка); для полной выгрузки всегда 100. */
          urlObj.searchParams.set('per_page', '100');
          requestUrl = urlObj.toString();
        } catch (_) {
          requestUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'page=' + pageNum + '&per_page=100';
        }

        let json;
        try {
          json = await httpGetJson(reqCtx, requestUrl);
        } catch (e) {
          log('[Teal export] FATAL API GET failed page ' + pageNum + ': ' + (e.message || e));
          stoppedReason = 'http_error';
          break;
        }

        const pagInfo = extractPagination(json);
        if (pageNum === 1) {
          totalPagesKnown = pagInfo.totalPages;
          totalCountKnown = pagInfo.totalCount;
          perPageEff = pagInfo.perPage || 100;
          log(
            '[Teal export] API meta: total_count=' +
              (totalCountKnown != null ? totalCountKnown : '?') +
              ' total_pages=' +
              (totalPagesKnown != null ? totalPagesKnown : '?') +
              ' per_page=' +
              perPageEff
          );
        }

        const n = ingestJsonApiUserJobPostsPayload(json);
        const listLen = extractListFromPayload(json).length;

        log(
          '[Teal export] Page ' +
            pageNum +
            (totalPagesKnown != null ? '/' + totalPagesKnown : '') +
            ': +' +
            n +
            ' ingested, raw_items=' +
            listLen +
            ' cumulative_unique=' +
            rows.length
        );

        if (n === 0 && pageNum > 1) {
          stoppedReason = 'empty_page';
          break;
        }

        if (totalPagesKnown != null) {
          if (pageNum >= totalPagesKnown) break;
          pageNum++;
          continue;
        }

        // Нет meta.pagination — последняя страница: пусто или меньше per_page (в т.ч. единственная страница)
        if (listLen === 0) {
          stoppedReason = 'no_meta_empty_page';
          break;
        }
        if (listLen < perPageEff) {
          stoppedReason = 'no_meta_last_page_short';
          break;
        }
        if (pageNum >= 500 && totalPagesKnown == null) {
          log('[Teal export] WARN: no total_pages in API meta; stopped safety cap at page 500');
          stoppedReason = 'cap_500';
          break;
        }
        pageNum++;
      }
    } finally {
      await reqCtx.dispose().catch(() => {});
    }

    log('[Teal export] Pagination stopped: ' + stoppedReason + '; unique jobs: ' + rows.length);

    if (totalCountKnown != null && rows.length !== totalCountKnown) {
      const msg =
        '[Teal export] COUNT MISMATCH: api total_count=' + totalCountKnown + ' exported rows=' + rows.length;
      log(msg);
      if (strictCount) {
        throw new Error(msg);
      }
    } else if (totalCountKnown != null) {
      log('[Teal export] OK: exported rows match API total_count (' + totalCountKnown + ')');
    }

    return {
      api_total_count: totalCountKnown,
      api_total_pages: totalPagesKnown,
      pagination_stopped_reason: stoppedReason
    };
  }

  const tealStats = await fetchAllUserJobPostPagesViaApi();
  page.off('response', responseHandler);
  page.off('request', requestHandler);

  let bookmarkExportMode = 'none';
  let jobsForExport = rows;

  if (useBookmarkedColumn) {
    if (!statusFilterOnly && domOrderedBookmarkIds.length > 0) {
      bookmarkExportMode = 'dom_tabulator_intersect_api';
      const byId = new Map(rows.map((r) => [String(r.teal_user_job_post_id || '').toLowerCase(), r]));
      jobsForExport = [];
      for (const rawId of domOrderedBookmarkIds) {
        const row = byId.get(String(rawId).toLowerCase());
        if (row) jobsForExport.push(row);
      }
      const miss = domOrderedBookmarkIds.length - jobsForExport.length;
      log(
        '[Teal export] Bookmarked export: DOM ' +
          domOrderedBookmarkIds.length +
          ' UUIDs → matched ' +
          jobsForExport.length +
          ' rows from API (pipeline ingested ' +
          rows.length +
          ' jobs)'
      );
      if (miss > 0) {
        log('[Teal export] WARN: ' + miss + ' DOM UUID(s) not in API payload yet (retry run or timing).');
      }
    } else if (sniffPickedExact && bookmarkedListFromSniff && rows.length > 0) {
      bookmarkExportMode = 'sniff_matched_list_url';
      jobsForExport = rows.slice();
      log(
        '[Teal export] Bookmarked column: using rows from sniff exact total_count URL only (' +
          jobsForExport.length +
          ' jobs; same slice as API total_count for that request, not status_teal substring).'
      );
    } else {
      bookmarkExportMode = statusFilterOnly ? 'status_teal_api_only' : 'status_teal_fallback_no_dom_ids';
      if (statusFilterOnly) {
        log('[Teal export] --status-filter-only: using API field status_teal=bookmarked (no DOM table slice).');
      } else if (domOrderedBookmarkIds.length === 0) {
        log('[Teal export] WARN: no UUIDs from table DOM; falling back to status_teal=bookmarked from API.');
      }
      jobsForExport = rows.filter((r) => String(r.status_teal || '').toLowerCase() === 'bookmarked');
      log(
        '[Teal export] Bookmarked (API status filter): ' +
          jobsForExport.length +
          ' jobs status_teal=bookmarked (ingested ' +
          rows.length +
          ' from pipeline)'
      );
    }

    if (uiBookmarkedCountHint != null && jobsForExport.length !== uiBookmarkedCountHint) {
      const w =
        '[Teal export] WARN: exported rows (' +
        jobsForExport.length +
        ') ≠ UI Bookmarked label (' +
        uiBookmarkedCountHint +
        '). If you need an exact match, re-run with visible Job Tracker; check DOM scroll log.';
      log(w);
      if (strictCount) {
        throw new Error(
          'Strict count: exported ' + jobsForExport.length + ' !== UI Bookmarked label ' + uiBookmarkedCountHint
        );
      }
    }
  } else {
    bookmarkExportMode = 'all_stages';
  }

  const pipelineStatusBreakdown = {};
  for (const r of rows) {
    const k = String(r.status_teal || 'unknown').toLowerCase();
    pipelineStatusBreakdown[k] = (pipelineStatusBreakdown[k] || 0) + 1;
  }

  const statusBreakdown = {};
  for (const r of jobsForExport) {
    const k = String(r.status_teal || 'unknown').toLowerCase();
    statusBreakdown[k] = (statusBreakdown[k] || 0) + 1;
  }

  const exportDoc = {
    meta: {
      source: 'teal_job_tracker_api',
      exported_at: new Date().toISOString(),
      vault: VAULT,
      filter: useBookmarkedColumn ? 'bookmarked_pipeline' : 'all_stages_ui_default',
      bookmark_export_mode: bookmarkExportMode,
      dom_unique_ids_collected: useBookmarkedColumn ? domOrderedBookmarkIds.length : 0,
      count: jobsForExport.length,
      ui_bookmarked_count_hint: uiBookmarkedCountHint,
      api_total_count_pipeline_request: tealStats ? tealStats.api_total_count : null,
      status_breakdown_pipeline_rows: pipelineStatusBreakdown,
      api_total_count: jobsForExport.length,
      api_total_pages: tealStats ? tealStats.api_total_pages : null,
      pagination_stopped_reason: tealStats ? tealStats.pagination_stopped_reason : null,
      status_breakdown_teal: statusBreakdown,
      note:
        'Default Bookmarked export: scroll Tabulator and collect /job-tracker/<uuid> links, then intersect with full user_job_posts API rows (bookmark_export_mode dom_tabulator_intersect_api). This aligns the file with the Bookmarked column count, not only status_teal=bookmarked on the full pipeline payload. Fallback: status_teal filter. Flags: --all-stages, --status-filter-only (API bookmarked only), --strict-count (export count vs UI label when hint present).'
    },
    jobs: jobsForExport.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  };
  fs.writeFileSync(EXPORT_JSON, JSON.stringify(exportDoc, null, 2), 'utf8');
  log('[Teal export] Wrote ' + exportDoc.meta.count + ' jobs → ' + EXPORT_JSON);

  if (suggestDex || applyDex) {
    const tracker = loadTracker();
    const apps = tracker.applications || [];
    const byJobId = new Map();
    const byTitleCompany = new Map();
    for (const app of apps) {
      if (app.jobId) byJobId.set(String(app.jobId), app);
      const k = normalizeMatchKey(app.role, app.company);
      if (k !== '|') byTitleCompany.set(k, app);
    }

    const suggestions = [];
    const unmatchedTeal = [];

    for (const job of jobsForExport) {
      let app = null;
      let match = 'none';
      if (job.linkedin_job_id && byJobId.has(String(job.linkedin_job_id))) {
        app = byJobId.get(String(job.linkedin_job_id));
        match = 'linkedin_job_id';
      } else {
        const k = normalizeMatchKey(job.title, job.company);
        if (k !== '|' && byTitleCompany.has(k)) {
          app = byTitleCompany.get(k);
          match = 'title_company';
        }
      }

      if (!app) {
        unmatchedTeal.push({
          teal_user_job_post_id: job.teal_user_job_post_id,
          title: job.title,
          company: job.company,
          status_teal: job.status_teal
        });
        continue;
      }

      const suggested = job.dex_status_suggestion;
      const current = app.status;
      const wouldChange = suggested && suggested !== current;

      suggestions.push({
        match,
        teal_user_job_post_id: job.teal_user_job_post_id,
        dex_application_id: app.id,
        role: app.role,
        company: app.company,
        linkedin_job_id: app.jobId || job.linkedin_job_id || null,
        status_teal: job.status_teal,
        status_dex_current: current,
        dex_status_suggestion: suggested,
        would_update_status: Boolean(wouldChange && suggested)
      });

      if (applyDex && wouldChange && suggested && match === 'linkedin_job_id') {
        const note = '[Teal sync ' + new Date().toISOString().slice(0, 10) + '] Teal status: ' + job.status_teal;
        updateStatus(app.id, suggested, null, note);
        log('[Teal export] Applied Dex status → ' + suggested + ' for ' + app.id + ' (' + app.role + ')');
      }
    }

    const suggestDoc = {
      meta: {
        generated_at: new Date().toISOString(),
        apply_mode: applyDex,
        note: applyDex
          ? 'Обновлены только записи с совпадением по LinkedIn jobId (безопасное сопоставление).'
          : 'Проверьте would_update_status; для применения: --apply-dex'
      },
      matched: suggestions,
      unmatched_teal: unmatchedTeal
    };
    fs.writeFileSync(SUGGEST_JSON, JSON.stringify(suggestDoc, null, 2), 'utf8');
    log('[Teal export] Suggestions → ' + SUGGEST_JSON + ' (matched ' + suggestions.length + ', unmatched Teal ' + unmatchedTeal.length + ')');
  }

  await context.close();
}

main().catch((e) => {
  log('Fatal: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
