#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends: Fetch Taplio Trending Topics
 *
 * Fetches https://taplio.com/trending, parses the daily topic list and
 * sample posts, and saves to:
 *   00-Inbox/LinkedIn_Trends/data/taplio-trends-YYYY-MM-DD.json
 *
 * Designed to run daily (lightweight — no browser, no API key).
 * If fetch fails or page structure has changed, exits 0 with a warning
 * so the rest of the pipeline is never blocked.
 *
 * Usage:
 *   node fetch-taplio-trends.cjs
 *   npm run linkedin-trends:taplio
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR  = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const URL       = 'https://taplio.com/trending';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function log(...args) {
  console.error('[Dex Taplio]', new Date().toISOString(), ...args);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      }
    };

    const req = https.get(url, options, res => {
      // Follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * Parse Taplio HTML.
 *
 * The page renders Next.js-generated HTML. The content we need lives inside
 * the rendered markup as plain text wrapped in heading / paragraph tags.
 * We look for:
 *   <h2>Topic Name</h2>  →  section start
 *   author lines + post text paragraphs between sections
 *
 * Fallback: also try to extract from the __NEXT_DATA__ JSON blob which
 * Next.js embeds in every page.
 */
function parseTaplioHtml(html) {
  const topics = [];

  // --- Strategy 1: extract from __NEXT_DATA__ JSON ---
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // Navigate possible paths where Taplio stores trending data
      const props = nextData && nextData.props && nextData.props.pageProps;
      if (props && props.trends && Array.isArray(props.trends)) {
        for (const t of props.trends) {
          const topicName = (t.topic || t.name || t.keyword || '').toLowerCase().trim();
          if (!topicName) continue;
          const posts = (t.posts || t.tweets || t.items || []).slice(0, 3).map(p => ({
            author: (p.author || p.name || p.username || '').trim().slice(0, 60),
            text: stripHtml(p.text || p.content || p.body || '').slice(0, 300)
          })).filter(p => p.text);
          topics.push({ topic: topicName, postCount: posts.length, topPosts: posts });
        }
        if (topics.length > 0) {
          log(`Parsed ${topics.length} topics from __NEXT_DATA__`);
          return topics;
        }
      }
    } catch (_) {
      // fall through to HTML parsing
    }
  }

  // --- Strategy 2: parse rendered HTML headings ---
  // Strip script/style blocks first
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Split on <h2> tags — each represents a trend topic
  const h2Sections = clean.split(/<h2[^>]*>/i);

  for (let i = 1; i < h2Sections.length; i++) {
    const section = h2Sections[i];

    // Extract topic name (text before </h2>)
    const topicMatch = section.match(/^([^<]{1,60})<\/h2>/i);
    if (!topicMatch) continue;

    const rawTopic = stripHtml(topicMatch[1]).trim().toLowerCase();
    // Skip nav/footer noise
    if (!rawTopic || rawTopic.length > 40 || /copyright|privacy|terms|taplio|cookie/i.test(rawTopic)) continue;

    // Extract up to 3 post text blocks from this section (until next h2)
    const sectionBody = section.slice(topicMatch[0].length);
    const postBlocks = [];

    // Look for <p> or <div> blocks with substantial text
    const pMatches = [...sectionBody.matchAll(/<p[^>]*>([\s\S]{30,600}?)<\/p>/gi)];
    for (const m of pMatches.slice(0, 3)) {
      const text = stripHtml(m[1]).replace(/\s+/g, ' ').trim();
      if (text.length > 30) {
        postBlocks.push({ author: '', text: text.slice(0, 300) });
      }
    }

    topics.push({
      topic: rawTopic,
      postCount: postBlocks.length,
      topPosts: postBlocks
    });
  }

  // --- Strategy 3: markdown-style headings in pre-rendered text ---
  if (topics.length === 0) {
    const text = stripHtml(clean);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentTopic = null;
    let currentPosts = [];

    for (const line of lines) {
      // Topic header lines are typically short capitalized words
      if (/^[A-Z][a-z]{2,20}$/.test(line) && line.length < 25) {
        if (currentTopic) {
          topics.push({ topic: currentTopic.toLowerCase(), postCount: currentPosts.length, topPosts: currentPosts.slice(0, 3) });
        }
        currentTopic = line;
        currentPosts = [];
      } else if (currentTopic && line.length > 40 && line.length < 500) {
        currentPosts.push({ author: '', text: line.slice(0, 300) });
      }
    }
    if (currentTopic && currentPosts.length > 0) {
      topics.push({ topic: currentTopic.toLowerCase(), postCount: currentPosts.length, topPosts: currentPosts.slice(0, 3) });
    }
  }

  log(`Parsed ${topics.length} topics from HTML`);
  return topics;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  log('Fetching', URL);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const today = todayStr();
  const outputPath = path.join(DATA_DIR, `taplio-trends-${today}.json`);

  // Skip if already fetched today
  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
    if (ageHours < 6) {
      log(`Already fetched today (${Math.round(ageHours * 10) / 10}h ago). Skipping.`);
      console.log(outputPath);
      return;
    }
  }

  let html;
  try {
    html = await fetchPage(URL);
    log(`Fetched ${html.length} bytes`);
  } catch (e) {
    log(`WARNING: Fetch failed: ${e.message}. Taplio trends will be skipped.`);
    process.exit(0);
  }

  const topics = parseTaplioHtml(html);

  if (topics.length === 0) {
    log('WARNING: Could not parse any topics from Taplio page. Page structure may have changed.');
    // Save a stub so we know we tried
    const stub = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: URL,
      parseError: 'No topics extracted — page structure may have changed',
      topics: []
    };
    fs.writeFileSync(outputPath, JSON.stringify(stub, null, 2), 'utf8');
    console.log(outputPath);
    return;
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    sourceUrl: URL,
    date: today,
    topicCount: topics.length,
    topics
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  log(`Saved ${topics.length} topics → ${outputPath}`);
  topics.forEach(t => log(`  - ${t.topic} (${t.postCount} posts)`));
  console.log(outputPath);
}

main().catch(e => {
  log('FATAL:', e && e.message ? e.message : e);
  process.exit(0); // Always exit 0 — don't block the pipeline
});
