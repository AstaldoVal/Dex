#!/usr/bin/env node
'use strict';

/**
 * Open LinkedIn Home Feed in Chrome and auto-start Dex feed capture.
 *
 * Works with the existing Dex LinkedIn extension:
 * - trigger.html sets `dexAutoCaptureRequested` in chrome.storage.local
 * - feed-capture.js reads it and starts scrolling + exporting JSON
 *
 * Finally this script polls:
 *   00-Inbox/Job_Search/data/dex-linkedin-feed-*.json
 * and prints the newest export path.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(REPO_ROOT, '.scripts', 'job-search', 'dex-linkedin-extension');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const TEAL_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal');

const LAST_EXPORT_PATH_FILE = path.join(TEAL_DIR, 'last-linkedin-feed-export-path.txt');

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 25 * 60 * 1000;
const FILE_MTIME_TOLERANCE_MS = 8000;

function isPortOpen(port, host) {
  return new Promise(function (resolve) {
    var socket = net.connect(port, host);
    socket.on('connect', function () {
      socket.end();
      resolve(true);
    });
    socket.on('error', function () {
      resolve(false);
    });
  });
}

async function ensureSaveServerRunning() {
  var host = '127.0.0.1';
  var port = 8765;

  try {
    var up = await isPortOpen(port, host);
    if (up) return;

    var saveServerScript = path.join(EXTENSION_DIR, 'save-server.cjs');
    console.error('[Dex] save-server not running. Starting:', saveServerScript);

    // Detached so it keeps running even after this script exits.
    try {
      var logPath = path.join(TEAL_DIR, 'dex-save-server.log');
      var fd = fs.openSync(logPath, 'a');
      spawn(process.execPath, [saveServerScript], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: ['ignore', fd, fd]
      }).unref();
    } catch (_) {
      spawn(process.execPath, [saveServerScript], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: 'ignore'
      }).unref();
    }

    // Wait until port is open (best effort).
    var start = Date.now();
    while (Date.now() - start < 7000) {
      up = await isPortOpen(port, host);
      if (up) return;
      await new Promise(function (r) { setTimeout(r, 300); });
    }
  } catch (e) {
    console.error('[Dex] ensureSaveServerRunning failed:', e.message);
  }
}

function getExtensionId() {
  const fromEnv = process.env.DEX_EXTENSION_ID;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const idFile = path.join(EXTENSION_DIR, 'extension-id.txt');
  try {
    if (fs.existsSync(idFile)) {
      const lines = fs.readFileSync(idFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const s = line.trim();
        if (s && s.indexOf('#') !== 0) return s;
      }
    }
  } catch (_) {}
  return null;
}

function openUrlInChrome(url) {
  const quoted = '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  try {
    execSync('open -a "Google Chrome" ' + quoted, { stdio: 'inherit' });
    return true;
  } catch (e1) {
    try {
      execSync('open ' + quoted, { stdio: 'inherit' });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function buildLinkedInUrlWithCapture(feedUrl) {
  const base = feedUrl.replace(/#.*$/, '').replace(/\?dex-auto-capture=1/g, '').replace(/\/$/, '');
  // Best-effort: if LinkedIn keeps query params, content script will auto-start from this param too.
  const withParam = base + '?dex-auto-capture=1';
  return withParam;
}

async function main() {
  const feedUrl = process.argv[2] || 'https://www.linkedin.com/feed/';

  if (!feedUrl.includes('linkedin.com')) {
    console.error('Usage: node linkedin-feed-capture-run.cjs <linkedin-feed-url>');
    process.exit(1);
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });

  await ensureSaveServerRunning();

  const startTime = Date.now();
  const cutoffTime = startTime - FILE_MTIME_TOLERANCE_MS;

  const extId = getExtensionId();
  const maxTriggerUrlLen = 2000;

  let urlToOpen;
  if (extId) {
    const triggerUrl = 'chrome-extension://' + extId + '/trigger.html?url=' + encodeURIComponent(feedUrl);
    if (triggerUrl.length <= maxTriggerUrlLen) {
      urlToOpen = triggerUrl;
      console.error('[Dex] Opening Feed via extension trigger page (auto-start capture).');
    } else {
      urlToOpen = buildLinkedInUrlWithCapture(feedUrl);
      console.error('[Dex] Trigger URL too long; opening feed directly with dex-auto-capture=1.');
    }
  } else {
    urlToOpen = buildLinkedInUrlWithCapture(feedUrl);
    console.error('[Dex] Extension id not found; opening feed directly with dex-auto-capture=1.');
  }

  console.error('[Dex] Opening in browser:', urlToOpen.substring(0, 80) + (urlToOpen.length > 80 ? '...' : ''));
  if (!openUrlInChrome(urlToOpen)) {
    console.error('[Dex] open failed');
    process.exit(1);
  }

  console.error('[Dex] Waiting for exported dex-linkedin-feed-*.json (poll every 5s, timeout 25min)…');

  while (Date.now() - startTime < TIMEOUT_MS) {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    let best = null;

    for (const e of entries) {
      if (!e.isFile()) continue;
      // Accept only real capture exports: dex-linkedin-feed-YYYY-MM-DD.json
      if (!/^dex-linkedin-feed-\d{4}-\d{2}-\d{2}\.json$/.test(e.name)) continue;
      const fp = path.join(DATA_DIR, e.name);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoffTime) continue;
      if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
    }

    if (best) {
      try {
        fs.writeFileSync(LAST_EXPORT_PATH_FILE, best.path + '\n', 'utf8');
      } catch (_) {}
      console.log(best.path);
      process.exit(0);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error('[Dex] No export yet (' + elapsed + 's)…');

    const remaining = TIMEOUT_MS - (Date.now() - startTime);
    const sleepMs = Math.min(POLL_INTERVAL_MS, remaining);
    if (sleepMs <= 0) break;

    try {
      execSync('sleep ' + (sleepMs / 1000).toFixed(1), { stdio: 'ignore' });
    } catch (_) {}
  }

  console.error('[Dex] Timeout. No new dex-linkedin-feed-*.json appeared in', DATA_DIR);
  process.exit(2);
}

main().catch(function (e) {
  console.error('[Dex] linkedin-feed-capture-run failed:', e && e.message ? e.message : e);
  process.exit(2);
});

