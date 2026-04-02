#!/usr/bin/env node
/**
 * Open a URL in the user's Google Chrome (default browser on macOS: open -a "Google Chrome").
 * Use this when the Dex extension or other Chrome-only flow must run (ATS autofill, LinkedIn capture, etc.).
 *
 * Usage (from repo root):
 *   node .scripts/job-search/open-url-in-chrome.cjs "https://app.navero.me/..."
 *   npm run job-search:open-in-chrome -- "https://..."
 */
'use strict';

const { execSync } = require('child_process');

const url = process.argv[2] || process.env.OPEN_URL;
if (!url || !url.startsWith('http')) {
  console.error('Usage: node open-url-in-chrome.cjs <url>');
  console.error('   or: OPEN_URL="https://..." node open-url-in-chrome.cjs');
  process.exit(1);
}

const quoted = '"' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
try {
  execSync('open -a "Google Chrome" ' + quoted, { stdio: 'inherit' });
} catch (e1) {
  try {
    execSync('open ' + quoted, { stdio: 'inherit' });
  } catch (e2) {
    console.error('Could not open browser. Paste URL in Chrome:', url);
    process.exit(1);
  }
}
