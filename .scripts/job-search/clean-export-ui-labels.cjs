#!/usr/bin/env node
/**
 * Clean LinkedIn export JSON: replace UI-label job titles (e.g. "People you can reach out to",
 * "About the Job") with empty string so consumers treat them as missing title.
 *
 * Usage:
 *   node clean-export-ui-labels.cjs [path-to-export.json]
 *   node clean-export-ui-labels.cjs   # uses latest dex-linkedin-search-*.json in data/
 * Writes in place. Backup recommended for first run.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./job-search-paths.cjs');

const UI_LABEL_PATTERNS = [
  /people\s+(you|they)\s+can\s+reach\s+out\s+to/i,
  /about\s+(the\s+)?job/i,
  /about\s+this\s+role/i,
  /similar\s+jobs/i,
  /meet\s+the\s+hiring\s+team/i,
  /^premium$/i,
  /^job\s+activity$/i,
  /^show\s+more$/i,
  /^show\s+less$/i,
  /^apply$/i,
  /^save$/i,
  /^share$/i,
  /^reposted$/i,
  /^promoted$/i,
  /^skills$/i,
  /how\s+you\s+match/i,
  /base\s+salary/i,
  /recommended\s+for\s+you/i
];

function isUILabel(title) {
  const t = (title || '').trim();
  if (t.length < 3 || t.length > 150) return true;
  return UI_LABEL_PATTERNS.some((re) => re.test(t));
}

function main() {
  let exportPath = process.argv[2];
  if (!exportPath && fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('dex-linkedin-search-') && f.endsWith('.json'))
      .sort();
    if (files.length > 0) exportPath = path.join(DATA_DIR, files[files.length - 1]);
  }
  if (!exportPath || !fs.existsSync(exportPath)) {
    console.error('Usage: node clean-export-ui-labels.cjs [path-to-export.json]');
    console.error('Export not found. Put dex-linkedin-search-*.json in 00-Inbox/Job_Search/data/ or pass path.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  let changed = 0;

  const results = data.filter?.results || data.results || {};
  for (const [id, r] of Object.entries(results)) {
    if (r && r.title && isUILabel(r.title)) {
      r.title = '';
      changed++;
    }
  }

  const jobs = data.jobs || {};
  for (const [id, j] of Object.entries(jobs)) {
    if (j && j.job_title && isUILabel(j.job_title)) {
      j.job_title = '';
      changed++;
    }
  }

  if (changed > 0) {
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Cleaned', exportPath, '—', changed, 'UI-label title(s) replaced with empty string.');
  } else {
    console.log('No UI-label titles found in', exportPath);
  }
}

main();
