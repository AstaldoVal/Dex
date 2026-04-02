#!/usr/bin/env node
/**
 * Fill job descriptions for a digest using the Dex extension only (no Playwright on LinkedIn).
 * With one arg: generates open-links HTML, starts server, opens browser with dex-auto-capture=1;
 * extension auto-starts capture; after each job it POSTs to /dex-save-job (incremental). Script
 * polls every 20s, runs inject-into-digest each time so the digest updates as jobs are captured;
 * when full export appears, runs inject-from-export and inject-into-digest then exits.
 * With two args (digest + export path): runs inject steps only.
 *
 * Usage:
 *   node fetch-job-descriptions.cjs [path-to-digest.md]
 *     → Full auto: server, open browser, wait for export, inject into digest.
 *   node fetch-job-descriptions.cjs [path-to-digest.md] [path-to-export.json]
 *     → Injects descriptions from export into data/jobs/ and into the digest.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const { VAULT, LINKEDIN_DIGESTS_DIR, DATA_DIR, JOBS_DIR } = require('./job-search-paths.cjs');

const scriptDir = __dirname;
const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function getJobViewUrl(url) {
  const id = getJobIdFromUrl(url);
  return id ? 'https://www.linkedin.com/comm/jobs/view/' + id : url;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns [{ jobId, title, url }] for digest job lines that have no description block. */
function getMissingDescriptions(digestPath) {
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const missing = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JOB_LINE_RE);
    if (!m) continue;
    const title = m[1];
    const url = m[2];
    const jobId = getJobIdFromUrl(url);
    if (!jobId) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j] || '').trim() === '') j++;
    const nextNonEmpty = (lines[j] || '').trim();
    if (nextNonEmpty.startsWith('>')) continue;
    missing.push({ jobId, title, url: getJobViewUrl(url) });
  }
  return missing;
}

/** Write HTML with only the missing job links for retry capture. */
function writeRetryOpenLinksHtml(missingJobs, digestName) {
  const jobs = missingJobs.map((j) => ({ title: j.title, url: j.url }));
  const jobUrlsJson = JSON.stringify({ digestName, urls: jobs });
  const list = jobs
    .map(
      (j, i) =>
        '<li><a href="' + j.url + '" target="_blank" rel="noopener">' + (i + 1) + '. ' + escapeHtml(j.title) + '</a></li>'
    )
    .join('\n');
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="dex:digest" content="' + escapeHtml(digestName) + '">\n<title>Dex: retry missing — ' + escapeHtml(digestName) + '</title>\n<style>\nbody{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;} ul{list-style:none;padding:0;} li{margin:6px 0;} a{color:#0a66c2;}\n</style>\n</head>\n<body>\n<h1>Dex: retry ' + jobs.length + ' jobs without description</h1>\n<div id="dex-capture-controls"></div>\n<ul>\n' + list + '\n</ul>\n<script id="dex-job-urls" type="application/json">' + jobUrlsJson.replace(/<\/script>/g, '<\\/script>') + '</script>\n</body>\n</html>';
  const baseName = digestName.replace('.md', '');
  const outPath = path.join(DATA_DIR, 'digest-open-links-RETRY-' + baseName + '.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return path.basename(outPath);
}
const POLL_INTERVAL_MS = 20000;
const TIMEOUT_MS = 35 * 60 * 1000;
const FILE_MTIME_TOLERANCE_MS = 10000;
const LOG_FILE = path.join(DATA_DIR, 'fetch-descriptions.log');

function log(...args) {
  const line = args.map(String).join(' ');
  const ts = new Date().toISOString();
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, ts + ' ' + line + '\n', 'utf8');
  } catch (_) {}
}

function resolveDigestPath(arg) {
  if (!arg) {
    if (!fs.existsSync(LINKEDIN_DIGESTS_DIR)) return null;
    const files = fs.readdirSync(LINKEDIN_DIGESTS_DIR)
      .filter((f) => f.startsWith('search-') && f.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return path.join(LINKEDIN_DIGESTS_DIR, files[0]);
  }
  if (path.isAbsolute(arg)) return arg;
  const fromVault = path.resolve(VAULT, arg);
  if (fs.existsSync(fromVault)) return fromVault;
  const fromCwd = path.resolve(process.cwd(), arg);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const linkedinDir = LINKEDIN_DIGESTS_DIR;
  const normalized = arg.replace(/^linkedin\//, '').replace(/^.*[/\\]/, '');
  return path.join(linkedinDir, normalized);
}

/** Shell-escape URL for passing to osascript (single-quote style so URL can contain double-quotes). */
function shellEscapeForOsascript(url) {
  return "'" + String(url).replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Open URL in Google Chrome. Tries AppleScript first (reliable new-tab open), then open -a Chrome.
 * Returns true if any method succeeded.
 */
function openBrowser(url) {
  const { execSync } = require('child_process');
  const quoted = '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  // 1) AppleScript: open location in Chrome (usually opens in new tab even if Chrome was already open)
  try {
    const arg = shellEscapeForOsascript(url);
    execSync(
      'osascript -e \'on run argv\' -e \'tell application "Google Chrome" to open location (item 1 of argv)\' -e \'end run\' -- ' + arg,
      { stdio: 'pipe', timeout: 5000 }
    );
    return true;
  } catch (_) {}
  // 2) macOS open -a "Google Chrome" URL
  try {
    execSync('open -a "Google Chrome" ' + quoted, { stdio: 'inherit' });
    return true;
  } catch (_) {
    try {
      execSync('open ' + quoted, { stdio: 'inherit' });
      return true;
    } catch (_2) {
      return false;
    }
  }
}

/** Wait until the open-links server responds with 200 for the given URL (max ~15s). */
function waitForServerReady(url, maxAttempts = 30) {
  const http = require('http');
  return new Promise((resolve) => {
    const u = new URL(url);
    const reqPath = u.pathname + u.search;
    let attempts = 0;
    function tryOnce() {
      attempts++;
      const req = http.get({ hostname: u.hostname, port: u.port || 80, path: reqPath, timeout: 2000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
          return;
        }
        if (attempts < maxAttempts) setTimeout(tryOnce, 500);
        else resolve(false);
      });
      req.on('error', () => {
        if (attempts < maxAttempts) setTimeout(tryOnce, 500);
        else resolve(false);
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxAttempts) setTimeout(tryOnce, 500);
        else resolve(false);
      });
    }
    tryOnce();
  });
}

function main() {
  const hasRetryOnly = process.argv.indexOf('--retry-only') !== -1;
  const args = process.argv.slice(2).filter((a) => a !== '--retry-only' && !a.startsWith('--'));
  const digestArg = args[0];
  const exportPathArg = args[1];

  const digestPath = resolveDigestPath(digestArg);
  if (!digestPath || !fs.existsSync(digestPath)) {
    console.error('Digest not found. Usage: node fetch-job-descriptions.cjs <path-to-digest.md> [path-to-export.json]');
    console.error('  Add --retry-only to only open missing jobs (no full run).');
    process.exit(1);
  }

  const digestName = path.basename(digestPath);
  const OPEN_LINKS_PORT = 8766;

  if (hasRetryOnly) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    log('[Dex] Mode: retry-only (missing jobs). Digest: ' + path.relative(VAULT, digestPath));
    log('[Dex] Step 1: start server on port ' + OPEN_LINKS_PORT + ' (background)…');
    const serverChild = spawn(process.execPath, [
      path.join(scriptDir, 'generate-digest-open-links.cjs'),
      digestPath,
      '--serve',
      '--serve-no-open',
      '--port=' + OPEN_LINKS_PORT
    ], { stdio: 'ignore', cwd: VAULT, detached: true, env: { ...process.env, DEX_FETCH_DESCRIPTIONS_LOG: LOG_FILE } });
    serverChild.unref();
    spawnSync(process.execPath, [
      path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
      digestPath
    ], { stdio: 'inherit', cwd: VAULT });
    let missing = getMissingDescriptions(digestPath);
    if (missing.length === 0) {
      log('[Dex] All vacancies have descriptions. Done.');
      process.exit(0);
      return;
    }
    const maxRetries = 4;
    let retryCount = 0;
    function doRetry() {
      missing = getMissingDescriptions(digestPath);
      if (missing.length === 0) {
        log('[Dex] All vacancies have descriptions. Done.');
        process.exit(0);
        return;
      }
      retryCount++;
      const retryTimeoutMs = Math.max(15 * 60 * 1000, missing.length * 2 * 60 * 1000);
      log('[Dex] Vacancies without description: ' + missing.length);
      missing.forEach(function (j) {
        log('[Dex]   - ' + j.title + ' (id ' + j.jobId + ')');
      });
      if (retryCount > maxRetries) {
        log('[Dex] Max retries reached. Exiting with error.');
        process.exit(1);
        return;
      }
      const retryHtmlName = writeRetryOpenLinksHtml(missing, digestName);
      const retryUrl = 'http://127.0.0.1:' + OPEN_LINKS_PORT + '/' + retryHtmlName + '?dex-auto-capture=1';
      log('[Dex] Retry ' + retryCount + '/' + maxRetries + ': open browser for ' + missing.length + ' jobs (timeout ' + Math.round(retryTimeoutMs / 60000) + ' min)…');
      openBrowser(retryUrl);
      const retryStartTime = Date.now();
      function retryPoll() {
        spawnSync(process.execPath, [
          path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
          digestPath
        ], { stdio: 'inherit', cwd: VAULT });
        missing = getMissingDescriptions(digestPath);
        if (missing.length === 0) {
          log('[Dex] All vacancies now have descriptions. Done.');
          process.exit(0);
          return;
        }
        if (Date.now() - retryStartTime >= retryTimeoutMs) {
          log('[Dex] Retry ' + retryCount + ' timeout. Still missing ' + missing.length + '. Starting next retry round…');
          doRetry();
          return;
        }
        setTimeout(retryPoll, POLL_INTERVAL_MS);
      }
      setTimeout(retryPoll, 8000);
    }
    doRetry();
    return;
  }

  if (exportPathArg) {
    const exportPath = path.isAbsolute(exportPathArg) ? exportPathArg : path.resolve(process.cwd(), exportPathArg);
    if (!fs.existsSync(exportPath)) {
      console.error('Export file not found:', exportPath);
      process.exit(1);
    }
    console.log('Step 1: inject descriptions from export into data/jobs/ …');
    const r1 = spawnSync(process.execPath, [
      path.join(scriptDir, 'inject-job-descriptions-from-export.cjs'),
      exportPath
    ], { stdio: 'inherit', cwd: VAULT });
    if (r1.status !== 0) process.exit(r1.status);
    console.log('Step 2: inject descriptions into digest …');
    const r2 = spawnSync(process.execPath, [
      path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
      digestPath
    ], { stdio: 'inherit', cwd: VAULT });
    process.exit(r2.status != null ? r2.status : 0);
    return;
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const logPath = path.relative(VAULT, LOG_FILE);
  log('[Dex] Digest: ' + path.relative(VAULT, digestPath));
  log('[Dex] Log file: ' + logPath);
  log('[Dex] To follow progress in another terminal: tail -f ' + logPath);
  log('[Dex] Step 1: generate open-links HTML…');
  spawnSync(process.execPath, [
    path.join(scriptDir, 'generate-digest-open-links.cjs'),
    digestPath
  ], { stdio: 'inherit', cwd: VAULT });

  const htmlBase = 'digest-open-links-' + digestName.replace('.md', '') + '.html';
  const openLinksUrl = 'http://127.0.0.1:' + OPEN_LINKS_PORT + '/' + htmlBase + '?dex-auto-capture=1';

  log('[Dex] Step 2: start server on port ' + OPEN_LINKS_PORT + ' (background)…');
  const serverChild = spawn(process.execPath, [
    path.join(scriptDir, 'generate-digest-open-links.cjs'),
    digestPath,
    '--serve',
    '--serve-no-open',
    '--port=' + OPEN_LINKS_PORT
  ], { stdio: 'ignore', cwd: VAULT, detached: true, env: { ...process.env, DEX_FETCH_DESCRIPTIONS_LOG: LOG_FILE } });
  serverChild.unref();

  const startTime = Date.now();
  const cutoffTime = startTime - FILE_MTIME_TOLERANCE_MS;
  const OPEN_RETRY_AFTER_MS = 30000;
  let openRetryDone = false;

  waitForServerReady(openLinksUrl).then((ready) => {
    if (ready) log('[Dex] Server ready.');
    else log('[Dex] Server did not respond in time; opening anyway.');
    log('[Dex] Step 3: open open-links page (job descriptions) in Chrome — NOT the LinkedIn search capture.');
    console.log('\n[Dex] Open-links URL (paste in Chrome if the wrong page opened):\n  ' + openLinksUrl + '\n');
    log('[Dex] Step 3: opening browser at open-links URL…');
    const opened = openBrowser(openLinksUrl);
    if (!opened) log('[Dex] openBrowser failed. Paste the URL above into Chrome manually.');
    log('[Dex] Waiting for export file (poll every 20s, timeout 35min)…');
    setTimeout(poll, 5000);
  });

  function poll() {
    if (!openRetryDone && (Date.now() - startTime >= OPEN_RETRY_AFTER_MS)) {
      const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      const hasNewExport = entries.some((e) => e.isFile() && e.name.startsWith('dex-linkedin-export-') && e.name.endsWith('.json') && fs.statSync(path.join(DATA_DIR, e.name)).mtimeMs >= cutoffTime);
      if (!hasNewExport) {
        openRetryDone = true;
        log('[Dex] No export yet after 30s. Re-opening open-links page (open-links only, not search capture).');
        openBrowser(openLinksUrl);
      }
    }
    if (fs.existsSync(JOBS_DIR)) {
      log('[Dex] Incremental inject into digest: ' + path.relative(VAULT, digestPath));
      spawnSync(process.execPath, [
        path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
        digestPath
      ], { stdio: 'inherit', cwd: VAULT });
    }
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    let best = null;
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith('dex-linkedin-export-') || !e.name.endsWith('.json')) continue;
      const fp = path.join(DATA_DIR, e.name);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs >= cutoffTime) {
        if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
      }
    }
    if (best) {
      log('[Dex] Export found: ' + best.path);
      log('[Dex] Step 4: inject into data/jobs/ and digest…');
      const r1 = spawnSync(process.execPath, [
        path.join(scriptDir, 'inject-job-descriptions-from-export.cjs'),
        best.path
      ], { stdio: 'inherit', cwd: VAULT });
      if (r1.status !== 0) process.exit(r1.status);
      spawnSync(process.execPath, [
        path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
        digestPath
      ], { stdio: 'inherit', cwd: VAULT });

      let missing = getMissingDescriptions(digestPath);
      const digestContent = fs.readFileSync(digestPath, 'utf8');
      const totalMatch = digestContent.match(new RegExp(JOB_LINE_RE.source, 'g'));
      const total = totalMatch ? totalMatch.length : 0;
      log('[Dex] Vacancies with description: ' + (total - missing.length) + ', without: ' + missing.length + (total ? ' (total ' + total + ')' : ''));
      if (missing.length === 0) {
        log('[Dex] All vacancies have descriptions. Done.');
        process.exit(0);
        return;
      }

      const maxRetries = 4;
      let retryCount = 0;

      function doRetry() {
        missing = getMissingDescriptions(digestPath);
        if (missing.length === 0) {
          log('[Dex] All vacancies have descriptions. Done.');
          process.exit(0);
          return;
        }
        retryCount++;
        const retryTimeoutMs = Math.max(15 * 60 * 1000, missing.length * 2 * 60 * 1000);
        log('[Dex] Vacancies without description: ' + missing.length);
        missing.forEach(function (j) {
          log('[Dex]   - ' + j.title + ' (id ' + j.jobId + ')');
        });
        if (retryCount > maxRetries) {
          log('[Dex] Max retries reached. Exiting with error.');
          process.exit(1);
          return;
        }
        const retryHtmlName = writeRetryOpenLinksHtml(missing, digestName);
        const retryUrl = 'http://127.0.0.1:' + OPEN_LINKS_PORT + '/' + retryHtmlName + '?dex-auto-capture=1';
        log('[Dex] Retry ' + retryCount + '/' + maxRetries + ': open browser for ' + missing.length + ' jobs (timeout ' + Math.round(retryTimeoutMs / 60000) + ' min)…');
        openBrowser(retryUrl);
        const retryStartTime = Date.now();

        function retryPoll() {
          spawnSync(process.execPath, [
            path.join(scriptDir, 'inject-job-descriptions-into-digest.cjs'),
            digestPath
          ], { stdio: 'inherit', cwd: VAULT });
          missing = getMissingDescriptions(digestPath);
          if (missing.length === 0) {
            log('[Dex] All vacancies now have descriptions. Done.');
            process.exit(0);
            return;
          }
          if (Date.now() - retryStartTime >= retryTimeoutMs) {
            log('[Dex] Retry ' + retryCount + ' timeout. Still missing ' + missing.length + '. Starting next retry round…');
            doRetry();
            return;
          }
          setTimeout(retryPoll, POLL_INTERVAL_MS);
        }
        setTimeout(retryPoll, 8000);
      }

      doRetry();
      return;
    }
    if (Date.now() - startTime >= TIMEOUT_MS) {
      log('[Dex] Timeout. No dex-linkedin-export-*.json appeared in ' + DATA_DIR);
      process.exit(2);
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log('[Dex] No export yet (' + elapsed + 's)…');
    setTimeout(poll, POLL_INTERVAL_MS);
  }

  // First poll is started inside waitForServerReady().then(...) after opening the browser.
}

main();
