#!/usr/bin/env node
/**
 * One-off: set title/job_title from job_description when they are empty or "View job".
 * Usage: node backfill-job-titles.cjs [path-to-job-descriptions-YYYY-MM-DD.json]
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./job-search-paths.cjs');
const { deriveTitleFromDescription } = require('./job-search-utils.cjs');

const jsonPath = process.argv[2]
  ? path.isAbsolute(process.argv[2])
    ? process.argv[2]
    : path.join(process.cwd(), process.argv[2])
  : path.join(DATA_DIR, `job-descriptions-${new Date().toISOString().slice(0, 10)}.json`);

if (!fs.existsSync(jsonPath)) {
  console.error('File not found:', jsonPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const list = Array.isArray(data) ? data : [];
let updated = 0;
for (const j of list) {
  const desc = j.job_description || '';
  const title = (j.title || '').trim();
  const jobTitle = (j.job_title || '').trim();
  const emptyOrViewJob = !title || title === 'View job' || !jobTitle || jobTitle === 'View job';
  if (!emptyOrViewJob) continue;
  const derived = desc.length >= 50 ? deriveTitleFromDescription(desc) : '';
  const newTitle = derived || '—';
  if (j.title !== newTitle || j.job_title !== newTitle) {
    j.title = newTitle;
    j.job_title = newTitle;
    updated++;
  }
}
fs.writeFileSync(jsonPath, JSON.stringify(list, null, 2) + '\n', 'utf8');
console.log('Updated', updated, 'entries in', path.basename(jsonPath));
