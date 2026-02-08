#!/usr/bin/env node
/**
 * Read a LinkedIn digest markdown file, fetch each job page, remove non-remote (hybrid/on-site) entries, write back.
 * Usage: node filter-digest-remote-only.cjs [path-to-linkedin-jobs-YYYY-MM-DD.md]
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');
const DEFAULT_FILE = path.join(OUT_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

const FETCH_TIMEOUT_MS = 10000;
const DELAY_BETWEEN_FETCHES_MS = 10000;

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function getJobViewUrl(url) {
  const id = getJobId(url);
  return id ? `https://www.linkedin.com/comm/jobs/view/${id}` : url;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJobPageHtml(url) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    clearTimeout(to);
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    clearTimeout(to);
    return '';
  }
}

function getWorkTypeFromPage(html) {
  if (!html || html.length < 500) return 'unknown';
  const lower = html.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/\bon-?site\b|onsite\b|in-?office\b|in office\b|in-?person\b|in person\b/.test(lower)) return 'on-site';
  if (/\bremote\b/.test(lower)) return 'remote';
  if (/workPlaceType["\s:]+(?:hybrid|HYBRID)/.test(html)) return 'hybrid';
  if (/workPlaceType["\s:]+(?:on-?site|ONSITE|on_site)/.test(html)) return 'on-site';
  if (/workPlaceType["\s:]+(?:remote|REMOTE)/.test(html)) return 'remote';
  return 'unknown';
}

function isJobClosed(html) {
  if (!html || html.length < 100) return false;
  return /no longer accepting applications|no longer accept(ing)?\s+applications|applications?\s*(are\s+)?closed|position\s*(is\s+)?closed|job\s*is\s*no\s+longer|we'?re\s+no\s+longer\s+accepting/i.test(html);
}

const JOB_LINE_RE = /^(- \[[ x\-]\] \[[^\]]*\]\()(https?:[^)]+)(\))$/;

async function main() {
  const filePath = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  if (typeof fetch === 'undefined') {
    console.error('Node 18+ required (fetch).');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const jobLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (JOB_LINE_RE.test(lines[i])) jobLineIndices.push(i);
  }

  console.log(`Found ${jobLineIndices.length} jobs in digest. Checking work type and closed status…`);

  const toRemove = new Set();
  const skipBlankAfter = new Set();
  for (let k = 0; k < jobLineIndices.length; k++) {
    const lineIdx = jobLineIndices[k];
    const line = lines[lineIdx];
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const url = m[2];
    const viewUrl = getJobViewUrl(url);
    process.stdout.write(`  [${k + 1}/${jobLineIndices.length}] ${getJobId(url)} … `);
    const html = await fetchJobPageHtml(viewUrl);
    if (isJobClosed(html)) {
      toRemove.add(lineIdx);
      if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
      console.log('closed (remove)');
    } else {
      const workType = getWorkTypeFromPage(html);
      if (workType === 'hybrid' || workType === 'on-site') {
        toRemove.add(lineIdx);
        if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
        console.log(workType + ' (remove)');
      } else {
        console.log(workType === 'remote' ? 'remote ✓' : 'unknown (keep)');
      }
    }
    if (k < jobLineIndices.length - 1) await sleep(DELAY_BETWEEN_FETCHES_MS);
  }

  if (toRemove.size === 0) {
    console.log('No jobs to remove (hybrid/on-site/closed).');
    return;
  }

  let bestCount = 0;
  let otherCount = 0;
  let inBest = true;
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (toRemove.has(i) || skipBlankAfter.has(i)) continue;
    const line = lines[i];
    if (line === '## Other (PM roles, check if relevant)') inBest = false;
    if (JOB_LINE_RE.test(line)) {
      if (inBest) bestCount++;
      else otherCount++;
    }
    newLines.push(line);
  }

  const newContent = newLines.join('\n');
  const headerCountRe = /^\*\*Best match: (\d+)\*\* \| Other: (\d+)$/m;
  const newContent2 = newContent.replace(headerCountRe, (_, _b, _o) => `**Best match: ${bestCount}** | Other: ${otherCount}`);

  fs.writeFileSync(filePath, newContent2, 'utf8');
  console.log(`Removed ${toRemove.size} jobs (hybrid/on-site/closed). Wrote ${bestCount + otherCount} jobs to ${path.relative(VAULT, filePath)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
