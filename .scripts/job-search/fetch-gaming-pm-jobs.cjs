#!/usr/bin/env node
/**
 * Fetch remote Product/PM jobs from JobsCollider RSS and filter for iGaming.
 * Focus: casino, Live Casino, TV games, bingo, lotteries, betting, compliance.
 * JobsCollider: https://jobscollider.com/remote-jobs-api (attribution required).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { VAULT, DIGESTS_DIR, ensureDirs } = require('./job-search-paths.cjs');
const GAMING_KEYWORDS = [
  'igaming', 'i-gaming', 'casino', 'live casino', 'tv games', 'bingo',
  'lottery', 'lotteries', 'gambling', 'sportsbook', 'betting', 'slot',
  'poker', 'mga', 'compliance'
];

const RSS_URLS = [
  { rss: 'https://jobscollider.com/remote-product-jobs.rss', api: 'https://jobscollider.com/api/search-jobs?category=product' },
  { rss: 'https://jobscollider.com/remote-project-management-jobs.rss', api: 'https://jobscollider.com/api/search-jobs?category=project_management' }
];

const FETCH_TIMEOUT_MS = 15000;

function fetchRss(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Dex-JobSearch/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return fetchRss(loc).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchJobsColliderApi(apiUrl) {
  try {
    const data = await fetchRss(apiUrl);
    const json = JSON.parse(data);
    if (!Array.isArray(json.jobs)) return [];
    return json.jobs.map((j) => ({
      title: j.title || '',
      link: j.url || j.link || '',
      description: (j.description || '').slice(0, 300),
      pubDate: j.published_at || ''
    })).filter((j) => j.title && j.link);
  } catch (e) {
    return [];
  }
}

function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/);
    const link = block.match(/<link>(.*?)<\/link>/);
    const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || block.match(/<description>([\s\S]*?)<\/description>/);
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/);
    if (title && link) {
      items.push({
        title: (title[1] || '').replace(/<[^>]+>/g, '').trim(),
        link: (link[1] || '').trim(),
        description: (desc ? desc[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
        pubDate: pubDate ? pubDate[1] : ''
      });
    }
  }
  return items;
}

function matchesGaming(item) {
  const text = `${(item.title || '')} ${(item.description || '')}`.toLowerCase();
  return GAMING_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// Collect URLs that were marked as applied [x] or rejected [-] in previous gaming digest files
function getExcludedUrlsFromPreviousDigests() {
  const excluded = new Set();
  if (!fs.existsSync(DIGESTS_DIR)) return excluded;
  const files = fs.readdirSync(DIGESTS_DIR).filter(f => f.startsWith('gaming-pm-jobs-') && f.endsWith('.md'));
  const re = /^- \[(x|-)\] \[[^\]]*\]\((https?:[^)]+)\)/gm;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(DIGESTS_DIR, file), 'utf8');
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(content)) !== null) {
        excluded.add((m[2] || '').trim());
      }
    } catch (e) {
      // ignore missing/bad files
    }
  }
  return excluded;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const debug = process.argv.includes('--debug');
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(DIGESTS_DIR, `gaming-pm-jobs-${today}.md`);

  (async () => {
    const seen = new Set();
    const results = [];

    const excludedUrls = getExcludedUrlsFromPreviousDigests();

    for (const { rss, api } of RSS_URLS) {
      try {
        let xml = await fetchRss(rss);
        const isHtml = typeof xml === 'string' && (xml.trimStart().toLowerCase().startsWith('<!') || xml.includes('<!doctype'));
        let items = [];
        if (isHtml) {
          if (debug) console.error('[debug] JobsCollider RSS returns HTML (404); trying API fallback.');
          items = await fetchJobsColliderApi(api);
        } else {
          items = parseItems(xml);
        }
        if (debug) {
          const label = rss.includes('product') && !rss.includes('project') ? 'Product' : 'Project Management';
          console.error(`[debug] ${label}: ${items.length} raw items (before iGaming filter)`);
        }
        for (const item of items) {
          if (matchesGaming(item) && !seen.has(item.link)) {
            if (excludedUrls.has((item.link || '').trim())) continue;
            seen.add(item.link);
            results.push(item);
          }
        }
      } catch (e) {
        console.error(`Fetch failed for ${rss}:`, e.message);
      }
    }

    ensureDirs();

    const lines = [
      `# iGaming PM jobs — ${today}`,
      '',
      '*Source: [JobsCollider](https://jobscollider.com) RSS (Product + PM), filtered for iGaming (casino, Live Casino, TV games, bingo, lotteries, betting, compliance).*',
      '*`[ ]` to process · `[x]` applied · `[-]` rejected. See `data/Applied.md` for applications. Applied/rejected (from previous digests) are excluded below.*',
      '',
      `**Found: ${results.length}**`,
      '',
      '---',
      ''
    ];

    for (const j of results) {
      lines.push(`- [ ] [${j.title}](${j.link})`);
      if (j.pubDate) lines.push(`  - ${j.pubDate}`);
      lines.push('');
    }

    const content = lines.join('\n');
    if (dryRun) {
      console.log(content);
      return;
    }
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`Wrote ${results.length} jobs to ${path.relative(VAULT, outPath)}`);
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

main();
