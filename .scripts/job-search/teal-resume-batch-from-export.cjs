#!/usr/bin/env node
/**
 * Create Teal resumes for jobs. Source: digest (recommended) or export JSON.
 * When first arg is a .md file: list and order of jobs from the digest; title, company, description
 * from jobs/<id>.json when present (digest is fallback). So digest = menu, jobs/ = data.
 * When first arg is .json: list from export, optionally filtered by --digest.
 * No timeouts: each job runs to completion. Progress: 00-Inbox/Job_Search/teal/batch-progress.log
 *
 * Usage:
 *   node teal-resume-batch-from-export.cjs [path-to-digest.md] [--from N]              # list from digest, data from jobs/
 *   node teal-resume-batch-from-export.cjs [path-to-export.json] [--exclude ...]     # from export
 *   node teal-resume-batch-from-export.cjs [export.json] --digest [digest.md]        # export filtered by digest
 *   npm run job-search:teal-resume-batch -- [digest.md]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isRemoteFromExcludedCountry, isVideoGamingRole, isAutomotiveRole, isHardwareRole, isTelecomRole, requiresSapExperience, requiresHighTravel, requiresRelocation, requiresResidenceInExcludedCountry, requiresNonEnglishLanguage, isBelowMinSalary, looksLikeJobTitle, deriveTitleFromDescription } = require('./job-search-utils.cjs');
const { updateFlowProgress } = require('./teal-flow-state.cjs');
const { TEAL_CHROME_PROFILE_BATCH } = require('./job-search-paths.cjs');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const JOBS_DIR = path.join(VAULT, '00-Inbox/Job_Search/data/jobs');
const TMP_DESC = path.join(VAULT, '00-Inbox/Job_Search/data/tmp-teal-batch-desc.txt');
const TEAL_DIR = path.join(VAULT, '00-Inbox/Job_Search/teal');
const PROGRESS_LOG = path.join(TEAL_DIR, 'batch-progress.log');
const RESUME_TO_JOB_MAP_PATH = path.join(TEAL_DIR, 'resume-to-job.json');
const BATCH_JOB_MAX_RETRIES = 2; // 1 initial + 2 retries on crash/fail
const BATCH_RETRY_DELAY_MS = 8000; // wait before retry so browser can fully close

function loadResumeJobMapping() {
  try {
    if (fs.existsSync(RESUME_TO_JOB_MAP_PATH)) return JSON.parse(fs.readFileSync(RESUME_TO_JOB_MAP_PATH, 'utf8'));
  } catch (_) {}
  return {};
}

/** True if we already have a Teal resume for this job (match-score or teal-resume-for-job saved it). */
function hasResumeForJobId(jobId, map) {
  if (!jobId || !map || typeof map !== 'object') return false;
  return Object.values(map).some((entry) => entry && entry.jobId === String(jobId));
}

/** Normalize for company+title dedup: lowercase, trim, collapse spaces. */
function normKey(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True if we already have a resume for this company+title (avoids duplicate resumes for same role). */
function hasResumeForCompanyTitle(map, company, title) {
  if (!map || typeof map !== 'object') return false;
  const wantCompany = normKey(company);
  const wantTitle = normKey(title);
  if (!wantTitle) return false;
  return Object.values(map).some((entry) => {
    if (!entry) return false;
    const c = normKey(entry.company);
    const t = normKey(entry.title);
    if (!t && !wantTitle) return false;
    const companyMatch = c === wantCompany || (wantCompany && c && (c.includes(wantCompany) || wantCompany.includes(c)));
    const titleMatch = t === wantTitle || (t && wantTitle && (t.includes(wantTitle) || wantTitle.includes(t)));
    return companyMatch && titleMatch;
  });
}

const LAST_ADDED_JOB_IDS_FILE = path.join(TEAL_DIR, 'last-added-job-ids.json');

/**
 * Load job IDs that were actually added to Teal in the last add-digest run.
 * Only used when TEAL_ONLY_ADDED_THIS_RUN=1 (set by incremental/full flow so we create resumes only for jobs we just added, not duplicates).
 */
function loadLastAddedJobIds() {
  try {
    if (!fs.existsSync(LAST_ADDED_JOB_IDS_FILE)) return { addedIds: null };
    const data = JSON.parse(fs.readFileSync(LAST_ADDED_JOB_IDS_FILE, 'utf8'));
    const addedIds = Array.isArray(data.addedIds) ? new Set(data.addedIds.map(String)) : null;
    return { addedIds };
  } catch (_) {}
  return { addedIds: null };
}

const JOB_LINE_RE = /^- \[[ x\-]\] \[([^\]]*)\]\((https?:[^)]+)\)/;
const JOB_LINE_URL_RE = /\]\((https?:[^)]+)\)/;
const DESC_LINE_RE = /^\s*> ?(.*)$/;

function getJobIdsFromDigest(digestPath) {
  if (!digestPath || !fs.existsSync(digestPath)) return null;
  const content = fs.readFileSync(digestPath, 'utf8');
  const ids = new Set();
  for (const line of content.split(/\r?\n/)) {
    if (!/^- \[[ x\-]\] \[/.test(line)) continue;
    const m = line.match(JOB_LINE_URL_RE);
    if (!m) continue;
    const idMatch = m[1].match(/\/jobs\/view\/(\d+)/);
    if (idMatch) ids.add(idMatch[1]);
  }
  return ids;
}

/** Parse digest: return [{ id, title, company, job_description }]. List/order from digest; data from jobs/<id>.json when present (digest is fallback). */
function getJobsFromDigest(digestPath) {
  if (!digestPath || !fs.existsSync(digestPath)) return [];
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const jobs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JOB_LINE_RE);
    if (!m) continue;
    const linkText = m[1].trim();
    const url = m[2];
    const idMatch = url.match(/\/jobs\/view\/(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const parts = linkText.split(/\s*[—·]\s*/).map((s) => s.trim());
    let rawTitle = parts[0] || 'Product Manager';
    let title = (rawTitle === '—' || !rawTitle) ? 'Product Manager' : rawTitle;
    let company = parts.length > 1 ? parts[1].replace(/\s*\([^)]*\)\s*$/, '').trim() : '';
    // Canonicalize: "· SoSafe · Remote" -> "SoSafe" so resume name matches match-score (Title — Company)
    if (company && company.includes(' · ')) {
      const segs = company.replace(/^[·\s]+/, '').split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
      company = segs[0] || company;
    } else if (company) {
      company = company.replace(/^[·\s]+/, '').trim();
    }
    let desc = '';
    let j = i + 1;
    while (j < lines.length && DESC_LINE_RE.test(lines[j])) {
      desc += lines[j].replace(DESC_LINE_RE, '$1') + '\n';
      j++;
    }
    desc = desc.trim();
    // Prefer digest as single source of truth for title/company.
    // jobs/<id>.json may be outdated or partial; use it ONLY to enrich description when digest has none.
    const jobFile = path.join(JOBS_DIR, id + '.json');
    if (!desc && fs.existsSync(jobFile)) {
      try {
        const o = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
        const jDesc = (o.job_description || '').trim();
        if (jDesc) desc = jDesc;
      } catch (_) {}
    }
    if (title && typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(title) && desc && desc.length >= 20 && typeof deriveTitleFromDescription === 'function') {
      const derived = (deriveTitleFromDescription(desc) || '').trim();
      title = (derived && derived.length >= 3 && derived.length <= 120 && looksLikeJobTitle(derived)) ? derived : 'Product Manager';
    } else if (title && typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(title)) {
      title = 'Product Manager';
    }
    jobs.push({ id, title, company, job_description: desc });
  }
  return jobs;
}

function logProgress(message, toStdout = true) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.appendFileSync(PROGRESS_LOG, line, 'utf8');
  } catch (_) {}
  if (toStdout) process.stdout.write(line);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let exportPath = null;
  let exclude = ['kraken', 'toptal'];
  let fromIndex = 0;
  let digestPath = null;
  let fromDigestOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exclude' && argv[i + 1]) {
      exclude = argv[i + 1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      i++;
    } else if (argv[i] === '--from' && argv[i + 1]) {
      fromIndex = Math.max(0, parseInt(argv[i + 1], 10) || 0);
      i++;
    } else if (argv[i] === '--digest' && argv[i + 1]) {
      digestPath = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.resolve(process.cwd(), argv[i + 1]);
      i++;
    } else if (!argv[i].startsWith('--')) {
      const p = path.isAbsolute(argv[i]) ? argv[i] : path.resolve(process.cwd(), argv[i]);
      if (p.toLowerCase().endsWith('.md')) {
        digestPath = p;
        fromDigestOnly = true;
      } else {
        exportPath = p;
      }
    }
  }
  if (!fromDigestOnly && !exportPath) {
    exportPath = path.join(VAULT, '00-Inbox/Job_Search/data/dex-linkedin-search-senior-product-manager-2026-02-10.json');
  }
  return { exportPath, exclude, fromIndex, digestPath, fromDigestOnly };
}

function main() {
  const { exportPath, exclude, fromIndex, digestPath, fromDigestOnly } = parseArgs();
  let jobs = [];

  if (fromDigestOnly && digestPath && fs.existsSync(digestPath)) {
    jobs = getJobsFromDigest(digestPath);
    jobs = jobs.filter((j) => !exclude.some((c) => (j.company || '').toLowerCase().includes(c)));
    jobs = jobs.filter((j) => !isVideoGamingRole(j.title, j.company, j.job_description || j.description || ''));
    jobs = jobs.filter((j) => !isAutomotiveRole(j.title, j.company, j.job_description || j.description || ''));
    jobs = jobs.filter((j) => !isHardwareRole(j.title, j.company, j.job_description || j.description || ''));
    jobs = jobs.filter((j) => !isTelecomRole(j.title, j.company, j.job_description || j.description || ''));
    jobs = jobs.filter((j) => !requiresSapExperience(j.title, j.company, j.job_description || j.description || ''));
    jobs = jobs.filter((j) => !isRemoteFromExcludedCountry(j.title, '', j.job_description || ''));
    jobs = jobs.filter((j) => !requiresResidenceInExcludedCountry(j.title, '', j.job_description || ''));
    jobs = jobs.filter((j) => !requiresRelocation(j.title, '', j.job_description || ''));
    jobs = jobs.filter((j) => !requiresHighTravel(j.title, j.job_description || ''));
    jobs = jobs.filter((j) => !isBelowMinSalary(j.job_description || ''));
    jobs = jobs.filter((j) => !requiresNonEnglishLanguage(j.title || '', j.job_description || j.description || ''));
    logProgress(`[Teal batch] From digest only: ${digestPath} (${jobs.length} jobs)`);
  } else {
    if (!exportPath || !fs.existsSync(exportPath)) {
      console.error('Export file not found:', exportPath);
      process.exit(1);
    }
    const digestIds = digestPath && fs.existsSync(digestPath) ? getJobIdsFromDigest(digestPath) : null;
    if (digestPath && digestIds) {
      logProgress(`[Teal batch] Export + digest filter: ${digestPath} (${digestIds.size} ids)`);
    }
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const results = data.filter?.results || {};
    const jobsById = data.jobs && typeof data.jobs === 'object' && !Array.isArray(data.jobs) ? data.jobs : {};
    for (const [id, r] of Object.entries(results)) {
      if (digestIds && !digestIds.has(id)) continue;
      const company = (r.company || '').toLowerCase();
      if (exclude.some((c) => company.includes(c))) continue;
      const payload = jobsById[id] || {};
      let title = r.title || payload.job_title || payload.title || 'Product Manager';
      const location = payload.location || '';
      const desc = payload.job_description || '';
      if (title && typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(title) && desc && desc.length >= 20 && typeof deriveTitleFromDescription === 'function') {
        const derived = (deriveTitleFromDescription(desc) || '').trim();
        title = (derived && derived.length >= 3 && derived.length <= 120 && looksLikeJobTitle(derived)) ? derived : 'Product Manager';
      } else if (title && typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(title)) {
        title = 'Product Manager';
      }
      if (isRemoteFromExcludedCountry(title, location, desc)) continue;
      if (requiresResidenceInExcludedCountry(title, location, desc)) continue;
      if (requiresRelocation(title, location, desc)) continue;
      if (isVideoGamingRole(title, r.company || payload.company || '', desc)) continue;
      if (isAutomotiveRole(title, r.company || payload.company || '', desc)) continue;
      if (isHardwareRole(title, r.company || payload.company || '', desc)) continue;
      if (isTelecomRole(title, r.company || payload.company || '', desc)) continue;
      if (requiresSapExperience(title, r.company || payload.company || '', desc)) continue;
      if (requiresHighTravel(title, desc)) continue;
      if (isBelowMinSalary(desc)) continue;
      if (requiresNonEnglishLanguage(title, desc)) continue;
      jobs.push({
        id,
        title,
        company: r.company || payload.company || '',
        job_description: payload.job_description || ''
      });
    }
    logProgress(`[Teal batch] Export: ${exportPath} | Jobs: ${jobs.length}`);
  }

  let toProcess = fromIndex > 0 ? jobs.slice(fromIndex) : jobs;
  const total = jobs.length;
  let startNum = fromIndex + 1;

  const onlyAddedThisRun = process.env.TEAL_ONLY_ADDED_THIS_RUN === '1' || process.env.TEAL_ONLY_ADDED_THIS_RUN === 'true';
  const { addedIds: lastAddedSet } = loadLastAddedJobIds();
  if (onlyAddedThisRun && lastAddedSet) {
    const before = toProcess.length;
    toProcess = toProcess.filter((j) => lastAddedSet.has(String(j.id)));
    const dropped = before - toProcess.length;
    if (dropped > 0) {
      logProgress(`[Teal batch] Only creating resumes for jobs actually added to Teal this run. Dropped ${dropped} (duplicates in Teal).`);
    }
    if (toProcess.length === 0 && before > 0) {
      const jobIdsInDigest = digestPath && fs.existsSync(digestPath) ? Array.from(getJobIdsFromDigest(digestPath) || []) : [];
      writeStep7Evidence({
        digestPath: digestPath ? path.relative(VAULT, digestPath) : null,
        jobsFromDigest: jobs.length,
        jobIdsInDigest,
        created: [],
        skipped: [],
        nothingToDoReason: 'TEAL_ONLY_ADDED_THIS_RUN: 0 jobs were added in step 6 (all digest jobs were duplicates in Teal)'
      });
      logProgress('[Teal batch] No new jobs were added to Teal (all were duplicates). Skip creating resumes.');
      return;
    }
  }

  const step7EvidencePath = path.join(TEAL_DIR, 'step-7-evidence.json');
  const writeStep7Evidence = (ev) => {
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(step7EvidencePath, JSON.stringify({ ...ev, writtenAt: new Date().toISOString() }, null, 2), 'utf8');
    } catch (_) {}
  };

  logProgress(`[Teal batch] Exclude: ${exclude.join(', ')} | Total: ${total} | Start from: ${startNum}`);
  logProgress(`[Teal batch] Progress log: ${PROGRESS_LOG}`);
  if (toProcess.length === 0) {
    const jobIdsInDigest = digestPath && fs.existsSync(digestPath) ? Array.from(getJobIdsFromDigest(digestPath) || []) : [];
    writeStep7Evidence({
      digestPath: digestPath ? path.relative(VAULT, digestPath) : null,
      jobsFromDigest: jobs.length,
      jobIdsInDigest,
      created: [],
      skipped: [],
      nothingToDoReason: onlyAddedThisRun && lastAddedSet && jobs.length > 0
        ? 'TEAL_ONLY_ADDED_THIS_RUN: 0 jobs were added in step 6 (all digest jobs were duplicates in Teal)'
        : (jobs.length === 0 ? '0 jobs from digest after filters' : 'toProcess empty after TEAL_ONLY_ADDED_THIS_RUN filter')
    });
    logProgress('[Teal batch] Nothing to do.');
    return;
  }

  const scriptPath = path.join(__dirname, 'teal-resume-for-job.cjs');
  const resumeToJobMap = loadResumeJobMapping();
  let done = 0;
  let failed = 0;
  let skippedExisting = 0;
  const createdList = [];
  const skippedList = [];

  for (let i = 0; i < toProcess.length; i++) {
    const job = toProcess[i];
    const n = startNum + i;

    if (hasResumeForJobId(job.id, resumeToJobMap)) {
      skippedList.push({ jobId: job.id, company: job.company, title: job.title, reason: 'resume_exists_for_job' });
      logProgress(`(${n}/${total}) SKIP (resume exists for jobId) ${job.company} | ${job.title}`);
      skippedExisting++;
      done++;
      if (process.env.FULL_FLOW_STATE_FILE) {
        try {
          updateFlowProgress(process.env.FULL_FLOW_STATE_FILE, 7, { total: toProcess.length, done, failed, fromIndex }, VAULT);
        } catch (_) {}
      }
      continue;
    }
    if (hasResumeForCompanyTitle(resumeToJobMap, job.company, job.title)) {
      skippedList.push({ jobId: job.id, company: job.company, title: job.title, reason: 'resume_exists_for_company_title' });
      logProgress(`(${n}/${total}) SKIP (resume exists for company+title) ${job.company} | ${job.title}`);
      skippedExisting++;
      done++;
      if (process.env.FULL_FLOW_STATE_FILE) {
        try {
          updateFlowProgress(process.env.FULL_FLOW_STATE_FILE, 7, { total: toProcess.length, done, failed, fromIndex }, VAULT);
        } catch (_) {}
      }
      continue;
    }

    const companyForName = (job.company || '').trim();
    const jobTitle = (companyForName && companyForName !== '—' && !/^—\s*$/.test(companyForName))
      ? `${job.title} — ${companyForName}` : job.title;
    const descFile = path.join(JOBS_DIR, job.id + '.json');
    const args = ['--job-title', jobTitle, '--job-id', String(job.id)];

    let descText = (job.job_description || '').trim();
    if (!descText && fs.existsSync(descFile)) {
      try {
        const j = JSON.parse(fs.readFileSync(descFile, 'utf8'));
        descText = (j.job_description || '').trim();
      } catch (_) {}
    }
    if (descText) {
      fs.writeFileSync(TMP_DESC, descText, 'utf8');
      args.push('--job-description-file', TMP_DESC);
    }

    logProgress(`(${n}/${total}) START ${job.company} | ${job.title}`);
    let result = null;
    let attempt = 0;
    while (attempt <= BATCH_JOB_MAX_RETRIES) {
      result = spawnSync('node', [scriptPath, ...args], {
        cwd: VAULT,
        stdio: 'inherit',
        env: { ...process.env, TEAL_CHROME_PROFILE: TEAL_CHROME_PROFILE_BATCH }
      });
      const ok = result.status === 0 && !result.signal;
      if (ok) break;
      attempt++;
      if (attempt <= BATCH_JOB_MAX_RETRIES) {
        const sec = Math.ceil(BATCH_RETRY_DELAY_MS / 1000);
        logProgress(`(${n}/${total}) RETRY ${attempt}/${BATCH_JOB_MAX_RETRIES} ${job.company} | ${job.title} (browser crash? waiting ${sec}s)`);
        try {
          require('child_process').execSync('sleep ' + sec, { stdio: 'ignore' });
        } catch (_) {}
      }
    }

    if (result && result.status === 0 && !result.signal) {
      createdList.push({ jobId: job.id, company: job.company, title: job.title });
      logProgress(`(${n}/${total}) OK ${job.company} | ${job.title}`);
    } else {
      failed++;
      logProgress(`(${n}/${total}) FAIL ${job.company} | ${job.title}` + (attempt > 1 ? ` (after ${attempt} attempts)` : ''));
    }
    done++;
    if (process.env.FULL_FLOW_STATE_FILE) {
      try {
        updateFlowProgress(process.env.FULL_FLOW_STATE_FILE, 7, { total: toProcess.length, done, failed, fromIndex }, VAULT);
      } catch (_) {}
    }
  }

  const jobIdsInDigest = digestPath && fs.existsSync(digestPath) ? Array.from(getJobIdsFromDigest(digestPath) || []) : [];
  writeStep7Evidence({
    digestPath: digestPath ? path.relative(VAULT, digestPath) : null,
    jobsFromDigest: jobs.length,
    jobIdsInDigest,
    created: createdList,
    skipped: skippedList,
    failed
  });

  logProgress(`[Teal batch] Done. Processed: ${done}, Failed: ${failed}, Skipped (resume exists): ${skippedExisting}`);
}

main();
