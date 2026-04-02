#!/usr/bin/env node
'use strict';

/**
 * LinkedIn Trends Capture Runner
 *
 * Iterates through active hashtags in config.json, opens each one in the real
 * Google Chrome browser with the Dex extension, and waits for trend-capture.js
 * to scrape posts and save a JSON file to 00-Inbox/LinkedIn_Trends/data/.
 *
 * Between hashtags: waits 90 seconds (configurable) to avoid rate-limiting.
 *
 * Usage:
 *   node linkedin-trends-capture-run.cjs
 *   npm run linkedin-trends:capture
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(REPO_ROOT, '.scripts', 'job-search', 'dex-linkedin-extension');
const SCRIPTS_DIR = path.join(REPO_ROOT, '.scripts', 'linkedin-trends');
const CONFIG_PATH = path.join(SCRIPTS_DIR, 'config.json');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends', 'data');
const LOG_DIR = path.join(REPO_ROOT, '00-Inbox', 'LinkedIn_Trends');

const SAVE_SERVER_PORT = 8765;
const POLL_INTERVAL_MS = 5000;
const FILE_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per hashtag
const FILE_MTIME_TOLERANCE_MS = 10000;       // file must be newer than capture start

function log(...args) {
  const ts = new Date().toISOString();
  console.error('[Dex Trends]', ts, ...args);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isPortOpen(port, host) {
  return new Promise(resolve => {
    const socket = net.connect(port, host);
    socket.on('connect', () => { socket.end(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

async function ensureSaveServerRunning() {
  const up = await isPortOpen(SAVE_SERVER_PORT, '127.0.0.1');
  if (up) {
    log('Save-server already running on port', SAVE_SERVER_PORT);
    return;
  }

  const saveServerScript = path.join(EXTENSION_DIR, 'save-server.cjs');
  log('Save-server not running. Starting:', saveServerScript);

  try {
    const logPath = path.join(LOG_DIR, 'dex-save-server.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const fd = fs.openSync(logPath, 'a');
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

  // Poll until port is open
  const start = Date.now();
  while (Date.now() - start < 8000) {
    await sleep(400);
    if (await isPortOpen(SAVE_SERVER_PORT, '127.0.0.1')) {
      log('Save-server started successfully.');
      return;
    }
  }
  log('WARNING: Save-server did not start in time. Capture may still work via background.');
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
        if (s && !s.startsWith('#')) return s;
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
  } catch (_) {
    try {
      execSync('open ' + quoted, { stdio: 'inherit' });
      return true;
    } catch (_) {
      return false;
    }
  }
}

function buildSearchUrl(hashtag) {
  // LinkedIn search for content with hashtag, sorted by recent
  const tag = hashtag.replace(/^#/, '');
  const encoded = encodeURIComponent('#' + tag);
  return `https://www.linkedin.com/search/results/content/?keywords=${encoded}&sortBy=date_posted&dex-auto-capture=1`;
}

function buildTriggerUrl(hashtag, extId) {
  const searchUrl = buildSearchUrl(hashtag);
  if (!extId) return searchUrl;
  const trigger = 'chrome-extension://' + extId + '/trigger.html?url=' + encodeURIComponent(searchUrl);
  if (trigger.length <= 2000) return trigger;
  return searchUrl;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    log('ERROR: Cannot load config.json:', e.message);
    process.exit(1);
  }
}

function getActiveHashtags(config) {
  return (config.hashtags || []).filter(h => h.status === 'active' || h.status === 'testing');
}

function hashtagToSlug(tag) {
  return tag.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

async function waitForCaptureFile(hashtag, captureStartMs) {
  const slug = hashtagToSlug(hashtag);
  const today = todayStr();
  const expectedPattern = new RegExp(`^dex-linkedin-trend-${today}-${slug}\\.json$`);
  const cutoff = captureStartMs - FILE_MTIME_TOLERANCE_MS;

  const deadline = Date.now() + FILE_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const entries = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR, { withFileTypes: true }) : [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!expectedPattern.test(e.name)) continue;
      const fp = path.join(DATA_DIR, e.name);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs >= cutoff) {
        return fp;
      }
    }
    const elapsed = Math.round((Date.now() - captureStartMs) / 1000);
    log(`Waiting for ${expectedPattern.source}… (${elapsed}s elapsed)`);
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function captureHashtag(hashtag, extId, pauseMs) {
  log(`\n--- Capturing hashtag: ${hashtag} ---`);

  const url = buildTriggerUrl(hashtag, extId);
  log('Opening:', url.substring(0, 100) + (url.length > 100 ? '…' : ''));

  const captureStartMs = Date.now();
  const opened = openUrlInChrome(url);
  if (!opened) {
    log('ERROR: Failed to open Chrome for', hashtag);
    return null;
  }

  log('Browser opened. Waiting for capture file…');
  const filePath = await waitForCaptureFile(hashtag, captureStartMs);

  if (filePath) {
    log(`SUCCESS: Captured ${hashtag} → ${filePath}`);
  } else {
    log(`TIMEOUT: No capture file appeared for ${hashtag} within ${FILE_WAIT_TIMEOUT_MS / 1000}s`);
  }

  return filePath;
}

async function main() {
  log('=== LinkedIn Trends Capture Start ===');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log('Created data directory:', DATA_DIR);
  }

  await ensureSaveServerRunning();

  const config = loadConfig();
  const hashtags = getActiveHashtags(config);
  const pauseMs = (config.captureSettings && config.captureSettings.pauseBetweenHashtagsMs) || 90000;

  if (hashtags.length === 0) {
    log('No active hashtags found in config.json. Nothing to capture.');
    process.exit(0);
  }

  log(`Found ${hashtags.length} hashtags to capture:`, hashtags.map(h => h.tag).join(', '));
  log(`Pause between hashtags: ${pauseMs / 1000}s`);

  const extId = getExtensionId();
  if (!extId) {
    log('WARNING: Extension ID not found. Will use ?dex-auto-capture=1 URL param (may be less reliable).');
  } else {
    log('Extension ID:', extId);
  }

  const results = [];
  let failed = 0;

  for (let i = 0; i < hashtags.length; i++) {
    const h = hashtags[i];

    const filePath = await captureHashtag(h.tag, extId, pauseMs);
    results.push({ hashtag: h.tag, filePath: filePath || null, ok: !!filePath });

    if (!filePath) failed++;

    // Pause between hashtags (skip after last one)
    if (i < hashtags.length - 1) {
      log(`Pausing ${pauseMs / 1000}s before next hashtag (${hashtags[i + 1].tag})…`);
      await sleep(pauseMs);
    }
  }

  log('\n=== LinkedIn Trends Capture Complete ===');
  log(`Results: ${results.filter(r => r.ok).length} succeeded, ${failed} failed`);
  results.forEach(r => {
    const status = r.ok ? 'OK' : 'FAILED';
    log(`  [${status}] ${r.hashtag}${r.filePath ? ' → ' + path.basename(r.filePath) : ''}`);
  });

  if (failed === hashtags.length) {
    log('All captures failed. Check that Chrome is open, extension is loaded, and save-server is running.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => {
  log('FATAL:', e && e.message ? e.message : e);
  process.exit(2);
});
