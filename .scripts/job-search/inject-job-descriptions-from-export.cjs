#!/usr/bin/env node
/**
 * Write job descriptions from Dex extension export into data/jobs/<id>.json.
 * No Playwright — use export JSON from the extension after you open job pages in your browser.
 *
 * Usage:
 *   node inject-job-descriptions-from-export.cjs [path-to-export.json]
 *   node inject-job-descriptions-from-export.cjs   # uses latest dex-linkedin-export-*.json in data/
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DATA_DIR, JOBS_DIR, ensureDirs } = require('./job-search-paths.cjs');

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  let exportPath = args[0];
  if (!exportPath && fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('dex-linkedin-export-') && f.endsWith('.json'));
    files.sort();
    if (files.length > 0) exportPath = path.join(DATA_DIR, files[files.length - 1]);
  }
  if (!exportPath || !fs.existsSync(exportPath)) {
    console.error('Export file not found. Save Dex extension export to', DATA_DIR, 'as dex-linkedin-export-YYYY-MM-DD.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(exportPath, 'utf8');
  const data = JSON.parse(raw);
  const jobs = data.jobs || {};
  if (Object.keys(jobs).length === 0) {
    console.log('No jobs in export.');
    return;
  }

  ensureDirs();
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

  let written = 0;
  for (const [jobId, payload] of Object.entries(jobs)) {
    if (!payload.job_description || payload.job_description.length < 100) continue;
    const jobPath = path.join(JOBS_DIR, jobId + '.json');
    const out = {
      id: jobId,
      url: payload.url || `https://www.linkedin.com/comm/jobs/view/${jobId}`,
      job_title: payload.job_title || '—',
      company: payload.company || '—',
      work_type: payload.work_type || 'Remote',
      job_description: payload.job_description
    };
    fs.writeFileSync(jobPath, JSON.stringify(out, null, 2), 'utf8');
    written++;
  }
  console.log('Wrote', written, 'job descriptions to', path.relative(VAULT, JOBS_DIR), 'from', path.basename(exportPath));
}

main();
