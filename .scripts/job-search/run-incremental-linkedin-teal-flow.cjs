#!/usr/bin/env node
/**
 * Incremental flow: capture from LinkedIn URL → only NEW jobs → add to Teal, create resumes, match-score.
 * Uses a separate Chrome profile (TEAL_CHROME_PROFILE_HOURLY) so it can run in parallel with the full flow.
 * Schedule hourly (e.g. cron 0 * * * *) with the same LinkedIn search URL.
 *
 * Usage:
 *   node .scripts/job-search/run-incremental-linkedin-teal-flow.cjs "https://www.linkedin.com/jobs/search/?..."
 *   npm run job-search:incremental-flow -- "https://..."
 *
 * Flow: capture → diff vs last-processed-job-ids (global: job ID seen in any search URL = already processed) → if no new jobs exit; else digest (filter to new) → steps 3–8.
 * Dedup is global so the same vacancy in multiple LinkedIn searches (e.g. "PM remote" and "PM iGaming") is not added to Teal multiple times.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const {
  TEAL_CHROME_PROFILE_HOURLY,
  LAST_PROCESSED_JOB_IDS_FILE,
  LINKEDIN_DIGESTS_DIR,
  DATA_DIR,
  TEAL_DIR
} = require('./job-search-paths.cjs');
const { normalizeSearchUrl } = require('./job-search-utils.cjs');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const SAVE_SERVER_URL = 'http://127.0.0.1:8765/dex-save';
const INCREMENTAL_LOG = path.join(TEAL_DIR, 'incremental-flow.log');
const LAST_RUN_SUMMARY_FILE = path.join(TEAL_DIR, 'last-incremental-summary.txt');
const CAPTURE_TIMEOUT_MS = 40 * 60 * 1000;
const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;

function writeRunSummary(obj) {
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    const line = Object.entries(obj)
      .map(([k, v]) => k + '=' + (v == null ? '' : String(v)))
      .join(' ');
    fs.writeFileSync(LAST_RUN_SUMMARY_FILE, line + '\n', 'utf8');
  } catch (_) {}
}

function getJobIdsFromExport(exportPath) {
  if (!exportPath || !fs.existsSync(exportPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const results = data.filter?.results || {};
    return Object.keys(results);
  } catch (_) {
    return [];
  }
}

function loadLastProcessedIds() {
  if (!fs.existsSync(LAST_PROCESSED_JOB_IDS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(LAST_PROCESSED_JOB_IDS_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveLastProcessedIds(byUrl) {
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    const data = { ...loadLastProcessedIds(), ...byUrl, updatedAt: new Date().toISOString() };
    fs.writeFileSync(LAST_PROCESSED_JOB_IDS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

/** Write a digest that contains only entries whose job ID is in keepIds. Preserves "  > " description blocks. */
function filterDigestToJobIds(fullDigestPath, keepIds, outPath) {
  const set = new Set(keepIds);
  const content = fs.readFileSync(fullDigestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(JOB_LINE_RE);
    if (m) {
      const jobId = getJobIdFromUrl(m[2]);
      if (jobId && set.has(jobId)) {
        out.push(lines[i]);
        i++;
        while (i < lines.length && (lines[i].startsWith('  > ') || lines[i].startsWith('  >'))) {
          out.push(lines[i]);
          i++;
        }
        continue;
      }
    }
    i++;
  }
  const firstJobLine = lines.findIndex((l) => JOB_LINE_RE.test(l));
  const header = firstJobLine >= 0 ? lines.slice(0, firstJobLine).join('\n').trim() : '# Incremental digest (new jobs only)';
  fs.writeFileSync(outPath, header + '\n\n' + out.join('\n') + '\n', 'utf8');
}

function getDigestPathForExport(exportPath) {
  if (!exportPath || !fs.existsSync(exportPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const searchQuery = (data.searchQuery || 'search').trim();
    const today = new Date().toISOString().slice(0, 10);
    const slug = searchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
    return path.join(LINKEDIN_DIGESTS_DIR, 'search-' + (slug || 'results') + '-' + today + '.md');
  } catch (_) {
    return null;
  }
}

function findLatestSearchExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith('dex-linkedin-search-') && e.name.endsWith('.json'));
  let best = null;
  for (const e of files) {
    const fp = path.join(DATA_DIR, e.name);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function findLatestFullExport() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('dex-linkedin-export-') && f.endsWith('.json'));
  let best = null;
  for (const f of files) {
    const fp = path.join(DATA_DIR, f);
    const stat = fs.statSync(fp);
    if (!best || stat.mtimeMs > best.mtimeMs) best = { path: fp, mtimeMs: stat.mtimeMs };
  }
  return best ? best.path : null;
}

function isSaveServerRunning() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get(SAVE_SERVER_URL, (res) => { resolve(res.statusCode < 500); });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  } catch (_) {
    return Promise.resolve(false);
  }
}

function startSaveServer() {
  const child = require('child_process').spawn('npm', ['run', 'dex-save-server'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
}

function log(msg) {
  const line = '[' + new Date().toISOString() + '] [Incremental] ' + msg;
  console.log(line);
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.appendFileSync(INCREMENTAL_LOG, line + '\n', 'utf8');
  } catch (_) {}
}

async function main() {
  const startedAt = new Date().toISOString();
  global.__incremental_started_at = startedAt;
  const summary = { started_at: startedAt };

  const linkedinUrl = process.argv[2] || process.env.LINKEDIN_SEARCH_URL;
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    summary.finished_at = new Date().toISOString();
    summary.error = 'missing_linkedin_url';
    writeRunSummary(summary);
    console.error('Usage: node run-incremental-linkedin-teal-flow.cjs <linkedin-search-url>');
    process.exit(1);
  }

  process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_HOURLY;
  if (!fs.existsSync(TEAL_CHROME_PROFILE_HOURLY)) fs.mkdirSync(TEAL_CHROME_PROFILE_HOURLY, { recursive: true });
  log('Using hourly Chrome profile (parallel to full flow): ' + TEAL_CHROME_PROFILE_HOURLY);
  log('URL: ' + linkedinUrl.substring(0, 90) + (linkedinUrl.length > 90 ? '...' : ''));

  const urlKey = normalizeSearchUrl(linkedinUrl);
  const lastByUrl = loadLastProcessedIds();
  // Global dedup: treat a job as "already processed" if we've seen it in ANY search URL.
  // Otherwise the same vacancy (e.g. Jobgether) appears in multiple searches (PM remote, iGaming, etc.),
  // each run thinks it's new for that URL, and we add it to Teal + create a resume again = duplicate resumes.
  const lastIds = new Set();
  for (const key of Object.keys(lastByUrl)) {
    if (key === 'updatedAt') continue;
    const ids = lastByUrl[key];
    if (Array.isArray(ids)) ids.forEach((id) => lastIds.add(String(id)));
  }

  // Step 1: Capture
  log('Step 1: Capture from LinkedIn…');
  const ok = await isSaveServerRunning();
  if (!ok) {
    startSaveServer();
    await new Promise((r) => setTimeout(r, 2000));
  }
  try {
    const script = path.join(__dirname, 'linkedin-capture-run.cjs');
    execSync('node ' + JSON.stringify(script) + ' ' + JSON.stringify(linkedinUrl), {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: CAPTURE_TIMEOUT_MS
    });
  } catch (e) {
    summary.finished_at = new Date().toISOString();
    summary.error = 'capture_failed';
    summary.message = (e.message || String(e)).slice(0, 120);
    writeRunSummary(summary);
    log('Capture failed: ' + (e.message || e));
    process.exit(1);
  }

  let exportPath = findLatestSearchExport();
  if (!exportPath && fs.existsSync(path.join(TEAL_DIR, 'last-export-path.txt'))) {
    try {
      const fromFile = fs.readFileSync(path.join(TEAL_DIR, 'last-export-path.txt'), 'utf8').trim().split(/\r?\n/)[0];
      if (fromFile && fs.existsSync(fromFile)) exportPath = fromFile;
    } catch (_) {}
  }
  if (!exportPath || !fs.existsSync(exportPath)) {
    summary.finished_at = new Date().toISOString();
    summary.error = 'no_export_after_capture';
    writeRunSummary(summary);
    log('No export after capture. Abort.');
    process.exit(1);
  }

  const exportIds = getJobIdsFromExport(exportPath);
  const newIds = exportIds.filter((id) => !lastIds.has(id));
  summary.export_total = exportIds.length;
  summary.new_jobs = newIds.length;

  if (newIds.length === 0) {
    summary.finished_at = new Date().toISOString();
    summary.status = 'no_new_jobs';
    writeRunSummary(summary);
    log('No new jobs (' + exportIds.length + ' total, all already processed). Exit. No duplicates added to Teal.');
    process.exit(0);
  }
  log('New jobs: ' + newIds.length + ' (total in export: ' + exportIds.length + '). Only these will be added to Teal (no duplicates).');

  // Step 2: Digest (full), then filter to new only
  log('Step 2: Generate digest and filter to new jobs…');
  execSync('node ' + JSON.stringify(path.join(__dirname, 'generate-search-digest.cjs')) + ' --export ' + JSON.stringify(exportPath), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024
  });
  const fullDigestPath = getDigestPathForExport(exportPath);
  if (!fullDigestPath || !fs.existsSync(fullDigestPath)) {
    log('Digest not generated. Abort.');
    process.exit(1);
  }
  const incrementalDigestPath = path.join(
    LINKEDIN_DIGESTS_DIR,
    'incremental-' + path.basename(fullDigestPath, '.md') + '-' + Date.now() + '.md'
  );
  filterDigestToJobIds(fullDigestPath, newIds, incrementalDigestPath);
  const incrementalCount = require('fs').readFileSync(incrementalDigestPath, 'utf8').match(new RegExp(JOB_LINE_RE.source, 'gm'));
  const count = incrementalCount ? incrementalCount.length : 0;
  summary.digest_count = count;
  if (count === 0) {
    summary.finished_at = new Date().toISOString();
    summary.status = 'digest_filtered_to_zero';
    writeRunSummary(summary);
    log('Filtered digest has 0 jobs (PM filter may have removed all). Exit.');
    process.exit(0);
  }
  log('Incremental digest: ' + count + ' jobs -> ' + path.basename(incrementalDigestPath));

  // Step 3: Filter digest by export (remote/on-site)
  const fullExport = findLatestFullExport();
  if (fullExport && fs.existsSync(fullExport)) {
    spawnSync('node', [
      path.join(__dirname, 'filter-digest-from-export.cjs'),
      incrementalDigestPath,
      fullExport
    ], { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  // Step 4: Open-links HTML
  spawnSync('node', [path.join(__dirname, 'generate-digest-open-links.cjs'), incrementalDigestPath], { cwd: REPO_ROOT, stdio: 'inherit' });

  // Step 5: Add descriptions (fetch missing)
  spawnSync('node', [path.join(__dirname, 'fetch-job-descriptions.cjs'), incrementalDigestPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 45 * 60 * 1000
  });

  // Step 6: Add to Teal (capture output on failure so we can see the error)
  const step6Env = { ...process.env, TEAL_CHROME_PROFILE: TEAL_CHROME_PROFILE_HOURLY };
  const addTealLogPath = path.join(TEAL_DIR, 'add-digest-last-error.txt');
  const addTealScript = path.join(__dirname, 'add-digest-jobs-to-teal-playwright.cjs');
  const addTealArgs = [addTealScript, incrementalDigestPath, '--app', '--export', exportPath];
  let r6 = spawnSync('node', addTealArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    env: step6Env
  });
  if (r6.stdout) process.stdout.write(r6.stdout);
  if (r6.stderr) process.stderr.write(r6.stderr);
  if (r6.status !== 0) {
    try {
      const errLines = [r6.stdout || '', r6.stderr || ''].filter(Boolean).join('\n').slice(-8000);
      if (errLines.trim()) fs.writeFileSync(addTealLogPath, errLines.trim() + '\n', 'utf8');
    } catch (_) {}
    r6 = spawnSync('node', [addTealScript, incrementalDigestPath, '--app', '--setup', '--export', exportPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
      env: step6Env
    });
    if (r6.stdout) process.stdout.write(r6.stdout);
    if (r6.stderr) process.stderr.write(r6.stderr);
  }
  summary.add_teal = r6.status === 0 ? 1 : 0;
  if (r6.status !== 0) {
    log('Add to Teal failed (exit ' + (r6.status || 'signal') + '). Continuing to save processed IDs.');
    try {
      const errLines = [r6.stdout || '', r6.stderr || ''].filter(Boolean).join('\n').slice(-8000);
      if (errLines.trim()) {
        fs.writeFileSync(addTealLogPath, errLines.trim() + '\n', 'utf8');
        log('Last add-digest output saved to: ' + path.basename(addTealLogPath));
      }
    } catch (_) {}
  }

  // Step 7: Create resumes (only for jobs we actually added in step 6 — no duplicates)
  const r7 = spawnSync('node', [path.join(__dirname, 'teal-resume-batch-from-export.cjs'), incrementalDigestPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 3 * 60 * 60 * 1000,
    env: { ...process.env, TEAL_CHROME_PROFILE: TEAL_CHROME_PROFILE_HOURLY, TEAL_ONLY_ADDED_THIS_RUN: '1' }
  });
  summary.resumes = r7.status === 0 ? 1 : 0;
  if (r7.status !== 0) log('Batch resume failed (exit ' + (r7.status || 'signal') + ').');

  // Step 8: Match-score (retry up to 3 times so every run completes)
  const STEP8_MAX_ATTEMPTS = 3;
  let r8Status = -1;
  for (let attempt = 1; attempt <= STEP8_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) log('Match-score retry ' + attempt + '/' + STEP8_MAX_ATTEMPTS + '…');
    const r8 = spawnSync('node', [path.join(__dirname, 'teal-resume-match-score.cjs'), incrementalDigestPath], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: 3 * 60 * 60 * 1000,
      env: { ...process.env, TEAL_CHROME_PROFILE: TEAL_CHROME_PROFILE_HOURLY }
    });
    r8Status = r8.status;
    if (r8.status === 0) break;
    log('Match-score attempt ' + attempt + ' failed (exit ' + (r8.status || 'signal') + ').');
    if (attempt < STEP8_MAX_ATTEMPTS) {
      const delaySec = 15;
      log('Waiting ' + delaySec + 's before retry…');
      try {
        require('child_process').execSync('sleep ' + delaySec, { stdio: 'ignore' });
      } catch (_) {}
    }
  }
  summary.match = r8Status === 0 ? 1 : 0;
  if (r8Status !== 0) log('Match-score failed after ' + STEP8_MAX_ATTEMPTS + ' attempts (exit ' + (r8Status || 'signal') + ').');

  saveLastProcessedIds({ [urlKey]: exportIds });
  summary.finished_at = new Date().toISOString();
  summary.status = 'done';
  writeRunSummary(summary);
  log('Done. Saved ' + exportIds.length + ' processed job IDs for this URL.');
}

main().catch((e) => {
  writeRunSummary({
    started_at: typeof global.__incremental_started_at === 'string' ? global.__incremental_started_at : new Date().toISOString(),
    finished_at: new Date().toISOString(),
    error: 'fatal',
    message: (e.message || String(e)).slice(0, 120)
  });
  log('Fatal: ' + (e.message || e));
  process.exit(1);
});
