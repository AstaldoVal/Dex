#!/usr/bin/env node
/**
 * Open LinkedIn job search URL in default browser with dex-auto-capture=1.
 * Extension will auto-start capture, read total results from the page (e.g. 85),
 * and capture until that number is reached or there are no more pages.
 * On pagination failure the extension saves state so you can re-open the URL and resume.
 * This script polls for the saved JSON and prints its path when done (or exits on timeout).
 *
 * Usage (from repo root):
 *   node .scripts/job-search/linkedin-capture-run.cjs "https://www.linkedin.com/jobs/search/?keywords=..."
 *   npm run job-search:linkedin-capture -- "https://..."
 *
 * Requires: Dex LinkedIn extension installed in default browser, optionally npm run dex-save-server.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { openUrlInDexChrome, closeDexOpenChrome } = require('./dex-chrome-open-background.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(__dirname, 'dex-linkedin-extension');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const TEAL_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'teal');
const LAST_EXPORT_PATH_FILE = path.join(TEAL_DIR, 'last-export-path.txt');
const POLL_INTERVAL_MS = 10000;
const TIMEOUT_MS = 30 * 60 * 1000;
const FILE_MTIME_TOLERANCE_MS = 10000; // file counts as "from this run" if mtime >= startTime - this

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

function main() {
  const rawUrl = process.argv[2] || process.env.LINKEDIN_SEARCH_URL;
  if (!rawUrl || !rawUrl.includes('linkedin.com')) {
    console.error('Usage: node linkedin-capture-run.cjs <linkedin-search-url>');
    process.exit(1);
  }

  const linkedinUrl = rawUrl.replace(/#.*$/, '').replace(/[?&]dex-auto-capture=1/g, '').replace(/\?$/, '');

  // Build direct LinkedIn URL with dex-auto-capture (opens the real search/job page; extension starts capture from param).
  function linkedinUrlWithCapture() {
    let url = linkedinUrl.includes('?') ? linkedinUrl + '&dex-auto-capture=1' : linkedinUrl + '?dex-auto-capture=1';
    if (url.indexOf('#dex-auto-capture=1') === -1) url = url + '#dex-auto-capture=1';
    return url;
  }

  // Trigger embeds the full jobs/search URL in a query param. If that string is truncated (OS limits,
  // address bar, etc.), `url` decodes to a broken or root-only URL → LinkedIn sends you to /feed.
  // Default: open the real jobs/search URL with dex-auto-capture=1 (correct page). Opt into trigger
  // only when LinkedIn strips the param: DEX_LINKEDIN_USE_TRIGGER=1
  const MAX_TRIGGER_URL_LENGTH = 2000;
  const useTrigger =
    process.env.DEX_LINKEDIN_USE_TRIGGER === '1' || process.env.DEX_LINKEDIN_USE_TRIGGER === 'true';
  let urlToOpen;
  const extId = getExtensionId();
  if (extId && useTrigger) {
    const triggerUrl = 'chrome-extension://' + extId + '/trigger.html?url=' + encodeURIComponent(linkedinUrl);
    if (triggerUrl.length <= MAX_TRIGGER_URL_LENGTH) {
      urlToOpen = triggerUrl;
      console.error('[Dex] Using extension trigger page (ID from extension-id.txt or DEX_EXTENSION_ID)');
    } else {
      urlToOpen = linkedinUrlWithCapture();
      console.error('[Dex] Search URL too long for trigger; opening LinkedIn page directly (dex-auto-capture=1).');
    }
  } else {
    urlToOpen = linkedinUrlWithCapture();
    if (!extId) {
      console.error('[Dex] Default: LinkedIn jobs/search with dex-auto-capture=1 (no trigger). Put extension ID in');
      console.error('[Dex]   ' + path.join(EXTENSION_DIR, 'extension-id.txt') + ' and set DEX_LINKEDIN_USE_TRIGGER=1 only if you need the trigger page.');
    } else {
      console.error('[Dex] Opening LinkedIn with dex-auto-capture=1 (set DEX_LINKEDIN_USE_TRIGGER=1 to use chrome-extension trigger).');
    }
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const startTime = Date.now();
  console.error('[Dex] Opening in browser (background, no focus steal):', urlToOpen.substring(0, 80) + (urlToOpen.length > 80 ? '...' : ''));

  const logDex = (msg) => console.error(msg);
  const dexOpenOpts = { log: logDex, runKey: 'linkedin-capture' };
  process.on('exit', () => closeDexOpenChrome(dexOpenOpts));

  if (!openUrlInDexChrome(urlToOpen, dexOpenOpts)) {
    console.error('[Dex] Could not open browser. Paste in Chrome (profile with Dex):');
    console.error('[Dex] ' + urlToOpen);
    process.exit(1);
  }

  console.error('[Dex] Capture should auto-start in ~4s. Waiting for saved file (poll every 10s, timeout 30min)...');
  const cutoffTime = startTime - FILE_MTIME_TOLERANCE_MS;

  while (Date.now() - startTime < TIMEOUT_MS) {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    let best = null;
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith('dex-linkedin-search-') || !e.name.endsWith('.json')) continue;
      const fp = path.join(DATA_DIR, e.name);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs >= cutoffTime) {
        if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
      }
    }
    if (best) {
      console.log(best.path);
      console.error('[Dex] Found:', best.path);
      try {
        if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
        fs.writeFileSync(LAST_EXPORT_PATH_FILE, best.path + '\n', 'utf8');
      } catch (_) {}
      process.exit(0);
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error('[Dex] No new file yet (' + elapsed + 's elapsed)...');
    const remaining = TIMEOUT_MS - (Date.now() - startTime);
    if (remaining <= 0) break;
    const sleepMs = Math.min(POLL_INTERVAL_MS, remaining);
    try {
      execSync('sleep ' + (sleepMs / 1000).toFixed(1), { stdio: 'ignore' });
    } catch (_) {}
  }

  console.error('[Dex] Timeout. No new dex-linkedin-search-*.json appeared in', DATA_DIR);
  process.exit(2);
}

main();
