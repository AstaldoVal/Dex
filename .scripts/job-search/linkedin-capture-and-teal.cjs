#!/usr/bin/env node
/**
 * One command: parse LinkedIn search by URL → generate digest → add jobs to Teal.
 * Prints the list of parsed vacancies added to Teal at the end.
 *
 * Usage (from repo root):
 *   node .scripts/job-search/linkedin-capture-and-teal.cjs "https://www.linkedin.com/jobs/search/?keywords=..."
 *   npm run job-search:linkedin-to-teal -- "https://..."
 *
 * Options:
 *   --no-teal    Only capture + digest; do not add to Teal.
 *
 * Requires: Dex LinkedIn extension, save server (started automatically in background), Teal credentials in .env.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const DATA_DIR = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'data');
const SAVE_SERVER_URL = 'http://127.0.0.1:8765/dex-save';

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
  const script = path.join(REPO_ROOT, 'node_modules', '.bin', 'npm');
  const cwd = REPO_ROOT;
  const child = spawn('npm', ['run', 'dex-save-server'], { cwd, stdio: 'ignore', detached: true });
  child.unref();
}

function runCapture(linkedinUrl) {
  const script = path.join(__dirname, 'linkedin-capture-run.cjs');
  const out = execSync('node ' + JSON.stringify(script) + ' ' + JSON.stringify(linkedinUrl), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  const lines = out.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.includes('dex-linkedin-search-') && line.endsWith('.json') && (path.isAbsolute(line) || line.startsWith(REPO_ROOT))) {
      return path.isAbsolute(line) ? line : path.resolve(REPO_ROOT, line);
    }
    if (fs.existsSync(line)) return line;
  }
  throw new Error('Capture did not return JSON path. Output: ' + out.slice(-500));
}

function runGenerateDigest(exportPath) {
  const script = path.join(__dirname, 'generate-search-digest.cjs');
  const out = execSync('node ' + JSON.stringify(script) + ' --export ' + JSON.stringify(exportPath), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024
  });
  const match = out.match(/Digest file:\s*(.+)/m);
  if (match) return match[1].trim();
  const linkedinDir = path.join(REPO_ROOT, '00-Inbox', 'Job_Search', 'digests', 'linkedin');
  const files = fs.readdirSync(linkedinDir).filter((f) => f.startsWith('search-') && f.endsWith('.md'));
  files.sort();
  return files.length ? path.join(linkedinDir, files[files.length - 1]) : null;
}

function runTeal(digestPath, exportPath) {
  const script = path.join(__dirname, 'add-digest-jobs-to-teal-playwright.cjs');
  const cmd = 'node ' + JSON.stringify(script) + ' ' + JSON.stringify(digestPath) + ' --app --export ' + JSON.stringify(exportPath);
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--no-teal');
  const noTeal = process.argv.includes('--no-teal');
  const linkedinUrl = argv[0] || process.env.LINKEDIN_SEARCH_URL;

  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    console.error('Usage: node linkedin-capture-and-teal.cjs <linkedin-search-url> [--no-teal]');
    process.exit(1);
  }

  console.log('[Dex] Step 1: ensure save server…');
  const serverOk = await isSaveServerRunning();
  if (!serverOk) {
    console.log('[Dex] Starting save server in background.');
    startSaveServer();
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('[Dex] Step 2: capture LinkedIn search (browser will open)…');
  const jsonPath = runCapture(linkedinUrl);
  console.log('[Dex] Captured:', jsonPath);

  console.log('[Dex] Step 3: generate digest…');
  const digestPath = runGenerateDigest(jsonPath);
  if (!digestPath || !fs.existsSync(digestPath)) {
    console.error('[Dex] Digest not generated.');
    process.exit(1);
  }
  console.log('[Dex] Digest:', digestPath);

  const digestContent = fs.readFileSync(digestPath, 'utf8');
  const jobLineRe = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;
  const jobLineCount = digestContent.split('\n').filter((line) => jobLineRe.test(line)).length;
  if (jobLineCount === 0) {
    console.error('[Dex] Digest has 0 jobs (filter removed all or export format unexpected).');
    console.error('[Dex] Step 4 (add to Teal) is skipped — no jobs to add. Fix filter or re-run capture with more results.');
    if (!noTeal) process.exit(1);
  } else {
    console.log('[Dex] Jobs in digest:', jobLineCount);
  }

  if (noTeal) {
    console.log('[Dex] Skipping Teal (--no-teal). Done.');
    return;
  }

  console.log('[Dex] Step 4: add jobs to Teal…');
  runTeal(digestPath, jsonPath);
  console.log('[Dex] Done. See list above for vacancies added to Teal.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
