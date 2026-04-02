#!/usr/bin/env node
/**
 * Single entry point for job digest: run steps 1–4 in order, skipping steps already done.
 *
 * - Step 1 (parser): skip if today's digest exists and has job lines.
 * - Step 2 (filter): skip if all jobs in digest are already in filter state; otherwise run in batches until done.
 * - Step 3 (summaries): fetch job descriptions from LinkedIn, then inject resume summary under each job in the digest.
 * - Step 4 (Teal): add each job from the digest to Teal (app) with URL and description.
 *
 * Usage: node run-job-digest.cjs [--linkedin] [--remotive] [--wwr] [--remoteok] [--foorilla] [--bettingjobs] [--dou] [--rss] [--search]
 *    or: npm run job-digest [-- --remotive --foorilla]
 *    or: npm run job-digest [-- --search]
 *
 * Source flags: run only selected sources; if none, run all.
 *   --linkedin     LinkedIn (email parser)
 *   --remotive     Remotive (Product + PM)
 *   --wwr          We Work Remotely
 *   --remoteok     RemoteOK
 *   --foorilla     Foorilla (scrape)
 *   --bettingjobs  BettingJobs (iGaming Product)
 *   --dou          DOU (iGaming UA, домен Gambling; нужен /tmp/dou-gambling-all.json)
 *   --rss          Shorthand: remotive + wwr + remoteok
 *   --search       LinkedIn search export (from Dex extension search-capture)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { VAULT, DIGESTS_DIR, LINKEDIN_DIGESTS_DIR, DATA_DIR, JOBS_DIR } = require('./job-search-paths.cjs');

const SOURCE_FLAGS = ['--linkedin', '--remotive', '--wwr', '--remoteok', '--foorilla', '--bettingjobs', '--dou', '--rss', '--search'];
const RSS_PASSTHROUGH_FLAGS = ['--remotive', '--wwr', '--remoteok', '--foorilla', '--rss'];

function parseSourceFlags() {
  const argv = process.argv.slice(2);
  const set = new Set();
  for (const f of SOURCE_FLAGS) {
    if (argv.includes(f)) set.add(f.slice(2));
  }
  return set;
}

function wantsLinkedIn(flags) {
  return flags.size === 0 || flags.has('linkedin');
}

function wantsRssOrScrape(flags) {
  if (flags.size === 0) return true;
  return flags.has('rss') || flags.has('remotive') || flags.has('wwr') || flags.has('remoteok') || flags.has('foorilla');
}

function wantsBettingJobs(flags) {
  return flags.size === 0 || flags.has('bettingjobs');
}

function wantsDou(flags) {
  return flags.size === 0 || flags.has('dou');
}

function wantsSearch(flags) {
  return flags.has('search');
}

function rssScriptArgs() {
  const argv = process.argv.slice(2);
  return argv.filter((a) => RSS_PASSTHROUGH_FLAGS.includes(a));
}

const FILTER_STATE_FILE = path.join(DATA_DIR, 'digest-filter-state.json');
const JOB_LINE_RE = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;

function getTodayDigestPath() {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(LINKEDIN_DIGESTS_DIR || DIGESTS_DIR, `linkedin-jobs-${today}.md`);
}

function digestHasJobLines(digestPath) {
  if (!fs.existsSync(digestPath)) return false;
  const content = fs.readFileSync(digestPath, 'utf8');
  return JOB_LINE_RE.test(content);
}

function countJobLinesInDigest(digestPath) {
  if (!fs.existsSync(digestPath)) return 0;
  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  return lines.filter((l) => JOB_LINE_RE.test(l)).length;
}

function getJobIdsFromDigest(digestPath) {
  if (!fs.existsSync(digestPath)) return [];
  const content = fs.readFileSync(digestPath, 'utf8');
  const ids = [];
  let m;
  const re = new RegExp(JOB_LINE_RE.source, 'gm');
  while ((m = re.exec(content)) !== null) {
    const id = (m[1].match(/\/jobs\/view\/(\d+)/) || [])[1];
    if (id) ids.push(id);
  }
  return ids;
}

function loadFilterState(digestName) {
  if (!fs.existsSync(FILTER_STATE_FILE)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(FILTER_STATE_FILE, 'utf8'));
    return data[digestName] || {};
  } catch (e) {
    return {};
  }
}

function filterStepNeeded(digestPath) {
  const digestName = path.basename(digestPath);
  const jobIds = getJobIdsFromDigest(digestPath);
  if (jobIds.length === 0) return false;
  const state = loadFilterState(digestName);
  const results = state.results || {};
  const processed = new Set(Object.keys(results));
  return jobIds.some((id) => !processed.has(id));
}

function runStep1() {
  console.log('[job-digest] Step 1: parsing email…');
  execSync('node .scripts/job-search/parse-linkedin-job-emails.cjs', {
    cwd: VAULT,
    stdio: 'inherit'
  });
}

function getLatestExportPath() {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith('dex-linkedin-export-') && f.endsWith('.json'));
  files.sort();
  return files.length > 0 ? path.join(DATA_DIR, files[files.length - 1]) : null;
}

function runStep2(digestPath, digestName) {
  if (!filterStepNeeded(digestPath)) {
    console.log('[job-digest] Step 2: applying saved filter state…');
    execSync(`node ${JSON.stringify(path.join(VAULT, '.scripts/job-search/apply-filter-state.cjs'))} ${JSON.stringify(digestName)}`, {
      cwd: VAULT,
      stdio: 'inherit'
    });
    return;
  }
  const exportPath = getLatestExportPath();
  if (exportPath) {
    console.log('[job-digest] Step 2: applying filter from extension export…');
    execSync(`node ${JSON.stringify(path.join(VAULT, '.scripts/job-search/filter-digest-from-export.cjs'))} ${JSON.stringify(digestName)} ${JSON.stringify(exportPath)}`, {
      cwd: VAULT,
      stdio: 'inherit'
    });
    return;
  }
  console.log('[job-digest] Step 2: no export file. Generating link list for browser capture…');
  execSync(`node ${JSON.stringify(path.join(VAULT, '.scripts/job-search/generate-digest-open-links.cjs'))} ${JSON.stringify(digestName)}`, {
    cwd: VAULT,
    stdio: 'inherit'
  });
  console.log('[job-digest] → Run npm run job-search:open-links:serve to open the page and use "Start auto-capture" in the Dex extension (one click, then wait). Or open the HTML manually, open each link, then "Export for Dex". Save JSON to 00-Inbox/Job_Search/data/ and re-run npm run job-digest.');
}

function jobsWithoutSummaryCount(digestPath) {
  if (!fs.existsSync(digestPath)) return 0;
  const content = fs.readFileSync(digestPath, 'utf8');
  const jobPattern = /- \[ \] \[([^\]]+)\]\(([^\)]+)\)/g;
  let count = 0;
  let match;
  while ((match = jobPattern.exec(content)) !== null) {
    const lineIndex = content.indexOf(match[0]);
    const nextJobMatch = content.substring(lineIndex).match(/- \[ \] \[/);
    const jobContentEnd = nextJobMatch ? lineIndex + nextJobMatch.index : content.length;
    const jobContent = content.substring(lineIndex, jobContentEnd);
    const hasSummary =
      jobContent.includes('**Suggested questions:**') ||
      (jobContent.split('\n').length > 2 && !jobContent.includes('---'));
    if (!hasSummary) count++;
  }
  return count;
}

function fetchDescriptionsNeeded(digestPath) {
  const jobIds = getJobIdsFromDigest(digestPath);
  if (jobIds.length === 0) return false;
  if (!fs.existsSync(JOBS_DIR)) return true;
  const withDescription = jobIds.filter((id) => {
    const p = path.join(JOBS_DIR, id + '.json');
    if (!fs.existsSync(p)) return false;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return j.job_description && j.job_description.length >= 100;
    } catch (_) {
      return false;
    }
  });
  return withDescription.length < jobIds.length;
}

function runStep3Inject(digestName) {
  console.log('[job-digest] Step 3b: injecting summaries under each job in digest…');
  const injectScript = path.join(VAULT, '.scripts', 'job-search', 'inject-summaries-into-digest.cjs');
  execSync(`node ${JSON.stringify(injectScript)} ${JSON.stringify(digestName)}`, {
    cwd: VAULT,
    stdio: 'inherit'
  });
}

function runStep4(digestName) {
  console.log('[job-digest] Step 4: adding each job to Teal (with description)…');
  const tealScript = path.join(VAULT, '.scripts', 'job-search', 'add-digest-jobs-to-teal-playwright.cjs');
  execSync(`node ${JSON.stringify(tealScript)} ${JSON.stringify(digestName)} --app`, {
    cwd: VAULT,
    stdio: 'inherit'
  });
}

function main() {
  const sourceFlags = parseSourceFlags();
  const digestPath = getTodayDigestPath();
  const digestName = path.basename(digestPath);
  const today = new Date().toISOString().slice(0, 10);
  const douDigestPath = path.join(DIGESTS_DIR, 'dou', `dou-gambling-product-compliance-vacancies-${today}.md`);

  if (wantsLinkedIn(sourceFlags)) {
    if (!digestHasJobLines(digestPath)) {
      runStep1();
    } else {
      console.log('[job-digest] Step 1: skip (digest already exists).');
    }
  } else {
    console.log('[job-digest] Step 1: skip (--linkedin not requested).');
  }

  if (wantsRssOrScrape(sourceFlags)) {
    const rssScript = path.join(VAULT, '.scripts', 'job-search', 'fetch-remote-pm-rss.cjs');
    const rssArgs = rssScriptArgs().join(' ');
    try {
      execSync(`node ${JSON.stringify(rssScript)} ${rssArgs}`.trim(), { cwd: VAULT, stdio: 'inherit' });
    } catch (e) {
      console.warn('[job-digest] RSS fetch failed (non-fatal):', e.message || e);
    }
  } else {
    console.log('[job-digest] RSS/scrape: skip (no --remotive/--wwr/--remoteok/--foorilla/--rss).');
  }

  if (wantsBettingJobs(sourceFlags)) {
    const bettingJobsScript = path.join(VAULT, '.scripts', 'job-search', 'fetch-bettingjobs-product.cjs');
    try {
      execSync(`node ${JSON.stringify(bettingJobsScript)}`, { cwd: VAULT, stdio: 'inherit' });
    } catch (e) {
      console.warn('[job-digest] BettingJobs fetch failed (non-fatal):', e.message || e);
    }
  } else {
    console.log('[job-digest] BettingJobs: skip (--bettingjobs not requested).');
  }

  // DOU: ресерч вакансий украинских iGaming-компаний (домен Gambling на DOU)
  const DOU_ALL_JSON = '/tmp/dou-gambling-all.json';
  const DOU_VACANCIES_JSON = '/tmp/dou-gambling-vacancies.json';
  if (wantsDou(sourceFlags)) {
    if (fs.existsSync(DOU_ALL_JSON)) {
      const checkScript = path.join(VAULT, '.scripts', 'job-search', 'dou-gambling-check-vacancies.cjs');
      const genScript = path.join(VAULT, '.scripts', 'job-search', 'generate-dou-digest-markdown.cjs');
      try {
        console.log('[job-digest] DOU: checking vacancies for iGaming companies…');
        execSync(`node ${JSON.stringify(checkScript)} --in ${JSON.stringify(DOU_ALL_JSON)} --out ${JSON.stringify(DOU_VACANCIES_JSON)} --delay 800`, {
          cwd: VAULT,
          stdio: 'inherit'
        });
        execSync(`node ${JSON.stringify(genScript)} --in ${JSON.stringify(DOU_VACANCIES_JSON)} --out ${JSON.stringify(douDigestPath)}`, {
          cwd: VAULT,
          stdio: 'inherit'
        });
      } catch (e) {
        console.warn('[job-digest] DOU failed (non-fatal):', e.message || e);
      }
    } else {
      console.log('[job-digest] DOU: skip (no ' + DOU_ALL_JSON + '; run once: node .scripts/job-search/fetch-dou-gambling-all-pages.cjs --out /tmp/dou-gambling-all.json).');
    }
  } else {
    console.log('[job-digest] DOU: skip (--dou not requested).');
  }

  // ── Search export (from Dex extension search-capture) ──────────────────
  let searchDigestPath = null;
  if (wantsSearch(sourceFlags)) {
    const searchScript = path.join(VAULT, '.scripts', 'job-search', 'generate-search-digest.cjs');
    // Forward --export arg if present
    const argv = process.argv.slice(2);
    const exportIdx = argv.indexOf('--export');
    const exportArg = (exportIdx !== -1 && argv[exportIdx + 1]) ? `--export ${JSON.stringify(argv[exportIdx + 1])}` : '';
    try {
      console.log('[job-digest] Search: generating digest from search export…');
      const result = execSync(`node ${JSON.stringify(searchScript)} ${exportArg}`.trim(), {
        cwd: VAULT,
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf8'
      });
      // Extract digest path from script output
      const pathMatch = (result || '').match(/Digest file:\s*(.+)/);
      if (pathMatch) searchDigestPath = pathMatch[1].trim();
      console.log(result);
    } catch (e) {
      console.warn('[job-digest] Search digest failed:', e.message || e);
    }
  }

  // ── Email-based LinkedIn pipeline (steps 2-4) ─────────────────────────
  const searchOnly = wantsSearch(sourceFlags) && sourceFlags.size === 1;

  if (!searchOnly) {
    if (!fs.existsSync(digestPath)) {
      if (wantsLinkedIn(sourceFlags)) {
        console.error('[job-digest] No digest after step 1. Stop.');
        process.exit(1);
      }
    } else {
      const exportPath = getLatestExportPath();
      const hasExport = !!exportPath;

      if (countJobLinesInDigest(digestPath) > 0) {
        runStep2(digestPath, digestName);
      }

      // Step 3a: job descriptions from extension export (no Playwright).
      const skipLinkedIn = process.env.SKIP_LINKEDIN_DESCRIPTIONS === '1' || process.env.SKIP_LINKEDIN_DESCRIPTIONS === 'true';
      if (skipLinkedIn) {
        console.log('[job-digest] Step 3a: skip (SKIP_LINKEDIN_DESCRIPTIONS=1).');
      } else if (fetchDescriptionsNeeded(digestPath) && hasExport) {
        console.log('[job-digest] Step 3a: injecting job descriptions from extension export…');
        try {
          execSync(`node ${JSON.stringify(path.join(VAULT, '.scripts/job-search/inject-job-descriptions-from-export.cjs'))} ${JSON.stringify(exportPath)}`, {
            cwd: VAULT,
            stdio: 'inherit'
          });
        } catch (e) {
          console.warn('[job-digest] Step 3a failed:', e.message || e);
        }
      } else if (fetchDescriptionsNeeded(digestPath)) {
        console.log('[job-digest] Step 3a: skip (export file needed — same as Step 2; re-run after export).');
      } else {
        console.log('[job-digest] Step 3a: skip (all LinkedIn job descriptions already present).');
      }

      const withoutSummary = jobsWithoutSummaryCount(digestPath);
      if (withoutSummary > 0) {
        runStep3Inject(digestName);
      } else {
        console.log('[job-digest] Step 3b: skip (all jobs already have summaries in digest).');
      }

      runStep4(digestName);
    }
  }

  // ── Search digest: summaries + Teal ───────────────────────────────────
  if (searchDigestPath && fs.existsSync(searchDigestPath)) {
    const searchDigestName = path.basename(searchDigestPath);
    const searchWithoutSummary = jobsWithoutSummaryCount(searchDigestPath);
    if (searchWithoutSummary > 0) {
      console.log('[job-digest] Search: injecting summaries…');
      runStep3Inject(searchDigestName);
    }
    if (countJobLinesInDigest(searchDigestPath) > 0) {
      runStep4(searchDigestName);
    }
  }

  // ── RSS and other digests: Teal ───────────────────────────────────────
  const rssDigestPath = path.join(DIGESTS_DIR, `remote-pm-rss-${today}.md`);
  const bettingJobsDigestPath = path.join(DIGESTS_DIR, `bettingjobs-${today}.md`);
  
  if (fs.existsSync(rssDigestPath) && countJobLinesInDigest(rssDigestPath) > 0) {
    runStep4(path.basename(rssDigestPath));
  }
  
  if (fs.existsSync(bettingJobsDigestPath) && countJobLinesInDigest(bettingJobsDigestPath) > 0) {
    runStep4(path.basename(bettingJobsDigestPath));
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const parts = [];
  if (!searchOnly && fs.existsSync(digestPath)) {
    const total = countJobLinesInDigest(digestPath);
    parts.push(`LinkedIn: ${path.relative(VAULT, digestPath)} | ${total} jobs`);
  }
  if (searchDigestPath && fs.existsSync(searchDigestPath)) {
    const searchTotal = countJobLinesInDigest(searchDigestPath);
    parts.push(`Search: ${path.relative(VAULT, searchDigestPath)} | ${searchTotal} jobs`);
  }
  const rssTotal = fs.existsSync(rssDigestPath) ? countJobLinesInDigest(rssDigestPath) : 0;
  const bettingJobsTotal = fs.existsSync(bettingJobsDigestPath) ? countJobLinesInDigest(bettingJobsDigestPath) : 0;
  const douTotal = fs.existsSync(douDigestPath) ? countJobLinesInDigest(douDigestPath) : 0;
  if (rssTotal > 0) parts.push(`RSS: ${path.relative(VAULT, rssDigestPath)} | ${rssTotal} jobs`);
  if (bettingJobsTotal > 0) parts.push(`BettingJobs: ${path.relative(VAULT, bettingJobsDigestPath)} | ${bettingJobsTotal} jobs`);
  if (douTotal > 0) parts.push(`DOU (iGaming UA): ${path.relative(VAULT, douDigestPath)} | ${douTotal} jobs`);
  console.log('[job-digest] Done. ' + (parts.length > 0 ? parts.join('. ') : 'No digests generated.'));
}

main();
