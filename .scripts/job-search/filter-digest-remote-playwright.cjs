#!/usr/bin/env node
/**
 * Filter LinkedIn digest to remote-only using a real browser (Playwright) with saved LinkedIn session.
 *
 * First time: run with --login to open browser, log in to LinkedIn, then press Enter in terminal.
 * Session is saved in 00-Inbox/Job_Search/.playwright-linkedin and reused next time.
 *
 * Usage:
 *   npm run job-search:linkedin-login   # one-time: open browser, log in, press Enter
 *   npm run job-search:filter-remote   # filter today's digest (or pass path to .md file)
 *
 *   node filter-digest-remote-playwright.cjs [path-to-linkedin-jobs-YYYY-MM-DD.md]
 *   node filter-digest-remote-playwright.cjs --login
 *   node filter-digest-remote-playwright.cjs --batch=15   # process 15 per run, then exit (resume next run)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { VAULT, DIGESTS_DIR, DATA_DIR, PROFILE_EXTENSION, ensureDirs } = require('./job-search-paths.cjs');

// Load .env for LINKEDIN_EMAIL / LINKEDIN_PASSWORD (auto-login)
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}
const DEFAULT_FILE = path.join(DIGESTS_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);
const FILTER_STATE_FILE = path.join(DATA_DIR, 'digest-filter-state.json');

const DELAY_BETWEEN_PAGES_MS = 10000;
const PAGE_WAIT_AFTER_NAV_MS = 10000;
const DEFAULT_BATCH_SIZE = 15;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function getJobViewUrl(url) {
  const id = getJobId(url);
  return id ? `https://www.linkedin.com/comm/jobs/view/${id}` : url;
}

function isLoginOrAuthwallPage(html) {
  if (!html) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('authwall') ||
    /sign in to linkedin|log in to linkedin|вход в linkedin/i.test(html) ||
    (html.length < 3000 && /login|signin|password/i.test(lower))
  );
}

function getWorkTypeFromPage(html) {
  if (!html || html.length < 500) return 'unknown';
  const lower = html.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/\bon-?site\b|onsite\b|in-?office\b|in office\b|in-?person\b|in person\b/.test(lower)) return 'on-site';
  if (/\bremote\b/.test(lower)) return 'remote';
  if (/workPlaceType["\s:]+(?:hybrid|HYBRID)/.test(html)) return 'hybrid';
  if (/workPlaceType["\s:]+(?:on-?site|ONSITE|on_site)/.test(html)) return 'on-site';
  if (/workPlaceType["\s:]+(?:remote|REMOTE)/.test(html)) return 'remote';
  return 'unknown';
}

function isJobClosed(html) {
  if (!html || html.length < 100) return false;
  // Only treat as closed when the phrase appears as visible status (inside tag content), not in tips/footer/long text.
  const inTagContent = />\s*[^<]{0,100}(?:no longer accepting applications|this (?:job|position) (?:is )?no longer accepting|applications? (?:are )?closed|position (?:is )?closed)\s*</i;
  if (inTagContent.test(html)) return true;
  if (/<[^>]+>\s*No longer accepting applications\s*</i.test(html)) return true;
  return false;
}

function getCompanyFromPage(html) {
  if (!html || html.length < 200) return '';
  const m1 = html.match(/hiringOrganization["\s:]+(?:\{[^}]*"name"\s*:\s*"([^"]+)"|"name"\s*:\s*"([^"]+)")/);
  if (m1) return (m1[1] || m1[2] || '').trim().slice(0, 80);
  const m2 = html.match(/"companyName"\s*:\s*"([^"]+)"/);
  if (m2) return m2[1].trim().slice(0, 80);
  const m3 = html.match(/job-details-jobs-unified-top-card__company-name[^>]*>[\s\S]*?<\/span>/i);
  if (m3) {
    const inner = m3[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (inner.length > 0 && inner.length < 100) return inner;
  }
  return '';
}

/** Parse LinkedIn job page <title>: usually "Job Title | Company | LinkedIn" */
function parseTitleAndCompanyFromPageTitle(pageTitle) {
  if (!pageTitle || typeof pageTitle !== 'string') return { title: '', company: '' };
  const parts = pageTitle.split(/\s*\|\s*/).map((s) => s.trim());
  if (parts.length >= 3 && parts[parts.length - 1].toLowerCase() === 'linkedin') {
    return { title: parts[0].slice(0, 120), company: parts[1].slice(0, 80) };
  }
  if (parts.length >= 2) {
    return { title: parts[0].slice(0, 120), company: parts[1].slice(0, 80) };
  }
  return { title: parts[0] ? parts[0].slice(0, 120) : '', company: '' };
}

const GENERIC_LINK_TEXTS = /^View job\.?$/i;
function isGenericLinkText(linkText) {
  if (!linkText || !linkText.trim()) return true;
  const t = linkText.split(' · ')[0].trim();
  return GENERIC_LINK_TEXTS.test(t) || t.length < 4;
}

// Captures: prefix, link text, ](, url, )
const JOB_LINE_RE = /^(- \[[ x\-]\] \[)([^\]]*)(\]\()(https?:[^)]+)(\))$/;

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runLogin() {
  const { chromium } = require('playwright');
  const linkedinEmail = process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_EMAIL.trim();
  const linkedinPassword = process.env.LINKEDIN_PASSWORD;

  const context = await chromium.launchPersistentContext(PROFILE_EXTENSION, {
    headless: false,
    args: ['--no-sandbox']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });

  if (linkedinEmail && linkedinPassword) {
    console.log('Auto-login: filling form from .env (LINKEDIN_EMAIL / LINKEDIN_PASSWORD)…');
    const submitSel = 'button[type="submit"], input[type="submit"], button[data-id="sign-in-form__submit-btn"]';
    await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => null);
    const passInput = page.locator('input[type="password"]').first();
    const hasPassword = (await passInput.count()) > 0 && (await passInput.isVisible().catch(() => false));

    if (hasPassword) {
      // Email may already be pre-filled (LinkedIn shows "email entered, enter password" state)
      const emailSelectors = [
        'input[type="email"]',
        'input[autocomplete="email"]',
        'input[id="username"]:not([type="hidden"])',
        'form input[type="text"]'
      ];
      let filledEmail = false;
      for (const sel of emailSelectors) {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
          await el.fill(linkedinEmail);
          filledEmail = true;
          break;
        }
      }
      if (!filledEmail) {
        // Only password field visible (email already entered or remembered)
        console.log('Only password field visible; filling password and submitting.');
      }
      await passInput.fill(linkedinPassword);
      await sleep(10000);
      await page.locator(submitSel).first().click();
      await page.waitForURL(/\/(feed|mynetwork|jobs|checkpoint)/, { timeout: 25000 }).catch(() => null);
      if (page.url().includes('/login') && !page.url().includes('/checkpoint')) {
        console.log('Still on login page (2FA or captcha?). Complete login in the browser, then press Enter.');
        await question('Press Enter when done to save the session.\n');
      } else {
        console.log('Logged in. Saving session…');
        await sleep(10000);
      }
    } else {
      console.log('Password field not found; log in manually and press Enter.');
      await question('After you have logged in, press Enter to close and save the session.\n');
    }
  } else {
    console.log('Opening browser. Log in to LinkedIn, then return here and press Enter.');
    console.log('(Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env for auto-login.)');
    await question('After you have logged in, press Enter to close the browser and save the session.\n');
  }

  await context.close();
  console.log('Session saved in', path.relative(VAULT, PROFILE_EXTENSION));
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

function saveFilterState(digestName, stateSlice) {
  ensureDirs();
  let all = {};
  if (fs.existsSync(FILTER_STATE_FILE)) {
    try {
      all = JSON.parse(fs.readFileSync(FILTER_STATE_FILE, 'utf8'));
    } catch (e) {}
  }
  all[digestName] = stateSlice;
  fs.writeFileSync(FILTER_STATE_FILE, JSON.stringify(all, null, 2), 'utf8');
}

function applyStateToDigest(lines, jobLineIndices, stateResults, JOB_LINE_RE) {
  const toRemove = new Set();
  const skipBlankAfter = new Set();
  const lineUpdates = new Map();
  for (let k = 0; k < jobLineIndices.length; k++) {
    const lineIdx = jobLineIndices[k];
    const line = lines[lineIdx];
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const url = m[4];
    const jobId = getJobId(url);
    const saved = stateResults[jobId];
    if (!saved) continue;
    if (saved.remove) {
      toRemove.add(lineIdx);
      if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
    } else if (saved.newLine) {
      lineUpdates.set(lineIdx, saved.newLine);
    }
  }
  return { toRemove, skipBlankAfter, lineUpdates };
}

function writeDigestFromState(filePath, lines, toRemove, skipBlankAfter, lineUpdates) {
  let bestCount = 0;
  let otherCount = 0;
  let inBest = true;
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (toRemove.has(i) || skipBlankAfter.has(i)) continue;
    const line = lines[i];
    if (line === '## Other (PM roles, check if relevant)') inBest = false;
    if (JOB_LINE_RE.test(line)) {
      if (inBest) bestCount++;
      else otherCount++;
    }
    newLines.push(lineUpdates.has(i) ? lineUpdates.get(i) : line);
  }
  const newContent = newLines.join('\n');
  const headerCountRe = /^\*\*Best match: (\d+)\*\* \| Other: (\d+)$/m;
  const newContent2 = newContent.replace(headerCountRe, (_, _b, _o) => `**Best match: ${bestCount}** | Other: ${otherCount}`);
  fs.writeFileSync(filePath, newContent2, 'utf8');
  return bestCount + otherCount;
}

async function runFilter(filePath, batchSize) {
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const digestName = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  const jobLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (JOB_LINE_RE.test(lines[i])) jobLineIndices.push(i);
  }

  if (jobLineIndices.length === 0) {
    console.log('No job lines found in digest.');
    return;
  }

  const stateSlice = loadFilterState(digestName);
  const stateResults = stateSlice.results || {};
  let toRemove = new Set();
  let skipBlankAfter = new Set();
  let lineUpdates = new Map();
  const applied = applyStateToDigest(lines, jobLineIndices, stateResults, JOB_LINE_RE);
  applied.toRemove.forEach((i) => toRemove.add(i));
  applied.skipBlankAfter.forEach((i) => skipBlankAfter.add(i));
  applied.lineUpdates.forEach((v, k) => lineUpdates.set(k, v));

  const alreadyDone = Object.keys(stateResults).length;
  const remaining = jobLineIndices.filter((idx) => {
    const line = lines[idx];
    const m = line.match(JOB_LINE_RE);
    const jobId = m ? getJobId(m[4]) : null;
    return m && jobId != null && !stateResults[jobId];
  });

  if (remaining.length === 0) {
    const total = writeDigestFromState(filePath, lines, toRemove, skipBlankAfter, lineUpdates);
    console.log(`All ${jobLineIndices.length} jobs already processed. Digest has ${total} remote jobs.`);
    return;
  }

  const { chromium } = require('playwright');
  console.log('Launching browser (saved LinkedIn session). Checking', remaining.length, 'jobs (', alreadyDone, 'already done)…');
  console.log('Browser window will open — LinkedIn often blocks headless, so we use a visible window.\n');

  const context = await chromium.launchPersistentContext(PROFILE_EXTENSION, {
    headless: false,
    args: ['--no-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const afterFeed = page.url();
  if (afterFeed.includes('/login') || afterFeed.includes('/authwall') || afterFeed.includes('/checkpoint')) {
    await context.close();
    console.error('Session expired or not logged in. Run: npm run job-search:linkedin-login');
    process.exit(1);
  }
  await sleep(10000);

  let processedThisRun = 0;
  const totalJobs = jobLineIndices.length;

  for (let k = 0; k < jobLineIndices.length; k++) {
    const lineIdx = jobLineIndices[k];
    const line = lines[lineIdx];
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const jobId = getJobId(m[4]);
    if (jobId == null) continue; // skip non-LinkedIn URLs (e.g. Remotive, WWR, RemoteOK)
    if (stateResults[jobId]) continue;

    const prefix = m[1];
    const linkText = m[2] || '';
    const url = m[4];
    const suffix = m[3] + url + m[5];
    const viewUrl = getJobViewUrl(url);
    process.stdout.write(`  [${k + 1}/${totalJobs}] ${jobId} … `);

    try {
      await page.goto(viewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const finalUrl = page.url();
      if (finalUrl.includes('/login') || finalUrl.includes('/authwall') || finalUrl.includes('/checkpoint')) {
        console.log('not logged in (run: npm run job-search:linkedin-login)');
        continue;
      }
      await sleep(PAGE_WAIT_AFTER_NAV_MS);
      const pageTitle = await page.title();
      const html = await page.content();
      if (isLoginOrAuthwallPage(html)) {
        console.log('not logged in (run: npm run job-search:linkedin-login)');
        continue;
      }
      if (isJobClosed(html)) {
        stateResults[jobId] = { remove: true };
        toRemove.add(lineIdx);
        if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
        console.log('closed (remove)');
      } else {
        const workType = getWorkTypeFromPage(html);
        if (workType === 'hybrid' || workType === 'on-site') {
          stateResults[jobId] = { remove: true };
          toRemove.add(lineIdx);
          if (lines[lineIdx + 1] === '') skipBlankAfter.add(lineIdx + 1);
          console.log(workType + ' (remove)');
        } else {
          const fromPage = parseTitleAndCompanyFromPageTitle(pageTitle);
          const currentTitle = linkText.includes(' · ') ? linkText.split(' · ')[0].trim() : linkText.trim();
          const title = (isGenericLinkText(linkText) && fromPage.title) ? fromPage.title : currentTitle;
          const company = fromPage.company || getCompanyFromPage(html) || '—';
          const typeDisplay = workType.replace(/^./, (c) => c.toUpperCase());
          stateResults[jobId] = { remove: false, newLine: `${prefix}${title} · ${company} · ${typeDisplay}${suffix}` };
          lineUpdates.set(lineIdx, stateResults[jobId].newLine);
          console.log(workType === 'remote' ? 'remote ✓' : 'unknown (keep)');
        }
      }
      processedThisRun++;
    } catch (err) {
      console.log('error:', err.message || err);
    }

    const hitBatchLimit = batchSize < Number.POSITIVE_INFINITY && processedThisRun >= batchSize;
    const periodicSave = batchSize === Number.POSITIVE_INFINITY && processedThisRun > 0 && processedThisRun % DEFAULT_BATCH_SIZE === 0;
    let writtenTotal = 0;
    if (hitBatchLimit || periodicSave) {
      writtenTotal = writeDigestFromState(filePath, lines, toRemove, skipBlankAfter, lineUpdates);
      saveFilterState(digestName, { results: stateResults });
      if (periodicSave) {
        process.stdout.write(`  … progress saved (${Object.keys(stateResults).length}/${totalJobs}).\n`);
      }
    }
    if (hitBatchLimit) {
      await context.close();
      const remainingCount = totalJobs - Object.keys(stateResults).length;
      console.log(`Enriched ${lineUpdates.size} lines; removed ${toRemove.size} (hybrid/on-site/closed).`);
      console.log(`Wrote ${writtenTotal} jobs to ${path.relative(VAULT, filePath)}.`);
      if (remainingCount > 0) {
        console.log(`Processed ${processedThisRun} this run. ${remainingCount} remaining. Run again to continue.`);
      }
      return;
    }

    if (k < jobLineIndices.length - 1) await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  await context.close();
  const total = writeDigestFromState(filePath, lines, toRemove, skipBlankAfter, lineUpdates);
  saveFilterState(digestName, { results: stateResults });
  if (toRemove.size > 0) console.log(`Removed ${toRemove.size} jobs (hybrid/on-site/closed).`);
  if (lineUpdates.size > 0) console.log(`Enriched ${lineUpdates.size} lines with company and work type.`);
  console.log(`Wrote ${total} jobs to ${path.relative(VAULT, filePath)}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const loginMode = args.includes('--login');
  ensureDirs();
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10) || DEFAULT_BATCH_SIZE) : Number.POSITIVE_INFINITY;
  const fileArg = args.filter((a) => a !== '--login' && !a.startsWith('--batch='))[0];
  const filePath = fileArg ? (path.isAbsolute(fileArg) ? fileArg : path.join(DIGESTS_DIR, fileArg)) : DEFAULT_FILE;

  try {
    require.resolve('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install');
    console.error('Then install browser: npx playwright install chromium');
    process.exit(1);
  }

  if (loginMode) {
    await runLogin();
  } else {
    await runFilter(filePath, batchSize);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
