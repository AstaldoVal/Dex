#!/usr/bin/env node
/**
 * Add Job Digest jobs to Teal. Two modes:
 *
 * 1) --app (recommended): Log into Teal web app once (--setup), then script adds jobs
 *    via the "Add a New Job" form (paste URL or job description). No extension needed.
 *
 * 2) Extension: Use Chrome with Teal extension; script opens each LinkedIn job page
 *    and clicks the extension "Save" button. Requires --setup to install extension.
 *
 * Usage:
 *   node add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --limit=2 --app
 *   node add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --setup   # one-time: log into Teal
 *
 * Options:
 *   --app         Use Teal web app (add job manually in app). One-time --setup to log in.
 *   --setup       First-time: open browser to log into Teal (--app) or install extension + LinkedIn.
 *   --limit=N     Add only first N jobs (default: all).
 *   --debug       Save screenshot/HTML (extension: first job page; app: Teal add-job form).
 *
 * Requires: Playwright. For extension mode: Chrome, profile .playwright-linkedin.
 * For --app: by default uses your system Chrome profile (Default or Profile 1 on macOS/Windows/Linux).
 * Close Chrome, run the script — it will use your Teal session. Override with TEAL_CHROME_PROFILE if needed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const dotenv = require('dotenv');
const envPath = path.join(VAULT, '.env');
dotenv.config({ path: envPath });
if (!process.env.TEAL_EMAIL || !process.env.TEAL_PASSWORD) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}
const { DIGESTS_DIR, DATA_DIR, JOBS_DIR, TEAL_DIR, TEAL_FLOW_DIR, PROFILE_EXTENSION, PROFILE_APP, TEAL_CHROME_PROFILE_ALT, LAST_PROCESSED_JOB_IDS_FILE, ensureDirs } = require('./job-search-paths.cjs');
const { deriveTitleFromDescription, locationRank, fetchJobPageTitleCompanyAndDescription, fetchJobPageTitleCompanyAndDescriptionCrawler, requiresNonEnglishLanguage } = require('./job-search-utils.cjs');
const {
  getTealProfileCandidates,
  isProfileInUseError,
  launchPersistentContextGuarded,
  killChromeForProfile
} = require('./teal-chrome-profile.cjs');

async function closeTealBrowser(context, profileDir) {
  try {
    await closeTealBrowser(context, usedProfileDir);
  } catch (_) {}
  if (profileDir) killChromeForProfile(profileDir);
}
const { updateFlowProgress } = require('./teal-flow-state.cjs');

function getDefaultChromeProfileDir() {
  const home = os.homedir();
  const platform = os.platform();
  let candidates = [];
  if (platform === 'darwin') {
    candidates = [
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default'),
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1')
    ];
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates = [
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1')
    ];
  } else {
    candidates = [
      path.join(home, '.config', 'google-chrome', 'Default'),
      path.join(home, '.config', 'google-chrome', 'Profile 1')
    ];
  }
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function resolveChromeProfileDir() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const expanded = env.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);
    if (fs.existsSync(resolved)) return resolved;
  }
  return getDefaultChromeProfileDir();
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('linkedin.com') && u.pathname.includes('/jobs/view/')) {
      const id = u.pathname.match(/\/view\/(\d+)/);
      return id ? `https://www.linkedin.com/comm/jobs/view/${id[1]}` : url;
    }
  } catch (_) {}
  return url;
}

function getUrlsFromJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const list = Array.isArray(data) ? data : [];
  const seen = new Set();
  return list
    .map((j) => (j.url || j.rawUrl || '').trim())
    .filter((url) => {
      const n = normalizeUrl(url);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return n.includes('linkedin.com') && /\/view\/\d+/.test(n);
    })
    .map(normalizeUrl);
}

const JOB_LINE_RE = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;

function getUrlsFromDigest(mdPath) {
  if (!fs.existsSync(mdPath)) return [];
  const text = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');
  const seen = new Set();
  const urls = [];
  for (const line of lines) {
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const raw = m[1].trim();
    const n = raw.includes('linkedin.com') ? normalizeUrl(raw) : raw;
    if (n && !seen.has(n)) {
      seen.add(n);
      urls.push(n);
    }
  }
  return urls;
}

/** Parse digest markdown: for each job line, collect the following blockquote (  > ...) until next job line. Returns Map<jobId, description>. */
function getDescriptionsFromDigest(mdPath) {
  const map = new Map();
  if (!fs.existsSync(mdPath)) return map;
  const text = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');
  let currentId = null;
  let block = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(JOB_LINE_RE);
    if (m) {
      if (currentId && block.length > 0) {
        const desc = block.join('\n').replace(/^\s+|\s+$/g, '');
        if (desc.length >= 100) map.set(currentId, desc);
      }
      const url = (m[1] || '').trim();
      currentId = getJobIdFromUrl(url);
      block = [];
      continue;
    }
    if (currentId && (line.startsWith('  > ') || line.startsWith('> '))) {
      block.push(line.replace(/^\s*> ?/, ''));
    }
  }
  if (currentId && block.length > 0) {
    const desc = block.join('\n').replace(/^\s+|\s+$/g, '');
    if (desc.length >= 100) map.set(currentId, desc);
  }
  return map;
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

/** Pasted (from-text) job IDs live in this range; each pasted job has a unique ID. Do not fill URL in Teal form and do not search in Teal list. */
const PASTED_JOB_ID_MIN = 9999990001;
const PASTED_JOB_ID_MAX = 9999999999;
function isPastedJobId(jobId) {
  if (!jobId || !/^\d+$/.test(jobId)) return false;
  const n = parseInt(jobId, 10);
  return n >= PASTED_JOB_ID_MIN && n <= PASTED_JOB_ID_MAX;
}
function isPastedJob(job) {
  return job && isPastedJobId(getJobIdFromUrl(job.url));
}

function getJobViewUrl(url) {
  const id = getJobIdFromUrl(url);
  return id ? 'https://www.linkedin.com/comm/jobs/view/' + id : url;
}

/** In --app mode: ensure jobs/<id>.json exists with description >= 100 chars. If missing or short, log CRITICAL and fetch+write automatically. */
async function ensureJobsDataAsync(digestPath, jsonPath, limit) {
  let urls = getUrlsFromDigest(digestPath);
  if (limit > 0) urls = urls.slice(0, limit);
  if (urls.length === 0) return;
  const incomplete = [];
  for (const url of urls) {
    const jobId = getJobIdFromUrl(url);
    if (!jobId) continue;
    const jobPath = path.join(JOBS_DIR, jobId + '.json');
    let needFetch = !fs.existsSync(jobPath);
    if (!needFetch) {
      try {
        const data = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        needFetch = !(data.job_description && data.job_description.length >= 100);
      } catch (_) {
        needFetch = true;
      }
    }
    if (needFetch) {
      // Skip fetch for pasted jobs (fake IDs 9999990xxx) — LinkedIn returns 404; createPastedJobDigestAndExport creates jobs file.
      if (/^999999\d{4}$/.test(jobId)) {
        console.error('[CRITICAL] job ' + jobId + ': pasted job, jobs/' + jobId + '.json missing. Run full-flow --from-text to create digest+jobs.');
        continue;
      }
      incomplete.push({ jobId, url: getJobViewUrl(url) });
    }
  }
  if (incomplete.length === 0) return;
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
  for (const { jobId, url } of incomplete) {
    console.error('\n[CRITICAL] job ' + jobId + ': jobs/' + jobId + '.json missing or description < 100 chars. Auto-fixing: fetching from LinkedIn…');
    let meta = await fetchJobPageTitleCompanyAndDescription(url);
    if (!meta || !((meta.description || meta.job_description || '').length >= 100)) {
      console.error('[CRITICAL] job ' + jobId + ': first fetch failed or short. Retrying with crawler UA…');
      meta = await fetchJobPageTitleCompanyAndDescriptionCrawler(url);
    }
    const desc = (meta && (meta.description || meta.job_description)) ? (meta.description || meta.job_description) : '';
    const payload = {
      job_title: (meta && meta.title) ? meta.title.trim() : '—',
      company: (meta && meta.company) ? meta.company.trim() : '—',
      job_description: desc,
      work_type: (meta && meta.work_type) ? meta.work_type : 'Remote',
      url: url.split('#')[0]
    };
    const jobPath = path.join(JOBS_DIR, jobId + '.json');
    fs.writeFileSync(jobPath, JSON.stringify(payload, null, 2), 'utf8');
    if (payload.job_description.length >= 100) {
      console.error('[CRITICAL] job ' + jobId + ': auto-fix OK. Written jobs/' + jobId + '.json');
    } else {
      console.error('[CRITICAL] job ' + jobId + ': auto-fix wrote jobs/' + jobId + '.json but description still short (' + payload.job_description.length + ' chars). Add to Teal may use export fallback.');
    }
  }
}

/** Canonical LinkedIn job URL for Teal and user: https://www.linkedin.com/jobs/view/<id>/
 *  Teal dedup and "already saved" check use this format; do not use comm/jobs/view when adding to Teal. */
function canonicalLinkedInJobUrl(url) {
  const id = getJobIdFromUrl(url);
  return id ? 'https://www.linkedin.com/jobs/view/' + id + '/' : (url || '');
}

/** Build Set of all LinkedIn job IDs ever processed (from last-processed-job-ids.json, all search URL keys). */
function loadAllProcessedJobIds() {
  if (!LAST_PROCESSED_JOB_IDS_FILE || !fs.existsSync(LAST_PROCESSED_JOB_IDS_FILE)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(LAST_PROCESSED_JOB_IDS_FILE, 'utf8'));
    const set = new Set();
    for (const [key, val] of Object.entries(data)) {
      if (key === 'updatedAt' || key === 'updated_at') continue;
      if (Array.isArray(val)) val.forEach((id) => set.add(String(id)));
    }
    return set;
  } catch (_) {
    return new Set();
  }
}

const TEAL_ADDED_KEYS_FILE = path.join(TEAL_DIR, 'added-company-titles.json');
// Persistent evidence that we actually saw Teal accept or already contain a job.
// Each entry: { company, title, linkedinUrl, status: 'created' | 'duplicate_detected', recordedAt }
const TEAL_ADDED_HISTORY_FILE = path.join(TEAL_DIR, 'added-history.json');

/** Load our local list of (company+title) already added to Teal. Primary duplicate check — no Teal scrape needed. */
function loadTealAddedKeys() {
  if (!fs.existsSync(TEAL_ADDED_KEYS_FILE)) return { keys: new Set(), keyToLocation: {} };
  try {
    const data = JSON.parse(fs.readFileSync(TEAL_ADDED_KEYS_FILE, 'utf8'));
    const keys = new Set(Array.isArray(data.keys) ? data.keys : []);
    const keyToLocation = data.keyToLocation && typeof data.keyToLocation === 'object' ? data.keyToLocation : {};
    return { keys, keyToLocation };
  } catch (_) {
    return { keys: new Set(), keyToLocation: {} };
  }
}

function saveTealAddedKeys(keys, keyToLocation) {
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.writeFileSync(
      TEAL_ADDED_KEYS_FILE,
      JSON.stringify({ keys: Array.from(keys), keyToLocation, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch (_) {}
}

function recordTealAddEvidence(entry) {
  if (!entry || !entry.company || !entry.title || !entry.linkedinUrl) return;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    /** @type {Array<{ company: string, title: string, linkedinUrl: string, status: string, recordedAt: string }>} */
    let history = [];
    if (fs.existsSync(TEAL_ADDED_HISTORY_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(TEAL_ADDED_HISTORY_FILE, 'utf8'));
        if (Array.isArray(parsed)) history = parsed;
      } catch (_) {}
    }
    history.push({
      company: entry.company,
      title: entry.title,
      linkedinUrl: entry.linkedinUrl,
      status: entry.status || 'created',
      recordedAt: new Date().toISOString()
    });
    fs.writeFileSync(TEAL_ADDED_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Normalize for company+title dedup so digest and Teal match despite spacing/punctuation differences.
 * - Lowercase, trim, single spaces.
 * - Strip " (remote)" / " — remote" from company.
 * - Collapse spaces around % and / so "100 %" matches "100%", "Co-Founder / Head" matches "Co-Founder/Head".
 */
function normCompanyTitle(company, title) {
  function norm(s) {
    if (!s || typeof s !== 'string') return '';
    let x = s.toLowerCase().trim().replace(/\s+/g, ' ');
    x = x.replace(/\s*%\s*/g, '%').replace(/\s*\/\s*/g, '/').replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
    return x.replace(/\s+/g, ' ').trim();
  }
  const c = norm((company || '').replace(/\s*[—\-]\s*remote\s*$/i, '').replace(/\s*\(remote\)\s*$/i, ''));
  const t = norm(title || '');
  return c + '|' + t;
}

function escapeRegex(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Get jobs with full data (url, job_title, company, job_description, work_type) for --app mode. Order by digest URLs.
 * Primary source: jobs/<id>.json (step 4 result — most complete). Export (step 1) only fills missing fields when jobs/ is absent or incomplete.
 * Supports search export format (payload.jobs object). */
function getJobsWithData(digestPath, jsonPath, limit) {
  const byUrl = new Map();
  let urls = [];

  if (jsonPath && fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Search export format: { jobs: { id: { job_title, company, job_description, work_type } }, filter: { results } }
    if (data.jobs && typeof data.jobs === 'object' && !Array.isArray(data.jobs)) {
      for (const [id, j] of Object.entries(data.jobs)) {
        const url = normalizeUrl('https://www.linkedin.com/jobs/view/' + id) || ('https://www.linkedin.com/jobs/view/' + id);
        byUrl.set(url, {
          url,
          job_title: j.job_title || j.title || '',
          company: j.company || '',
          job_description: j.job_description || '',
          work_type: j.work_type || '',
          location: j.location || ''
        });
      }
      urls = getUrlsFromDigest(digestPath);
    } else {
      (Array.isArray(data) ? data : []).forEach((j) => {
        const u = normalizeUrl(j.url || j.rawUrl || '');
        if (u) byUrl.set(u, j);
      });
      urls = getUrlsFromJson(jsonPath).length ? getUrlsFromJson(jsonPath) : getUrlsFromDigest(digestPath);
    }
  } else {
    urls = getUrlsFromDigest(digestPath);
  }

  if (urls.length === 0) return [];
  const digestDescriptions = getDescriptionsFromDigest(digestPath);
  // Prefer jobs/<id>.json (step 4) as primary; then digest (full text in markdown); then export (step 1) for missing fields.
  let list = urls.map((url) => {
    const lookupUrl = normalizeUrl(url) || url;
    const fromExport = byUrl.get(lookupUrl) || byUrl.get(url) || {};
    const jobId = getJobIdFromUrl(url);
    let job_description = '';
    let job_title = '';
    let company = '—';
    let work_type = '';
    let location = '';
    const jobPath = jobId ? path.join(JOBS_DIR, jobId + '.json') : null;
    if (jobPath && fs.existsSync(jobPath)) {
      try {
        const single = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        // Important: even when description is short (<100), keep the title/company if present.
        // This prevents step 6 from writing placeholder "—" into Teal.
        const parsedTitle = (single.job_title || single.title || '').trim();
        if (parsedTitle) job_title = parsedTitle;

        const parsedCompany = (single.company && single.company.trim()) ? single.company.trim() : '';
        if (parsedCompany) company = parsedCompany;

        // Work type and location are usually independent from description length.
        work_type = single.work_type || work_type;
        location = single.location || location;

        if (single.job_description && single.job_description.length >= 100) {
          job_description = single.job_description;
        }
      } catch (_) {}
    }
    if (!job_description || job_description.length < 100) {
      const fromDigest = jobId ? digestDescriptions.get(jobId) : '';
      if (fromDigest && fromDigest.length >= 100) {
        job_description = fromDigest;
        if (!job_title && (fromExport.job_title || fromExport.title)) job_title = (fromExport.job_title || fromExport.title).trim();
        if (company === '—' && fromExport.company) company = fromExport.company.trim();
        work_type = work_type || fromExport.work_type || '';
      } else {
        console.error('[CRITICAL] job ' + (jobId || '?') + ': jobs/' + (jobId || '') + '.json missing or description < 100 chars. Using export fallback (title/company/desc from step 1). This should not happen after auto-fix.');
        job_description = fromExport.job_description || '';
        job_title = job_title || (fromExport.job_title || fromExport.title || '').trim();
        company = (company === '—' && fromExport.company) ? fromExport.company.trim() : company;
        work_type = work_type || fromExport.work_type || '';
        location = location || fromExport.location || '';
      }
    }
    const isPlaceholderTitle = !job_title || job_title.trim() === '' || job_title.trim() === '—' || /^View job$/i.test(job_title.trim());
    if (isPlaceholderTitle && job_description && job_description.length >= 50) {
      const derived = deriveTitleFromDescription(job_description);
      if (derived) job_title = derived;
    }
    if (!job_title || job_title.trim() === '' || job_title.trim() === '—') job_title = '—';
    if ((company || '').trim() === '') company = '—';
    if (!job_description || job_description.trim().length < 50) {
      // Teal now blocks "Add Job" when description is empty.
      // Keep flow resilient even when LinkedIn body wasn't captured.
      const wt = (work_type || '').trim();
      const loc = (location || '').trim();
      job_description = [
        'Job captured from LinkedIn (fallback description).',
        `Title: ${job_title}`,
        `Company: ${company}`,
        wt ? `Work type: ${wt}` : '',
        loc ? `Location: ${loc}` : '',
        `Source URL: ${canonicalLinkedInJobUrl(url || lookupUrl)}`
      ].filter(Boolean).join('\n');
    }
    return { url: canonicalLinkedInJobUrl(url || lookupUrl), job_title, company, job_description, work_type, location };
  });
  list = limit > 0 ? list.slice(0, limit) : list;
  if (list.length === 0) return [];
  const byKey = new Map();
  for (const job of list) {
    const key = normCompanyTitle(job.company, job.job_title);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(job);
  }
  const onePerRole = [];
  for (const group of byKey.values()) {
    const best = group.slice().sort((a, b) => locationRank(a.location) - locationRank(b.location))[0];
    onePerRole.push(best);
  }
  return onePerRole;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useApp = process.argv.includes('--app');
  const setup = process.argv.includes('--setup');
  const debug = process.argv.includes('--debug');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
  ensureDirs();

  const exportIdx = process.argv.indexOf('--export');
  const exportPath = exportIdx >= 0 && process.argv[exportIdx + 1] ? process.argv[exportIdx + 1] : null;

  const input = args[0] || 'linkedin-jobs-' + new Date().toISOString().slice(0, 10) + '.md';
  let digestPath = path.isAbsolute(input) ? input : path.join(DIGESTS_DIR, input);
  if (!fs.existsSync(digestPath) && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    digestPath = path.join(DIGESTS_DIR, `linkedin-jobs-${input}.md`);
  }
  const dateMatch = path.basename(digestPath).match(/(\d{4}-\d{2}-\d{2})/);
  const jsonPath = exportPath
    ? (path.isAbsolute(exportPath) ? exportPath : path.resolve(process.cwd(), exportPath))
    : (dateMatch ? path.join(DATA_DIR, `job-descriptions-${dateMatch[1]}.json`) : null);

  if (useApp) {
    await ensureJobsDataAsync(digestPath, jsonPath, limit);
  }
  const jobs = useApp ? getJobsWithData(digestPath, jsonPath, limit) : [];
  let urls = useApp ? jobs.map((j) => j.url) : (jsonPath ? getUrlsFromJson(jsonPath) : getUrlsFromDigest(digestPath));
  if (urls.length === 0 && !useApp) {
    urls = getUrlsFromDigest(digestPath);
    if (limit > 0) urls = urls.slice(0, limit);
  }
  if (urls.length === 0 && jobs.length === 0) {
    console.error('No jobs to add to Teal. Digest has no job lines (filter may have removed all) or export does not match digest.');
    console.error('Run LinkedIn capture again and ensure the digest contains "- [ ] [Title — Company](url)" lines.');
    process.exit(1);
  }
  if (!useApp && limit > 0) urls = urls.slice(0, limit);

  let jobsToAdd = jobs;
  let addedKeys = new Set();
  let keyToLocation = {};
  const step6EvidencePath = path.join(TEAL_FLOW_DIR, 'step-6-evidence.json');
  const writeStep6Evidence = (ev) => {
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(step6EvidencePath, JSON.stringify(ev, null, 2), 'utf8');
    } catch (_) {}
  };
  if (useApp && jobs.length > 0) {
    const processedIds = loadAllProcessedJobIds();
    const loaded = loadTealAddedKeys();
    addedKeys = loaded.keys;
    keyToLocation = loaded.keyToLocation;
    const skippedList = [];
    jobsToAdd = jobs.filter((job) => {
      const id = getJobIdFromUrl(job.url);
      const company = (job.company || '').trim() || '—';
      const title = (job.job_title || job.title || '').trim() || '—';
      // For single-job flow, do not skip by processedIds: we may have saved the ID last run without actually adding to Teal. Only skip by addedKeys (really in Teal).
      if (jobs.length > 1 && id && processedIds.has(id)) {
        skippedList.push({ jobId: id, linkedinUrl: job.url, company, title, reason: 'already_processed' });
        return false;
      }
      const key = normCompanyTitle(job.company, job.job_title);
      // Placeholder key (e.g. "—|—") is not unique: multiple single jobs can have it. Do not skip by addedKeys so we always add the job to Teal.
      const isPlaceholderKey = !key || key === '—|—' || key === '|' || /^[\s|—\-]+$/.test(key);
      // IMPORTANT: For single-job runs (jobs.length === 1), always attempt to add the job in Teal UI.
      // Even if our local cache thinks it's a duplicate, we must let Teal confirm via "already saved" toast.
      if (jobs.length > 1) {
        if (!isPlaceholderKey && addedKeys.has(key)) {
          skippedList.push({ jobId: id, linkedinUrl: job.url, company, title, reason: 'already_in_teal' });
          if (locationRank(job.location) < locationRank(keyToLocation[key] || '')) return true;
          return false;
        }
      }
      return true;
    });
    const skipped = jobs.length - jobsToAdd.length;
    if (skipped > 0) {
      console.log('On our side: skipping ' + skipped + ' (already processed or already in Teal). Adding ' + jobsToAdd.length + ' jobs.');
    }
    if (jobsToAdd.length === 0) {
      writeStep6Evidence({
        added: [],
        skipped: skippedList,
        noJobsToAddReason: 'all skipped (already processed or already in Teal)',
        digestPath: path.relative(VAULT, digestPath),
        writtenAt: new Date().toISOString()
      });
      const skippedAlreadyInTealIds = skippedList.filter((s) => s.reason === 'already_in_teal').map((s) => s.jobId).filter(Boolean);
      try {
        if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(TEAL_DIR, 'last-added-job-ids.json'),
          JSON.stringify({ addedIds: skippedAlreadyInTealIds, addedAt: new Date().toISOString() }, null, 2),
          'utf8'
        );
      } catch (_) {}
      console.log('No jobs to add (all skipped on our side). ' + (skippedAlreadyInTealIds.length > 0 ? 'Step 7 will create resumes for ' + skippedAlreadyInTealIds.length + ' job(s) already in Teal.' : '') + ' Done.');
      return;
    }
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fjob-tracker';
  const chromeProfileDir = useApp ? resolveChromeProfileDir() : null;
  const profileDir = useApp
    ? (chromeProfileDir || fs.mkdtempSync(path.join(os.tmpdir(), 'teal-playwright-')))
    : PROFILE_EXTENSION;
  const useSystemChrome = useApp && !!chromeProfileDir;

  if (useSystemChrome) {
    console.log('Используется профиль Chrome (при занятости — следующий из списка):', profileDir);
    console.log('(Если Chrome уже открыт с этим профилем — скрипт попробует другой профиль.)');
  } else if (useApp) {
    console.log('Профиль Chrome не найден — временный профиль. Войдите в Teal в открывшемся окне.');
  }

  // Teal automation: always visible browser (headless: false). Rule: no headless for Teal — script does not work otherwise.
  const launchOptions = {
    headless: false,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
  };
  if (useSystemChrome || !useApp) {
    launchOptions.channel = 'chrome';
  }

  let context;
  let usedProfileDir = profileDir;
  if (useApp && useSystemChrome) {
    const envDedicated =
      process.env.TEAL_CHROME_PROFILE &&
      path.resolve(process.env.TEAL_CHROME_PROFILE.replace(/^~/, os.homedir()));
    const candidates =
      envDedicated && fs.existsSync(envDedicated)
        ? [envDedicated]
        : getTealProfileCandidates();
    ensureDirs();
    for (const p of candidates) {
      for (let launchAttempt = 0; launchAttempt < 2; launchAttempt++) {
        try {
          context = await launchPersistentContextGuarded(playwright.chromium, p, launchOptions);
          usedProfileDir = p;
          if (p !== (chromeProfileDir || '')) {
            console.log('Запущен профиль (предпочтительный был занят): ' + p);
          }
          break;
        } catch (e) {
          const msg = e && e.message ? String(e.message) : '';
          if (launchAttempt === 0 && msg.includes('DevToolsActivePort')) {
            const { removeStaleSingletonLock } = require('./teal-chrome-profile.cjs');
            removeStaleSingletonLock(p);
            console.log('DevToolsActivePort: повтор после сброса singleton lock…');
            continue;
          }
          if (!isProfileInUseError(e)) throw e;
          console.log('Профиль занят; пробуем следующий…');
          break;
        }
      }
      if (context) break;
    }
    if (!context) {
      const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
      const tealPassword = process.env.TEAL_PASSWORD;
      if (tealEmail && tealPassword) {
        console.log('Все профили заняты — временный профиль и вход по TEAL_EMAIL/TEAL_PASSWORD.');
        usedProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teal-playwright-'));
        context = await launchPersistentContextGuarded(playwright.chromium, usedProfileDir, launchOptions);
        if (useApp && usedProfileDir && usedProfileDir.startsWith(os.tmpdir())) {
          context.on('close', () => { try { fs.rmSync(usedProfileDir, { recursive: true, force: true }); } catch (_) {} });
        }
      } else {
        throw new Error('Не удалось запустить Chrome: все профили заняты. Задайте TEAL_EMAIL и TEAL_PASSWORD в .env или закройте окно Teal/Chrome.');
      }
    }
  } else {
    try {
      context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOptions);
    } catch (e) {
      if (!useApp && e.message && e.message.includes('channel')) {
        console.error('Chrome не найден. Используйте --app для добавления вакансий через веб-приложение Teal.');
        process.exit(1);
      }
      throw e;
    }
  }
  if (useApp && !useSystemChrome) {
    context.on('close', () => { try { fs.rmSync(usedProfileDir, { recursive: true, force: true }); } catch (_) {} });
  }

  await sleep(2000);
  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  if (useApp) {
    if (setup) {
      console.log('Setup: opening Teal Sign In. Log in; script will exit when it detects the dashboard (or after 10 min).');
      await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(2000);
        try {
          for (const p of context.pages()) {
            const url = p.url();
            if (url.includes('app.tealhq.com') && !url.includes('sign-up') && !url.includes('sign-in') && !url.includes('login') && !url.includes('accounts.google.com')) {
              console.log('Detected Teal dashboard. Setup done.');
              await closeTealBrowser(context, usedProfileDir);
              return;
            }
          }
        } catch (e) {
          if (!e.message || !e.message.includes('Target closed')) throw e;
          break;
        }
      }
      console.log('Timeout. If you logged in, run the script without --setup.');
      try {
        await closeTealBrowser(context, usedProfileDir);
      } catch (_) {}
      return;
    }
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(5000);
    const currentUrl = page.url();
    const isRedirectToAuth = currentUrl.includes('sign-up') || currentUrl.includes('login') || currentUrl.includes('accounts.google.com');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const looksLikeLogin = /sign in|sign up|log in|create account/i.test(bodyText.slice(0, 2000)) && !/add job|job tracker|bookmarked/i.test(bodyText.slice(0, 3000));
    if (isRedirectToAuth || looksLikeLogin) {
      const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
      const tealPassword = process.env.TEAL_PASSWORD;
      if (tealEmail && tealPassword) {
        console.log('Вход по TEAL_EMAIL/TEAL_PASSWORD из .env …');
        await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), [data-testid*="email"], a:has-text("Continue with email")').first();
        if ((await emailLink.count()) > 0) {
          try {
            await emailLink.click();
            await sleep(1500);
          } catch (_) {}
        }
        const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
        const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
        if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0) {
          await emailInput.fill(tealEmail);
          await sleep(300);
          await passwordInput.fill(tealPassword);
          await sleep(300);
          const submitBtn = page.locator('button[type="submit"]').first();
          const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
          const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
          if ((await submitBtn.count()) > 0) await submitBtn.click();
          else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
          else if ((await altBtn.count()) > 0) await altBtn.click();
          else await page.locator('form').first().evaluate((f) => f.submit());
          await sleep(5000);
          const afterUrl = page.url();
          const afterAuth = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login') && !afterUrl.includes('accounts.google.com');
          if (afterAuth) {
            console.log('Вход выполнен.');
            await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(2000);
          } else {
            if (debug) {
              await page.screenshot({ path: path.join(TEAL_DIR, 'teal-login-check.png') });
              fs.writeFileSync(path.join(TEAL_DIR, 'teal-login-check.html'), await page.content(), 'utf8');
            }
            await closeTealBrowser(context, usedProfileDir);
            console.error('Вход не прошёл или редирект. Проверьте TEAL_EMAIL/TEAL_PASSWORD в .env или запустите с --debug.');
            process.exit(1);
          }
        } else {
          await closeTealBrowser(context, usedProfileDir);
          console.error('Форма входа по email не найдена (возможно, только Google). Задайте TEAL_EMAIL/TEAL_PASSWORD в .env для входа по email или закройте Chrome и запустите с вашим профилем.');
          process.exit(1);
        }
      } else {
        await closeTealBrowser(context, usedProfileDir);
        const envFile = path.join(VAULT, '.env');
        console.error('Креды не найдены. Проверьте:');
        console.error('  Файл .env: ' + envFile);
        console.error('  TEAL_EMAIL задан: ' + (!!(process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim())) + ', TEAL_PASSWORD задан: ' + !!process.env.TEAL_PASSWORD);
        console.error('Добавьте в .env строки (без кавычек, без пробелов вокруг =):');
        console.error('  TEAL_EMAIL=ваш@email.com');
        console.error('  TEAL_PASSWORD=пароль');
        process.exit(1);
      }
    }

    const addedToTeal = [];
    for (let i = 0; i < jobsToAdd.length; i++) {
      const job = jobsToAdd[i];
      const cTitleKey = normCompanyTitle(job.company, job.job_title);
      console.log(`[${i + 1}/${jobsToAdd.length}] ${(job.job_title || job.url).slice(0, 50)} …`);
      try {
        if (requiresNonEnglishLanguage(job.job_title || '', job.job_description || '')) {
          console.log('  → Skip: non-English language required (e.g. Deutsch- und Englischkenntnisse).');
          continue;
        }
        if (!(job.job_description || '').trim() || (job.job_description || '').trim().length < 50) {
          console.log('  → Skip: no description or too short (required).');
          continue;
        }
        const addNewJobBtn = page
          .locator('button:has-text("Add Job")')
          .or(page.locator('button:has-text("Add a new job"), button:has-text("Add a New Job"), a:has-text("Add a new job")'))
          .first();
        if ((await addNewJobBtn.count()) > 0 && (await addNewJobBtn.isVisible())) await addNewJobBtn.click();
        else {
          const fallback = page.locator('button, a').filter({ hasText: /add a new job/i }).first();
          if ((await fallback.count()) > 0) await fallback.click();
        }
        await sleep(3000);
        const dialog = page.locator('.ant-modal.job-tracker-job-modal, [role="dialog"].ant-modal, [role="dialog"], [data-state="open"], .modal').first();
        const jobPostForm = page.locator('form#job-post').first();
        const form = (await jobPostForm.count()) > 0 && (await jobPostForm.isVisible().catch(() => false))
          ? jobPostForm
          : ((await dialog.count()) > 0 && (await dialog.isVisible()) ? dialog : page);

        async function fillField(selectors, value) {
          if (!value || typeof value !== 'string') return;
          const trimmed = value.trim().slice(0, 5000);
          for (const sel of selectors) {
            const el = form.locator(sel).first();
            if ((await el.count()) > 0 && (await el.isVisible())) {
              await el.fill(trimmed);
              await sleep(200);
              return;
            }
          }
        }

        async function fillFieldByLabel(labelPattern, value, multiline = false) {
          if (!value || typeof value !== 'string') return false;
          const trimmed = value.trim().slice(0, multiline ? 15000 : 5000);
          return await form.evaluate((root, { labelPattern, value, multiline }) => {
            const re = new RegExp(labelPattern, 'i');
            const isUsable = (el) => {
              if (!el || el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            };
            const setValue = (el) => {
              if (!isUsable(el)) return false;
              el.focus();
              if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                el.textContent = value;
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
              } else {
                const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
                if (setter) setter.call(el, value);
                else el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            };
            let labels = Array.from(root.querySelectorAll('label'))
              .filter((el) => re.test((el.textContent || '').trim()))
              .filter((el) => !el.closest('button'));
            if (labels.length === 0) {
              labels = Array.from(root.querySelectorAll('div, span, p'))
                .filter((el) => re.test((el.textContent || '').trim()))
                .filter((el) => !el.closest('button'));
            }
            for (const label of labels) {
              const controlSelector = multiline
                ? 'textarea, [contenteditable="true"], div[role="textbox"], .ProseMirror'
                : 'input, textarea, [contenteditable="true"], div[role="textbox"]';
              const explicitTarget = label.getAttribute('for')
                ? root.querySelector('#' + CSS.escape(label.getAttribute('for')))
                : null;
              const explicitControl = explicitTarget && explicitTarget.matches?.(controlSelector)
                ? explicitTarget
                : explicitTarget?.querySelector?.(controlSelector);
              if (setValue(explicitControl)) return true;
              let scope = label;
              for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
                const controls = Array.from(scope.querySelectorAll(controlSelector));
                const preferred = multiline
                  ? controls.find((el) => el.tagName === 'TEXTAREA') || controls[0]
                  : controls.find((el) => el.tagName === 'INPUT') || controls[0];
                if (setValue(preferred)) return true;
              }
              let next = label.nextElementSibling;
              for (let hops = 0; next && hops < 4; hops++, next = next.nextElementSibling) {
                const control = next.matches?.(controlSelector) ? next : next.querySelector?.(controlSelector);
                if (setValue(control)) return true;
              }
            }
            return false;
          }, { labelPattern, value: trimmed, multiline }).catch(() => false);
        }

        const pastedJob = isPastedJob(job);
        async function switchToManualDescriptionMode() {
          // Teal UI variants:
          // - old: direct description editor is visible
          // - new: "search by URL" mode is default, description is behind a tab/button (often with a magnifier icon nearby)
          const manualMode = form
            .locator('button, [role="tab"], [role="button"], a')
            .filter({ hasText: /description|paste|manual|enter manually|job details/i })
            .first();
          if ((await manualMode.count()) > 0 && (await manualMode.isVisible().catch(() => false))) {
            await manualMode.click().catch(() => {});
            await sleep(600);
          }
        }
        // Always attempt to switch; safe no-op on old UI and fixes new hidden-description mode.
        await switchToManualDescriptionMode();
        if (!pastedJob) {
          await fillField(['input[type="url"]', 'input[placeholder*="url" i]', 'input[placeholder*="link" i]', 'input[name*="url" i]'], job.url);
          await fillFieldByLabel('url|original posting|posting', job.url);
        }
        await fillField(['input[placeholder*="job title" i]', 'input[placeholder*="position" i]', 'input[name*="title" i]', 'input[name*="position" i]', 'input[aria-label*="title" i]'], job.job_title);
        await fillFieldByLabel('job\\s*title|position', job.job_title);
        const companyValue = (job.company || '').trim() || '—';
        await fillField(['input[placeholder*="company" i]', 'input[name*="company" i]', 'input[aria-label*="company" i]', 'input[placeholder*="Company" i]'], companyValue);
        await fillFieldByLabel('company', companyValue);
        await fillField(['input[placeholder*="location" i]', 'input[placeholder*="type" i]', 'input[name*="location" i]', 'input[name*="work" i]', 'select[name*="location" i]', 'select[name*="type" i]'], job.work_type);
        await fillFieldByLabel('location|work\\s*type', job.work_type);

        const descSelectors = [
          '.ProseMirror', '.tiptap.ProseMirror', 'div.ProseMirror', '[class*="ProseMirror"][class*="cursor-text"]',
          'textarea[placeholder*="description" i]', 'textarea[name*="description" i]', 'textarea[aria-label*="description" i]',
          'textarea', '[contenteditable="true"]', 'div[role="textbox"]',
          '[data-placeholder*="description" i]', '[data-placeholder*="paste" i]'
        ];
        let descTextarea = null;
        const descText = (job.job_description || '').trim().slice(0, 15000);
        const isRichTextSelector = (sel) => /ProseMirror|tiptap|contenteditable|role="textbox"/i.test(sel);
        const richPasteShortcut = process.platform === 'darwin' ? 'Meta+v' : 'Control+v';
        const selectAllShortcut = process.platform === 'darwin' ? 'Meta+a' : 'Control+a';
        async function tryFillDescriptionOnce() {
          const filledByLabel = await fillFieldByLabel('job\\s*description|description', descText, true);
          if (filledByLabel) {
            const labelFilledLength = await form.evaluate((root) => {
              const controls = Array.from(root.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"], .ProseMirror'));
              return controls.reduce((max, el) => Math.max(max, ((el.value || el.textContent || '').trim()).length), 0);
            }).catch(() => 0);
            if (labelFilledLength >= 50) {
              descTextarea = form.locator('textarea, [contenteditable="true"], div[role="textbox"], .ProseMirror').first();
              return;
            }
          }
          for (const sel of descSelectors) {
            const textarea = form.locator(sel).first();
            if ((await textarea.count()) > 0 && (await textarea.isVisible()) && descText.length > 0) {
              await textarea.click();
              await sleep(200);
              if (isRichTextSelector(sel)) {
                // Teal often renders description as ProseMirror/contenteditable where .fill() can be ignored.
                await textarea.evaluate((el, text) => {
                  const isEditable = !!el && (el.isContentEditable || el.getAttribute('contenteditable') === 'true');
                  if (isEditable) {
                    el.focus();
                    el.textContent = text;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }, descText).catch(() => {});
                await sleep(150);
                await textarea.click();
                await page.keyboard.press(selectAllShortcut).catch(() => {});
                await page.keyboard.insertText(descText).catch(() => {});
              } else {
                await textarea.fill(descText);
              }
              await sleep(300);
              let valueNow = await textarea.inputValue().catch(() => '') || await textarea.textContent().catch(() => '') || '';
              if ((valueNow || '').trim().length < 50 && isRichTextSelector(sel)) {
                await page.evaluate((text) => navigator.clipboard.writeText(text), descText);
                await textarea.click();
                await sleep(100);
                await page.keyboard.press(richPasteShortcut);
                await sleep(500);
                valueNow = await textarea.textContent().catch(() => '') || '';
              }
              if ((valueNow || '').trim().length >= 50) {
                descTextarea = textarea;
                break;
              }
            }
          }
        }
        await tryFillDescriptionOnce();
        if (!descTextarea || ((await descTextarea.inputValue().catch(() => '') || await descTextarea.textContent().catch(() => '') || '').trim().length < 50)) {
          // One more attempt after explicitly re-opening manual description mode.
          await switchToManualDescriptionMode();
          await tryFillDescriptionOnce();
        }
        const descValueNow = descTextarea
          ? (await descTextarea.inputValue().catch(() => '') || await descTextarea.textContent().catch(() => '') || '').trim()
          : '';
        if (!descTextarea || (descValueNow || '').length < 50) {
          const debugPath = path.join(TEAL_DIR, 'teal-form-no-description.html');
          fs.writeFileSync(debugPath, await page.content(), 'utf8');
          if (debug) await page.screenshot({ path: path.join(TEAL_DIR, 'teal-form-no-description.png') });
          console.log('  → Skip: description not filled or empty in form (required). Debug: ' + debugPath);
          await page.keyboard.press('Escape');
          await sleep(500);
          continue;
        }
        const submitInDialog = (await dialog.count()) > 0
          ? dialog.locator('button').filter({ hasNotText: 'Save this Search' }).filter({ hasText: /Add|Save|Submit/i }).first()
          : page.locator('button').filter({ hasNotText: 'Save this Search' }).filter({ hasText: /^Add$|^Save$|^Submit$/i }).first();
        if ((await submitInDialog.count()) > 0 && (await submitInDialog.isEnabled())) await submitInDialog.click();
        else {
          const anySubmit = page.locator('button[type="submit"]').filter({ hasNotText: 'Save this Search' }).first();
          if ((await anySubmit.count()) > 0 && (await anySubmit.isEnabled())) await anySubmit.click();
        }
        await sleep(2500);
        const toastDuplicate = page.getByRole('alert').filter({ hasText: /already saved a job post with this URL|duplicate/i }).first();
        const alreadySaved = (await toastDuplicate.count()) > 0 && (await toastDuplicate.isVisible().catch(() => false));
        if (alreadySaved) {
          console.log('  → Teal: вакансия уже добавлена (duplicate / already saved). Закрываю форму, возвращаюсь к списку, ищу по названию.');
        }
        let tealJobUrl = null;
        if (!alreadySaved) {
          await sleep(2000);
          const currentUrl = page.url();
          if (/app\.tealhq\.com\/job-tracker\/[a-f0-9-]{36}/i.test(currentUrl)) tealJobUrl = currentUrl;
          addedToTeal.push({
            title: (job.job_title || '').trim() || '—',
            company: (job.company || '').trim() || '—',
            url: job.url,
            tealJobUrl
          });
        }
        // Invariant: we only treat a job as "already in Teal" if we have a concrete evidence entry.
        // For a new add we know Teal accepted the job; for a duplicate toast we know Teal already has it.
        const evCompany = (job.company || '').trim() || '—';
        const evTitle = (job.job_title || '').trim() || '—';
        const evUrl = (job.url || '').trim();
        if (evUrl) {
          recordTealAddEvidence({
            company: evCompany,
            title: evTitle,
            linkedinUrl: evUrl,
            status: alreadySaved ? 'duplicate_detected' : 'created'
          });
        }
        addedKeys.add(cTitleKey);
        keyToLocation[cTitleKey] = (job.location || '').trim();
        if (alreadySaved) {
          await page.keyboard.press('Escape');
          await sleep(500);
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('button:has-text("Add a new job"), button:has-text("Add a New Job")', { state: 'visible', timeout: 10000 }).catch(() => {});
          await sleep(2000);
          console.log('  → Страница Job Tracker обновлена. Ищу вакансию в списке по названию.');
          if (pastedJob) {
            console.log('  → Вакансия уже в Teal (pasted job, без поиска в списке).');
          } else {
          const descText = (job.job_description || '').trim().slice(0, 15000);
          const jobTitle = (job.job_title || '').trim();
          const company = ((job.company || '').trim() && (job.company || '').trim() !== '—') ? (job.company || '').trim() : '—';
          const workType = (job.work_type || '').trim();
          const needFill = descText.length >= 50 || jobTitle || company || workType;
          if (needFill) {
            const titleMatch = jobTitle.slice(0, 40);
            const titleRegex = titleMatch.length > 1 ? new RegExp(escapeRegex(titleMatch.slice(0, 25)), 'i') : null;
            const filterByPlaceholder = page.getByPlaceholder('Filter Jobs');
            let filterInput = (await filterByPlaceholder.count()) > 0
              ? filterByPlaceholder
              : page.locator('input[aria-label="Filter Jobs"], input[placeholder="Filter Jobs"], .ant-input-affix-wrapper.filter-input input, .filter-input input').first();
            if (!((await filterInput.count()) > 0 && (await filterInput.isVisible().catch(() => false)))) {
              // New Teal UI: filter input is hidden until Search (magnifier) button click.
              const searchToggle = page
                .locator('button:has(span.sr-only:has-text("Search"))')
                .or(page.locator('button[aria-label="Search"]'))
                .or(page.locator('button').filter({ hasText: /^Search$/i }))
                .first();
              if ((await searchToggle.count()) > 0 && (await searchToggle.isVisible().catch(() => false))) {
                await searchToggle.click().catch(() => {});
                await sleep(400);
              }
              filterInput = (await filterByPlaceholder.count()) > 0
                ? filterByPlaceholder
                : page.locator('input[aria-label="Filter Jobs"], input[placeholder="Filter Jobs"], .ant-input-affix-wrapper.filter-input input, .filter-input input').first();
            }
            if (titleMatch.length > 0) {
              if ((await filterInput.count()) > 0 && (await filterInput.isVisible().catch(() => false))) {
                console.log('  → Фильтр: ввожу «' + titleMatch + '»');
                await filterInput.focus();
                await sleep(200);
                await filterInput.evaluate((el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
                await sleep(200);
                await filterInput.fill(titleMatch);
                await sleep(2500);
              } else {
                console.log('  → Поле Filter Jobs не найдено.');
              }
            }
            let toClick = null;
            if (titleRegex) {
              // Teal Job Tracker uses Tabulator (divs), not <table>: role-cell has div.invisible-button > span (job title)
              const tabulatorRow = page.locator('div.tabulator-row').filter({ hasText: titleRegex }).first();
              if ((await tabulatorRow.count()) > 0 && (await tabulatorRow.isVisible().catch(() => false))) toClick = tabulatorRow;
              if (!toClick) {
                const tabulatorCell = page.locator('div.tabulator-cell.role-cell div.invisible-button').filter({ hasText: titleRegex }).first();
                if ((await tabulatorCell.count()) > 0 && (await tabulatorCell.isVisible().catch(() => false))) toClick = tabulatorCell;
              }
              if (!toClick) {
                const linkInTable = page.locator('table tbody tr td a').filter({ hasText: titleRegex }).first();
                if ((await linkInTable.count()) > 0 && (await linkInTable.isVisible().catch(() => false))) toClick = linkInTable;
              }
              if (!toClick) {
                const linkAny = page.locator('a').filter({ hasText: titleRegex }).first();
                if ((await linkAny.count()) > 0 && (await linkAny.isVisible().catch(() => false))) toClick = linkAny;
              }
              if (!toClick) {
                const row = page.locator('[role="row"], tbody tr').filter({ hasText: titleRegex }).first();
                if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) {
                  const linkInRow = row.locator('a').filter({ hasText: titleRegex }).first();
                  if ((await linkInRow.count()) > 0 && (await linkInRow.isVisible().catch(() => false))) toClick = linkInRow;
                }
              }
            }
            if (toClick) {
              console.log('  → В списке найдена вакансия «' + titleMatch + '». Открываю страницу.');
              const urlBefore = page.url();
              await toClick.click();
              await Promise.race([
                page.waitForURL((u) => u.pathname !== new URL(urlBefore).pathname || u.hash !== new URL(urlBefore).hash, { timeout: 8000 }),
                sleep(4000)
              ]).catch(() => {});
              await sleep(2000);
              const editBtn = page.getByRole('button', { name: /edit/i }).first();
              if ((await editBtn.count()) > 0 && (await editBtn.isVisible().catch(() => false))) {
                await editBtn.click();
                await sleep(2000);
              }
              const editForm = page.locator('.ant-modal.job-tracker-job-modal, [role="dialog"].ant-modal, [role="dialog"]').first();
              const formScope = (await editForm.count()) > 0 && (await editForm.isVisible()) ? editForm : page;
              const titleInput = formScope.locator('input[placeholder*="job title" i], input[placeholder*="position" i], input[name*="title" i]').first();
              const companyInput = formScope.locator('input[placeholder*="company" i], input[name*="company" i]').first();
              const descEl = formScope.locator('.ProseMirror, .tiptap.ProseMirror').first();
              const workTypeInput = formScope.locator('input[placeholder*="location" i], input[placeholder*="type" i], input[name*="work" i], select[name*="type" i], select[name*="location" i]').first();
              const needTitle = jobTitle && (!(await titleInput.count()) || !(await titleInput.inputValue().catch(() => '')) || (await titleInput.inputValue().catch(() => '')).trim().length < 2);
              const needCompany = (!(await companyInput.count()) || !(await companyInput.inputValue().catch(() => '')) || (await companyInput.inputValue().catch(() => '')).trim().length < 2);
              const currentDesc = (await descEl.count()) > 0 ? (await descEl.textContent().catch(() => '') || '').trim() : '';
              const needDesc = descText.length >= 50 && currentDesc.length < 50;
              const needWorkType = workType && (!(await workTypeInput.count()) || !(await workTypeInput.inputValue().catch(() => '')) || (await workTypeInput.inputValue().catch(() => '')).trim().length < 2);
              if (needTitle || needCompany || needDesc || needWorkType) {
                console.log('  → Дозаполняю: ' + [needTitle && 'название', needCompany && 'компания', needDesc && 'описание', needWorkType && 'тип занятости'].filter(Boolean).join(', '));
                if (needTitle && (await titleInput.count()) > 0 && (await titleInput.isVisible().catch(() => false))) {
                  await titleInput.fill(jobTitle.slice(0, 500));
                  await sleep(200);
                }
                if (needCompany && (await companyInput.count()) > 0 && (await companyInput.isVisible().catch(() => false))) {
                  await companyInput.fill((company || '—').slice(0, 500));
                  await sleep(200);
                }
                if (needDesc && (await descEl.count()) > 0 && (await descEl.isVisible())) {
                  await descEl.click();
                  await sleep(200);
                  await page.evaluate((text) => navigator.clipboard.writeText(text), descText);
                  await descEl.click();
                  await sleep(100);
                  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
                  await sleep(500);
                }
                if (needWorkType && (await workTypeInput.count()) > 0 && (await workTypeInput.isVisible().catch(() => false))) {
                  await workTypeInput.fill(workType.slice(0, 200));
                  await sleep(200);
                }
                const saveBtn = formScope.locator('button').filter({ hasText: /Save|Update|Submit/i }).first();
                if ((await saveBtn.count()) > 0 && (await saveBtn.isEnabled())) await saveBtn.click();
                await sleep(2000);
              } else {
                console.log('  → Все поля уже заполнены.');
              }
              await page.keyboard.press('Escape');
              await sleep(500);
            } else {
              // Дубликат: строка в списке не найдена по текущему селектору. Не падаем — пропускаем дозаполнение, flow продолжается (match-score найдёт вакансию по-своему).
              console.log('  → Дубликат: строка в списке не найдена по селектору (искал «' + titleMatch + '»). Пропуск дозаполнения, продолжаю flow.');
              try {
                if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
                const prefix = 'teal-list-row-not-found-' + (job.url ? getJobIdFromUrl(job.url) : i) + '-';
                const ts = Date.now();
                await page.screenshot({ path: path.join(TEAL_DIR, prefix + ts + '.png') });
                fs.writeFileSync(path.join(TEAL_DIR, prefix + ts + '.html'), await page.content(), 'utf8');
                console.log('  → Сохранён снимок и HTML в ' + path.relative(VAULT, TEAL_DIR) + ' для доработки селектора (см. 00-Inbox/Job_Search/teal/TEAL_LIST_SELECTOR_STEPS.md).');
              } catch (saveErr) {
                console.log('  → Не удалось сохранить снимок:', saveErr.message);
              }
            }
          } else {
            console.log('  → Дубликат (дозаполнение не требуется).');
          }
          }
        }
        await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
        if (debug && i === 0) {
          await page.screenshot({ path: path.join(TEAL_DIR, 'teal-app-debug.png') });
          fs.writeFileSync(path.join(TEAL_DIR, 'teal-app-debug.html'), await page.content(), 'utf8');
          console.log('  → Debug: saved teal-app-debug.png and teal-app-debug.html');
        }
      } catch (e) {
        console.log('  → Error:', e.message);
        try {
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 10000 });
          await sleep(1500);
        } catch (_) {}
      }
      if (process.env.FULL_FLOW_STATE_FILE) {
        try {
          updateFlowProgress(process.env.FULL_FLOW_STATE_FILE, 6, { total: jobsToAdd.length, done: i + 1 }, VAULT);
        } catch (_) {}
      }
    }
    saveTealAddedKeys(addedKeys, keyToLocation);
    const skippedAlreadyInTealIds = (typeof skippedList !== 'undefined' && Array.isArray(skippedList))
      ? skippedList.filter((s) => s.reason === 'already_in_teal').map((s) => s.jobId).filter(Boolean)
      : [];
    const addedIds = addedToTeal.map((j) => getJobIdFromUrl(j.url)).filter(Boolean).concat(skippedAlreadyInTealIds);
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(TEAL_DIR, 'last-added-job-ids.json'),
        JSON.stringify({ addedIds, addedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
      const step6EvidencePath = path.join(TEAL_FLOW_DIR, 'step-6-evidence.json');
      const skippedForEvidence = (typeof skippedList !== 'undefined' && Array.isArray(skippedList)) ? skippedList : [];
      fs.writeFileSync(
        step6EvidencePath,
        JSON.stringify({
          added: addedToTeal.map((j) => ({
            jobId: getJobIdFromUrl(j.url),
            linkedinUrl: j.url,
            company: j.company || '—',
            title: j.title || '—',
            tealJobUrl: j.tealJobUrl || null
          })),
          skipped: skippedForEvidence,
          writtenAt: new Date().toISOString()
        }, null, 2),
        'utf8'
      );
      if (addedToTeal.length > 0 && digestPath && fs.existsSync(digestPath)) {
        const timestamp = new Date().toISOString().replace(/T/, ' ').slice(0, 16);
        const sectionLines = ['', '## Added to Teal (' + timestamp + ')', 'Ссылки: LinkedIn (источник) и при успешном редиректе — карточка в Teal:', ''];
        for (const j of addedToTeal) {
          const url = j.url || ('https://www.linkedin.com/jobs/view/' + (getJobIdFromUrl(j.url) || '') + '/');
          const title = (j.title || '—').replace(/\]/g, '\\]');
          const company = (j.company || '—').replace(/\]/g, '\\]');
          sectionLines.push('- [' + title + ' · ' + company + '](' + url + ')');
          if (j.tealJobUrl && String(j.tealJobUrl).trim()) {
            sectionLines.push('  - Teal: ' + String(j.tealJobUrl).trim());
          }
        }
        sectionLines.push('');
        let content = fs.readFileSync(digestPath, 'utf8');
        const addedSectionRe = /\n## Added to Teal \([^)]+\)[\s\S]*?(?=\n## |\n---|$)/;
        if (addedSectionRe.test(content)) {
          content = content.replace(addedSectionRe, sectionLines.join('\n'));
        } else {
          content = content.trimEnd() + '\n' + sectionLines.join('\n');
        }
        fs.writeFileSync(digestPath, content, 'utf8');
      }
    } catch (_) {}
    await closeTealBrowser(context, usedProfileDir);
    if (addedToTeal.length > 0) {
      console.log('');
      console.log('---');
      console.log('Added to Teal (' + addedToTeal.length + '):');
      addedToTeal.forEach((j, idx) => {
        console.log((idx + 1) + '. ' + j.title + ' — ' + j.company);
        console.log('   ' + j.url);
      });
    } else if (jobsToAdd.length > 0) {
      console.log('');
      console.log('---');
      console.error('No jobs were added (all skipped: no description or form not filled).');
      console.error('Ensure digest and export are from the same capture run. If you re-ran capture, use the digest that was just generated.');
      process.exitCode = 1;
    }
    console.log('Done.');
    return;
  }

  if (setup) {
    console.log('Setup: install Teal in this profile (LinkedIn already used by job-search).');
    console.log('1. Install Teal: https://chromewebstore.google.com/detail/teal-job-search-companion/opafjjlpbiaicbbgifbejoochmmeikep');
    console.log('2. Log into Teal at app.tealhq.com if prompted.');
    await page.goto('https://app.tealhq.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => page.goto('https://app.tealhq.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 15000 }));
    await sleep(3000);
    console.log('When done, close this browser. Next run (without --setup) will add jobs automatically.');
    return;
  }

  // Open the page from the link the user gave (LINKEDIN_OPEN_URL from full-flow), or first job from digest, or feed
  const userUrl = (process.env.LINKEDIN_OPEN_URL || '').trim();
  const loginCheckUrl = (userUrl && userUrl.includes('linkedin.com')) ? userUrl : (urls.length > 0 ? urls[0] : 'https://www.linkedin.com/feed/');
  await page.goto(loginCheckUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (page.url().includes('/login') || page.url().includes('/authwall')) {
    await closeTealBrowser(context, usedProfileDir);
    console.error('Not logged into LinkedIn. Run with --setup or use --app to add via Teal web app.');
    process.exit(1);
  }
  await sleep(1500);

  const tealSelectors = [
    'button:has-text("Save")',
    'button:has-text("Bookmark")',
    'button:has-text("Add to Teal")',
    'a:has-text("Save to Teal")',
    '[data-teal-save]',
    '[data-testid*="teal"]',
    '[aria-label*="Save"]',
    '[aria-label*="Bookmark"]',
    'button[class*="teal"]',
    'a[href*="teal"]'
  ];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const jobId = url.match(/\/view\/(\d+)/)?.[1] || '?';
    console.log(`[${i + 1}/${urls.length}] Job ${jobId} …`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (page.url().includes('/login') || page.url().includes('/authwall')) {
        console.log('  → LinkedIn session expired, skip.');
        continue;
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(3000);

      if (debug && i === 0) {
        await page.screenshot({ path: path.join(TEAL_DIR, 'teal-debug-screenshot.png') });
        fs.writeFileSync(path.join(TEAL_DIR, 'teal-debug-page.html'), await page.content(), 'utf8');
        console.log('  → Debug: saved teal-debug-screenshot.png and teal-debug-page.html');
      }

      let clicked = false;
      for (const sel of tealSelectors) {
        try {
          const btn = page.locator(sel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await btn.click();
            clicked = true;
            console.log('  → Clicked Teal save.');
            break;
          }
        } catch (_) {}
      }
      if (!clicked) {
        const allButtons = await page.locator('button, a[role="button"]').all();
        for (const b of allButtons) {
          const text = (await b.textContent()) || '';
          const label = (await b.getAttribute('aria-label')) || '';
          if (/save|bookmark|add to teal/i.test(text + label)) {
            await b.click();
            clicked = true;
            console.log('  → Clicked by text/aria.');
            break;
          }
        }
      }
      if (!clicked) console.log('  → Teal button not found (extension may not be in this profile).');
      await sleep(2000);
    } catch (e) {
      console.log('  → Error:', e.message);
    }
  }

  await closeTealBrowser(context, usedProfileDir);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
