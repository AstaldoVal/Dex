#!/usr/bin/env node
/**
 * Open LinkedIn Grow in Chrome, wait for Dex extension export, then build digest.
 * User only action: click "Dex: Capture Hiring Managers" when the page loads.
 * No Playwright on LinkedIn — extension runs in user's Chrome.
 *
 * Usage (from repo root):
 *   node .scripts/job-search/run-hiring-managers-capture-and-digest.cjs
 *   npm run job-search:hiring-managers-capture
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { openUrlInDexChrome } = require('./dex-chrome-open-background.cjs');
const { DATA_DIR, LINKEDIN_DIGESTS_DIR } = require('./job-search-paths.cjs');

const GROW_URL = 'https://www.linkedin.com/mynetwork/grow/';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MINUTES = 60;

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function openInChrome(url) {
  return openUrlInDexChrome(url);
}

function waitForExportFile(dateStr) {
  const exportPath = path.join(DATA_DIR, `dex-linkedin-hiring-managers-${dateStr}.json`);
  const deadline = Date.now() + POLL_MAX_MINUTES * 60 * 1000;
  return new Promise((resolve) => {
    function check() {
      if (fs.existsSync(exportPath)) {
        resolve(exportPath);
        return;
      }
      if (Date.now() > deadline) {
        resolve(null);
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    }
    check();
  });
}

function main() {
  const dateStr = todayStr();
  const exportPath = path.join(DATA_DIR, `dex-linkedin-hiring-managers-${dateStr}.json`);

  if (fs.existsSync(exportPath)) {
    console.log('[Dex] Export already exists:', exportPath);
    console.log('[Dex] Building digest...');
    execSync(
      `node ${path.join(__dirname, 'generate-hiring-managers-digest.cjs')} ${exportPath}`,
      { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') }
    );
    const digestPath = path.join(LINKEDIN_DIGESTS_DIR, `hiring-managers-remote-${dateStr}.md`);
    console.log('[Dex] Digest:', digestPath);
    return;
  }

  console.log('[Dex] Opening LinkedIn Grow in Chrome. Click "Dex: Capture Hiring Managers" on the page.');
  if (!openInChrome(GROW_URL)) {
    console.error('[Dex] Could not open browser. Open manually:', GROW_URL);
    process.exit(1);
  }

  console.log('[Dex] Waiting for export (max ' + POLL_MAX_MINUTES + ' min). Ensure save-server is running: npm run dex-save-server');
  waitForExportFile(dateStr).then((resolved) => {
    if (!resolved) {
      console.error('[Dex] Timeout. Export not found:', exportPath);
      console.error('[Dex] After capture finishes, run: npm run job-search:hiring-managers-digest');
      process.exit(1);
    }
    console.log('[Dex] Export found. Building digest...');
    execSync(
      `node ${path.join(__dirname, 'generate-hiring-managers-digest.cjs')} ${resolved}`,
      { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') }
    );
    const digestPath = path.join(LINKEDIN_DIGESTS_DIR, `hiring-managers-remote-${dateStr}.md`);
    console.log('[Dex] Done. Digest:', digestPath);
  });
}

main();
