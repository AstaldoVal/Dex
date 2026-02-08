#!/usr/bin/env node
/**
 * Generate an HTML page with one link per LinkedIn job from the digest.
 * Open this file in your browser, then open each link (or batch in new tabs);
 * the Dex extension will capture each job page. Then use "Export for Dex" and save the JSON.
 *
 * Usage:
 *   node generate-digest-open-links.cjs [path-to-linkedin-jobs-YYYY-MM-DD.md]
 *   node generate-digest-open-links.cjs   # today's digest
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DIGESTS_DIR, DATA_DIR, ensureDirs } = require('./job-search-paths.cjs');

const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function getJobViewUrl(url) {
  const id = getJobId(url);
  return id ? `https://www.linkedin.com/comm/jobs/view/${id}` : url;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const digestArg = args[0];
  const digestPath = digestArg
    ? path.isAbsolute(digestArg)
      ? digestArg
      : path.join(DIGESTS_DIR, digestArg)
    : path.join(DIGESTS_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found:', digestPath);
    process.exit(1);
  }

  const digestName = path.basename(digestPath);
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  const jobs = [];
  for (const line of lines) {
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const linkText = m[1];
    const url = m[2];
    if (!getJobId(url)) continue;
    jobs.push({ title: linkText, url: getJobViewUrl(url) });
  }

  if (jobs.length === 0) {
    console.log('No LinkedIn job links in digest.');
    return;
  }

  ensureDirs();
  const jobUrlsJson = JSON.stringify({ digestName, urls: jobs });
  const list = jobs
    .map(
      (j, i) =>
        `<li><a href="${j.url}" target="_blank" rel="noopener">${i + 1}. ${escapeHtml(j.title)}</a></li>`
    )
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="dex:digest" content="${escapeHtml(digestName)}">
  <title>Dex: open jobs — ${digestName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 1.25rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 6px 0; }
    a { color: #0a66c2; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hint { color: #666; font-size: 0.9rem; margin-top: 16px; }
    #dex-capture-controls { margin: 16px 0; }
    #dex-start-btn { background: #0a66c2; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: 600; }
    #dex-start-btn:hover { background: #004182; }
  </style>
</head>
<body>
  <h1>Dex: auto-capture LinkedIn jobs</h1>
  <p>Digest: <strong>${escapeHtml(digestName)}</strong> — ${jobs.length} jobs.</p>
  <div id="dex-capture-controls"></div>
  <p class="hint">Or open links manually:</p>
  <ul>
${list}
  </ul>
  <script id="dex-job-urls" type="application/json">${escapeHtml(jobUrlsJson)}</script>
  <p class="hint">When auto-capture finishes, click &quot;Export for Dex&quot; in the extension banner and save the JSON to <code>00-Inbox/Job_Search/data/</code>.</p>
</body>
</html>`;

  const outPath = path.join(DATA_DIR, `digest-open-links-${digestName.replace('.md', '')}.html`);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Wrote', path.relative(VAULT, outPath), '—', jobs.length, 'job links.');

  const serve = process.argv.includes('--serve');
  if (serve) {
    const http = require('http');
    const port = 8765;
    const server = http.createServer((req, res) => {
      const subPath = (req.url || '/').replace(/^\//, '').split('?')[0].replace(/\.\./g, '');
      const requested = subPath || `digest-open-links-${digestName.replace('.md', '')}.html`;
      const safePath = path.resolve(DATA_DIR, path.normalize(requested));
      if (!safePath.startsWith(path.resolve(DATA_DIR))) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(safePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(safePath);
        const ct = ext === '.json' ? 'application/json' : ext === '.html' ? 'text/html' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
      });
    });
    server.listen(port, () => {
      const url = `http://127.0.0.1:${port}/digest-open-links-${digestName.replace('.md', '')}.html`;
      console.log('Server at', url);
      console.log('Open this URL in Chrome (with Dex extension). Click "Start auto-capture".');
      const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      require('child_process').exec(`${open} "${url}"`, () => {});
    });
  } else {
    console.log('Run with --serve to start local server and open in browser: node generate-digest-open-links.cjs --serve');
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main();
