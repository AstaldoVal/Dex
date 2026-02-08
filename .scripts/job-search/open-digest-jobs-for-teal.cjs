#!/usr/bin/env node
/**
 * Collect LinkedIn job URLs from a Job Digest and open them for saving to Teal.
 * Teal extension can save a job only when you're on the job page — so we open each URL
 * in your browser; you click "Save" in the Teal extension on each tab.
 *
 * Usage:
 *   node open-digest-jobs-for-teal.cjs [digest-file-or-date]
 *   node open-digest-jobs-for-teal.cjs linkedin-jobs-2026-02-07.md
 *   node open-digest-jobs-for-teal.cjs 2026-02-07
 *
 * Options:
 *   --print     Print one URL per line (for copy-paste or piping)
 *   --html      Write an HTML file that opens all jobs in new tabs (open in Chrome, then use Teal on each)
 *   --open      Open each URL in default browser with delay (default 10s) so you can click Teal Save on each
 *   --delay N   Delay in seconds between opens (default 10)
 *
 * Examples:
 *   node open-digest-jobs-for-teal.cjs 2026-02-07 --print
 *   node open-digest-jobs-for-teal.cjs 2026-02-07 --html
 *   node open-digest-jobs-for-teal.cjs 2026-02-07 --open --delay 12
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { JOB_SEARCH_ROOT, DIGESTS_DIR, DATA_DIR, TEAL_DIR, ensureDirs } = require('./job-search-paths.cjs');

function extractJobIdFromUrl(url) {
  const m = (url || '').match(/view\/(\d+)/);
  return m ? m[1] : null;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('linkedin.com') && u.pathname.includes('/jobs/view/')) {
      const id = u.pathname.match(/\/view\/(\d+)/);
      return id ? `https://www.linkedin.com/comm/jobs/view/${id[1]}` : url;
    }
  } catch (_) {}
  return url;
}

function getUrlsFromJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const list = Array.isArray(data) ? data : [];
  const seen = new Set();
  return list
    .map((j) => (j.url || j.rawUrl || '').trim())
    .filter((url) => {
      const n = normalizeUrl(url);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return n.includes('linkedin.com') && extractJobIdFromUrl(n);
    })
    .map(normalizeUrl);
}

const JOB_LINE_RE = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;

function getUrlsFromDigest(mdPath) {
  if (!fs.existsSync(mdPath)) return [];
  const text = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');
  const seen = new Set();
  const urls = [];
  for (const line of lines) {
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const raw = m[1].trim();
    const n = raw.includes('linkedin.com') ? normalizeUrl(raw) : raw;
    if (n && !seen.has(n)) {
      seen.add(n);
      urls.push(n);
    }
  }
  return urls;
}

function openInBrowser(url, platform) {
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    execSync(`${cmd} ${JSON.stringify(url)}`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Open failed:', e.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const optPrint = process.argv.includes('--print');
  const optHtml = process.argv.includes('--html');
  const optOpen = process.argv.includes('--open');
  const delayIdx = process.argv.indexOf('--delay');
  const delaySec = Math.max(10, delayIdx >= 0 && process.argv[delayIdx + 1] ? parseInt(process.argv[delayIdx + 1], 10) : 10);
  const input = args[0] || 'linkedin-jobs-' + new Date().toISOString().slice(0, 10) + '.md';

  ensureDirs();
  let digestPath;
  if (path.isAbsolute(input)) {
    digestPath = input;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    digestPath = path.join(DIGESTS_DIR, `linkedin-jobs-${input}.md`);
  } else {
    digestPath = path.join(DIGESTS_DIR, input);
  }

  const base = path.basename(digestPath, path.extname(digestPath));
  const dateMatch = base.match(/(\d{4}-\d{2}-\d{2})/);
  const jsonPath = dateMatch ? path.join(DATA_DIR, `job-descriptions-${dateMatch[1]}.json`) : null;

  let urls = jsonPath ? getUrlsFromJson(jsonPath) : [];
  if (urls.length === 0) urls = getUrlsFromDigest(digestPath);

  if (urls.length === 0) {
    console.error('No job URLs found in digest. Check path:', digestPath);
    process.exit(1);
  }

  if (optPrint) {
    urls.forEach((u) => console.log(u));
    return;
  }

  if (optHtml) {
    const htmlPath = path.join(TEAL_DIR, `teal-open-all-${dateMatch ? dateMatch[1] : 'jobs'}.html`);
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Open digest jobs for Teal</title>
  <style>
    body { font-family: system-ui; padding: 1rem; max-width: 40rem; }
    button { padding: 0.75rem 1.5rem; font-size: 1rem; cursor: pointer; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>Job Digest → Teal</h1>
  <p>${urls.length} LinkedIn jobs from digest. Click "Open all in new tabs", then on each tab use the Teal extension to save the job.</p>
  <button type="button" id="openAll">Open all in new tabs</button>
  <script>
    var urls = ${JSON.stringify(urls)};
    document.getElementById('openAll').onclick = function() {
      urls.forEach(function(u) { window.open(u, '_blank'); });
    };
  </script>
</body>
</html>`;
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('Wrote', htmlPath);
    console.log('Open this file in Chrome, click "Open all in new tabs", then use Teal extension to save each job.');
    return;
  }

  if (optOpen) {
    console.log(`Opening ${urls.length} URLs in default browser (${delaySec}s between each). Use Teal extension to save each job.`);
    (async () => {
      for (let i = 0; i < urls.length; i++) {
        openInBrowser(urls[i], process.platform);
        if (i < urls.length - 1) await sleep(delaySec * 1000);
      }
      console.log('Done.');
    })();
    return;
  }

  // default: print usage and URL count
  console.log('URLs found:', urls.length);
  console.log('');
  console.log('Options:');
  console.log('  --print       Print URLs (one per line)');
  console.log('  --html        Generate HTML file to open all in new tabs');
  console.log('  --open        Open each URL in browser with delay (use Teal Save on each)');
  console.log('  --delay N     Delay in seconds between --open (default 10)');
}

main();
