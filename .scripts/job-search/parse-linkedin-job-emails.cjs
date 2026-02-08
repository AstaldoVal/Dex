#!/usr/bin/env node
/**
 * Parse LinkedIn Job Alert emails from inbox via IMAP.
 * Extracts job links and titles, filters by iGaming/PM relevance, writes to 00-Inbox/Job_Search.
 * Requires: JOBSEARCH_EMAIL_USER, JOBSEARCH_EMAIL_PASSWORD in .env
 */

const fs = require('fs');
const path = require('path');
const { simpleParser } = require('mailparser');
const { execSync } = require('child_process');

const { VAULT, DIGESTS_DIR, DEBUG_DIR, ensureDirs } = require('./job-search-paths.cjs');

const RELEVANCE_KEYWORDS = [
  'igaming', 'i-gaming', 'casino', 'live casino', 'tv games', 'bingo',
  'lottery', 'lotteries', 'gambling', 'sportsbook', 'betting', 'slot',
  'product manager', 'head of product', 'cpo', 'compliance', 'compliance manager',
  'remote', 'mga'
];

function loadEnv() {
  const envPath = path.join(VAULT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*JOBSEARCH_EMAIL_(USER|PASSWORD)\s*=\s*(.+)\s*$/);
    if (m) out[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

// Extract company name and work type from email HTML around a job URL
function extractJobMetadataFromEmail(html, jobUrl) {
  if (!html || !jobUrl) return { company: '', workType: 'unknown' };
  
  // Extract job ID from URL for more reliable matching
  const jobIdMatch = jobUrl.match(/\/jobs\/view\/(\d+)/);
  if (!jobIdMatch) return { company: '', workType: 'unknown' };
  const jobId = jobIdMatch[1];
  
  // Escape URL for regex
  const urlEscaped = jobUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Strategy 1: Find the <a> tag with this URL and extract surrounding HTML structure
  const linkPattern = new RegExp(`<a[^>]+href=["']${urlEscaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i');
  const linkMatch = html.match(linkPattern);
  
  let company = '';
  let workType = 'unknown';
  let searchContext = '';
  
  if (linkMatch) {
    const linkIndex = linkMatch.index;
    const linkEnd = linkIndex + linkMatch[0].length;
    
    // Extract context: 300 chars before link, 1500 after (to catch company/location)
    const contextStart = Math.max(0, linkIndex - 300);
    const contextEnd = Math.min(html.length, linkEnd + 1500);
    searchContext = html.slice(contextStart, contextEnd);
    
    // Strategy 1a: Look for company name in table cells or divs after the link
    // LinkedIn emails often structure: <a>Job Title</a> ... <td>Company</td> ... <td>Location (Remote)</td>
    const afterLink = searchContext.slice(linkEnd - contextStart);
    
    // Pattern 1: Company in next text node after closing </a> tag
    // Look for: </a> ... <td>Company</td> or </a> ... <div>Company</div>
    const companyPatterns = [
      // Table structure: </a> ... <td[^>]*>Company Name</td>
      /<\/a>[\s\S]{0,200}<td[^>]*>([^<]{2,80})<\/td>/i,
      // Div structure: </a> ... <div[^>]*>Company Name</div>
      /<\/a>[\s\S]{0,200}<div[^>]*>([^<]{2,80})<\/div>/i,
      // Span structure: </a> ... <span[^>]*>Company Name</span>
      /<\/a>[\s\S]{0,200}<span[^>]*>([^<]{2,80})<\/span>/i,
      // Text directly after link (within same container)
      /<\/a>\s*([A-Z][a-zA-Z0-9\s&.\-]{1,78}[a-zA-Z0-9])\s*</i,
    ];
    
    for (const pattern of companyPatterns) {
      const m = afterLink.match(pattern);
      if (m && m[1]) {
        const candidate = m[1].trim();
        // Validate it's likely a company name
        if (candidate.length >= 2 && candidate.length <= 80 &&
            !candidate.includes('http') && !candidate.includes('linkedin.com') &&
            !candidate.match(/^\d+$/) &&
            !/\b(remote|hybrid|on-?site|metropolitan|area|region|country|city|state|province|full-?time|part-?time|contract|view job|see all)\b/i.test(candidate)) {
          company = candidate;
          break;
        }
      }
    }
    
    // Strategy 1b: If not found, look for company in structured data (JSON-LD or data attributes)
    if (!company) {
      const jsonLdMatch = searchContext.match(/"@type"\s*:\s*"JobPosting"[\s\S]{0,500}"hiringOrganization"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);
      if (jsonLdMatch && jsonLdMatch[1]) {
        company = jsonLdMatch[1].trim().slice(0, 80);
      }
    }
    
    // Strategy 1c: Extract work type from location text after company
    const locationPatterns = [
      /\(([^)]*remote[^)]*)\)/i,
      /\(([^)]*hybrid[^)]*)\)/i,
      /\(([^)]*on-?site[^)]*)\)/i,
      /\b(remote|hybrid|on-?site|onsite)\b/i
    ];
    
    const locationText = afterLink.toLowerCase();
    if (/\b\(remote\)|remote\b/.test(locationText)) workType = 'remote';
    else if (/\b\(hybrid\)|hybrid\b/.test(locationText)) workType = 'hybrid';
    else if (/\b\(on-?site\)|on-?site|onsite|in-?office\b/.test(locationText)) workType = 'on-site';
  }
  
  // Strategy 2: Fallback - search entire HTML for job ID and extract nearby text
  if (!company || workType === 'unknown') {
    const jobIdPattern = new RegExp(`(?:${jobId}|${urlEscaped})`, 'i');
    const match = html.match(jobIdPattern);
    if (match) {
      const idx = match.index;
      const fallbackStart = Math.max(0, idx - 200);
      const fallbackEnd = Math.min(html.length, idx + 2000);
      const fallbackContext = html.slice(fallbackStart, fallbackEnd);
      
      // Extract text blocks
      const textBlocks = fallbackContext
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '|')
        .split('|')
        .map(b => b.trim())
        .filter(b => b.length > 0 && b.length < 200);
      
      // Find company in text blocks (usually appears after job title)
      for (let i = 0; i < textBlocks.length - 1; i++) {
        if (textBlocks[i].includes(jobId) || 
            textBlocks[i].toLowerCase().includes('product manager') ||
            textBlocks[i].toLowerCase().includes('head of product')) {
          // Check next 2-3 blocks for company name
          for (let j = i + 1; j < Math.min(i + 4, textBlocks.length); j++) {
            const candidate = textBlocks[j];
            if (candidate.length >= 2 && candidate.length <= 80 &&
                !candidate.includes('http') && !candidate.match(/^\d+$/) &&
                !/\b(remote|hybrid|on-?site|metropolitan|area|region|country|city|state|province|full-?time|part-?time|contract|view job|see all|actively recruiting|fast growing|connections)\b/i.test(candidate) &&
                !candidate.match(/^\d+\s*(connections?|followers?)$/i)) {
              if (!company) company = candidate;
              break;
            }
          }
          break;
        }
      }
      
      // Extract work type from fallback context
      if (workType === 'unknown') {
        const fallbackLower = fallbackContext.toLowerCase();
        if (/\b\(remote\)|remote\b/.test(fallbackLower)) workType = 'remote';
        else if (/\b\(hybrid\)|hybrid\b/.test(fallbackLower)) workType = 'hybrid';
        else if (/\bon-?site|onsite|in-?office\b/.test(fallbackLower)) workType = 'on-site';
      }
    }
  }
  
  return { company: company.slice(0, 80), workType };
}

function extractJobLinks(html) {
  if (!html || typeof html !== 'string') return [];
  const jobs = [];
  const seen = new Set();

  function add(url, title) {
    let u = url.replace(/&amp;/g, '&').trim();
    if (u.startsWith('/')) u = 'https://www.linkedin.com' + u;
    if (!u || !u.includes('linkedin.com') || u.includes('/jobs/view/0')) return;
    if (seen.has(u)) return;
    seen.add(u);
    const job = { 
      url: u, 
      title: (title || u).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) 
    };
    // Extract company and work type from email HTML
    const metadata = extractJobMetadataFromEmail(html, u);
    job.company = metadata.company;
    job.workType = metadata.workType;
    jobs.push(job);
  }

  // Full URL: linkedin.com/jobs/view/... or click tracker or lnkd.in
  const patterns = [
    /<a[^>]+href=["'](https?:\/\/[^"']*linkedin\.com\/jobs?\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /href=["'](https?:\/\/[^"']*linkedin\.com\/jobs?\/[^"']+)["']/gi,
    /<a[^>]+href=["'](https?:\/\/[^"']*linkedin\.com[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /href=["'](https?:\/\/[^"']*linkedin\.com[^"']*)["']/gi,
    /<a[^>]+href=["'](https?:\/\/lnkd\.in\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /href=["'](https?:\/\/lnkd\.in\/[^"']+)["']/gi,
    /<a[^>]+href=["'](\/jobs?\/view\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /href=["'](\/jobs?\/view\/[^"']+)["']/gi
  ];
  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      const text = m[2] || '';
      add(url, text);
    }
  }
  return jobs;
}

function isRelevant(job) {
  const text = `${(job.title || '')} ${job.url}`.toLowerCase();
  return RELEVANCE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// Exclude on-site only; we want remote (or hybrid). Filter runs after relevance.
const EXCLUDE_KEYWORDS = ['on-site', 'onsite', 'on site', 'in-office', 'in office', 'hybrid', 'relocation'];
function isExcluded(job) {
  const text = `${(job.title || '')} ${job.url}`.toLowerCase();
  return EXCLUDE_KEYWORDS.some(kw => text.includes(kw));
}

// Exclude clear engineering/developer roles — digest is for PM / Head of Product / CPO / Compliance.
function isNonPmRole(job) {
  const title = (job.title || '').toLowerCase();
  if (/product manager|product owner|head of product|cpo\b|chief product|compliance manager/.test(title)) return false;
  if (/\b(software engineer|c# engineer|\.net engineer|java engineer|r&d engineer|backend engineer|frontend engineer|fullstack?\s+engineer|devops engineer|qa engineer|data engineer|ml engineer|game engineer)\b/i.test(title)) return true;
  if (/\b(backend developer|frontend developer|fullstack?\s+developer|\.net developer|java developer|c# developer)\b/i.test(title)) return true;
  if (/\bdeveloper\b/i.test(title) && !/product/i.test(title)) return true;
  return false;
}

// Extract LinkedIn job ID from URL (e.g. /jobs/view/4366369039/) for dedupe
function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

// Collect job IDs that were marked as applied [x] or rejected [-] in previous LinkedIn digest files
function getExcludedJobIdsFromPreviousDigests() {
  const excluded = new Set();
  if (!fs.existsSync(DIGESTS_DIR)) return excluded;
  const files = fs.readdirSync(DIGESTS_DIR).filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.md'));
  const re = /^- \[(x|-)\] \[[^\]]*\]\((https?:[^)]+)\)/gm;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(DIGESTS_DIR, file), 'utf8');
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(content)) !== null) {
        const id = getJobId(m[2]);
        if (id) excluded.add(id);
      }
    } catch (e) {
      // ignore missing/bad files
    }
  }
  return excluded;
}

/**
 * Parse job descriptions from LinkedIn and prepare data for automatic summary generation.
 * Summary will be generated automatically in Cursor context when digest is processed.
 */
async function parseJobDescriptionsAndGenerateSummaries(jobs, verbose = false) {
  const pythonScript = `
import sys
import json
import asyncio

# PYTHONPATH is set by Node to core/mcp
from job_digest_server import parse_linkedin_job

async def main():
    data = json.loads(sys.stdin.read())
    jobs = data.get('jobs', data) if isinstance(data, dict) else data
    verbose = data.get('verbose', False) if isinstance(data, dict) else False
    
    results = []
    for i, job in enumerate(jobs):
        try:
            if verbose:
                print(f"Processing {i+1}/{len(jobs)}: {job.get('url', 'unknown')}", file=sys.stderr)
            
            # Parse job description from LinkedIn
            parsed = await parse_linkedin_job(job['url'])
            
            if 'error' in parsed:
                if verbose:
                    print(f"  Error: {parsed['error']}", file=sys.stderr)
                results.append(job)  # Keep original job without summary
                continue
            
            # Add parsed data to job
            job['jobDescription'] = parsed.get('job_description', '')
            job['parsedTitle'] = parsed.get('job_title', job.get('title', ''))
            job['parsedCompany'] = parsed.get('company', job.get('company', ''))
            job['jobType'] = parsed.get('job_type', 'ai')
            job['cvPath'] = parsed.get('cv_path', '')
            job['keywords'] = parsed.get('keywords', {})
            
            # Generate summary using Claude in Cursor context
            # We'll prepare the data and add a note - actual generation happens when digest is opened
            job['summaryData'] = {
                'job_description': parsed.get('job_description', ''),
                'cv_content': parsed.get('cv_content', ''),
                'confirmed_facts': parsed.get('confirmed_facts', ''),
                'keywords': parsed.get('keywords', {}),
                'job_title': parsed.get('job_title', ''),
                'company': parsed.get('company', ''),
                'job_type': parsed.get('job_type', 'ai'),
                'cv_path': parsed.get('cv_path', '')
            }
            job['needsSummary'] = True
            
            # Note: Summary will be generated automatically when digest is processed in Cursor
            # using /job-summary skill or MCP generate_job_summary tool
            
            results.append(job)
            
            # Rate limiting: wait between requests
            if i < len(jobs) - 1:
                await asyncio.sleep(2)
                
        except Exception as e:
            if verbose:
                print(f"  Exception: {e}", file=sys.stderr)
            results.append(job)  # Keep original job on error
    
    print(json.dumps(results))

asyncio.run(main())
`;
  
  const tmpDir = path.join(VAULT, '00-Inbox', 'Job_Search', 'debug');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpScript = path.join(tmpDir, 'parse-job-descriptions.py');
  fs.writeFileSync(tmpScript, pythonScript, 'utf8');

  try {
    const payload = { jobs, verbose };
    const jobsJson = JSON.stringify(payload);
    const result = execSync(`python3 ${JSON.stringify(tmpScript)}`, {
      input: jobsJson,
      encoding: 'utf-8',
      cwd: VAULT,
      env: { ...process.env, PYTHONPATH: path.join(VAULT, 'core', 'mcp') },
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large responses
    });
    
    const parsedJobs = JSON.parse(result);
    return parsedJobs;
  } catch (error) {
    if (verbose) {
      console.error('Error parsing job descriptions:', error.message);
    }
    // Return original jobs if parsing fails
    return jobs;
  }
}

// Score 0–10: how well the job matches iGaming + Senior PM / Head of Product / CPO / Compliance (iGaming only)
function scoreJob(job) {
  const t = `${(job.title || '')} ${job.url}`.toLowerCase();
  let score = 0;
  const hasIgaming = /\bigaming\b|i-gaming|gambling|casino|sportsbook|betting|mga\b|live casino|bingo|lottery|slot\b/.test(t);
  // iGaming / target industry (compliance only counts when iGaming context present)
  if (hasIgaming) {
    if (/compliance|gambling|casino|sportsbook|betting|mga|igaming/.test(t)) score += 3;
    if (/live casino|bingo|lottery|slot\b/.test(t)) score += 2;
  }
  if (/compliance/.test(t) && !hasIgaming) {
    // Compliance in fintech/banking (not iGaming) — not your niche
    if (/banking|private bank|revolut|fintech|payments\b|trading\b|brokerage|wealth\b|crypto\b|financial services/.test(t)) score -= 3;
  }
  // Target roles (your level)
  if (/senior product manager|head of product|cpo\b|chief product/.test(t)) score += 2;
  if (/compliance (product )?manager|product owner/.test(t) && hasIgaming) score += 1;
  if (/product manager/.test(t)) score += 1;
  if (/remote/.test(t)) score += 1;
  // Penalise non-iGaming gaming (video games — no experience)
  if (/star trek|fleet command|video game|esports|game studio\b|unity\b|unreal\b/.test(t)) score -= 2;
  if (/junior|intern\b|graduate/.test(t)) score -= 2;
  // Only real job postings (exclude search/alert links)
  if (!job.url.includes('/jobs/view/')) score -= 5;
  return Math.max(0, Math.min(10, score));
}

async function main() {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
  const user = process.env.JOBSEARCH_EMAIL_USER || loadEnv().user;
  const pass = process.env.JOBSEARCH_EMAIL_PASSWORD || loadEnv().password;

  if (!user || !pass) {
    console.log('Skip email: JOBSEARCH_EMAIL_USER or JOBSEARCH_EMAIL_PASSWORD not set in .env');
    process.exit(0);
  }

  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose') || process.env.JOBSEARCH_DEBUG === '1';
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(DIGESTS_DIR, `linkedin-jobs-${today}.md`);

  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({
    host: process.env.JOBSEARCH_IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.JOBSEARCH_IMAP_PORT || '993', 10),
    secure: true,
    auth: { user, pass },
    logger: false
  });

  const seenUrls = new Set();
  const seenJobIds = new Set();
  const results = [];

  try {
    await client.connect();
    const host = (process.env.JOBSEARCH_IMAP_HOST || 'imap.gmail.com').toLowerCase();
    const mailbox = host.includes('gmail.com') ? '[Gmail]/All Mail' : 'INBOX';
    await client.mailboxOpen(mailbox);
    if (verbose) console.log('Mailbox:', mailbox);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const uids = await client.search({ from: 'linkedin', since }, { uid: true });
    if (verbose) console.log('Emails from LinkedIn (last 7 days):', uids.length);
    if (uids.length === 0) {
      console.log('No LinkedIn emails found in last 7 days.');
    } else {
      const range = uids.join(',');
      const list = client.fetch(range, { source: true }, { uid: true });
      let totalLinks = 0;
      let firstHtmlSaved = false;
      for await (const msg of list) {
        try {
          const raw = msg.source && (typeof msg.source === 'string' ? Buffer.from(msg.source) : msg.source);
          if (!raw) continue;
          const parsed = await simpleParser(raw);
          const html = parsed.html || parsed.textAsHtml || '';
          if (verbose && html && !firstHtmlSaved && (parsed.subject || '').toLowerCase().includes('job')) {
            fs.writeFileSync(path.join(DEBUG_DIR, 'last-linkedin-job-email.html'), html.slice(0, 100000), 'utf8');
            firstHtmlSaved = true;
            console.log('Saved sample HTML to', path.join(DEBUG_DIR, 'last-linkedin-job-email.html'));
          }
          const jobs = extractJobLinks(html);
          totalLinks += jobs.length;
          for (const job of jobs) {
            if (!isRelevant(job)) continue;
            if (isExcluded(job)) continue; // skip on-site / in-office
            if (isNonPmRole(job)) continue; // skip engineering/developer roles (digest is for PM)
            const jobId = getJobId(job.url);
            if (jobId) {
              if (seenJobIds.has(jobId)) continue;
              seenJobIds.add(jobId);
            } else if (seenUrls.has(job.url)) {
              continue;
            }
            seenUrls.add(job.url);
            results.push(job);
          }
        } catch (e) {
          if (verbose) console.error('Parse error:', e.message);
        }
      }
      if (verbose) console.log('Job links extracted:', totalLinks, '| Passed relevance filter:', results.length);
    }
  } finally {
    await client.logout();
  }

  ensureDirs();

  // Keep only real job postings (exclude search/alert links), score and sort
  let withScore = results
    .filter(j => j.url.includes('/jobs/view/'))
    .map(j => ({ ...j, score: scoreJob(j) }))
    .sort((a, b) => b.score - a.score);

  // Exclude jobs marked as applied [x] or rejected [-] in previous digest files
  const excludedIds = getExcludedJobIdsFromPreviousDigests();
  const excludedCount = withScore.filter(j => excludedIds.has(getJobId(j.url))).length;
  withScore = withScore.filter(j => !excludedIds.has(getJobId(j.url)));

  // Remote filtering and title/company enrichment: done by filter-digest-remote-playwright.cjs (step 2).
  // Summaries: done by add-summaries-to-digest.cjs (step 3) after filter.

  const best = withScore.filter(j => j.score >= 5);
  const other = withScore.filter(j => j.score < 5);

  const lines = [
    `# LinkedIn jobs (from your Job Alert emails) — ${today}`,
    '',
    '*Parsed from inbox (last 7 days). Sorted by relevance to iGaming + Senior PM / Head of Product / CPO / Compliance.*',
    '*`[ ]` to process · `[x]` applied · `[-]` rejected. See `data/Applied.md` for applications. Applied/rejected (from previous digests) are excluded below.*',
    '',
    `**Best match: ${best.length}** | Other: ${other.length}`,
    '',
    '---',
    '',
    '## Best match (iGaming / target role)',
    ''
  ];
  const fmt = async (j) => {
    const title = (j.title && j.title.length < 120 ? j.title : 'View job').replace(/\|/g, ' ');
    const company = (j.company || '—').replace(/\|/g, ' ');
    const type = (j.workType || 'unknown').replace(/^./, (c) => c.toUpperCase());
    let line = `- [ ] [${title} · ${company} · ${type}](${j.url})`;
    
    // Add summary if available
    if (j.summary) {
      line += `\n\n${j.summary}`;
      if (j.suggested_questions && j.suggested_questions.length > 0) {
        line += `\n\n**Suggested questions:**\n`;
        j.suggested_questions.forEach(q => {
          line += `- ${q}\n`;
        });
      }
    } else if (j.needsSummary && j.summaryData) {
      // Add special marker for automatic summary generation in Cursor
      // Format: <!-- AUTO_SUMMARY:job_description:... -->
      const jobDescEncoded = Buffer.from(j.summaryData.job_description).toString('base64');
      line += `\n\n<!-- AUTO_SUMMARY:${j.jobType}:${jobDescEncoded} -->`;
    }
    
    return line;
  };
  for (const j of best) {
    lines.push(await fmt(j));
    lines.push('');
  }
  lines.push('---', '', '## Other (PM roles, check if relevant)', '');
  for (const j of other) {
    lines.push(await fmt(j));
    lines.push('');
  }
  const content = lines.join('\n');

  if (dryRun) {
    console.log(content);
    return;
  }
  fs.writeFileSync(outPath, content, 'utf8');
  const exclNote = excludedCount > 0 ? ` (${excludedCount} applied/rejected, excluded)` : '';
  const companiesFound = withScore.filter(j => j.company && j.company !== '—').length;
  const companyNote = companiesFound > 0 ? ` | Companies extracted: ${companiesFound}/${withScore.length}` : '';
  console.log(`Wrote ${withScore.length} LinkedIn jobs (${best.length} best match) to ${path.relative(VAULT, outPath)}${exclNote}${companyNote}`);
}

main().catch(err => {
  console.error('Email parse error:', err.message);
  process.exit(1);
});
