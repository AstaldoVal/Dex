#!/usr/bin/env node
/**
 * Generate a digest markdown file from a Dex LinkedIn search export JSON.
 *
 * Reads `dex-linkedin-search-*.json` (produced by the search-capture.js extension)
 * and writes a markdown digest to `00-Inbox/Job_Search/digests/linkedin/`.
 *
 * Usage:
 *   node generate-search-digest.cjs                          # auto-find latest search export
 *   node generate-search-digest.cjs --export path/to/file.json
 *   node generate-search-digest.cjs --export file.json --no-cross-dedup  # include jobs already in other digests (used by full-flow)
 *   npm run job-search:from-search
 *   npm run job-search:from-search -- --export ~/Downloads/dex-linkedin-search-senior-product-manager-2026-02-09.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { VAULT, LINKEDIN_DIGESTS_DIR, DIGESTS_DIR, DATA_DIR, JOBS_DIR, ensureDirs } = require('./job-search-paths.cjs');
const { isRemoteFromExcludedCountry, isVideoGamingRole, isAutomotiveRole, isTelecomRole, requiresHighTravel, requiresRelocation, requiresOfficePresence, requiresResidenceInExcludedCountry, isBelowMinSalary, isHardwareRole, requiresSapExperience, deriveTitleFromDescription } = require('./job-search-utils.cjs');

/**
 * Find the latest dex-linkedin-search-*.json file.
 * Searches in DATA_DIR first, then ~/Downloads.
 */
function findLatestSearchExport() {
  const searchDirs = [
    DATA_DIR,
    path.join(os.homedir(), 'Downloads', 'dex-job-search'),
    path.join(os.homedir(), 'Downloads')
  ];

  let newest = null;
  let newestMtime = 0;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f =>
      f.startsWith('dex-linkedin-search-') && f.endsWith('.json')
    );
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs;
        newest = fullPath;
      }
    }
  }

  return newest;
}

/**
 * Parse CLI: --export path, --search-total N (optional), --single-job (skip PM-only filter), --no-cross-dedup (include jobs already in other digests).
 */
function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { exportPath: null, searchTotal: null, singleJob: false, noCrossDedup: false };
  const exportIdx = argv.indexOf('--export');
  if (exportIdx !== -1 && argv[exportIdx + 1]) {
    const p = argv[exportIdx + 1];
    out.exportPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }
  const totalIdx = argv.indexOf('--search-total');
  if (totalIdx !== -1 && argv[totalIdx + 1] && /^\d+$/.test(argv[totalIdx + 1])) {
    out.searchTotal = parseInt(argv[totalIdx + 1], 10);
  }
  if (argv.includes('--single-job')) out.singleJob = true;
  if (argv.includes('--no-cross-dedup')) out.noCrossDedup = true;
  return out;
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function main() {
  const args = parseArgs();
  const exportPath = args.exportPath || findLatestSearchExport();
  if (args.searchTotal != null) process.env.LINKEDIN_SEARCH_TOTAL = String(args.searchTotal);

  if (!exportPath || !fs.existsSync(exportPath)) {
    console.error('[search-digest] No search export found.');
    console.error('  Looked in:', DATA_DIR, 'and', path.join(os.homedir(), 'Downloads'));
    console.error('  Use --export path/to/file.json to specify manually.');
    process.exit(1);
  }

  console.log('[search-digest] Reading:', exportPath);

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  } catch (e) {
    console.error('[search-digest] Failed to parse JSON:', e.message);
    process.exit(1);
  }

  const searchQuery = payload.searchQuery || 'search';
  const searchUrl = payload.searchUrl || '';
  const stats = payload.stats || {};
  const filterResults = (payload.filter && payload.filter.results) || {};
  const jobs = payload.jobs || {};
  const failedIds = payload.failedIds || [];

  // Title patterns to exclude from digest (not relevant PM roles; non-product positions)
  const NON_PM_TITLE_PATTERNS = [
    /Operations Manager\s*\(\s*Product\s*\)/i,
    /Product Success Specialist/i,
    /Sr\.?\s*Product Success Manager/i,
    /Product Success Manager\s*\(/i,  // "Product Success Manager (for product managers...)"
    /European IVD Hematology Product Manager/i,
    /Product Design Lead/i,
    /\bProduct\s+Designer\b/i,   // Design role, not PM (e.g. Principal Product Designer — PagerDuty)
    /Junior Product Manager/i,
    // Non-product: marketing, creative, people (HR) roles
    /Creative\s+Marketing\s+Manager/i,
    /Marketing\s+Manager\s*\(\s*People\s*Product\s*\)/i,
    /Brand\s+Marketing\s+Manager/i,
    /Content\s+Marketing\s+Manager/i,
    /Growth\s+Marketing\s+Manager/i,
    /Digital\s+Marketing\s+Manager/i,
    /Performance\s+Marketing\s+Manager/i,
    /(\s|^)Marketing\s+Manager(\s|$|\))/i,
    /Product\s+Marketing\s+Manager/i,
    /Blockchain\s+Manager/i,
    /Product\s+Delivery\s+Lead/i,
    /Innovation\s+Manager/i,
    /Market\s+Launch\s+Owner/i,
    /Growth\s*&\s*Operations\s+Lead/i,
    // Category/retail (merchandising, not software PM)
    /\bProduct\s+Category\s+Manager\b/i,
    // Product line (P&L/hardware line, not software PM; e.g. Product Line Manager - Microwave Systems)
    /\bProduct\s+Line\s+Manager\b/i,
    // Sales-heavy hybrid (sales & product manager, technical sales & product manager)
    /\b(?:Technical\s+)?Sales\s*(?:&|and|\s*[-–—])\s*Product\s+Manager\b/i,
    // Adoption/Experience (customer success, not product strategy)
    /Product\s+Adoption\s*&\s*Experience\s+Manager/i,
    /Adoption\s*&\s*Experience\s+Manager/i,
    /Product\s+Adoption\s+Manager/i,
    // UX leadership (design track), not PM
    /\bUX\s+Lead\s*\(\s*Product\s*&\s*Growth\s*\)/i,
    // Only product roles (PM, PO); not business analyst
    /\bBusiness\s+Analyst\b/i,
    /\bSenior\s+Business\s+Analyst\b/i,
    /\bLead\s+Business\s+Analyst\b/i,
    /\bPrincipal\s+Business\s+Analyst\b/i
  ];
  function isRelevantPMTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const t = title.trim();
    for (const re of NON_PM_TITLE_PATTERNS) {
      if (re.test(t)) return false;
    }
    return true;
  }

  // Exclude junior/intern/graduate/entry-level (user does not consider these levels)
  const JUNIOR_ENTRY_LEVEL_PATTERNS = [
    /\bJunior\b/i,
    /\bIntern\b/i,
    /\bGraduate\b/i,
    /\bEntry[- ]?level\b/i,
    /\bAssociate\s+Product\s+Manager\b/i
  ];
  function isJuniorOrEntryLevel(title) {
    if (!title || typeof title !== 'string') return false;
    const t = title.trim();
    return JUNIOR_ENTRY_LEVEL_PATTERNS.some((re) => re.test(t));
  }

  // Non-English: exclude when job *requires* German/Spanish/Portuguese/French (in description or title).
  // Do not exclude by (m/w/d) or (f/m/d) alone — common in EMEA remote roles, job can still be English.
  const NON_ENGLISH_TITLE_PATTERNS = [
    /\/\s*-\s*in\b/i,   // German "Produktmanager/-in" (clearly German title)
    /\bdeutschsprachig\b/i   // e.g. "Freelance Product Owner remote (m/w/d) - deutschsprachig"
  ];
  const REQUIRES_NON_ENGLISH = [
    [/fluent\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i, 'fluent in (German|Spanish|...)'],
    [/\bproficient\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i, 'proficient in (German|Spanish|...)'],
    [/\bfluency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i, 'fluency in (German|Spanish|...)'],
    [/native\s+(German|Spanish|Portuguese|French|Italian|Arabic)\s+(speaker|language)?/i, 'native (German|Spanish|...) speaker/language'],
    [/(German|Spanish|Portuguese|French|Italian|Arabic)\s+(language\s+)?(proficiency|required|essential|fluent)/i, '(Language) proficiency/required/essential/fluent'],
    [/proficiency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i, 'proficiency in (German|Spanish|...)'],
    [/working\s+language\s*[:\s]+\s*(German|Spanish|Portuguese|French|Italian|Arabic)/i, 'working language: (German|Spanish|...)'],
    [/(German|Spanish|Portuguese|French|Italian|Arabic)\s+\((C1|B2|native)\)/i, '(Language) (C1|B2|native)'],
    [/\bArabic\s+[Ss]peaker\b/i, 'Arabic Speaker'],
    [/\bDeutsch\s+auf\s+Muttersprachniveau\b/i, 'Deutsch auf Muttersprachniveau'],
    [/\bMuttersprache\s+Deutsch\b/i, 'Muttersprache Deutsch'],
    [/\bDeutsch\s+als\s+Muttersprache\b/i, 'Deutsch als Muttersprache'],
    [/\bdeutschsprachig\b/i, 'deutschsprachig'],
    [/\b(?:wir\s+)?suchen\s+(?:eine?n?\s+)?deutschsprachige?n?\s+(?:Product\s+)?Owner\b/i, 'suchen deutschsprachig(en)'],
    [/\bin\s+deutscher\s+Sprache\b/i, 'in deutscher Sprache'],
    [/\bDeutsch-?\s*und\s+Englischkenntnisse\b/i, 'Deutsch- und Englischkenntnisse'],
    [/\bDeutschkenntnisse\b/i, 'Deutschkenntnisse'],
    [/\bfließend(?:em)?\s+(?:in\s+)?Deutsch\b/i, 'fließend Deutsch'],
    [/\bsehr\s+gute\s+Deutsch-?\s*und\s+Englisch\b/i, 'sehr gute Deutsch- und Englisch']
  ];
  function getNonEnglishMatch(job) {
    const title = (job.title || '').trim();
    const desc = (job.description || '').trim();
    if (NON_ENGLISH_TITLE_PATTERNS.some((re) => re.test(title))) return 'title: German-language (Produktmanager/-in or deutschsprachig)';
    if (desc.length < 25) return null;  // lowered from 50: catch "Deutsch- und Englischkenntnisse" in shorter snippets
    const entry = REQUIRES_NON_ENGLISH.find(([re]) => re.test(desc));
    return entry ? entry[1] : null;
  }
  function isNonEnglishJob(job) {
    return getNonEnglishMatch(job) !== null;
  }

  // Collect jobs that passed filter (remove: false); fill description from export, then from JOBS_DIR if missing
  const totalInExport = Object.keys(filterResults).length;
  let removedByWorkType = 0;
  let jobEntries = [];
  for (const [jobId, filterData] of Object.entries(filterResults)) {
    if (filterData.remove) {
      removedByWorkType++;
      continue;
    }
    const jobData = jobs[jobId] || {};
    let description = (jobData.job_description || '').trim();
    const needFromJobsDir = !description || description.length < 100;
    if (needFromJobsDir) {
      const jobPath = path.join(JOBS_DIR, jobId + '.json');
      if (fs.existsSync(jobPath)) {
        try {
          const single = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
          if (single.job_description && single.job_description.length >= 100) {
            description = single.job_description;
            if (single.job_title && !jobData.job_title) jobData.job_title = single.job_title;
            if (single.company && single.company.trim() && !jobData.company) jobData.company = single.company;
          }
        } catch (_) {}
      }
    }
    let title = (filterData.title || jobData.job_title || '').trim();
    let company = (filterData.company || jobData.company || '').trim();
    // If title still placeholder/missing, try JOBS_DIR (for this job only) and derive from description
    if (title === '—' || !title) {
      if (!needFromJobsDir) {
        const jobPath = path.join(JOBS_DIR, jobId + '.json');
        if (fs.existsSync(jobPath)) {
          try {
            const single = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
            if (single.job_title && single.job_title.trim()) title = single.job_title.trim();
            if (!company && single.company && single.company.trim()) company = single.company.trim();
            if (!description && single.job_description && single.job_description.length >= 100) description = single.job_description;
          } catch (_) {}
        }
      }
      if ((title === '—' || !title) && description && description.length >= 20 && typeof deriveTitleFromDescription === 'function') {
        const derived = (deriveTitleFromDescription(description) || '').trim();
        if (derived) title = derived;
      }
    }
    if (title === '—' || company === '—' || !title || !company) {
      console.warn('[search-digest] Skipping job ' + jobId + ': no title or company (placeholders not allowed in digest).');
      continue;
    }
    jobEntries.push({
      id: jobId,
      title,
      company,
      workType: filterData.workType || jobData.work_type || 'Remote',
      location: jobData.location || '',
      description,
      url: 'https://www.linkedin.com/jobs/view/' + jobId
    });
  }

  // Deduplicate by (company, title): keep one entry per role, chosen by location priority
  // Priority: PT (live there) → UA (origin) → ES (neighbour) → UK → PL → NL → DE → … → rest
  const LOCATION_PRIORITY = [
    { pattern: /portugal/i, rank: 0 },
    { pattern: /ukraine/i, rank: 1 },
    { pattern: /spain/i, rank: 2 },
    { pattern: /united kingdom|england|,\s*uk\b|wales|scotland/i, rank: 3 },
    { pattern: /poland/i, rank: 4 },
    { pattern: /netherlands/i, rank: 5 },
    { pattern: /germany/i, rank: 6 },
    { pattern: /ireland/i, rank: 7 },
    { pattern: /italy|italia/i, rank: 8 },
    { pattern: /france/i, rank: 9 },
    { pattern: /czechia|czech/i, rank: 10 },
    { pattern: /estonia/i, rank: 11 },
    { pattern: /latvia/i, rank: 12 },
    { pattern: /lithuania/i, rank: 13 },
    { pattern: /romania/i, rank: 14 },
    { pattern: /hungary/i, rank: 15 },
    { pattern: /austria/i, rank: 16 },
    { pattern: /belgium/i, rank: 17 },
    { pattern: /sweden/i, rank: 18 },
    { pattern: /cyprus|moldova|serbia|israel|south africa/i, rank: 19 }
  ];
  const DEFAULT_PRIORITY = 99;

  function locationRank(loc) {
    const s = (loc || '').toLowerCase();
    for (const { pattern, rank } of LOCATION_PRIORITY) {
      if (pattern.test(s)) return rank;
    }
    return DEFAULT_PRIORITY;
  }

  const byKey = new Map();
  for (const j of jobEntries) {
    const key = (j.company + '|' + j.title).toLowerCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(j);
  }
  jobEntries = [];
  for (const group of byKey.values()) {
    const best = group.slice().sort((a, b) => locationRank(a.location) - locationRank(b.location))[0];
    jobEntries.push(best);
  }

  const afterDedupeCount = jobEntries.length;

  // Cross-digest dedup: exclude job IDs already present in *other* LinkedIn search digests (avoid duplicate processing and OpenAI calls).
  // Skip when --no-cross-dedup (e.g. full-flow) so the current run's digest always includes jobs from this export.
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(searchQuery);
  const currentDigestFilename = 'search-' + (slug || 'results') + '-' + today + '.md';
  const linkedinDir = LINKEDIN_DIGESTS_DIR || path.join(DIGESTS_DIR, 'linkedin');
  let excludedOtherDigests = 0;
  let excludedByCrossDedup = [];
  if (!args.noCrossDedup && fs.existsSync(linkedinDir)) {
    const existingJobIds = new Set();
    /** jobId -> list of digest filenames that contain this job (for reporting source). */
    const existingJobIdToFiles = new Map();
    const jobUrlRe = /\/jobs\/view\/(\d+)/g;
    const existingFiles = fs.readdirSync(linkedinDir).filter((f) => f.startsWith('search-') && f.endsWith('.md') && f !== currentDigestFilename);
    for (const f of existingFiles) {
      const content = fs.readFileSync(path.join(linkedinDir, f), 'utf8');
      let m;
      jobUrlRe.lastIndex = 0;
      while ((m = jobUrlRe.exec(content)) !== null) {
        existingJobIds.add(m[1]);
        if (!existingJobIdToFiles.has(m[1])) existingJobIdToFiles.set(m[1], []);
        if (!existingJobIdToFiles.get(m[1]).includes(f)) existingJobIdToFiles.get(m[1]).push(f);
      }
    }
    const beforeOtherDigests = jobEntries.length;
    excludedByCrossDedup = jobEntries.filter((j) => existingJobIds.has(String(j.id)));
    jobEntries = jobEntries.filter((j) => !existingJobIds.has(String(j.id)));
    excludedOtherDigests = beforeOtherDigests - jobEntries.length;
    if (excludedOtherDigests > 0) {
      console.log('[search-digest] Excluded ' + excludedOtherDigests + ' jobs already in other digests (no duplicate OpenAI/Teal).');
      for (const j of excludedByCrossDedup) {
        const id = String(j.id);
        const files = existingJobIdToFiles.get(id) || [];
        const source = files.length ? files.join(', ') : 'unknown';
        console.log('[search-digest] Job ' + id + ' (' + (j.title || '—') + ' @ ' + (j.company || '—') + ') already in digest: ' + source);
      }
    }
  }

  // Exclude non-PM roles, junior/intern/entry-level, non-English, "Remote from [excluded country]", "only for applicants from [country]", relocation required, video-gaming, hardware, high-travel, and below min salary (7k EUR/mo); count each reason
  // With --single-job (one vacancy URL), skip PM title and language filters so the one job the user chose is always included.
  const singleJob = args.singleJob || (payload.searchQuery === 'single-job');
  let excludedPM = 0, excludedJunior = 0, excludedLang = 0, excludedRemoteFrom = 0, excludedResidenceOnly = 0, excludedRelocation = 0, excludedOfficePresence = 0, excludedVideoGaming = 0, excludedAutomotive = 0, excludedTelecom = 0, excludedHardware = 0, excludedSap = 0, excludedHighTravel = 0, excludedLowSalary = 0;
  const languageMatchByJobId = {};
  jobEntries = jobEntries.filter((j) => {
    if (!singleJob && !isRelevantPMTitle(j.title)) { excludedPM++; return false; }
    if (isJuniorOrEntryLevel(j.title)) { excludedJunior++; return false; }
    if (!singleJob && isNonEnglishJob(j)) {
      excludedLang++;
      const pattern = getNonEnglishMatch(j);
      if (pattern && j.id) languageMatchByJobId[j.id] = pattern;
      return false;
    }
    if (isRemoteFromExcludedCountry(j.title, j.location, j.description)) { excludedRemoteFrom++; return false; }
    if (requiresResidenceInExcludedCountry(j.title, j.location, j.description)) { excludedResidenceOnly++; return false; }
    if (requiresRelocation(j.title, j.location, j.description)) { excludedRelocation++; return false; }
    if (requiresOfficePresence(j.title, j.location, j.description)) { excludedOfficePresence++; return false; }
    if (isVideoGamingRole(j.title, j.company, j.description)) { excludedVideoGaming++; return false; }
    if (isAutomotiveRole(j.title, j.company, j.description)) { excludedAutomotive++; return false; }
    if (isTelecomRole(j.title, j.company, j.description)) { excludedTelecom++; return false; }
    if (isHardwareRole(j.title, j.company, j.description)) { excludedHardware++; return false; }
    if (requiresSapExperience(j.title, j.company, j.description)) { excludedSap++; return false; }
    if (requiresHighTravel(j.title, j.description)) { excludedHighTravel++; return false; }
    if (isBelowMinSalary(j.description)) { excludedLowSalary++; return false; }
    return true;
  });

  const finalCount = jobEntries.length;
  const searchTotal = typeof process.env.LINKEDIN_SEARCH_TOTAL === 'string' && /^\d+$/.test(process.env.LINKEDIN_SEARCH_TOTAL)
    ? parseInt(process.env.LINKEDIN_SEARCH_TOTAL, 10) : null;

  function printFunnel() {
    const parts = [];
    if (searchTotal != null) parts.push('В поиске LinkedIn (по фильтрам): ' + searchTotal);
    parts.push('В экспорте (сохранено расширением): ' + totalInExport);
    parts.push('Убрано hybrid/on-site/closed (remove: true): ' + removedByWorkType);
    parts.push('После фильтра по типу работы: ' + (totalInExport - removedByWorkType));
    parts.push('После дедупа (компания + должность): ' + afterDedupeCount);
    if (excludedOtherDigests > 0) parts.push('Уже в других дайджестах (кросс-дедуп): ' + excludedOtherDigests);
    parts.push('Убрано не-PM должности: ' + excludedPM);
    parts.push('Убрано junior/intern/entry-level: ' + excludedJunior);
    parts.push('Убрано требование языка (не англ.): ' + excludedLang);
    if (excludedLang > 0 && Object.keys(languageMatchByJobId).length > 0) {
      console.log('[search-digest] Языковой фильтр — сработавший паттерн по job id:');
      for (const [id, pattern] of Object.entries(languageMatchByJobId)) {
        console.log('  ' + id + ' → ' + pattern);
      }
    }
    parts.push('Убрано remote from [искл. страна]: ' + excludedRemoteFrom);
    parts.push('Убрано только для проживающих (напр. Deutschland): ' + excludedResidenceOnly);
    parts.push('Убрано relocate / relocation required: ' + excludedRelocation);
    parts.push('Убрано обязательное присутствие в офисе (hybrid): ' + excludedOfficePresence);
    parts.push('Убрано video gaming (не iGaming): ' + excludedVideoGaming);
    parts.push('Убрано automotive: ' + excludedAutomotive);
    parts.push('Убрано telecom (телеком проекты): ' + excludedTelecom);
    parts.push('Убрано hardware (semiconductor/electronics PM): ' + excludedHardware);
    parts.push('Убрано SAP (требуют SAP experience): ' + excludedSap);
    parts.push('Убрано высокие поездки (40%+ travel): ' + excludedHighTravel);
    parts.push('Убрано зарплата < 7k EUR/мес: ' + excludedLowSalary);
    parts.push('В дайджесте: ' + finalCount);
    console.log('[search-digest] Расчёт:');
    parts.forEach((p) => console.log('  ' + p));
  }
  printFunnel();

  const digestFilename = 'search-' + (slug || 'results') + '-' + today + '.md';
  ensureDirs();
  const digestDir = LINKEDIN_DIGESTS_DIR || DIGESTS_DIR;
  const digestPath = path.join(digestDir, digestFilename);

  if (jobEntries.length === 0) {
    const lines = [];
    lines.push('# LinkedIn Search: ' + searchQuery + ' — ' + today);
    lines.push('');
    lines.push('*Search URL:* ' + searchUrl);
    lines.push('*No jobs passed filter (PM-only, remote, etc.). Nothing to add to Teal.*');
    lines.push('');
    lines.push('**Расчёт (куда ушло):**');
    if (searchTotal != null) lines.push('- В поиске LinkedIn (по фильтрам): ' + searchTotal);
    lines.push('- В экспорте (сохранено расширением): ' + totalInExport);
    lines.push('- Убрано hybrid/on-site/closed (remove: true): ' + removedByWorkType);
    lines.push('- После фильтра по типу работы: ' + (totalInExport - removedByWorkType));
    lines.push('- После дедупа (компания + должность): ' + afterDedupeCount);
    if (excludedOtherDigests > 0) lines.push('- Уже в других дайджестах (кросс-дедуп): ' + excludedOtherDigests);
    lines.push('- Убрано не-PM должности: ' + excludedPM);
    lines.push('- Убрано junior/intern/entry-level: ' + excludedJunior);
    lines.push('- Убрано требование языка (не англ.): ' + excludedLang);
    lines.push('- Убрано remote from [искл. страна]: ' + excludedRemoteFrom);
    lines.push('- Убрано только для проживающих (напр. Deutschland): ' + excludedResidenceOnly);
    lines.push('- Убрано relocate / relocation required: ' + excludedRelocation);
    lines.push('- Убрано обязательное присутствие в офисе (hybrid): ' + excludedOfficePresence);
    lines.push('- Убрано video gaming (не iGaming): ' + excludedVideoGaming);
    lines.push('- Убрано automotive: ' + excludedAutomotive);
    lines.push('- Убрано telecom (телеком проекты): ' + excludedTelecom);
    lines.push('- Убрано hardware (semiconductor/electronics PM): ' + excludedHardware);
    lines.push('- Убрано SAP (требуют SAP experience): ' + excludedSap);
    lines.push('- Убрано высокие поездки (40%+ travel): ' + excludedHighTravel);
    lines.push('- Убрано зарплата < 7k EUR/мес: ' + excludedLowSalary);
    lines.push('- **В дайджесте: 0**');
    lines.push('');
    fs.writeFileSync(digestPath, lines.join('\n'), 'utf8');
    console.log('[search-digest] No jobs passed filter. Wrote empty digest.');
    if (totalInExport > 0) {
      if (removedByWorkType === totalInExport) {
        console.log('[search-digest] Reason: all ' + totalInExport + ' jobs in export have remove: true (hybrid/on-site/closed). Use Remote-only search or run full capture so remote jobs are saved.');
      } else {
        console.log('[search-digest] Reason: in export ' + totalInExport + ' total, ' + removedByWorkType + ' hybrid/on-site (remove: true), ' + (totalInExport - removedByWorkType) + ' after remove check, ' + afterDedupeCount + ' after dedupe, 0 after PM/language filter.');
      }
    }
    console.log('[search-digest] Digest file:', digestPath);
    return;
  }

  const lines = [];
  lines.push('# LinkedIn Search: ' + searchQuery + ' — ' + today);
  lines.push('');
  lines.push('*Search URL:* ' + searchUrl);
  lines.push('*Captured: ' + (stats.captured || jobEntries.length) +
    ' remote | Filtered: ' + (stats.filtered || 0) + ' hybrid/on-site' +
    (stats.failed ? ' | Failed: ' + stats.failed : '') + '*');
  lines.push('');
  lines.push('**Расчёт (куда ушло):**');
  if (searchTotal != null) lines.push('- В поиске LinkedIn (по фильтрам): ' + searchTotal);
  lines.push('- В экспорте (сохранено расширением): ' + totalInExport);
  lines.push('- Убрано hybrid/on-site/closed (remove: true): ' + removedByWorkType);
  lines.push('- После фильтра по типу работы: ' + (totalInExport - removedByWorkType));
  lines.push('- После дедупа (компания + должность): ' + afterDedupeCount);
  if (excludedOtherDigests > 0) lines.push('- Уже в других дайджестах (кросс-дедуп): ' + excludedOtherDigests);
  lines.push('- Убрано не-PM должности: ' + excludedPM);
  lines.push('- Убрано junior/intern/entry-level: ' + excludedJunior);
  lines.push('- Убрано требование языка (не англ.): ' + excludedLang);
  lines.push('- Убрано remote from [искл. страна]: ' + excludedRemoteFrom);
  lines.push('- Убрано только для проживающих (напр. Deutschland): ' + excludedResidenceOnly);
  lines.push('- Убрано relocate / relocation required: ' + excludedRelocation);
  lines.push('- Убрано обязательное присутствие в офисе (hybrid): ' + excludedOfficePresence);
  lines.push('- Убрано video gaming (не iGaming): ' + excludedVideoGaming);
  lines.push('- Убрано automotive: ' + excludedAutomotive);
  lines.push('- Убрано telecom (телеком проекты): ' + excludedTelecom);
  lines.push('- Убрано hardware (semiconductor/electronics PM): ' + excludedHardware);
  lines.push('- Убрано SAP (требуют SAP experience): ' + excludedSap);
  lines.push('- Убрано высокие поездки (40%+ travel): ' + excludedHighTravel);
  lines.push('- Убрано зарплата < 7k EUR/мес: ' + excludedLowSalary);
  lines.push('- **В дайджесте: ' + finalCount + '**');
  lines.push('');
  lines.push('*`[ ]` to process · `[x]` applied · `[-]` rejected.*');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const job of jobEntries) {
    const label = job.title + ' — ' + job.company + ' (' + job.workType + ')';
    lines.push('- [ ] [' + label + '](' + job.url + ')');

    // Full job description (no truncation)
    if (job.description && job.description.trim()) {
      const desc = job.description.trim();
      for (const line of desc.split(/\n/)) {
        lines.push('  > ' + line);
      }
    }
    lines.push('');
  }

  if (failedIds.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('*Failed to capture (' + failedIds.length + '): ' +
      failedIds.map(id => 'https://www.linkedin.com/jobs/view/' + id).join(', ') + '*');
    lines.push('');
  }

  fs.writeFileSync(digestPath, lines.join('\n'), 'utf8');

  const relative = path.relative(VAULT, digestPath);
  console.log('[search-digest] Written:', relative, '—', jobEntries.length, 'jobs.');

  // Move export to data/ dir if it's from Downloads (keep project self-contained)
  if (exportPath.includes(path.join(os.homedir(), 'Downloads'))) {
    const destPath = path.join(DATA_DIR, path.basename(exportPath));
    if (!fs.existsSync(destPath)) {
      try {
        fs.renameSync(exportPath, destPath);
        console.log('[search-digest] Moved export to:', path.relative(VAULT, destPath));
      } catch (e) {
        // Cross-device move: copy + delete
        fs.copyFileSync(exportPath, destPath);
        fs.unlinkSync(exportPath);
        console.log('[search-digest] Moved export to:', path.relative(VAULT, destPath));
      }
    }
  }

  // Output digest path for pipeline integration
  console.log('[search-digest] Digest file:', digestPath);
}

main();
