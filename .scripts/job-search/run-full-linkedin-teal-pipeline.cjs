#!/usr/bin/env node
/**
 * Full pipeline: LinkedIn search URL → capture → digest (filter) → add to Teal
 * → create Teal resumes → match-score (optimize summary, add target title, export to Applied, cover letter).
 *
 * Step 3 (match-score) per resume: open Job Matcher → if score < 80% add/iterate Professional Summary
 * → add Target Title (normalized from vacancy) → export PDF to Applied/<Company>/<Vacancy>/ → create or copy cover letter.
 * Retries each step on failure until success. No manual steps.
 *
 * Usage (from repo root):
 *   node .scripts/job-search/run-full-linkedin-teal-pipeline.cjs "https://www.linkedin.com/jobs/search?..."
 *   npm run job-search:full-pipeline -- "https://..."
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const DIGESTS_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'digests', 'linkedin');

const LINKEDIN_TO_TEAL_TIMEOUT_MS = 40 * 60 * 1000;   // 40 min
const BATCH_TIMEOUT_MS = 3 * 60 * 60 * 1000;         // 3 h
const MATCH_SCORE_TIMEOUT_MS = 3 * 60 * 60 * 1000;   // 3 h

function findLatestExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.startsWith('dex-linkedin-search-') && e.name.endsWith('.json'));
  let best = null;
  for (const e of files) {
    const fp = path.join(DATA_DIR, e.name);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function findLatestDigest() {
  if (!fs.existsSync(DIGESTS_DIR)) return null;
  const files = fs.readdirSync(DIGESTS_DIR)
    .filter(f => f.startsWith('search-') && f.endsWith('.md'));
  let best = null;
  for (const f of files) {
    const fp = path.join(DIGESTS_DIR, f);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function runStep(name, fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Pipeline] ${name} (attempt ${attempt}/${maxRetries})…`);
      const result = fn();
      if (result && result.failed) {
        throw new Error(result.message || 'Step reported failure');
      }
      console.log(`[Pipeline] ${name} OK`);
      return result;
    } catch (e) {
      console.error(`[Pipeline] ${name} failed:`, e.message || e);
      if (attempt === maxRetries) throw e;
      console.log(`[Pipeline] Retrying in 10s…`);
      try {
        execSync('sleep 10', { stdio: 'ignore' });
      } catch (_) {}
    }
  }
}

function main() {
  const linkedinUrl = process.argv[2] || process.env.LINKEDIN_SEARCH_URL;
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    console.error('Usage: node run-full-linkedin-teal-pipeline.cjs <linkedin-search-url>');
    process.exit(1);
  }

  let exportPath;
  let digestPath;

  // Step 1: Capture + digest + add to Teal
  runStep('LinkedIn capture + digest + add to Teal', () => {
    execSync('node .scripts/job-search/linkedin-capture-and-teal.cjs ' + JSON.stringify(linkedinUrl), {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 15 * 1024 * 1024,
      timeout: LINKEDIN_TO_TEAL_TIMEOUT_MS
    });
    const ep = findLatestExport();
    const dp = findLatestDigest();
    if (!ep || !fs.existsSync(ep)) {
      throw new Error('No export JSON found after capture');
    }
    exportPath = ep;
    digestPath = dp;
  });

  if (!exportPath) {
    exportPath = findLatestExport();
    digestPath = findLatestDigest();
  }
  if (!exportPath) {
    console.error('[Pipeline] Could not determine export path.');
    process.exit(1);
  }
  console.log('[Pipeline] Using export:', exportPath);
  if (digestPath) console.log('[Pipeline] Using digest:', digestPath);

  // Step 2: Teal resume batch
  runStep('Teal resume batch', () => {
    const result = spawnSync('node', [
      '.scripts/job-search/teal-resume-batch-from-export.cjs',
      exportPath
    ], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: BATCH_TIMEOUT_MS
    });
    if (result.status !== 0) {
      throw new Error('teal-resume-batch exited with ' + (result.status || 'signal'));
    }
  });

  // Step 3: Match score (optimize summary, add target title, export PDF + cover letter to Applied/<Company>)
  const matchScoreSource = digestPath && fs.existsSync(digestPath) ? digestPath : exportPath;
  runStep('Teal match-score (summary + target title + export to Applied)', () => {
    const result = spawnSync('node', [
      '.scripts/job-search/teal-resume-match-score.cjs',
      matchScoreSource
    ], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: MATCH_SCORE_TIMEOUT_MS
    });
    if (result.status !== 0) {
      throw new Error('teal-resume-match-score exited with ' + (result.status || 'signal'));
    }
  });

  console.log('[Pipeline] Full cycle completed successfully.');
}

main();
