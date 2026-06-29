#!/usr/bin/env node
/**
 * Open a URL in the user's Google Chrome (Dex extension). macOS default: open -g (no focus steal).
 *
 * Usage (from repo root):
 *   node .scripts/job-search/open-url-in-chrome.cjs "https://..."
 *   npm run job-search:open-in-chrome -- "https://..."
 *
 * Legacy foreground: DEX_CHROME_ALLOW_FOCUS_STEAL=1 or DEX_LINKEDIN_USE_OPEN=1
 */
'use strict';

const { openUrlInDexChrome } = require('./dex-chrome-open-background.cjs');

const url = process.argv[2] || process.env.OPEN_URL;
if (!url || !url.startsWith('http')) {
  console.error('Usage: node open-url-in-chrome.cjs <url>');
  console.error('   or: OPEN_URL="https://..." node open-url-in-chrome.cjs');
  process.exit(1);
}

if (!openUrlInDexChrome(url, { log: (m) => console.error(m) })) {
  console.error('Could not open browser. Paste URL in Chrome:', url);
  process.exit(1);
}
