#!/usr/bin/env node
/**
 * Fetch remote Product/PM jobs from BettingJobs (iGaming).
 * Two modes:
 * 1) Default: parses sector page https://www.bettingjobs.com/product/ (no JS, ~15 featured).
 * 2) --search: Playwright loads /jobs/, opens Classification dropdown (.classification-selector), selects "Product" (.cls-item-label-text), keyword "Senior Product Manager", Search; intercepts search-job API. With Classification = 15 product roles (3 Remote by default); use --no-remote-filter for all 15.
 * Keeps only roles with location "Remote" unless --no-remote-filter.
 * Writes to a separate digest file: digests/bettingjobs-YYYY-MM-DD.md (no merge into main digest).
 *
 * Usage: node fetch-bettingjobs-product.cjs [--dry-run] [--no-remote-filter] [--search]
 *   --search             Use Playwright to scrape full search (Product), all pages.
 *   --dry-run            Print jobs to stdout only.
 *   --no-remote-filter   Include all product jobs, not only Remote.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { VAULT, DIGESTS_DIR, ensureDirs } = require('./job-search-paths.cjs');

const BETTINGJOBS_PRODUCT_URL = 'https://www.bettingjobs.com/product/';
const BETTINGJOBS_JOBS_URL = 'https://www.bettingjobs.com/jobs/';
const FETCH_TIMEOUT_MS = 15000;
const FEED_ID = 'BettingJobs Product';
const PAGE_WAIT_MS = 4000;
const MAX_PAGES = 10;

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Dex-JobSearch/1.0' } }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseProductPage(html, remoteOnly) {
  const jobs = [];
  const linkRe = /<a[^>]+href="(\/(?:jobview\/[^"]+)|https?:\/\/www\.bettingjobs\.com\/jobview\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    let url = m[1].trim();
    if (url.startsWith('/')) url = 'https://www.bettingjobs.com' + url;
    const rawTitle = (m[2] || '').replace(/<[^>]+>/g, '').trim();
    if (!url || !rawTitle || /^\s*See all jobs\s*$/i.test(rawTitle) || /learn more/i.test(rawTitle) || url.includes('/jobs') || url.includes('/resource-hub') || url.includes('/insights') || url.includes('/podcast') || url.includes('/interviews')) continue;
    const title = rawTitle.replace(/\s+/g, ' ').slice(0, 120);
    if (remoteOnly) {
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
      if (!/\bRemote\b/i.test(after)) continue;
    }
    if (!isProductRoleTitle(title)) continue;
    jobs.push({ title, url });
  }
  return jobs;
}

function sanitizeTitle(title) {
  return (title || '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Only titles that are clearly product-role (PM/PO/Head of Product), not Marketing/Sales/Dev/etc. */
const PRODUCT_ROLE_PATTERNS = [
  /\bproduct\s+manager\b/i,
  /\bproduct\s+owner\b/i,
  /\bhead\s+of\s+product\b/i,
  /\b(?:vp|vice\s+president)\s+product\b/i,
  /\bdirector\s+of\s+product\b/i,
  /\bchief\s+product\s+officer\b/i,
  /\bcpo\b/i,
  /\bproduct\s+lead\b/i,
  /\bproduct\s+director\b/i,
  /\bsenior\s+product\s+manager\b/i,
  /\bsenior\s+product\s+owner\b/i,
];

function isProductRoleTitle(title) {
  if (!title || typeof title !== 'string') return false;
  return PRODUCT_ROLE_PATTERNS.some((re) => re.test(title.trim()));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SEARCH_JOB_API = 'https://account-api-uk.applyflow.com/api/seeker/v1/search-job';
const RESULTS_PER_PAGE = 20;

/** POST to search-job API, return parsed JSON or null. */
function postSearchJobApi(body) {
  return new Promise((resolve) => {
    const u = new URL(SEARCH_JOB_API);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'Dex-JobSearch/1.0',
          Origin: 'https://www.bettingjobs.com',
          Referer: 'https://www.bettingjobs.com/jobs/',
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (ch) => { buf += ch; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}

/** Fetch using Classification "Product" + keyword via direct API (no Playwright). Returns [] if API rejects. */
async function fetchSearchWithClassificationApi(remoteOnly) {
  const baseBody = {
    search_keywords: 'Senior Product Manager',
    sort_by: '',
    applyflow_custom_1: [],
    applyflow_custom_2: [],
    applyflow_custom_3: [],
    applyflow_custom_4: [],
    pay_max: '',
    pay_min: '',
    location: '',
    classifications: 'Product',
    page: 1,
    resultsPerPage: RESULTS_PER_PAGE,
    bucket_code: 'BETTING-JOBS',
    site_code: 'bettingjobs',
    facet: 1,
  };
  const allJobs = [];
  const seenUrls = new Set();
  let pageNum = 1;
  let totalCount = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = { ...baseBody, page: pageNum };
    const res = await postSearchJobApi(body);
    if (!res || !res.search_results || !Array.isArray(res.search_results.jobs)) break;
    const count = res.search_results.job_count || 0;
    if (pageNum === 1) totalCount = count;
    for (const j of parseSearchJobResponse(res, remoteOnly)) {
      if (!seenUrls.has(j.url)) {
        seenUrls.add(j.url);
        allJobs.push(j);
      }
    }
    if (allJobs.length >= totalCount || res.search_results.jobs.length < RESULTS_PER_PAGE) break;
    pageNum += 1;
  }
  return allJobs;
}

/** Parse Applyflow search-job response body into { title, url }[]. When fromProductClassification, skip title filter (site taxonomy = product roles). */
function parseSearchJobResponse(body, remoteOnly, fromProductClassification) {
  const jobs = [];
  const results = body.search_results || body.data?.search_results;
  if (!results || !Array.isArray(results.jobs)) return jobs;
  for (const j of results.jobs) {
    const jobUrl = (j.URL || (j.job_title && j.uuid ? `${j.job_title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${j.uuid}` : null));
    if (!jobUrl) continue;
    const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.bettingjobs.com/jobview/${jobUrl}`;
    const title = (j.job_title || '').trim().slice(0, 120);
    if (!title) continue;
    if (remoteOnly) {
      const details = j.custom_detail_2 || [];
      const isRemote = details.some((d) => d && /remote/i.test(String(d.value)));
      if (!isRemote) continue;
    }
    if (!fromProductClassification && !isProductRoleTitle(title)) continue;
    jobs.push({ title, url: fullUrl });
  }
  return jobs;
}

/** Fetch Product search via Playwright: load page, trigger search, collect search-job API responses and parse. */
async function fetchSearchWithPlaywright(remoteOnly, debug) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const allJobs = [];
  const seenUrls = new Set();
  const searchJobBodies = [];
  page.on('response', async (res) => {
    if (!res.url().includes('search-job')) return;
    try {
      const body = await res.json();
      if (body && body.search_results) searchJobBodies.push(body);
    } catch (_) {}
  });

  let searchRequestPostData = null;
  if (debug) {
    page.on('request', (req) => {
      if (!searchRequestPostData && req.url().includes('search-job') && req.method() === 'POST' && req.postData()) {
        searchRequestPostData = req.postData();
      }
    });
  }

  const SEARCH_KEYWORD = 'Senior Product Manager';
  try {
    await page.goto(BETTINGJOBS_JOBS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    await page.locator('input[placeholder="Enter keyword"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    // Set Classification "Product" (custom Vue: .classification-selector → .cls-item-label-text "Product")
    try {
      let classificationSelector = page.locator('.classification-selector').first();
      const filtersBtn = page.getByRole('button', { name: /filter/i }).or(page.locator('button').filter({ hasText: /filter/i }));
      if (await filtersBtn.first().isVisible().catch(() => false)) {
        await filtersBtn.first().scrollIntoViewIfNeeded().catch(() => {});
        await sleep(300);
        await filtersBtn.first().click({ timeout: 5000 });
        await sleep(1500);
      }
      await classificationSelector.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await classificationSelector.click({ timeout: 5000 });
      await sleep(1000);
      const productRow = page.locator('div.afu-mb-2.afu-mr-3').filter({ has: page.locator('.cls-item-label-text', { hasText: 'Product' }) }).first();
      await productRow.waitFor({ state: 'visible', timeout: 5000 });
      await productRow.click({ timeout: 3000 });
      await sleep(400);
      await page.keyboard.press('Escape');
      await sleep(300);
      if (debug) console.error('[fetch-bettingjobs-product] Selected Classification Product.');
    } catch (e) {
      if (debug) console.error('[fetch-bettingjobs-product] Classification Product not set:', e?.message || e);
    }

    const keywordInput = page.locator('input[placeholder="Enter keyword"]').first();
    await keywordInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
    await keywordInput.fill(SEARCH_KEYWORD);
    await sleep(1000);
    const searchBtn = page.locator('button:has-text("Search")').first();
    await searchBtn.click().catch(() => {});
    await sleep(6000);
    let totalCount = 0;
    const parsedPages = new Set();
    const processBodies = () => {
      for (const body of searchJobBodies) {
        const filters = body.search_filters || {};
        const keywordMatch = (filters.search_keywords || '').toLowerCase() === SEARCH_KEYWORD.toLowerCase();
        const hasProductClassification = (f) => {
          if (f.classification_ids && Array.isArray(f.classification_ids) && f.classification_ids.length) return true;
          if (f.sector && /product/i.test(String(f.sector))) return true;
          if (f.job_classification && /product/i.test(String(f.job_classification))) return true;
          if (f.classifications && Array.isArray(f.classifications) && f.classifications.some((c) => c && /product/i.test(String(c.value || c)))) return true;
          if (f.classifications && /product/i.test(String(f.classifications))) return true;
          return false;
        };
        if (!keywordMatch && !hasProductClassification(filters)) continue;
        const filterPage = filters.page;
        const fromProductClassification = hasProductClassification(filters);
        const pageKey = fromProductClassification ? `c-${filterPage}` : `k-${filterPage}`;
        if (parsedPages.has(pageKey)) continue;
        if (!body.search_results || !Array.isArray(body.search_results.jobs)) continue;
        parsedPages.add(pageKey);
        totalCount = Math.max(totalCount, body.search_results.job_count || 0);
        for (const j of parseSearchJobResponse(body, remoteOnly, fromProductClassification)) {
          if (!seenUrls.has(j.url)) {
            seenUrls.add(j.url);
            allJobs.push(j);
          }
        }
      }
    };
    processBodies();

    let pageNum = 2;
    while (pageNum <= MAX_PAGES && allJobs.length < (totalCount || 999)) {
      const responsePromise = page.waitForResponse((r) => r.url().includes('search-job'), { timeout: 12000 }).catch(() => null);
      const clicked = await page.evaluate((num) => {
        const buttons = document.querySelectorAll('button');
        for (const b of buttons) {
          if ((b.textContent || '').trim() === String(num)) {
            b.click();
            return true;
          }
        }
        return false;
      }, pageNum);
      if (!clicked) break;
      const res = await responsePromise;
      if (res) {
        const body = await res.json().catch(() => null);
        if (body && body.search_results) searchJobBodies.push(body);
      }
      const deadline = Date.now() + 8000;
      while (!searchJobBodies.some((b) => (b.search_filters || {}).page === pageNum) && Date.now() < deadline) await sleep(400);
      processBodies();
      if (allJobs.length >= (totalCount || 0)) break;
      pageNum += 1;
    }

    if (debug) {
      const dir = path.join(VAULT, '00-Inbox', 'Job_Search', 'debug');
      require('fs').mkdirSync(dir, { recursive: true });
      require('fs').writeFileSync(path.join(dir, 'bettingjobs-api-jobs-count.txt'), `total: ${totalCount}, collected: ${allJobs.length}\n`, 'utf8');
      if (searchRequestPostData) require('fs').writeFileSync(path.join(dir, 'bettingjobs-search-request-body.txt'), searchRequestPostData, 'utf8');
      try { require('fs').writeFileSync(path.join(dir, 'bettingjobs-url-after-search.txt'), page.url(), 'utf8'); } catch (_) {}
      const firstBody = searchJobBodies.find((b) => b.search_filters && (b.search_filters.search_keywords === SEARCH_KEYWORD || (b.search_filters || {}).classifications));
      if (firstBody && firstBody.search_filters) require('fs').writeFileSync(path.join(dir, 'bettingjobs-search-filters.json'), JSON.stringify(firstBody.search_filters, null, 2), 'utf8');
    }
  } finally {
    await browser.close();
  }
  return allJobs;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const noRemoteFilter = process.argv.includes('--no-remote-filter');
  const useSearch = process.argv.includes('--search');
  const today = new Date().toISOString().slice(0, 10);

  let jobs = [];
  const debug = process.argv.includes('--debug');
  if (useSearch) {
    try {
      console.error('[fetch-bettingjobs-product] Fetching Product search (Playwright: Classification "Product" + Senior Product Manager)…');
      jobs = await fetchSearchWithPlaywright(!noRemoteFilter, debug);
      if (jobs.length === 0) {
        console.error('[fetch-bettingjobs-product] Search returned 0; falling back to sector page.');
        const html = await fetchHtml(BETTINGJOBS_PRODUCT_URL);
        jobs = parseProductPage(html, !noRemoteFilter);
      }
    } catch (e) {
      console.error('[fetch-bettingjobs-product] Search failed:', e.message, '; falling back to sector page.');
      const html = await fetchHtml(BETTINGJOBS_PRODUCT_URL);
      jobs = parseProductPage(html, !noRemoteFilter);
    }
  } else {
    let html;
    try {
      html = await fetchHtml(BETTINGJOBS_PRODUCT_URL);
    } catch (e) {
      console.error('[fetch-bettingjobs-product] Fetch failed:', e.message);
      process.exit(1);
    }
    jobs = parseProductPage(html, !noRemoteFilter);
  }
  const seen = new Set();
  const unique = jobs.filter((j) => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  const jobLines = unique.map((j) => {
    const display = `${sanitizeTitle(j.title)} · ${FEED_ID}`;
    return `- [ ] [${display}](${j.url})`;
  });

  if (dryRun) {
    const block = `\n### ${FEED_ID} (${unique.length})\n\n${jobLines.join('\n\n')}\n`;
    console.log(block);
    console.error(`[fetch-bettingjobs-product] Would write ${unique.length} remote product jobs to separate digest.`);
    return;
  }

  ensureDirs();
  const bettingjobsDigestPath = path.join(DIGESTS_DIR, `bettingjobs-${today}.md`);
  const intro = `# BettingJobs Product (remote) — ${today}\n\n*Источник: [BettingJobs Product](https://www.bettingjobs.com/product/) (iGaming, remote).*\n\n`;
  const statsLine = `**По фидам:** ${FEED_ID}: ${unique.length}\n\n`;
  const block = unique.length ? `### ${FEED_ID} (${unique.length})\n\n${jobLines.join('\n\n')}\n` : '';
  const content = intro + statsLine + block;
  fs.writeFileSync(bettingjobsDigestPath, content, 'utf8');

  console.log(`[fetch-bettingjobs-product] Wrote ${unique.length} jobs to ${path.relative(VAULT, bettingjobsDigestPath)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
