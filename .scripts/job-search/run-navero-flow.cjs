#!/usr/bin/env node
/**
 * Full Navero flow without manual steps: start save-server (if needed) and open Navero in Chrome.
 * Extension in Chrome will request profile, fill email, get code from Gmail via server, fill code.
 *
 * Usage (from repo root):  npm run job-search:navero
 *   or with URL:          npm run job-search:navero -- "https://app.navero.me/..."
 */
'use strict';

const { execSync, spawn } = require('child_process');
const { openUrlInDexChrome } = require('./dex-chrome-open-background.cjs');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const NAVERO_URL_FILE = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'navero-url.txt');
const DEFAULT_NAVERO_URL = 'https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx';

function portInUse(port) {
  try {
    const out = execSync('lsof -ti :' + port, { encoding: 'utf8' });
    return out.trim().length > 0;
  } catch (_) {
    return false;
  }
}

function killPort(port) {
  try {
    execSync('lsof -ti :' + port + ' | xargs kill 2>/dev/null', { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function startSaveServer() {
  const serverPath = path.join(__dirname, 'dex-linkedin-extension', 'save-server.cjs');
  const child = spawn('node', [serverPath], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  return child.pid;
}

function waitForAtsProfile(maxAttempts, intervalSec) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const out = execSync('curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:8765/ats-profile', { encoding: 'utf8' });
      if (out.trim() === '200') return true;
    } catch (_) {}
    execSync('sleep ' + intervalSec, { stdio: 'ignore' });
  }
  return false;
}

function openChrome(url) {
  if (!openUrlInDexChrome(url)) {
    console.error('Could not open browser. URL:', url);
    process.exit(1);
  }
}

const urlArg = process.argv[2];
let url = urlArg && urlArg.startsWith('http') ? urlArg : null;
if (!url && fs.existsSync(NAVERO_URL_FILE)) {
  url = fs.readFileSync(NAVERO_URL_FILE, 'utf8').trim();
  if (!url.startsWith('http')) url = null;
}
if (!url) url = DEFAULT_NAVERO_URL;

killPort(8765);
execSync('sleep 1', { stdio: 'ignore' });

startSaveServer();
console.log('[Dex] Save-server starting. Waiting for GET /ats-profile 200...');
const ready = waitForAtsProfile(15, 0.5);
if (!ready) {
  console.warn('[Dex] Save-server did not respond in time. Opening Chrome anyway.');
} else {
  console.log('[Dex] Save-server OK.');
}

console.log('[Dex] Opening Chrome:', url);
openChrome(url);
