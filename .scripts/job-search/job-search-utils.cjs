/**
 * Shared helpers for job-search scripts.
 * deriveTitleFromDescription: извлекает название вакансии из текста описания, если в источнике его нет.
 * detectJobType: iGaming/compliance vs AI/other (for resume template selection).
 * isRemoteFromExcludedCountry: true if role requires working from an excluded country (e.g. Nigeria).
 * isVideoGamingCompany: true if company is a video-game studio (not iGaming); user does not consider gaming roles.
 * requiresHighTravel: true if role requires 40%+ travel or similar (e.g. Molex 50% travel); user does not consider these.
 * isBelowMinSalary: true when job states a salary below minimum (7000 EUR/month equivalent); only excludes when salary is explicit.
 * fetchJobPageTitleAndCompany: fetch LinkedIn job view page and parse <title> for company and role (no auth).
 */
const https = require('https');

/** Minimum acceptable salary: 7000 EUR/month = 84,000 EUR/year (equivalent). Jobs stating a lower salary are excluded. */
const MIN_SALARY_EUR_YEAR = 84000;

/** Approximate rates to EUR for filtering (no live FX). */
const GBP_TO_EUR = 1.18;
const USD_TO_EUR = 1.05;

/** Countries to exclude when they appear as "Remote from [Country]" or "based in [Country]" (user won't work from there). */
const REMOTE_FROM_EXCLUDED_COUNTRIES = ['nigeria'];

/**
 * Patterns that mean "only applicants from [country]" / "residence required in [country]".
 * User does not consider roles that are restricted to applicants residing in these countries.
 * Add patterns for other countries/languages as needed.
 */
const RESIDENCE_ONLY_PATTERNS = [
  // German: Wohnsitz: Nur für Bewerber aus Deutschland
  /\bwohnsitz\s*[:\s]*\s*nur\s+für\s+bewerber\s+aus\s+deutschland\b/i,
  /\bnur\s+für\s+bewerber\s+aus\s+deutschland\b/i,
  // English
  /\bonly\s+for\s+applicants?\s+(?:from|based\s+in|resident\s+in)\s+(?:deutschland|germany)\b/i,
  /\bapplicants?\s+must\s+be\s+(?:based|resident)\s+in\s+(?:deutschland|germany)\b/i,
  /\b(?:must\s+be|limited\s+to)\s+(?:based|resident)\s+in\s+(?:deutschland|germany)\b/i,
  /\b(?:based|resident)\s+in\s+(?:deutschland|germany)\s+only\b/i,
  // Generic "only for applicants from Germany" (catch similar phrasing)
  /\bonly\s+for\s+applicants?\s+from\s+germany\b/i,
  /\bonly\s+for\s+applicants?\s+from\s+deutschland\b/i
];

/** Companies that primarily recruit for hardware/semiconductor/electronics roles. User is not interested in hardware PM positions. */
const HARDWARE_EXCLUDED_COMPANIES = [
  'ic resources'
];

/** Patterns in title or description that indicate a hardware-focused PM role (semiconductor, silicon, IC design, electronics product, etc.). */
const HARDWARE_ROLE_PATTERNS = [
  /\bhardware\s+(?:product\s+)?manager\b/i,
  /\bsemiconductor\b/i,
  /\bsilicon\s+(?:design|product|engineering)\b/i,
  /\bIC\s+(?:design|product|engineering)\b/i,
  /\b(?:analog|digital)\s+IC\b/i,
  /\belectronics\s+(?:product\s+)?manager\b/i,
  /\b(?:FPGA|ASIC|SoC)\s+(?:design|product)\b/i,
  /\bPCB\s+(?:design|product)\b/i,
  /\b(?:chip|semiconductor)\s+(?:product\s+)?manager\b/i
];

/**
 * Returns true if the job is clearly hardware-focused (company recruits for hardware, or title/description indicate hardware/semiconductor/electronics PM).
 * User does not consider hardware PM roles.
 * @param {string} [title=''] - Job title
 * @param {string} [company=''] - Company name
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isHardwareRole(title = '', company = '', description = '') {
  const c = (company || '').toLowerCase().trim();
  if (HARDWARE_EXCLUDED_COMPANIES.some((name) => c.includes(name))) return true;
  const text = [title, description].filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  return HARDWARE_ROLE_PATTERNS.some((re) => re.test(text));
}

/**
 * Location priority for dedup: when the same role (company+title) appears in multiple locations,
 * prefer PT (live there) → UA (origin) → ES → UK → PL → NL → DE → … (same order as generate-search-digest, teal-resume-match-score).
 */
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
const LOCATION_DEFAULT_PRIORITY = 99;

function locationRank(loc) {
  const s = (loc || '').toLowerCase();
  for (const { pattern, rank } of LOCATION_PRIORITY) {
    if (pattern.test(s)) return rank;
  }
  return LOCATION_DEFAULT_PRIORITY;
}

/** Video-game studios (not iGaming): user has no experience in gaming and does not consider these roles. Add company name substrings (lowercase). */
const VIDEO_GAMING_EXCLUDED_COMPANIES = [
  'fortis games',
  'zynga',
  'voodoo',
  'playrix',
  'supercell',
  'roblox',
  'unity technologies',
  'epic games',
  'riot games',
  'electronic arts',
  'activision',
  'nintendo',
  'scopely',
  'machine zone',
  'social point',
  'lilith games',
  'playtika',
  'miniclip',
  'wooga',
  'peak games',
  'gram games',
  'big fish games',
  'userwise'
];

/** Patterns in title or description that indicate a video-games PM role (not iGaming). e.g. "Senior Product Manager - Games", "video game", "game studio". */
const VIDEO_GAMING_ROLE_PATTERNS = [
  /\b(?:senior\s+)?product\s+manager\s*[·\-–]\s*games\b/i,
  /\bproduct\s+manager\s+[·\-–]\s*games\b/i,
  /\bvideo\s+game\b/i,
  /\bgame\s+studio\b/i,
  /\bgames?\s+(?:product|team)\s+manager\b/i
];

/**
 * Returns true if the company is a video-game studio (entertainment games), not iGaming (gambling/casino).
 * Use to exclude roles user does not consider (no experience in gaming).
 * @param {string} [company=''] - Company name
 * @returns {boolean}
 */
function isVideoGamingCompany(company = '') {
  const c = (company || '').toLowerCase().trim();
  if (!c) return false;
  return VIDEO_GAMING_EXCLUDED_COMPANIES.some((name) => c.includes(name.trim()));
}

/**
 * Returns true if the job is video-games related (company or title/description). Not iGaming.
 * Use this for filtering so both known game studios and roles like "Product Manager - Games" are excluded.
 * @param {string} [title=''] - Job title
 * @param {string} [company=''] - Company name
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isVideoGamingRole(title = '', company = '', description = '') {
  if (isVideoGamingCompany(company)) return true;
  const text = [title, description].filter(Boolean).join(' ');
  if (!text) return false;
  return VIDEO_GAMING_ROLE_PATTERNS.some((re) => re.test(text));
}

/** Telecom sector: user does not consider telecom/telecommunications projects. Add company name substrings (lowercase). */
const TELECOM_EXCLUDED_COMPANIES = [
  'vodafone',
  'orange s.a.',
  'orange telecom',
  't-mobile',
  'deutsche telekom',
  'telefonica',
  'bt group',
  'british telecom',
  'verizon',
  'at&t',
  'at&t inc',
  'vodacom',
  'telstra',
  'nokia networks',
  'ericsson',
  'huawei technologies',
  'zte ',
  'vodafone ziggo',
  'o2 ',
  'ee limited',
  'three uk',
  'sky telecom',
  'three ireland',
  'eir ',
  'proximus',
  'telenor',
  'telia company',
  'swisscom',
  'telecom italia',
  'tim ',
  'orange poland',
  'play ',
  'plus gsm',
  't-mobile poland'
];

/** Patterns in title or description that indicate a telecom-sector role. */
const TELECOM_ROLE_PATTERNS = [
  /\btelecom(?:munications?)?\b/i,
  /\btelecom\s+(?:operator|industry|sector|company|project)\b/i,
  /\bmobile\s+(?:operator|carrier|network)\b/i,
  /\bwireless\s+carrier\b/i,
  /\btelecom\s+product\b/i,
  /\b(?:5g|4g|mobile\s+network)\s+(?:operator|carrier)\b/i,
  /\bcarrier\s+(?:services?|network)\b/i,
  /\b(?:telecom|telco)\s+sector\b/i
];

/**
 * Returns true if the job is in the telecom sector (company or title/description). User does not consider telecom projects.
 * @param {string} [title=''] - Job title
 * @param {string} [company=''] - Company name
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isTelecomRole(title = '', company = '', description = '') {
  const c = (company || '').toLowerCase().trim();
  if (TELECOM_EXCLUDED_COMPANIES.some((name) => c.includes(name))) return true;
  const text = [title, company, description].filter(Boolean).join(' ');
  if (!text) return false;
  return TELECOM_ROLE_PATTERNS.some((re) => re.test(text));
}

/** Automotive sector: user does not consider automotive industry roles. Add company name substrings (lowercase). */
const AUTOMOTIVE_EXCLUDED_COMPANIES = ['motorad', 'motor rad'];

/** Patterns in title or description that indicate an automotive-sector role. */
const AUTOMOTIVE_ROLE_PATTERNS = [
  /\bautomotive\b/i,
  /\bauto\s+industry\b/i,
  /\bautomotive\s+(?:sector|industry)\b/i,
  /\b(?:car|vehicle)\s+(?:manufacturing|industry|sector)\b/i
];

/** Patterns indicating the job requires SAP experience. User does not consider SAP-focused roles. */
const REQUIRES_SAP_PATTERNS = [
  /\bSAP\s+(?:HANA|ECC|S\/4HANA|S4HANA)\b/i,
  /\b(?:experience|knowledge|expertise)\s+(?:with|in)\s+SAP\b/i,
  /\bSAP\s+(?:experience|knowledge|expertise)\b/i,
  /\b(?:working\s+with|proficient\s+in)\s+(?:SAP|SAP\s+HANA)\b/i
];

/**
 * Returns true if the job requires SAP experience. User does not consider SAP-focused roles.
 * @param {string} [title=''] - Job title
 * @param {string} [company=''] - Company name
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresSapExperience(title = '', company = '', description = '') {
  const text = [title, description].filter(Boolean).join(' ');
  if (!text || text.length < 80) return false;
  return REQUIRES_SAP_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true if the job is in the automotive sector (company or title/description). User does not consider these roles.
 * @param {string} [title=''] - Job title
 * @param {string} [company=''] - Company name
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isAutomotiveRole(title = '', company = '', description = '') {
  const c = (company || '').toLowerCase().trim();
  if (AUTOMOTIVE_EXCLUDED_COMPANIES.some((name) => c.includes(name))) return true;
  const text = [title, company, description].filter(Boolean).join(' ');
  if (!text) return false;
  return AUTOMOTIVE_ROLE_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true if the job requires working from an excluded country (e.g. "Remote from Nigeria").
 * @param {string} [title=''] - Job title
 * @param {string} [location=''] - Job location text
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isRemoteFromExcludedCountry(title = '', location = '', description = '') {
  const text = [title, location, description].filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  for (const country of REMOTE_FROM_EXCLUDED_COUNTRIES) {
    if (new RegExp('\\bremote\\s+from\\s+' + country + '\\b', 'i').test(text)) return true;
    if (new RegExp('\\bfrom\\s+' + country + '\\b', 'i').test(text) && /\bremote\b/i.test(text)) return true;
    if (new RegExp('\\b(based|located|work(?:ing)?)\\s+(in|from)\\s+' + country + '\\b', 'i').test(text)) return true;
  }
  return false;
}

/**
 * Returns true if the job is restricted to applicants residing in specific countries (e.g. "Nur für Bewerber aus Deutschland").
 * User does not consider these roles when they don't live in that country.
 * @param {string} [title=''] - Job title
 * @param {string} [location=''] - Job location / snippet
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresResidenceInExcludedCountry(title = '', location = '', description = '') {
  const text = [title, location, description].filter(Boolean).join(' ');
  if (!text) return false;
  return RESIDENCE_ONLY_PATTERNS.some((re) => re.test(text));
}

/**
 * Returns true if the job requires high travel (e.g. 40%+ or 50% of the time).
 * User does not consider roles requiring 50% travel (e.g. Molex-style positions).
 * @param {string} [title=''] - Job title
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresHighTravel(title = '', description = '') {
  const text = [title, description].filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  // 40%+ travel: "50% travel", "up to 50% travel", "travel 50%", "40-50% travel"
  if (/(?:up to\s+)?(?:4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)\s*%\s*(?:travel|of the time)/.test(text)) return true;
  if (/travel\s*(?:of\s+)?(?:up to\s+)?(?:4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)\s*%/.test(text)) return true;
  if (/(?:4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)\s*%\s*travel/.test(text)) return true;
  // "50% of the time" in travel context (within ~80 chars)
  if (/\b(?:travel|traveling|travelling)\b.{0,80}(?:4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)\s*%\s*of the time/.test(text)) return true;
  if (/(?:4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|100)\s*%\s*of the time.{0,80}\b(?:travel|traveling|travelling)\b/.test(text)) return true;
  // Explicit high-travel phrasing
  if (/\b(?:extensive|significant|heavy|frequent|substantial)\s+travel\b/.test(text)) return true;
  return false;
}

/**
 * Returns true if the job requires the candidate to relocate (e.g. "Relocation to Valencia Required", "relocate to London").
 * User does not consider relocation roles.
 * @param {string} [title=''] - Job title
 * @param {string} [location=''] - Job location
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresRelocation(title = '', location = '', description = '') {
  const text = [title, location, description].filter(Boolean).join(' ');
  if (!text) return false;
  // Optional relocation should not exclude remote roles:
  // "relocation is possible", "possible relocation", etc.
  if (/\brelocation\b.{0,40}\b(?:possible|optional|available)\b/i.test(text)) return false;
  if (/\b(?:possible|optional|available)\b.{0,40}\brelocation\b/i.test(text)) return false;
  if (/\b(?:relocate|relocation)\b.{0,40}\b(?:if desired|if you wish)\b/i.test(text)) return false;
  if (/\brelocate\s+to\b/i.test(text)) return true;
  if (/\brelocation\s+required\b/i.test(text)) return true;
  if (/\bmust\s+relocate\b/i.test(text)) return true;
  if (/\brelocation\s+to\b/i.test(text)) {
    // Optional path: "business trips or relocation to Cyprus" — not mandatory relocation
    if (/\bor\s+relocation\s+to\b/i.test(text)) return false;
    return true;
  }
  return false;
}

/**
 * Patterns that mean mandatory office presence (hybrid with required office days).
 * User considers only remote; roles requiring regular office presence are excluded.
 */
const REQUIRES_OFFICE_PRESENCE_PATTERNS = [
  // German: "alle 6 Wochen im Büro", "im Büro in Freiburg präsent sein"
  /\balle\s+\d+\s+Wochen\s+im\s+Büro\b/i,
  /\bim\s+Büro\s+(?:in\s+[\w\s]+)?\s*präsent\s+sein\b/i,
  /\bpräsent\s+sein\s+(?:im\s+Büro|in\s+[\w\s]+)\b/i,
  /\b(?:Büro|Office)\s+in\s+[\w\s]+\s+(?:sowie|und)\s+[\w\s]+\s+zu\s+arbeiten\b/i,
  // English: "every N weeks in the office", "office presence required"
  /\bevery\s+\d+\s+weeks?\s+(?:in\s+the\s+)?office\b/i,
  /\bin\s+the\s+office\s+every\s+\d+\s+weeks?\b/i,
  /\boffice\s+presence\s+(?:required|expected|mandatory)\b/i,
  /\b(?:required|expected|must)\s+to\s+be\s+(?:in\s+the\s+)?office\b/i,
  /\b(?:based|work)\s+in\s+our\s+(?:office|büro)\s+in\s+[\w\s]+\b/i,
  /\bjoin\s+(?:their|our)\s+team\s+based\s+in\b/i,
  /\b(?:in\s+)?(?:Freiburg|Leipzig|Munich|Berlin|Frankfurt|Hamburg|Cologne)\s+(?:sowie|und)\s+[\w\s]+\s+(?:zu\s+arbeiten|to\s+work)\b/i
];

/**
 * Returns true if the job requires mandatory office presence (e.g. hybrid with "every 6 weeks in the office").
 * User considers only remote; such roles are excluded from digest.
 * @param {string} [title=''] - Job title
 * @param {string} [location=''] - Job location / snippet
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresOfficePresence(title = '', location = '', description = '') {
  const text = [title, location, description].filter(Boolean).join(' ');
  if (!text) return false;
  return REQUIRES_OFFICE_PRESENCE_PATTERNS.some((re) => re.test(text));
}

/**
 * Parse salary from job description to yearly EUR equivalent. Returns null if no clear salary found.
 * Supports: £70K/yr, £70,000, €60,000, $90,000, "70,000 Salary", ranges (uses higher bound for comparison).
 * @param {string} [description=''] - Job description (and optionally title/location)
 * @returns {number|null} - Yearly salary in EUR or null
 */
function parseSalaryToEurYear(description = '') {
  const text = (description || '').trim();
  if (!text) return null;
  // Parse only lines that look like compensation info.
  // This avoids false positives from benefit amounts (insurance/reimbursement/training budgets).
  const salaryContextRe = /\b(salary|compensation|base\s+pay|pay\s+range|annual|annum|per\s+(year|month)|monthly|yearly|gross|brut\/an|ote|on-target)\b/i;
  const nonSalaryBenefitsRe = /\b(reimburse(?:ment)?|insurance|wellness|vacation|pto|training|conference|workplace\s+costs?)\b/i;
  const salaryLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => salaryContextRe.test(l) && !nonSalaryBenefitsRe.test(l));
  const source = salaryLines.length > 0 ? salaryLines.join('\n') : text;

  const numbers = [];
  // Normalize number string: remove spaces (EU "40 000") and commas
  function parseNum(s) {
    const n = parseInt(String(s).replace(/[\s,]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  // £70K/yr, £70,000/yr, £70 000, €40 000 brut/an
  const reCurrencyK = /(£|€|\$)\s*([\d\s,]+)\s*(K|k)(?:\s*\/\s*yr|\s*\/\s*year|\s*per\s+year|\s*yearly)?/gi;
  const reCurrencyFull = /(£|€|\$)\s*([\d\s,]+)(?:\s*\/\s*yr|\s*\/\s*year|\s*per\s+year|\s*salary|\s*Salary|\s*brut\/an)?/gi;
  const reNumberFirst = /([\d\s,]+)\s*(K|k)?\s*(£|€|\$|\s*GBP|\s*EUR|\s*USD)/gi;
  function pushValue(currency, numStr, isK) {
    const n = parseNum(numStr);
    if (n == null) return;
    const val = isK ? n * 1000 : n;
    if (currency === '£') numbers.push(Math.round(val * GBP_TO_EUR));
    else if (currency === '€') numbers.push(val);
    else if (currency === '$') numbers.push(Math.round(val * USD_TO_EUR));
  }
  let m;
  while ((m = reCurrencyK.exec(source)) !== null) {
    pushValue(m[1], m[2], true);
  }
  while ((m = reCurrencyFull.exec(source)) !== null) {
    const n = parseNum(m[2]);
    if (n == null || n < 1000) continue; // skip £70 from £70K, day rates
    pushValue(m[1], m[2], false);
  }
  while ((m = reNumberFirst.exec(source)) !== null) {
    const n = parseNum(m[1]);
    if (n == null || n < 1000) continue;
    const isK = !!m[2];
    const cur = (m[3] || '').trim().toUpperCase();
    const val = isK ? n * 1000 : n;
    if (cur === '£' || cur === 'GBP') numbers.push(Math.round(val * GBP_TO_EUR));
    else if (cur === '€' || cur === 'EUR') numbers.push(val);
    else if (cur === '$' || cur === 'USD') numbers.push(Math.round(val * USD_TO_EUR));
  }
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

/**
 * Returns true if the job states a salary below minimum (7000 EUR/month = 84,000 EUR/year equivalent).
 * Only excludes when salary is explicitly stated and below threshold (e.g. £70K/yr at Careerwise).
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function isBelowMinSalary(description = '') {
  const eurYear = parseSalaryToEurYear(description);
  if (eurYear == null) return false;
  return eurYear < MIN_SALARY_EUR_YEAR;
}

/** Compliance/regulatory role patterns: these positions are only considered in iGaming, so always use iGaming template. */
const COMPLIANCE_ROLE_PATTERNS = [
  'compliance officer', 'compliance manager', 'compliance specialist', 'compliance lead',
  'regulatory officer', 'regulatory manager', 'regulatory affairs', 'regulatory compliance',
  'responsible gaming', 'aml compliance', 'licensing manager', 'gaming compliance'
];

/**
 * Detect if job is iGaming/compliance or AI/other.
 * Template is chosen by role: Compliance Officer, Compliance Manager, regulatory roles → always iGaming (no company list).
 * @param {string} jobDescription - Full job description text
 * @param {string} [jobTitle=''] - Job title (e.g. "Compliance Officer — Alea")
 * @returns {'igaming'|'ai'}
 */
function detectJobType(jobDescription, jobTitle = '') {
  const rawTitle = (jobTitle || '').trim();
  const title = rawTitle.toLowerCase();
  const desc = (jobDescription || '').toLowerCase();

  // Compliance/regulatory roles are only considered in iGaming → always iGaming template.
  if (COMPLIANCE_ROLE_PATTERNS.some((p) => title.includes(p))) return 'igaming';

  // Strong AI signals (title or description): AI is the main focus — prefer ai template
  const aiDominant = [
    'ai-platform', 'ai platform', 'ai-powered', 'ai powered', 'ai-based', 'ai based',
    'ai workers', 'ai workflow', 'ai product', 'lead product manager (ai',
    'sr. product manager (ai', 'senior product manager (ai'
  ];
  for (const phrase of aiDominant) {
    if (title.includes(phrase) || desc.includes(phrase)) return 'ai';
  }
  if (/\bai\b/.test(title) || (/\bai\b/.test(desc) && (desc.includes('ai worker') || desc.includes('ai team') || desc.includes('ai product') || desc.includes('ai platform')))) {
    return 'ai';
  }

  // iGaming template when description or company has clear iGaming context (gambling/casino/sportsbook/social gaming etc.).
  const igamingCore = [
    'igaming', 'i-gaming', 'gambling', 'casino', 'sportsbook', 'betting', 'wagering',
    'gaming license', 'responsible gaming', 'player protection', 'gaming platform',
    'live casino', 'bingo', 'lottery', 'slot', 'poker', 'betting platform',
    'mga', 'ukgc', 'curacao', 'malta gaming', 'gaming regulatory',
    'social gaming', 'gaming regulations', 'gaming industry'
  ];
  const igamingCompanies = ['patrianna', 'evoplay', 'gr8 tech', 'betconstruct', 'ebet', 'alea', 'nuvei'];
  const companyPart = (rawTitle.split(/\s*[—–-]\s*/)[1] || '').trim().toLowerCase();
  const text = desc + ' ' + title + ' ' + companyPart;
  const hasIgamingContext = igamingCore.some((kw) => text.includes(kw)) ||
    igamingCompanies.some((c) => text.includes(c));

  if (!hasIgamingContext) return 'ai';

  // If role is iGaming but title/desc emphasize AI (e.g. "AI PM in gaming"), prefer AI template
  if (/\bai\b/.test(title) || desc.includes('ai product') || desc.includes('ai platform') || desc.includes('ai-powered')) {
    return 'ai';
  }
  return 'igaming';
}

function deriveTitleFromDescription(desc) {
  if (!desc || typeof desc !== 'string' || desc.length < 20) return '';
  const s = desc.trim().slice(0, 2000);
  const trimResult = (val) => {
    if (!val || typeof val !== 'string') return '';
    const t = val.trim();
    // Never return "Role The X" or "Role: The X" — strip the label so we get the real title.
    const withoutRole = t.replace(/^Role\s*:\s*/i, '').replace(/^Role\s+/i, '').trim();
    return withoutRole.length >= 3 && withoutRole.length <= 120 ? withoutRole : '';
  };
  // Prefer exact position title including domain suffix (e.g. "Compliance Officer - IGaming") when it appears in the description.
  let m = s.match(/\b([A-Za-z][A-Za-z0-9\s&\-]{4,70}?)\s*[-–—]\s*IGaming\b/i);
  if (m && m[0].trim().length >= 10 && m[0].trim().length <= 120) return m[0].trim();
  m = s.match(/\b([A-Za-z][A-Za-z0-9\s&\-]{4,70}?)\s*[-–—]\s*iGaming\b/);
  if (m && m[0].trim().length >= 10 && m[0].trim().length <= 120) return m[0].trim();
  m = s.match(/(?:We're hiring a|We are hiring a|Hiring:)\s+([^.!?\n]+?)(?:\.|!|\?|\n|$)/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) return m[1].trim();
  m = s.match(/(?:is seeking|are seeking|seeking)\s+(?:a|an)\s+(?:talented|experienced|strategic)?\s*([^,.!?\n]{5,100}?)(?:\.|,|!|\?|\n|$)/i);
  if (m && m[1]) {
    const v = m[1].trim();
    if (v.length >= 5 && v.length <= 120 && looksLikeJobTitle(v)) return v;
  }
  m = s.match(/([A-Z][a-z].*?)\s+required\s+to\s+join/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) return m[1].trim();
  m = s.match(/(?:POSITION SUMMARY|Role:)\s*\n\s*As (?:a|an)\s+([^,!.\n]+?)(?:,|\.|\n|$)/i);
  if (m && m[1].trim().length >= 3 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/(?:As (?:a|an)\s+)([^,!.\n]+?)(?:,|\.|\n|$)/i);
  if (m && m[1].trim().length >= 3 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/\bThe\s+([A-Z][A-Za-z\s&\-]{4,60}?)\s+(?:ensures|plays|is\s+responsible|conducts|drafts|monitors|coordinates|prepares|manages|supports)\b/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 80) return m[1].trim();
  // "Role: The Compliance Officer" or "Role The Compliance Officer" (same line or after newline)
  m = s.match(/(?:^|\n)\s*Role\s*:\s*([^\n]+)/i) || s.match(/(?:^|\n)\s*Role\s+([A-Z][^\n]+?)(?:\n|$)/i);
  if (m && m[1]) {
    const v = trimResult(m[1]);
    if (v.length >= 5) return v;
  }
  m = s.match(/(?:Job Summary|Position Summary|The Opportunity|Role):\s*\n\s*([^\n]+)/i);
  if (m && m[1].trim().length >= 5 && m[1].trim().length <= 120) {
    const v = trimResult(m[1]);
    if (v && looksLikeJobTitle(v)) return v;
  }
  m = s.match(/([A-Z][A-Za-z\s&\-]{10,80})\s*[-–—]\s*(?:remote|location|usa|edtech)/i);
  if (m && m[1].trim().length >= 5) return m[1].trim();
  m = s.match(/^([A-Z][^\n]{15,100}?)(?:\s+\.{3}|\n\n|$)/m);
  if (m && m[1].trim().length >= 10 && m[1].trim().length <= 120) {
    const v = trimResult(m[1]);
    if (v && looksLikeJobTitle(v)) return v;
  }
  const firstLine = s.split('\n')[0].trim();
  if (firstLine.length >= 10 && firstLine.length <= 120 && /^[A-Za-z]/.test(firstLine) && !/^(About|We |Our |The |This |At |Why )/i.test(firstLine) && looksLikeJobTitle(firstLine)) return trimResult(firstLine);
  if (firstLine.length >= 10 && firstLine.length <= 120 && looksLikeJobTitle(firstLine)) return trimResult(firstLine);
  return '';
}

/**
 * Derive company name from job description when missing (e.g. "Williams Lea seeks a Lead Product Manager").
 */
function deriveCompanyFromDescription(desc) {
  if (!desc || typeof desc !== 'string' || desc.length < 30) return '';
  const s = desc.trim().slice(0, 800);
  let m = s.match(/\b([A-Z][A-Za-z0-9\s&.\-']{2,50}?)\s+seeks\s+(?:a|an)\s+/);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/\b([A-Z][A-Za-z0-9\s&.\-']{2,50}?)\s+is\s+hir(?:ing|ed)\s+/i);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/Join\s+([A-Z][A-Za-z0-9\s&.\-']{2,50}?)(?:\s+to\s+|\s+as\s+|\s+!\s*$|\n)/);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/(?:at|At)\s+([A-Z][A-Za-z0-9\s&.\-']{2,50}?)\s+(?:we|,)\s+/);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/\b([A-Z][A-Za-z0-9\s&.\-']{2,50}?)\s+is\s+the\s+(?:leading|global)/i);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  m = s.match(/\b([A-Z][A-Za-z0-9\s&.\-']{2,50}?)\s+(?:provides|offers|delivers)\s+/i);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 80) return m[1].trim();
  return '';
}

/**
 * Normalize LinkedIn search URL for use as key (e.g. last-processed-job-ids).
 * Strips currentJobId, origin; sorts params so same search = same key.
 */
function normalizeSearchUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    u.searchParams.delete('currentJobId');
    u.searchParams.delete('origin');
    u.searchParams.sort();
    return u.toString();
  } catch (_) {
    return url.trim();
  }
}

/** Patterns indicating the role requires a non-English language (German, Spanish, Arabic, etc.). User has English; we filter when German or other non-English is required. "Englischkenntnisse" alone is OK. */
const REQUIRES_NON_ENGLISH_PATTERNS = [
  /fluent\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /\bproficient\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i, // e.g. "Proficient in German (...)" (not caught by proficiency\s+in)
  /\bfluency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i,  // e.g. "Fluency in German (written and verbal)"
  /native\s+(German|Spanish|Portuguese|French|Italian|Arabic)\s+(speaker|language)?/i,
  /(German|Spanish|Portuguese|French|Italian|Arabic)\s+(language\s+)?(proficiency|required|essential|fluent)/i,
  /proficiency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /working\s+language\s*[:\s]+\s*(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /(German|Spanish|Portuguese|French|Italian|Arabic)\s+\((C1|B2|native)\)/i,
  /\bArabic\s+[Ss]peaker\b/i,
  // German-language job ads: "Deutsch auf Muttersprachniveau", "deutschsprachig" in title or description, etc.
  /\bDeutsch\s+auf\s+Muttersprachniveau\b/i,
  /\bMuttersprache\s+Deutsch\b/i,
  /\bDeutsch\s+als\s+Muttersprache\b/i,
  /\bdeutschsprachig\b/i,
  /\b(?:wir\s+)?suchen\s+(?:eine?n?\s+)?deutschsprachige?n?\s+(?:Product\s+)?Owner\b/i,
  /\bin\s+deutscher\s+Sprache\b/i,
  // "sehr gute Deutsch- und Englischkenntnisse", "Deutschkenntnisse", "fließend Deutsch"
  /\bDeutsch-?\s*und\s+Englischkenntnisse\b/i,
  /\bDeutschkenntnisse\b/i,
  /\bfließend(?:em)?\s+(?:in\s+)?Deutsch\b/i,
  /\bsehr\s+gute\s+Deutsch-?\s*und\s+Englisch\b/i
];

/**
 * Returns true if the job requires German or another non-English language (e.g. fluent in German, Deutschkenntnisse). English-only requirement is not filtered.
 * @param {string} [title=''] - Job title
 * @param {string} [description=''] - Job description
 * @returns {boolean}
 */
function requiresNonEnglishLanguage(title = '', description = '') {
  const desc = (description || '').trim();
  if (desc.length < 25) return false;  // lowered from 50: catch "Deutsch- und Englischkenntnisse" in shorter snippets
  const text = [title, desc].filter(Boolean).join(' ');
  return REQUIRES_NON_ENGLISH_PATTERNS.some((re) => re.test(text));
}

/** LinkedIn job page section headings that must NEVER be used as job title. Only the real role from page HTML (e.g. <title> or JSON-LD) is valid. */
const LINKEDIN_SECTION_HEADER_TITLES = [
  "What You'll Be Doing",
  "What You'll Do",
  "About The Role",
  "About the role",
  "What We Ask Of You",
  "What We Ask",
  "What We Offer",
  "What We Offer In Exchange",
  "About Us",
  "Responsibilities",
  "Requirements",
  "Qualifications",
  "Nice to Have",
  "Why Join Us",
  "Our Benefits",
  "The Role",
  "Role"
];

/**
 * Returns false when the string looks like a tagline/sentence or LinkedIn section header rather than a job title
 * (e.g. "We believe in smart execution", "What You'll Be Doing"). Job title must come only from LinkedIn page HTML (e.g. <title> or JSON-LD).
 */
function looksLikeJobTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/,/.test(t)) return false;
  if (LINKEDIN_SECTION_HEADER_TITLES.some((h) => t === h || t.startsWith(h + '\u2014') || t.startsWith(h + ' '))) return false;
  if (/^(We |Our |The |This |At |Why |How we |About )/i.test(t)) return false;
  if (/\b(we believe|we're |we are |our (?:mission|vision|values|team)|smart execution|continuous improvement)\b/i.test(t)) return false;
  return true;
}

/**
 * Extract job title and company from LinkedIn job page HTML when <title> is wrong or tagline-like.
 * Tries: JSON-LD JobPosting, script-block "title"/"jobTitle", then deriveTitleFromDescription(description) if description present.
 * Returns { title, company } or null. Title is always a real role name when possible (no placeholder).
 */
function parseTitleAndCompanyFromJobPageHtml(html) {
  if (!html || typeof html !== 'string' || html.length < 500) return null;
  let title = '';
  let company = '';
  let description = '';

  const jsonLdScript = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdScript && jsonLdScript[1]) {
    try {
      const raw = jsonLdScript[1].trim().replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(raw);
      const job = Array.isArray(parsed) ? parsed.find((o) => o && (o['@type'] === 'JobPosting' || o['@type'] === 'https://schema.org/JobPosting')) : (parsed && (parsed['@type'] === 'JobPosting' || parsed['@type'] === 'https://schema.org/JobPosting') ? parsed : null);
      if (job) {
        title = (job.title || job.name || '').trim();
        if (job.hiringOrganization && typeof job.hiringOrganization === 'object') {
          company = (job.hiringOrganization.name || job.hiringOrganization.title || '').trim();
        } else if (typeof job.hiringOrganization === 'string') {
          company = job.hiringOrganization.trim();
        }
        if (job.description && typeof job.description === 'string') {
          description = job.description.trim().slice(0, 2000);
        }
      }
    } catch (_) {}
  }
  // Fallback: LinkedIn often exposes canonical "Title | Company" in og:title, language-agnostic.
  // Example: <meta property="og:title" content="Lead Product Manager (Remote) | Capgemini Engineering">
  if (!title && html) {
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      let og = ogTitleMatch[1]
        .replace(/\s*\|\s*LinkedIn\s*$/i, '')
        .replace(/&amp;/g, '&')
        .trim();
      // Split on pipe; LinkedIn jobs use "Title | Company" in og:title.
      const parts = og.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        if (looksLikeJobTitle(first)) {
          title = first;
          company = last;
        } else if (looksLikeJobTitle(last)) {
          title = last;
          company = first;
        }
      } else if (looksLikeJobTitle(og)) {
        // Single chunk that still looks like a title; company may come from other fallbacks.
        title = og;
      }
    }
  }
  if (!title && html) {
    const jobPostingBlock = html.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,2000}?"title"\s*:\s*"([^"]+)"/i) || html.match(/"@type"\s*:\s*"https:\/\/schema\.org\/JobPosting"[\s\S]{0,2000}?"title"\s*:\s*"([^"]+)"/i);
    if (jobPostingBlock && jobPostingBlock[1]) title = jobPostingBlock[1].trim().replace(/\\u0026/g, '&');
    const companyBlock = html.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,1500}?"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);
    if (companyBlock && companyBlock[1] && !company) company = companyBlock[1].trim().replace(/\\u0026/g, '&');
    if (!description && html) {
      const descMatch = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (descMatch && descMatch[1]) description = descMatch[1].replace(/\\"/g, '"').trim().slice(0, 2000);
    }
  }
  // LinkedIn job view DOM: company from aria-label="Company, Boston Consulting Group (BCG)." (stable across layout changes)
  if (!company && html) {
    const ariaCompany = html.match(/aria-label="Company,\s*([^"]+)"/);
    if (ariaCompany && ariaCompany[1]) company = ariaCompany[1].trim().replace(/\.\s*$/, '').replace(/&amp;/g, '&');
  }
  // Same block: company from link text <a ...>Boston Consulting Group (BCG)</a> inside company header (when aria-label present but captured empty)
  if (!company && html) {
    const companyLink = html.match(/aria-label="Company[^"]*"[\s\S]*?<a[^>]+class="[^"]*ffd1c173[^"]*"[^>]*>([^<]+)<\/a>/i)
      || html.match(/Company[^>]*>[\s\S]*?<a[^>]+href="[^"]*linkedin\.com\/company\/[^"]*"[^>]*>([^<]+)<\/a>/i);
    if (companyLink && companyLink[1]) {
      const c = companyLink[1].replace(/&amp;/g, '&').trim();
      if (c.length >= 2 && c.length <= 120) company = c;
    }
  }
  // LinkedIn job view DOM: title from block with data-display-contents="true" -> first <p> (job title)
  if (!title && html) {
    const titleBlock = html.match(/data-display-contents="true"[\s\S]*?<p[^>]*>([^<]+?)(?:<\/p>|<span)/i);
    if (titleBlock && titleBlock[1]) {
      const t = titleBlock[1].replace(/&amp;/g, '&').trim();
      if (t.length >= 3 && t.length <= 120 && looksLikeJobTitle(t)) title = t;
    }
  }
  // Fallback: title from <p> with class pattern typical for job title line (e.g. _39f29958)
  if (!title && html) {
    const titleP = html.match(/<p[^>]*class="[^"]*_39f29958[^"]*"[^>]*>([^<]+?)<\/p>/i)
      || html.match(/<p[^>]*class="[^"]*_0b0793cb[^"]*_9bceb233[^"]*"[^>]*>([^<]+?)<\/(?:p|span)/i);
    if (titleP && titleP[1]) {
      const t = titleP[1].replace(/&amp;/g, '&').trim();
      if (t.length >= 3 && t.length <= 120 && looksLikeJobTitle(t)) title = t;
    }
  }
  if (!title && description && description.length >= 50) {
    title = (deriveTitleFromDescription(description) || '').trim();
  }
  if (!title || !looksLikeJobTitle(title)) return null;
  if (!company) company = '';
  return { title, company };
}

/** Max length for description extracted from JSON-LD (single-job flow, no browser). */
const JOB_PAGE_DESCRIPTION_MAX_LEN = 120000;

/**
 * Extract job title, company, and full description from LinkedIn job page HTML.
 * Used for single-job flow to avoid opening browser. Returns { title, company, description }.
 * description is from JSON-LD JobPosting.description when present.
 */
function parseTitleCompanyAndDescriptionFromJobPageHtml(html) {
  if (!html || typeof html !== 'string' || html.length < 500) return null;
  let title = '';
  let company = '';
  let description = '';

  const jsonLdScript = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdScript && jsonLdScript[1]) {
    try {
      const raw = jsonLdScript[1].trim().replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(raw);
      const job = Array.isArray(parsed) ? parsed.find((o) => o && (o['@type'] === 'JobPosting' || o['@type'] === 'https://schema.org/JobPosting')) : (parsed && (parsed['@type'] === 'JobPosting' || parsed['@type'] === 'https://schema.org/JobPosting') ? parsed : null);
      if (job) {
        title = (job.title || job.name || '').trim();
        if (job.hiringOrganization && typeof job.hiringOrganization === 'object') {
          company = (job.hiringOrganization.name || job.hiringOrganization.title || '').trim();
        } else if (typeof job.hiringOrganization === 'string') {
          company = job.hiringOrganization.trim();
        }
        if (job.description && typeof job.description === 'string') {
          description = job.description.trim().slice(0, JOB_PAGE_DESCRIPTION_MAX_LEN);
        }
      }
    } catch (_) {}
  }
  if (!description && html) {
    const descMatch = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (descMatch && descMatch[1]) description = descMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim().slice(0, JOB_PAGE_DESCRIPTION_MAX_LEN);
  }
  if (!title && html) {
    const jobPostingBlock = html.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,2000}?"title"\s*:\s*"([^"]+)"/i) || html.match(/"@type"\s*:\s*"https:\/\/schema\.org\/JobPosting"[\s\S]{0,2000}?"title"\s*:\s*"([^"]+)"/i);
    if (jobPostingBlock && jobPostingBlock[1]) title = jobPostingBlock[1].trim().replace(/\\u0026/g, '&');
    const companyBlock = html.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,1500}?"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);
    if (companyBlock && companyBlock[1] && !company) company = companyBlock[1].trim().replace(/\\u0026/g, '&');
  }
  if (!company && html) {
    const ariaCompany = html.match(/aria-label="Company,\s*([^"]+)"/);
    if (ariaCompany && ariaCompany[1]) company = ariaCompany[1].trim().replace(/\.\s*$/, '').replace(/&amp;/g, '&');
    if (!company) {
      const companyLink = html.match(/aria-label="Company[^"]*"[\s\S]*?<a[^>]+class="[^"]*ffd1c173[^"]*"[^>]*>([^<]+)<\/a>/i)
        || html.match(/Company[^>]*>[\s\S]*?<a[^>]+href="[^"]*linkedin\.com\/company\/[^"]*"[^>]*>([^<]+)<\/a>/i);
      if (companyLink && companyLink[1]) {
        const c = companyLink[1].replace(/&amp;/g, '&').trim();
        if (c.length >= 2 && c.length <= 120) company = c;
      }
    }
  }
  if (!title && html) {
    const titleBlock = html.match(/data-display-contents="true"[\s\S]*?<p[^>]*>([^<]+?)(?:<\/p>|<span)/i);
    if (titleBlock && titleBlock[1]) {
      const t = titleBlock[1].replace(/&amp;/g, '&').trim();
      if (t.length >= 3 && t.length <= 120 && looksLikeJobTitle(t)) title = t;
    }
    if (!title) {
      const titleP = html.match(/<p[^>]*class="[^"]*_39f29958[^"]*"[^>]*>([^<]+?)<\/p>/i)
        || html.match(/<p[^>]*class="[^"]*_0b0793cb[^"]*_9bceb233[^"]*"[^>]*>([^<]+?)<\/(?:p|span)/i);
      if (titleP && titleP[1]) {
        const t = titleP[1].replace(/&amp;/g, '&').trim();
        if (t.length >= 3 && t.length <= 120 && looksLikeJobTitle(t)) title = t;
      }
    }
  }
  if (!title && description && description.length >= 50) {
    title = (deriveTitleFromDescription(description) || '').trim();
  }
  if (!title || !looksLikeJobTitle(title)) return null;
  if (!company) company = '';
  return { title, company, description: description || '' };
}

/**
 * Internal: fetch LinkedIn job page HTML and parse title/company.
 * @param {string} viewUrl - Full job view URL
 * @param {{ timeoutMs?: number, userAgent?: string }} opts - timeout and User-Agent
 * @returns {Promise<{ title: string, company: string } | null>}
 */
function fetchJobPageTitleAndCompanyInternal(viewUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const userAgent = opts.userAgent ?? 'Mozilla/5.0 (compatible; Dex/1.0)';
  return new Promise((resolve) => {
    const url = (viewUrl || '').split('#')[0].trim();
    if (!url || !url.startsWith('https://www.linkedin.com/jobs/view/')) {
      resolve(null);
      return;
    }
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      resolve(null);
      return;
    }
    let settled = false;
    let req;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (req) req.destroy();
      resolve(value);
    };
    const overallTimer = setTimeout(() => done(null), timeoutMs);
    req = https.get(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } },
      (res) => {
        let data = '';
        res.on('data', (ch) => { data += ch; if (data.length > 200000) res.destroy(); });
        res.on('end', () => {
          const m = data.match(/<title[^>]*>([^<]+)<\/title>/i);
          const raw = m ? (m[1] || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim() : '';
          let title = '';
          let company = '';
          if (raw) {
            const hiringMatch = raw.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+|$)/i);
            if (hiringMatch) {
              company = hiringMatch[1].trim();
              title = hiringMatch[2].replace(/\s+in\s+.*$/i, '').trim();
            } else {
              const atMatch = raw.match(/^(.+?)\s+at\s+(.+)$/i);
              if (atMatch) {
                title = atMatch[1].trim();
                company = atMatch[2].trim();
              }
            }
          }
          if (title && looksLikeJobTitle(title) && (company || title)) {
            done({ title, company: company || '' });
            return;
          }
          const fromHtml = parseTitleAndCompanyFromJobPageHtml(data);
          if (fromHtml && fromHtml.title) {
            done({ title: fromHtml.title, company: fromHtml.company || company || '' });
            return;
          }
          done(null);
        });
      }
    );
    req.on('error', () => done(null));
    req.setTimeout(Math.min(timeoutMs + 2000, timeoutMs - 500), () => { req.destroy(); done(null); });
  });
}

const FETCH_JOB_PAGE_TIMEOUT_MS = 4000;

/**
 * Fetch LinkedIn job view page and parse for job title and company. Always returns a real title when the page contains job data (no placeholder).
 * Tries: <title> (if looks like job title), then JSON-LD / script extraction from HTML, then derive from description in page.
 */
function fetchJobPageTitleAndCompany(viewUrl) {
  return fetchJobPageTitleAndCompanyInternal(viewUrl, { timeoutMs: FETCH_JOB_PAGE_TIMEOUT_MS });
}

/**
 * Retry fetch with longer timeout and crawler User-Agent. Use when default fetch returns null (e.g. LinkedIn login wall).
 * Some sites serve job page HTML to crawlers; LinkedIn may include og:title or JSON-LD for bots.
 */
function fetchJobPageTitleAndCompanyCrawler(viewUrl) {
  return fetchJobPageTitleAndCompanyInternal(viewUrl, {
    timeoutMs: 10000,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  });
}

/**
 * Fetch LinkedIn job page and return title, company, and description (from JSON-LD).
 * For single-job flow: get description without opening browser. Returns { title, company, description } or null.
 */
function fetchJobPageTitleCompanyAndDescriptionInternal(viewUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const userAgent = opts.userAgent ?? 'Mozilla/5.0 (compatible; Dex/1.0)';
  return new Promise((resolve) => {
    const url = (viewUrl || '').split('#')[0].trim();
    if (!url || !url.startsWith('https://www.linkedin.com/jobs/view/')) {
      resolve(null);
      return;
    }
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      resolve(null);
      return;
    }
    let settled = false;
    let req;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      if (req) req.destroy();
      resolve(value);
    };
    const overallTimer = setTimeout(() => done(null), timeoutMs);
    req = https.get(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } },
      (res) => {
        let data = '';
        res.on('data', (ch) => { data += ch; if (data.length > 500000) res.destroy(); });
        res.on('end', () => {
          const parsed = parseTitleCompanyAndDescriptionFromJobPageHtml(data);
          if (parsed && parsed.title) {
            done({ title: parsed.title, company: parsed.company || '', description: parsed.description || '' });
            return;
          }
          const fallback = parseTitleAndCompanyFromJobPageHtml(data);
          if (fallback && fallback.title) {
            done({ title: fallback.title, company: fallback.company || '', description: '' });
            return;
          }
          done(null);
        });
      }
    );
    req.on('error', () => done(null));
    req.setTimeout(Math.min(timeoutMs + 2000, timeoutMs - 500), () => { req.destroy(); done(null); });
  });
}

function fetchJobPageTitleCompanyAndDescription(viewUrl) {
  return fetchJobPageTitleCompanyAndDescriptionInternal(viewUrl, { timeoutMs: 6000 });
}

function fetchJobPageTitleCompanyAndDescriptionCrawler(viewUrl) {
  return fetchJobPageTitleCompanyAndDescriptionInternal(viewUrl, {
    timeoutMs: 12000,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  });
}

module.exports = {
  deriveTitleFromDescription,
  deriveCompanyFromDescription,
  detectJobType,
  locationRank,
  isBelowMinSalary,
  isAutomotiveRole,
  isHardwareRole,
  isTelecomRole,
  isRemoteFromExcludedCountry,
  isVideoGamingCompany,
  isVideoGamingRole,
  normalizeSearchUrl,
  parseSalaryToEurYear,
  requiresHighTravel,
  requiresRelocation,
  requiresOfficePresence,
  requiresNonEnglishLanguage,
  requiresSapExperience,
  requiresResidenceInExcludedCountry,
  MIN_SALARY_EUR_YEAR,
  LOCATION_PRIORITY,
  LOCATION_DEFAULT_PRIORITY,
  AUTOMOTIVE_EXCLUDED_COMPANIES,
  HARDWARE_EXCLUDED_COMPANIES,
  REMOTE_FROM_EXCLUDED_COUNTRIES,
  RESIDENCE_ONLY_PATTERNS,
  VIDEO_GAMING_EXCLUDED_COMPANIES,
  fetchJobPageTitleAndCompany,
  fetchJobPageTitleAndCompanyCrawler,
  fetchJobPageTitleCompanyAndDescription,
  fetchJobPageTitleCompanyAndDescriptionCrawler,
  looksLikeJobTitle,
  parseTitleAndCompanyFromJobPageHtml
};
