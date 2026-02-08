#!/usr/bin/env node
/**
 * Fetch remote Product/PM jobs from Remotive, We Work Remotely, RemoteOK, JobsCollider.
 * Merges into the daily digest (linkedin-jobs-YYYY-MM-DD.md) under "## Remote job boards (RSS)".
 * Run from job-digest pipeline after Step 1 (email parser).
 *
 * Usage: node fetch-remote-pm-rss.cjs [--dry-run] [--no-merge]
 *   --dry-run   Print jobs to stdout, do not write.
 *   --no-merge  Write remote-pm-rss-YYYY-MM-DD.md only, do not append to main digest.
 *
 * Source flags (run only selected; if none, run all):
 *   --linkedin     (no-op here; used by run-job-digest for email step)
 *   --remotive     Remotive (Product + PM feeds)
 *   --wwr          We Work Remotely
 *   --remoteok     RemoteOK
 *   --jobscollider JobsCollider (Product + PM feeds)
 *   --foorilla     Foorilla (scrape)
 *   --rss          Shorthand: remotive + wwr + remoteok + jobscollider (no Foorilla)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { VAULT, DIGESTS_DIR, ensureDirs } = require('./job-search-paths.cjs');

// feedId -> source key for filtering
const FEED_TO_SOURCE = {
  'Remotive Product': 'remotive',
  'Remotive PM': 'remotive',
  'WWR': 'wwr',
  'RemoteOK': 'remoteok',
  'JobsCollider Product': 'jobscollider',
  'JobsCollider PM': 'jobscollider',
  'Foorilla': 'foorilla'
};

const RSS_SOURCES = [
  { feedId: 'Remotive Product', url: 'https://remotive.com/remote-jobs/feed/product', type: 'rss' },
  { feedId: 'Remotive PM', url: 'https://remotive.com/remote-jobs/feed/project-management', type: 'rss' },
  { feedId: 'WWR', url: 'https://weworkremotely.com/categories/remote-product-jobs.rss', type: 'rss' },
  { feedId: 'RemoteOK', url: 'https://remoteok.com/remote-jobs.rss', type: 'rss' },
  { feedId: 'JobsCollider Product', url: 'https://jobscollider.com/remote-product-jobs.rss', type: 'rss', apiFallback: 'https://jobscollider.com/api/search-jobs?category=product' },
  { feedId: 'JobsCollider PM', url: 'https://jobscollider.com/remote-project-management-jobs.rss', type: 'rss', apiFallback: 'https://jobscollider.com/api/search-jobs?category=project_management' }
];

const FETCH_TIMEOUT_MS = 15000;
const FOORILLA_BASE = 'https://foorilla.com';
/** Foorilla Roles filter: "Senior Product Manager" (id 7091). Applied via POST /hiring/filter/ so jobs list is pre-filtered. */
const FOORILLA_ROLE_ID = '7091';

function fetchUrl(url, opts = {}) {
  const followRedirect = opts.followRedirect !== false;
  const headers = { 'User-Agent': 'Dex-JobSearch/1.0', 'Accept': 'application/json, application/xml, text/xml, */*', ...opts.headers };
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (followRedirect && (res.statusCode === 301 || res.statusCode === 302)) {
        const loc = res.headers.location;
        if (loc) {
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
          return fetchUrl(nextUrl, opts).then(resolve).catch(reject);
        }
      }
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

/** Merge Set-Cookie headers into a single Cookie header value (name=value; name2=value2). */
function mergeSetCookie(setCookie) {
  const pairs = [];
  const list = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
  for (const c of list) {
    const part = c.split(';')[0].trim();
    if (part) {
      const eq = part.indexOf('=');
      if (eq > 0) pairs.push({ name: part.slice(0, eq), value: part });
    }
  }
  const byName = {};
  for (const p of pairs) byName[p.name] = p.value;
  return Object.values(byName).join('; ');
}

/** GET with optional cookie; follows one redirect with same cookie. opts.extraHeaders merged into headers. Returns { body, setCookie, statusCode }. */
function foorillaGet(url, cookie = '', opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'Dex-JobSearch/1.0', Accept: 'text/html', Referer: `${FOORILLA_BASE}/hiring/`, ...opts.extraHeaders };
    if (cookie) headers.Cookie = cookie;
    const lib = https;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
          return foorillaGet(nextUrl, cookie).then(resolve).catch(reject);
        }
      }
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => resolve({ body: data, setCookie: res.headers['set-cookie'], statusCode: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/** POST to Foorilla; returns { body, setCookie, statusCode }. */
function foorillaPost(url, body, cookie, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Dex-JobSearch/1.0',
      Accept: 'text/html',
      Referer: `${FOORILLA_BASE}/hiring/`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      Cookie: cookie,
      ...extraHeaders
    };
    const lib = https;
    const u = new URL(url);
    const req = lib.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (ch) => { data += ch; });
        res.on('end', () => resolve({ body: data, setCookie: res.headers['set-cookie'], statusCode: res.statusCode }));
      }
    );
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Get Foorilla session with Filters → Roles = "Senior Product Manager" applied.
 * 1) GET /hiring/ for csrftoken cookie.
 * 2) POST /hiring/filter/ with roles=7091 to apply filter; response sets sessionid.
 * Returns { cookie } for use in GET /hiring/jobs/ (filtered list).
 */
async function getFoorillaSession() {
  const { body: _page, setCookie: set1 } = await foorillaGet(`${FOORILLA_BASE}/hiring/`);
  let cookie = mergeSetCookie(set1);
  const csrfMatch = cookie.match(/csrftoken=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1].trim() : '';
  if (!csrf) return { cookie: '' };

  const postBody = `csrfmiddlewaretoken=${encodeURIComponent(csrf)}&roles=${FOORILLA_ROLE_ID}`;
  const { setCookie: set2, statusCode } = await foorillaPost(
    `${FOORILLA_BASE}/hiring/filter/`,
    postBody,
    cookie,
    { 'X-CSRFToken': csrf, 'HX-Request': 'true' }
  );
  if (statusCode !== 200) return { cookie: '' };
  cookie = mergeSetCookie([...(Array.isArray(set1) ? set1 : set1 ? [set1] : []), ...(Array.isArray(set2) ? set2 : set2 ? [set2] : [])]);
  return { cookie };
}

/** Parse Foorilla /hiring/jobs/ HTML: list-group-item with title, link, and location (div.text-end > small). */
function parseFoorillaJobsHtml(html) {
  const items = [];
  const blockRegex = /<li class="list-group-item">([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const block = m[1];
    const linkMatch = block.match(/hx-get="(\/hiring\/jobs\/[^"]+)"/);
    const titleMatch = block.match(/<a class="stretched-link"[^>]*>([\s\S]*?)<\/a>/);
    const locationMatch = block.match(/<div class="text-end">\s*<small[^>]*>([\s\S]*?)<\/small>/i);
    const location = locationMatch ? (locationMatch[1] || '').replace(/<[^>]+>/g, '').trim() : '';
    if (linkMatch && titleMatch) {
      const title = (titleMatch[1] || '').replace(/<[^>]+>/g, '').trim();
      const path = linkMatch[1];
      const link = path.startsWith('http') ? path : FOORILLA_BASE + path;
      if (title && link) items.push({ title, link, location });
    }
  }
  return items;
}

const FOORILLA_PAGES = 2; // API returns jobs only for page=1 and page=2 (~100 total)

/** Fetch Product/PM jobs from Foorilla with Filters → Roles = "Senior Product Manager" applied (multiple pages). */
async function fetchFoorillaJobs() {
  try {
    const { cookie } = await getFoorillaSession();
    if (!cookie) return [];
    const baseHeaders = { Cookie: cookie, 'HX-Request': 'true', Referer: `${FOORILLA_BASE}/hiring/` };
    const allItems = [];
    for (let page = 1; page <= FOORILLA_PAGES; page++) {
      const url = page === 1 ? `${FOORILLA_BASE}/hiring/jobs/` : `${FOORILLA_BASE}/hiring/jobs/?page=${page}`;
      const { body } = await foorillaGet(url, cookie, { extraHeaders: { 'HX-Request': 'true' } });
      const pageItems = parseFoorillaJobsHtml(body || '');
      if (pageItems.length === 0) break;
      allItems.push(...pageItems);
    }
    return allItems;
  } catch (e) {
    console.error('[fetch-remote-pm-rss] Foorilla:', e.message);
    return [];
  }
}

/** Fetch JobsCollider API (GET search-jobs). Returns [] if API returns non-JSON or 404. */
async function fetchJobsColliderApi(apiUrl) {
  try {
    const data = await fetchUrl(apiUrl);
    const json = JSON.parse(data);
    if (!Array.isArray(json.jobs)) return [];
    return json.jobs.map((j) => ({ title: j.title || '', link: j.url || j.link || '' })).filter((j) => j.title && j.link);
  } catch (e) {
    return [];
  }
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/);
    const linkMatch = block.match(/<link>(.*?)<\/link>/) || block.match(/<link>([^<]+)/);
    if (titleMatch && linkMatch) {
      const title = (titleMatch[1] || '').replace(/<[^>]+>/g, '').trim();
      let link = (linkMatch[1] || '').trim();
      if (link && !link.startsWith('http')) link = null;
      if (title && link) {
        items.push({ title, link });
      }
    }
  }
  return items;
}

function parseAtomEntries(xml) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/);
    if (titleMatch && linkMatch) {
      const raw = (titleMatch[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
      const title = raw;
      const link = linkMatch[1].trim();
      if (title && link) items.push({ title, link });
    }
  }
  return items;
}

function sanitizeTitleForMarkdown(title) {
  return (title || '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// Keep only roles that look like Product / PM. Feeds (e.g. WWR "remote-product-jobs") often include Sales, Engineering, Support.
const PM_TITLE_INCLUDE = [
  'product manager', 'product lead', 'head of product', 'cpo', 'chief product officer',
  'product owner', 'product director', 'product head', 'growth product', 'technical product manager',
  'senior product manager', 'lead product manager', 'principal product manager', 'product specialist',
  'director of product', 'vp product', 'vice president product', 'product management'
];
const PM_TITLE_EXCLUDE = [
  'account executive', 'sales manager', 'sales representative', 'business development',
  'support engineer', 'customer support', 'client support', 'tier 1 support', 'tier 2 support',
  'wordpress developer', 'software engineer', 'developer', 'devsecops', 'devops',
  'qa analyst', 'quality assurance', 'werkstudent', 'intern ', ' intern',
  'product engineer', 'product developer'  // engineering roles, not PM
];

function isProductRole(title) {
  const t = (title || '').toLowerCase();
  const hasInclude = PM_TITLE_INCLUDE.some((kw) => t.includes(kw));
  const hasExclude = PM_TITLE_EXCLUDE.some((kw) => t.includes(kw));
  return hasInclude && !hasExclude;
}

/** Foorilla-only: include product-related roles that strict PM filter might miss (e.g. Associate Product Data Analyst). */
function isFoorillaProductRelated(title) {
  const t = (title || '').toLowerCase();
  if (!t.includes('product')) return false;
  const exclude = ['product engineer', 'product developer', 'product designer'];
  return !exclude.some((kw) => t.includes(kw));
}

/** Foorilla: keep only European locations (country names, "Europe", "EU"; excludes US, Canada, Asia, etc.). */
const FOORILLA_EUROPE_KEYWORDS = [
  'europe', 'eu ', ' uk', 'united kingdom', 'germany', 'deutschland', 'france', 'spain', 'italy',
  'netherlands', 'holland', 'poland', 'portugal', 'ireland', 'belgium', 'austria', 'switzerland',
  'sweden', 'norway', 'denmark', 'finland', 'romania', 'czech', 'greece', 'hungary', 'luxembourg',
  'croatia', 'bulgaria', 'serbia', 'slovenia', 'slovakia', 'estonia', 'latvia', 'lithuania',
  'malta', 'cyprus', 'iceland', 'munich', 'berlin', 'london', 'dublin', 'amsterdam', 'paris',
  'madrid', 'barcelona', 'warsaw', 'lisbon', 'vienna', 'zurich', 'stockholm', 'oslo', 'copenhagen',
  'helsinki', 'bucharest', 'prague', 'athens', 'budapest', 'zagreb', 'sofia', 'belgrade', 'ljubljana',
  'bratislava', 'tallinn', 'riga', 'vilnius', 'valletta', 'reykjavik'
];

function isEuropeanLocation(location) {
  if (!location || !location.trim()) return false;
  const lower = ` ${location.toLowerCase()} `;
  return FOORILLA_EUROPE_KEYWORDS.some((kw) => lower.includes(` ${kw}`) || lower.includes(` ${kw},`) || lower.includes(`-${kw}`));
}

function parseSourceFlags() {
  const argv = process.argv.slice(2);
  const set = new Set();
  if (argv.includes('--rss')) {
    set.add('remotive');
    set.add('wwr');
    set.add('remoteok');
    set.add('jobscollider');
  }
  if (argv.includes('--remotive')) set.add('remotive');
  if (argv.includes('--wwr')) set.add('wwr');
  if (argv.includes('--remoteok')) set.add('remoteok');
  if (argv.includes('--jobscollider')) set.add('jobscollider');
  if (argv.includes('--foorilla')) set.add('foorilla');
  return set;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const noMerge = process.argv.includes('--no-merge');
  const onlyFoorilla = process.argv.includes('--only-foorilla');
  const sourceFlags = parseSourceFlags();
  const useAllSources = sourceFlags.size === 0;
  const today = new Date().toISOString().slice(0, 10);
  const mainDigestPath = path.join(DIGESTS_DIR, `linkedin-jobs-${today}.md`);
  const rssOnlyPath = path.join(DIGESTS_DIR, onlyFoorilla ? `foorilla-pm-${today}.md` : `remote-pm-rss-${today}.md`);

  const rssSourcesToRun = useAllSources
    ? RSS_SOURCES
    : RSS_SOURCES.filter((s) => sourceFlags.has(FEED_TO_SOURCE[s.feedId]));
  const runFoorilla = useAllSources || sourceFlags.has('foorilla');

  const seenUrls = new Set();
  const byFeed = new Map(); // feedId -> [{ title, url }]

  if (!onlyFoorilla && rssSourcesToRun.length > 0) {
  for (const source of rssSourcesToRun) {
    const feedId = source.feedId;
    if (!byFeed.has(feedId)) byFeed.set(feedId, []);
    try {
      let xml = await fetchUrl(source.url);
      const isHtml = typeof xml === 'string' && (xml.trimStart().toLowerCase().startsWith('<!') || xml.includes('<!doctype'));
      let items = [];
      if (isHtml && source.apiFallback) {
        console.error(`[fetch-remote-pm-rss] ${feedId}: RSS returns 404/HTML (jobscollider.com redirects to remotefirstjobs.com, feed not migrated). Trying API fallback.`);
        items = await fetchJobsColliderApi(source.apiFallback);
      } else if (!isHtml) {
        items = xml.includes('<entry>') ? parseAtomEntries(xml) : parseRssItems(xml);
      }
      for (const item of items) {
        const url = (item.link || '').trim();
        if (!url || seenUrls.has(url)) continue;
        if (!isProductRole(item.title)) continue;
        seenUrls.add(url);
        const title = sanitizeTitleForMarkdown(item.title);
        byFeed.get(feedId).push({ title, url });
      }
    } catch (e) {
      console.error(`[fetch-remote-pm-rss] ${feedId} ${source.url}: ${e.message}`);
    }
  }
  }

  if (runFoorilla || onlyFoorilla) {
  try {
    const foorillaItems = await fetchFoorillaJobs();
    if (!byFeed.has('Foorilla')) byFeed.set('Foorilla', []);
    for (const item of foorillaItems) {
      const url = (item.link || '').trim();
      if (!url || seenUrls.has(url)) continue;
      if (!isProductRole(item.title) && !isFoorillaProductRelated(item.title)) continue;
      const location = (item.location || '').trim().replace(/\s+/g, ' ');
      if (!isEuropeanLocation(location)) continue;
      seenUrls.add(url);
      byFeed.get('Foorilla').push({ title: sanitizeTitleForMarkdown(item.title), url, location });
    }
  } catch (e) {
      console.error('[fetch-remote-pm-rss] Foorilla:', e.message);
    }
  }

  const ALL_SOURCES = onlyFoorilla
    ? [{ feedId: 'Foorilla' }]
    : [...rssSourcesToRun, ...(runFoorilla ? [{ feedId: 'Foorilla' }] : [])];
  const jobLines = [];
  const feedStats = [];
  let totalJobs = 0;
  for (const source of ALL_SOURCES) {
    const feedId = source.feedId;
    const list = byFeed.get(feedId) || [];
    feedStats.push(`${feedId}: ${list.length}`);
    if (list.length === 0) continue;
    totalJobs += list.length;
    jobLines.push(`\n### ${feedId} (${list.length})\n`);
    for (const entry of list) {
      const { title, url, location } = entry;
      const display = title
        ? (location ? `${title} · ${location} · ${feedId}` : `${title} · ${feedId}`)
        : feedId;
      jobLines.push(`- [ ] [${display}](${url})`);
    }
  }

  const sectionHeader = '\n\n## Remote job boards (RSS)\n\n';
  const sectionIntro = '*По фидам: Remotive, WWR, RemoteOK, JobsCollider (Product/PM), Foorilla (scrape). BettingJobs — отдельный файл digests/bettingjobs-YYYY-MM-DD.md.*  \n';
  const statsLine = `**По фидам:** ${feedStats.join(' | ')}\n\n`;
  const block = sectionHeader + sectionIntro + statsLine + jobLines.join('\n\n') + (jobLines.length ? '\n' : '');

  if (dryRun) {
    console.log(block);
    console.error(`[fetch-remote-pm-rss] Would add ${totalJobs} jobs. By feed: ${feedStats.join(', ')}.`);
    return;
  }

  ensureDirs();
  const rssOnlyContent = (onlyFoorilla ? `# Foorilla PM jobs — ${today}\n\n*Источник: [Foorilla](https://foorilla.com/hiring/) (Product/PM).*\n\n` : sectionIntro) + statsLine + jobLines.join('\n\n').trim() + '\n';
  fs.writeFileSync(rssOnlyPath, rssOnlyContent, 'utf8');

  if (noMerge || onlyFoorilla) {
    console.log(`[fetch-remote-pm-rss] Wrote ${totalJobs} jobs to ${path.relative(VAULT, rssOnlyPath)}. By feed: ${feedStats.join(', ')}.`);
    return;
  }

  let mainContent = '';
  if (fs.existsSync(mainDigestPath)) {
    mainContent = fs.readFileSync(mainDigestPath, 'utf8');
  } else {
    mainContent = `# Job digest — ${today}\n\n*Sources: LinkedIn (email) + Remotive, We Work Remotely, RemoteOK, JobsCollider (RSS).*\n*[ ] to process · [x] applied · [-] rejected.*\n`;
  }

  if (mainContent.includes('## Remote job boards (RSS)')) {
    console.log('[fetch-remote-pm-rss] RSS section already in digest; skipping merge.');
    return;
  }

  fs.writeFileSync(mainDigestPath, mainContent.trimEnd() + block, 'utf8');
  console.log(`[fetch-remote-pm-rss] Merged ${totalJobs} RSS jobs into ${path.relative(VAULT, mainDigestPath)}. By feed: ${feedStats.join(', ')}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
