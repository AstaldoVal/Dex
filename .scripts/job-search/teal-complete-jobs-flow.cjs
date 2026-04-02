#!/usr/bin/env node
/**
 * Complete full flow for Teal jobs that have no resume yet: fetch job data from Teal,
 * create resume, run match-score. Use when jobs were added to Teal but resume step was skipped.
 *
 * Usage:
 *   node teal-complete-jobs-flow.cjs <teal-job-url-1> [<teal-job-url-2> ...]
 *   node teal-complete-jobs-flow.cjs https://app.tealhq.com/job-tracker/7e6132f5-34f2-4c05-94dc-8f757795ee90 ...
 *   npm run job-search:teal-complete-jobs -- "https://app.tealhq.com/job-tracker/<uuid>" ...
 *
 * For each URL: fetch title/company/description from Teal -> create resume (teal-resume-for-job)
 * -> run match-score (teal-resume-match-score --resume-url ... --company ... --job-description-file).
 * Browser: visible Chrome (same as other Teal scripts). Close Chrome before run or use TEAL_CHROME_PROFILE.
 *
 * Forbidden: do not run in background (no &, no nohup). Script must run in foreground so the browser
 * is visible and automation can complete. If run in background, the script exits immediately.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { TEAL_DIR, ensureDirs, VAULT, TEAL_CHROME_PROFILE_COMPLETE } = require('./job-search-paths.cjs');
const { launchTealContext } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');

const VAULT_ROOT = VAULT;
const JOBS_OUT_DIR = path.join(TEAL_DIR, 'jobs');
const RESUME_TO_JOB_PATH = path.join(TEAL_DIR, 'resume-to-job.json');
const FULL_FLOW_LOG = path.join(TEAL_DIR, 'full-flow.log');

const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

/** Don't use product name "Teal" as job title or company. */
function sanitizeJobField(value) {
  if (!value || typeof value !== 'string') return '';
  const s = value.trim();
  if (!s) return '';
  if (/^Teal$/i.test(s)) return '';
  if (/^Teal\s*[-–—|]/i.test(s)) return s.replace(/^Teal\s*[-–—|]\s*/i, '').trim();
  if (/\s*[-–—|]\s*Teal\s*$/i.test(s)) return s.replace(/\s*[-–—|]\s*Teal\s*$/i, '').trim();
  return s;
}

function extractUuid(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const m = urlOrId.trim().match(UUID_RE);
  return m ? m[0] : null;
}

function loadResumeToJob() {
  try {
    if (fs.existsSync(RESUME_TO_JOB_PATH)) return JSON.parse(fs.readFileSync(RESUME_TO_JOB_PATH, 'utf8'));
  } catch (_) {}
  return {};
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract title, company, desc from a JSON object (any common shape). */
function extractJobFromPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const obj = data.data ?? data.job ?? data.result ?? data;
  const item = Array.isArray(obj) ? obj[0] : obj;
  if (!item || typeof item !== 'object') return null;
  const title = item.jobTitle ?? item.title ?? item.job_title ?? item.name;
  const company = item.companyName ?? item.company ?? item.company_name;
  const desc = item.jobDescription ?? item.description ?? item.job_description ?? item.body ?? item.content;
  if ((title || company) && (typeof title === 'string' || typeof company === 'string')) {
    const jt = typeof title === 'string' ? sanitizeJobField(title) : '';
    const co = typeof company === 'string' ? sanitizeJobField(company) : '';
    if (jt || co) {
      return {
        job_title: jt || (co ? 'Product Manager' : ''),
        company: co,
        job_description: typeof desc === 'string' ? desc.trim() : ''
      };
    }
  }
  return null;
}

/**
 * Fetch job title, company, description from Teal job-tracker page.
 * Tries: (1) intercept API response with job data, (2) DOM extraction, (3) existing teal/jobs/<uuid>.json.
 */
async function fetchJobDataFromTeal(page, jobUuid) {
  const url = 'https://app.tealhq.com/job-tracker/' + jobUuid;
  let captured = null;
  const onResponse = async (response) => {
    if (captured) return;
    const req = response.request();
    const resUrl = response.url();
    if (!resUrl || !resUrl.includes('tealhq.com')) return;
    if (req.method() !== 'GET') return;
    try {
      const body = await response.text();
      const data = (() => {
        try { return JSON.parse(body); } catch (_) { return null; }
      })();
      const got = extractJobFromPayload(data) || (data && typeof data === 'object' ? extractJobFromPayload({ data }) : null);
      if (got) captured = got;
    } catch (_) {}
  };
  page.on('response', onResponse);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(5000);
  page.off('response', onResponse);

  if (captured && (captured.job_title || captured.company)) {
    return captured;
  }

  // Fallback: DOM extraction. Teal job detail: .read-row-container h2 = title, .job-detail-row strong = company
  const dom = await page.evaluate(() => {
    const out = { job_title: '', company: '', job_description: '' };
    const readRow = document.querySelector('.read-row-container');
    if (readRow) {
      const h2 = readRow.querySelector('h2');
      if (h2) out.job_title = (h2.textContent || '').trim();
      const jobDetailRow = readRow.querySelector('.job-detail-row');
      if (jobDetailRow) {
        const strong = jobDetailRow.querySelector('strong');
        if (strong) out.company = (strong.textContent || '').trim();
      }
    }
    const getText = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').trim() : '';
    };
    const h1 = document.querySelector('h1');
    if (h1) out.job_title = (h1.textContent || '').trim();
    const labels = document.querySelectorAll('label, [class*="label"], dt, th');
    for (const l of labels) {
      const t = (l.textContent || '').trim().toLowerCase();
      const next = l.nextElementSibling || l.parentElement?.querySelector('div, p, input');
      const val = next ? (next.value ?? next.textContent ?? '').trim() : '';
      if ((t.includes('company') || t.includes('organization')) && val) out.company = val;
      if ((t.includes('title') || t.includes('position')) && val && !out.job_title) out.job_title = val;
      if ((t.includes('description') || t.includes('job description')) && val) out.job_description = val;
    }
    const pm = document.querySelector('.ProseMirror, [class*="ProseMirror"]');
    if (pm && !out.job_description) out.job_description = (pm.textContent || '').trim();
    const ta = document.querySelector('textarea');
    if (ta && !out.job_description) out.job_description = (ta.value || ta.textContent || '').trim();
    return out;
  }).catch(() => ({ job_title: '', company: '', job_description: '' }));

  const jt = sanitizeJobField(dom.job_title);
  const co = sanitizeJobField(dom.company);
  if (jt || co) {
    return {
      job_title: jt || (co ? 'Product Manager' : ''),
      company: co,
      job_description: dom.job_description || ''
    };
  }

  // Fallback: use existing teal/jobs/<uuid>.json if present (e.g. from previous run)
  const existingPath = path.join(JOBS_OUT_DIR, jobUuid + '.json');
  if (fs.existsSync(existingPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      const jt = sanitizeJobField(existing.job_title);
      const co = sanitizeJobField(existing.company);
      return {
        job_title: jt || (co ? 'Product Manager' : '') || 'Product Manager',
        company: co,
        job_description: (existing.job_description || '').trim()
      };
    } catch (_) {}
  }
  return null;
}

async function main() {
  const urls = process.argv.slice(2).filter((a) => a && !a.startsWith('--'));
  if (urls.length === 0) {
    console.error('Usage: node teal-complete-jobs-flow.cjs <teal-job-url-1> [url2 ...]');
    process.exit(1);
  }

  if (!process.stdout.isTTY && !process.env.TEAL_COMPLETE_ALLOW_NO_TTY) {
    console.error('[Teal complete] Запуск в фоне запрещён. Скрипт должен работать в переднем плане (браузер виден).');
    console.error('Не запускайте через nohup, & или в фоновом режиме. Выполните в интерактивном терминале.');
    console.error('(Для обхода: TEAL_COMPLETE_ALLOW_NO_TTY=1 — только если браузер всё равно виден.)');
    process.exit(1);
  }

  const uuids = [];
  for (const u of urls) {
    const id = extractUuid(u);
    if (id) uuids.push(id);
    else console.warn('Skip (no UUID):', u.slice(0, 60));
  }
  if (uuids.length === 0) {
    console.error('No valid Teal job UUIDs.');
    process.exit(1);
  }

  ensureDirs();
  if (!fs.existsSync(JOBS_OUT_DIR)) fs.mkdirSync(JOBS_OUT_DIR, { recursive: true });

  loadTealEnv(VAULT_ROOT);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  if (!process.env.TEAL_CHROME_PROFILE) process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_COMPLETE;
  const launchOptions = { headless: false, timeout: 90000, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let context;
  try {
    const result = await launchTealContext(playwright, launchOptions);
    context = result.context;
    console.log('[Teal complete] Using Chrome profile:', result.profileDir);
  } catch (e) {
    console.error('Failed to launch Chrome:', e.message);
    process.exit(1);
  }

  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  // If first navigation lands on sign-in, log in with TEAL_EMAIL/TEAL_PASSWORD then retry
  const firstJobUrl = 'https://app.tealhq.com/job-tracker/' + uuids[0];
  await page.goto(firstJobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(3000);
  const currentUrl = page.url();
  if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login') || currentUrl.includes('accounts.google.com')) {
    await doTealLogin(page, { tealDir: TEAL_DIR });
    await page.goto(firstJobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
  }

  const jobDataByUuid = {};
  for (let i = 0; i < uuids.length; i++) {
    const uuid = uuids[i];
    console.log('[' + (i + 1) + '/' + uuids.length + '] Fetching job:', uuid);
    const data = await fetchJobDataFromTeal(page, uuid);
    if (!data) {
      console.warn('  Could not get job data for', uuid);
      continue;
    }
    jobDataByUuid[uuid] = data;
    const jsonPath = path.join(JOBS_OUT_DIR, uuid + '.json');
    const txtPath = path.join(JOBS_OUT_DIR, uuid + '.txt');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(txtPath, data.job_description || '', 'utf8');
    console.log('  Saved:', data.job_title || '(no title)', '|', data.company || '(no company)', '|', (data.job_description || '').length, 'chars');
    await sleep(1500);
  }
  await context.close();

  if (Object.keys(jobDataByUuid).length === 0) {
    console.error('No job data fetched. Exit.');
    process.exit(1);
  }

  const env = { ...process.env, VAULT_PATH: VAULT_ROOT, TEAL_CHROME_PROFILE: process.env.TEAL_CHROME_PROFILE || TEAL_CHROME_PROFILE_COMPLETE };
  const stats = { total: uuids.length, skipped: 0, resumesCreated: 0, matchScoreOk: 0, matchScoreFail: 0 };
  for (let i = 0; i < uuids.length; i++) {
    const uuid = uuids[i];
    const data = jobDataByUuid[uuid];
    if (!data) continue;

    const jobTitle = sanitizeJobField(data.job_title) || 'Product Manager';
    const company = sanitizeJobField(data.company);
    const resumeName = company ? jobTitle + ' — ' + company : jobTitle;
    const txtPath = path.join(JOBS_OUT_DIR, uuid + '.txt');

    const mapBefore = loadResumeToJob();
    const already = Object.entries(mapBefore).find(([, e]) => e && e.jobId === uuid);
    if (already) {
      stats.skipped++;
      console.log('[' + (i + 1) + '/' + uuids.length + '] Resume already exists for', uuid, '->', already[0]);
      continue;
    }

    console.log('[' + (i + 1) + '/' + uuids.length + '] Creating resume:', resumeName);
    let r1 = spawnSync('node', [
      path.join(__dirname, 'teal-resume-for-job.cjs'),
      '--job-id', uuid,
      '--job-title', resumeName,
      '--job-description-file', txtPath
    ], { cwd: VAULT_ROOT, encoding: 'utf8', timeout: 120000, env });
    if (r1.stdout) process.stdout.write(r1.stdout);
    if (r1.stderr) process.stderr.write(r1.stderr);
    if (r1.status !== 0 && /Template resume not found|template not found/i.test((r1.stderr || '') + (r1.stdout || ''))) {
      console.log('  Retry resume creation (template may need time to load)...');
      await new Promise((r) => setTimeout(r, 5000));
      r1 = spawnSync('node', [
        path.join(__dirname, 'teal-resume-for-job.cjs'),
        '--job-id', uuid,
        '--job-title', resumeName,
        '--job-description-file', txtPath
      ], { cwd: VAULT_ROOT, encoding: 'utf8', timeout: 120000, env });
      if (r1.stdout) process.stdout.write(r1.stdout);
      if (r1.stderr) process.stderr.write(r1.stderr);
    }
    if (r1.status !== 0) {
      console.warn('  teal-resume-for-job exit', r1.status, 'for', uuid);
      continue;
    }
    stats.resumesCreated++;

    const mapAfter = loadResumeToJob();
    const entry = Object.entries(mapAfter).find(([, e]) => e && e.jobId === uuid);
    const resumeId = entry ? entry[0] : null;
    if (!resumeId) {
      console.warn('  Could not find new resumeId for job', uuid);
      continue;
    }

    const resumeUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId;
    const jdLen = (data.job_description || '').trim().length;
    if (jdLen < 100) {
      console.warn('  WARNING: Job description has only ' + jdLen + ' chars (< 100). Match-score will skip optimization to 80%% and will not save PDF. Fetch may have failed; check ' + txtPath);
    }
    console.log('[' + (i + 1) + '/' + uuids.length + '] Match-score for resume', resumeId);
    const r2 = spawnSync('node', [
      path.join(__dirname, 'teal-resume-match-score.cjs'),
      '--resume-url', resumeUrl,
      '--company', company || '—',
      '--job-description-file', txtPath
    ], { cwd: VAULT_ROOT, encoding: 'utf8', timeout: 10 * 60 * 1000, env });
    if (r2.stdout) process.stdout.write(r2.stdout);
    if (r2.stderr) process.stderr.write(r2.stderr);
    if (r2.status === 0) stats.matchScoreOk++; else { stats.matchScoreFail++; console.warn('  teal-resume-match-score exit', r2.status); }
  }

  const matchDone = stats.matchScoreOk + stats.matchScoreFail;
  const resultPct = stats.total > 0 ? Math.round((100 * (stats.skipped + matchDone)) / stats.total) : 100;
  const lines = [
    '',
    '========== TEAL COMPLETE JOBS STATS (same as Full Flow Step 7+8) ==========',
    '  Вакансий в списке: ' + stats.total,
    '  Пропущено (резюме уже есть): ' + stats.skipped,
    '  Резюме создано: ' + stats.resumesCreated,
    '  Match-score (summary, Target Title, PDF, cover letter): ' + stats.matchScoreOk + ' OK' + (stats.matchScoreFail ? ', ' + stats.matchScoreFail + ' fail' : ''),
    '  Цель: 100%',
    '  Результат: ' + resultPct + '%',
    '================================================================================',
    ''
  ];
  console.log(lines.join('\n'));
  if (fs.existsSync(TEAL_DIR)) {
    try {
      const logLine = '[' + new Date().toISOString() + '] [Teal complete] Jobs: ' + stats.total + ', Skipped: ' + stats.skipped + ', Resumes created: ' + stats.resumesCreated + ', Match-score OK: ' + stats.matchScoreOk + (stats.matchScoreFail ? ', Fail: ' + stats.matchScoreFail : '') + '\n';
      fs.appendFileSync(FULL_FLOW_LOG, logLine, 'utf8');
    } catch (_) {}
  }
  console.log('[Teal complete] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
