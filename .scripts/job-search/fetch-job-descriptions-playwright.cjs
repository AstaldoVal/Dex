#!/usr/bin/env node
/**
 * Fetch job descriptions from LinkedIn for each job in the digest.
 * Uses the same .playwright-linkedin session as filter-digest-remote-playwright.
 * Writes 00-Inbox/Job_Search/job-descriptions-YYYY-MM-DD.json
 *
 * Usage:
 *   node fetch-job-descriptions-playwright.cjs [path-to-linkedin-jobs-YYYY-MM-DD.md]
 *   node fetch-job-descriptions-playwright.cjs [path] --debug   # save first job page HTML for selector debugging
 */

const fs = require('fs');
const path = require('path');

const { VAULT, DIGESTS_DIR, DATA_DIR, JOBS_DIR, DEBUG_DIR, PROFILE_EXTENSION, ensureDirs } = require('./job-search-paths.cjs');
const { deriveTitleFromDescription } = require('./job-search-utils.cjs');
const JOB_LINE_RE = /^(- \[[ x\-]\] \[)([^\]]*)(\]\()(https?:[^)]+)(\))$/;

try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const DELAY_MS = 10000;
const PAGE_WAIT_MS = 10000;
const PAGE_WAIT_NETWORK_MS = 10000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJobViewUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? `https://www.linkedin.com/comm/jobs/view/${m[1]}` : url;
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

/** Try to log in on current page (login/authwall). Returns true if we appear to be logged in after. */
async function tryLinkedInAutoLogin(page) {
  const email = process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_EMAIL.trim();
  const password = process.env.LINKEDIN_PASSWORD;
  if (!email || !password) return false;
  await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => null);
  const passInput = page.locator('input[type="password"]').first();
  if ((await passInput.count()) === 0 || !(await passInput.isVisible().catch(() => false))) return false;
  const emailSelectors = ['input[type="email"]', 'input[autocomplete="email"]', 'input[id="username"]:not([type="hidden"])', 'form input[type="text"]'];
  for (const sel of emailSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
      await el.fill(email);
      break;
    }
  }
  await passInput.fill(password);
  await sleep(10000);
  const submitSel = 'button[type="submit"], input[type="submit"], button[data-id="sign-in-form__submit-btn"]';
  await page.locator(submitSel).first().click();
  await page.waitForURL(/\/(feed|mynetwork|jobs|checkpoint)/, { timeout: 20000 }).catch(() => null);
  return !page.url().includes('/login') || page.url().includes('/checkpoint');
}

function normalizeUrlKey(url) {
  return (url || '').replace(/\?.*$/, '').replace(/\/$/, '').trim();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--debug' && a !== '--only-bettingjobs' && !a.startsWith('--limit') && !a.startsWith('--max-fetches'));
  const debug = process.argv.includes('--debug');
  const onlyBettingJobs = process.argv.includes('--only-bettingjobs');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
  const maxFetchesArg = process.argv.find((a) => a.startsWith('--max-fetches='));
  const maxFetches = maxFetchesArg ? parseInt(maxFetchesArg.split('=')[1], 10) : 0;
  ensureDirs();
  const digestPath = args[0]
    ? path.isAbsolute(args[0])
      ? args[0]
      : path.join(VAULT, args[0])
    : path.join(DIGESTS_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

  if (!fs.existsSync(digestPath)) {
    console.error('Digest not found:', digestPath);
    process.exit(1);
  }

  const content = fs.readFileSync(digestPath, 'utf8');
  const lines = content.split('\n');
  const jobs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JOB_LINE_RE);
    if (!m) continue;
    const linkText = m[2] || '';
    const url = m[4];
    const title = linkText.includes(' · ') ? linkText.split(' · ')[0].trim() : linkText.trim();
    jobs.push({
      index: i,
      title,
      url: getJobViewUrl(url),
      linkText,
      rawUrl: url
    });
  }

  if (jobs.length === 0) {
    console.log('No job lines in digest.');
    return;
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const dateStr = path.basename(digestPath).replace('linkedin-jobs-', '').replace('.md', '');
  const outPath = path.join(DATA_DIR, `job-descriptions-${dateStr}.json`);
  let results = [];
  const existingByUrl = new Map();
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      existing.forEach((r) => {
        if (r.url) {
          const key = normalizeUrlKey(r.url);
          existingByUrl.set(key, r);
        }
      });
      results = [...existing];
    } catch (_) {}
  }

  let jobsToFetch = limit > 0 ? jobs.slice(0, limit) : jobs;
  if (onlyBettingJobs) jobsToFetch = jobsToFetch.filter((j) => (j.url || j.rawUrl || '').includes('bettingjobs.com'));
  const skipCount = jobsToFetch.filter((j) => {
    const key = j.url.replace(/\?.*$/, '').replace(/\/$/, '');
    const ex = existingByUrl.get(key);
    return ex && ex.job_description && ex.job_description.length >= 100;
  }).length;
  const limitNote = limit > 0 ? ` (--limit=${limit})` : '';
  const maxFetchesNote = maxFetches > 0 ? `, max ${maxFetches} new fetches per run` : '';
  console.log('Launching browser. Fetching descriptions for', jobsToFetch.length, 'jobs' + (skipCount ? ` (${skipCount} already cached)` : '') + limitNote + maxFetchesNote + '…\n');

  const context = await playwright.chromium.launchPersistentContext(PROFILE_EXTENSION, {
    headless: false,
    args: ['--no-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  if (!onlyBettingJobs) {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      console.log('Session expired; attempting auto-login from .env…');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const loggedIn = await tryLinkedInAutoLogin(page);
      if (loggedIn) {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      }
      if (page.url().includes('/login') || page.url().includes('/authwall')) {
        await context.close();
        console.error('Session expired. Run: npm run job-search:linkedin-login');
        process.exit(1);
      }
    }
    await sleep(10000);
  }

  if (debug) {
    const firstJob = jobs[0];
    console.log('Debug: loading first job', firstJob.url);
    await page.goto(firstJob.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(10000);
    const html = await page.content();
    const debugPath = path.join(DEBUG_DIR, 'debug-linkedin-job-page.html');
    fs.writeFileSync(debugPath, html, 'utf8');
    await context.close();
    console.log('Saved page HTML to', path.relative(VAULT, debugPath));
    console.log('Inspect it to find the job description selector, then update this script.');
    return;
  }

  const descriptionSelectors = [
    'div[class*="jobs-description-content__text"]',
    'div[class*="jobs-box__html-content"]',
    'div[class*="description__text"]',
    'section[class*="jobs-description"] div[class*="text"]',
    '[data-test-id="job-poster-description"]',
    'div[class*="jobs-description"]',
    'section[class*="description"]',
    '.jobs-description-content__text',
    '[id*="job-details"]',
    'main section div[class*="text"]'
  ];

  const titleSelectors = [
    'h1[class*="jobs-unified-top-card__job-title"]',
    'h1[class*="job-title"]',
    '[data-test-id="job-poster-name"]'
  ];

  const companySelectors = [
    'a[class*="jobs-unified-top-card__company-name"]',
    'a[class*="job-details-jobs-unified-top-card__company-name"]',
    'span[class*="jobs-unified-top-card__company-name"]'
  ];

  function saveResults() {
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  }

  function upsertResult(record) {
    const key = normalizeUrlKey(record.url);
    const idx = results.findIndex((r) => normalizeUrlKey(r.url) === key);
    if (idx >= 0) results[idx] = record;
    else results.push(record);
  }

  function saveJobToJobsDir(jobId, payload) {
    if (!jobId || !payload) return;
    if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
    const jobPath = path.join(JOBS_DIR, jobId + '.json');
    fs.writeFileSync(jobPath, JSON.stringify({ id: jobId, ...payload }, null, 2), 'utf8');
  }

  let fetchCount = 0;
  for (let k = 0; k < jobsToFetch.length; k++) {
    const job = jobsToFetch[k];
    const key = job.url.replace(/\?.*$/, '').replace(/\/$/, '');
    const existing = existingByUrl.get(key);
    if (existing && existing.job_description && existing.job_description.length >= 100) {
      if (!onlyBettingJobs) results.push(existing);
      saveResults();
      const jobId = getJobIdFromUrl(job.url);
      if (jobId) {
        const jobPath = path.join(JOBS_DIR, jobId + '.json');
        if (!fs.existsSync(jobPath)) saveJobToJobsDir(jobId, { url: job.url, job_title: existing.job_title, company: existing.company || '—', work_type: existing.work_type || 'Remote', job_description: existing.job_description });
      }
      process.stdout.write(`  [${k + 1}/${jobsToFetch.length}] ${job.url.match(/\d+$/)?.[0] || '?'} … cached\n`);
      if (k < jobsToFetch.length - 1) await sleep(10000);
      continue;
    }
    process.stdout.write(`  [${k + 1}/${jobsToFetch.length}] ${job.url.match(/\d+$/)?.[0] || '?'} … `);
    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (page.url().includes('/login') || page.url().includes('/authwall')) {
        console.log('not logged in');
        if (onlyBettingJobs) upsertResult({ ...job, error: 'not_logged_in' }); else results.push({ ...job, error: 'not_logged_in' });
        saveResults();
        fetchCount++;
        if (maxFetches > 0 && fetchCount >= maxFetches) {
          console.log(`\nReached --max-fetches=${maxFetches}; next batch will run automatically.`);
          break;
        }
        continue;
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(PAGE_WAIT_NETWORK_MS);

      let job_description = '';
      const isBettingJobs = (job.url || '').includes('bettingjobs.com');
      if (isBettingJobs) {
        const bettingJobsSelectors = [
          '[class*="job-description"], [class*="job-detail"]',
          '[class*="description"]',
          'main [class*="content"], main [class*="body"]',
          'article',
          'main'
        ];
        for (const sel of bettingJobsSelectors) {
          try {
            const el = page.locator(sel).first();
            if ((await el.count()) > 0) {
              const text = await el.innerText();
              if (text && text.length > 200 && text.length < 50000) {
                job_description = text.trim();
                break;
              }
            }
          } catch (_) {}
        }
        if (!job_description || job_description.length < 100) {
          const found = await page.evaluate(() => {
            const keywords = /responsibilities|requirements|about the role|qualifications|experience|product manager/i;
            for (const el of document.querySelectorAll('div[class], section[class], main div')) {
              const text = (el.textContent || '').trim();
              if (text.length > 400 && text.length < 50000 && keywords.test(text)) return text;
            }
            return null;
          });
          if (found) job_description = found;
        }
      }

      // LinkedIn: full description is behind "… more" — click to expand, then read expandable-text-box
      if (!isBettingJobs) {
      const expandBtn = page.locator('[data-testid="expandable-text-button"]').first();
      if ((await expandBtn.count()) > 0) {
        try {
          await expandBtn.click();
          await sleep(10000);
        } catch (_) {}
      }
      const expandableBox = page.locator('[data-testid="expandable-text-box"]').first();
      if ((await expandableBox.count()) > 0) {
        const text = await expandableBox.innerText();
        if (text && text.length > 100) job_description = text.trim();
      }

      if (!job_description || job_description.length < 100) {
        for (const sel of descriptionSelectors) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            const text = await el.innerText();
            if (text && text.length > 100) {
              job_description = text.trim();
              break;
            }
          }
        } catch (_) {}
        }
      }

      if (!job_description || job_description.length < 100) {
        const found = await page.evaluate(() => {
          const candidates = document.querySelectorAll('div[class], section[class], main div');
          const keywords = /responsibilities|requirements|about the role|qualifications|experience|product manager/i;
          for (const el of candidates) {
            const text = (el.textContent || '').trim();
            if (text.length > 400 && text.length < 50000 && keywords.test(text)) {
              return text;
            }
          }
          return null;
        });
        if (found && found.length > 100) job_description = found;
      }
      }

      // Fallback: extract from page HTML (JSON-LD, embedded JSON, or inline description)
      if (!job_description || job_description.length < 100) {
        const html = await page.content();
        const ldJsonMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        if (ldJsonMatch) {
          for (const block of ldJsonMatch) {
            const inner = block.replace(/<script[^>]*>([\s\S]*)<\/script>/i, '$1').trim();
            try {
              const data = JSON.parse(inner);
              const item = Array.isArray(data) ? data.find((o) => o['@type'] === 'JobPosting' || o.description) : data;
              const desc = item?.description || item?.articleBody;
              if (desc && typeof desc === 'string' && desc.length > 100) {
                job_description = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                break;
              }
            } catch (_) {}
          }
        }
        if (!job_description || job_description.length < 100) {
          const descMatch = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (descMatch && descMatch[1]) {
            try {
              const unescaped = JSON.parse('"' + descMatch[1].replace(/\\"/g, '"') + '"');
              if (unescaped && unescaped.length > 100) job_description = unescaped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            } catch (_) {}
          }
        }
        if (!job_description || job_description.length < 100) {
          const fragmentMatch = html.match(/jobPostingCard|jobDetails|"description"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]+)"/);
          if (fragmentMatch && fragmentMatch[1] && fragmentMatch[1].length > 100) {
            job_description = fragmentMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }
      }

      let pageTitle = job.title;
      for (const sel of titleSelectors) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            const text = await el.innerText();
            if (text && text.length > 0) {
              pageTitle = text.trim();
              break;
            }
          }
        } catch (_) {}
      }

      let company = '';
      for (const sel of companySelectors) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            const text = await el.innerText();
            if (text && text.length > 0 && text.length < 100) {
              company = text.trim();
              break;
            }
          }
        } catch (_) {}
      }

      if (job_description.length < 100) {
        console.log('no description');
        const fallbackTitle = (!pageTitle || /^View job$/i.test(pageTitle)) ? '—' : pageTitle;
        const noDescRecord = { ...job, job_title: fallbackTitle, title: fallbackTitle, company: company || '—', job_description: '', error: 'no_description' };
        if (onlyBettingJobs) upsertResult(noDescRecord); else results.push(noDescRecord);
        saveResults();
      } else {
        const trimMarkers = /\n(?:… more|See more jobs|Set alert for similar|Based on LinkedIn data)/i;
        const trimmed = trimMarkers.test(job_description) ? job_description.split(trimMarkers)[0].trim() : job_description;
        const start = /About the job|About the role|Job description/i.exec(trimmed);
        const core = start ? trimmed.slice(trimmed.indexOf(start[0])) : trimmed;
        const finalDesc = core.length > 200 ? core : trimmed;
        console.log('ok');
        const emptyOrViewJob = !pageTitle || pageTitle.trim() === '' || /^View job$/i.test(pageTitle.trim());
        const finalTitle = emptyOrViewJob && finalDesc.length >= 50 ? (deriveTitleFromDescription(finalDesc) || pageTitle) : pageTitle;
        const jobTitle = (finalTitle && finalTitle.trim()) ? finalTitle.trim() : '—';
        const record = {
          ...job,
          job_title: jobTitle,
          title: jobTitle,
          company: company || '—',
          work_type: 'Remote',
          job_description: finalDesc
        };
        if (onlyBettingJobs) upsertResult(record); else results.push(record);
        saveResults();
        const jobId = getJobIdFromUrl(job.url);
        if (jobId) saveJobToJobsDir(jobId, { url: job.url, job_title: jobTitle, company: company || '—', work_type: 'Remote', job_description: finalDesc });
      }
      fetchCount++;
      if (maxFetches > 0 && fetchCount >= maxFetches) {
        console.log(`\nReached --max-fetches=${maxFetches}; next batch will run automatically.`);
        break;
      }
    } catch (err) {
      console.log('error:', err.message || err);
      const errRecord = { ...job, error: err.message || 'error' };
      if (onlyBettingJobs) upsertResult(errRecord); else results.push(errRecord);
      saveResults();
      fetchCount++;
      if (maxFetches > 0 && fetchCount >= maxFetches) {
        console.log(`\nReached --max-fetches=${maxFetches}; next batch will run automatically.`);
        break;
      }
    }

    if (k < jobsToFetch.length - 1) await sleep(DELAY_MS);
  }

  await context.close();

  // When using --max-fetches we may have broken early; merge with existing file so we don't overwrite other jobs
  const normalizeUrl = (u) => (u || '').replace(/\?.*$/, '').replace(/\/$/, '');
  const resultsByUrl = new Map();
  results.forEach((r) => { if (r && r.url) resultsByUrl.set(normalizeUrl(r.url), r); });
  const merged = jobs.map((j) => resultsByUrl.get(normalizeUrl(j.url)) || existingByUrl.get(normalizeUrl(j.url)) || j);
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');
  const withDesc = merged.filter((r) => r.job_description && r.job_description.length >= 100).length;
  console.log(`\nWrote ${merged.length} jobs (${withDesc} with description) to ${path.relative(VAULT, outPath)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
