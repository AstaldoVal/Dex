#!/usr/bin/env node
/**
 * Create a Teal resume copy for a job: detect job type (iGaming vs AI/other),
 * pick the right template resume, duplicate it in Teal, and rename to the job title.
 *
 * Usage:
 *   node teal-resume-for-job.cjs --job-title "Senior Product Manager" [--job-id <id>] --job-description "..." [--job-description-file path]
 *   npm run job-search:teal-resume -- --job-title "PM - Cloudbeds" --job-description-file ./job.txt
 *   With --job-id: saves resume→job mapping (00-Inbox/Job_Search/teal/resume-to-job.json) so match-score can load JD by id.
 *
 * Requires: Playwright, Chrome. Uses same Chrome profile as Teal job-tracker (close Chrome before run).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectJobType } = require('./job-search-utils.cjs');
const { TEAL_DIR, ensureDirs, TEAL_CHROME_PROFILE_RESUME } = require('./job-search-paths.cjs');
const { launchTealContext } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
// Default profile for resume-for-job so it can run in parallel with match-score and batch
if (!process.env.TEAL_CHROME_PROFILE) process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_RESUME;

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}
try {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
} catch (_) {}

// Template resume IDs from Teal (edit/preview URL). Override via TEAL_TEMPLATE_IGAMING / TEAL_TEMPLATE_AI if your account uses different IDs.
const TEAL_TEMPLATE_IGAMING = process.env.TEAL_TEMPLATE_IGAMING || '296be353-ba11-4ee7-a827-cb7985cbfa26';
const TEAL_TEMPLATE_AI = process.env.TEAL_TEMPLATE_AI || 'c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9';

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

/** Sanitize job title for use as resume name (safe length, no problematic chars). */
function sanitizeResumeName(title) {
  if (!title || typeof title !== 'string') return 'Resume copy';
  return title
    .trim()
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const getVal = (key) => {
    const i = argv.indexOf(key);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  let jobDescription = getVal('--job-description');
  const descFile = getVal('--job-description-file');
  if (!jobDescription && descFile) {
    const p = path.isAbsolute(descFile) ? descFile : path.resolve(process.cwd(), descFile);
    if (fs.existsSync(p)) jobDescription = fs.readFileSync(p, 'utf8');
  }
  return {
    jobTitle: getVal('--job-title') || '',
    jobDescription: jobDescription || '',
    jobId: getVal('--job-id') || ''
  };
}

/** Persist resumeId -> jobId (and company, title) so match-score can load JD by id. Same file as teal-resume-match-score. */
function saveResumeJobMapping(resumeId, entry) {
  if (!resumeId || !entry || !entry.jobId) return;
  const mapPath = path.join(TEAL_DIR, 'resume-to-job.json');
  let map = {};
  try {
    if (fs.existsSync(mapPath)) map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (_) {}
  map[resumeId] = { jobId: entry.jobId, company: entry.company || '', title: entry.title || '' };
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');
    console.log('[Teal resume] Saved resume→job mapping for JD lookup');
  } catch (_) {}
}

function loadResumeJobMapping() {
  const mapPath = path.join(TEAL_DIR, 'resume-to-job.json');
  try {
    if (fs.existsSync(mapPath)) return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (_) {}
  return {};
}

/** Persist jobId -> exact resume name set in Teal so match-score can search by this name (step 8). */
const CREATED_RESUME_NAMES_PATH = path.join(TEAL_DIR, 'created-resume-names.json');
function saveCreatedResumeName(jobId, resumeName) {
  if (!jobId || !resumeName || typeof resumeName !== 'string') return;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    let map = {};
    if (fs.existsSync(CREATED_RESUME_NAMES_PATH)) {
      try {
        map = JSON.parse(fs.readFileSync(CREATED_RESUME_NAMES_PATH, 'utf8'));
      } catch (_) {}
    }
    map[String(jobId)] = resumeName.trim();
    fs.writeFileSync(CREATED_RESUME_NAMES_PATH, JSON.stringify(map, null, 2), 'utf8');
    console.log('[Teal resume] Saved created name for step 8 search:', resumeName.slice(0, 50) + (resumeName.length > 50 ? '…' : ''));
  } catch (_) {}
}

async function main() {
  ensureDirs();
  const { jobTitle, jobDescription, jobId } = parseArgs();
  if (!jobTitle.trim()) {
    console.error('Usage: node teal-resume-for-job.cjs --job-title "Job title" [--job-description "..." | --job-description-file path]');
    process.exit(1);
  }

  if (jobId) {
    const map = loadResumeJobMapping();
    const existing = Object.entries(map).find(([_, entry]) => entry && entry.jobId === String(jobId));
    if (existing) {
      console.log('[Teal resume] Resume for this job already exists (jobId=' + jobId + ', resumeId=' + existing[0] + '). Skip duplicate.');
      process.exit(0);
    }
  }

  const jobType = detectJobType(jobDescription, jobTitle);
  const templateId = jobType === 'igaming' ? TEAL_TEMPLATE_IGAMING : TEAL_TEMPLATE_AI;
  const resumeName = sanitizeResumeName(jobTitle);

  console.log('[Teal resume] Job type:', jobType);
  console.log('[Teal resume] Template:', jobType === 'igaming' ? 'iGaming/Compliance' : 'AI/other');
  console.log('[Teal resume] New resume name:', resumeName);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const launchOptions = {
    headless: false,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
  };
  let context;
  try {
    const result = await launchTealContext(playwright, launchOptions);
    context = result.context;
    console.log('[Teal resume] Using Chrome profile:', result.profileDir);
  } catch (e) {
    console.error('Failed to launch Chrome:', e.message);
    process.exit(1);
  }

  await sleep(2000);
  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  const listUrl = 'https://app.tealhq.com/resume-builder/resumes';

  loadTealEnv(VAULT);

  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for list to load: "Loading resumes" overlay disappears and resume table/cards render
    try {
      await page.locator('text=Loading resumes').waitFor({ state: 'hidden', timeout: 15000 });
    } catch (_) {
      // ignore timeout; continue and try to find template
    }
    // Wait for at least one resume link (list rendered)
    try {
      await page.locator('a[href*="/resumes/"]').first().waitFor({ state: 'visible', timeout: 10000 });
    } catch (_) {
      // continue; template check below will fail with clear message
    }
    // New Teal UI: resumes are often rendered in a table under "Recent Resumes".
    // If the loader stayed visible or the table is still mounting, the snapshot may only contain the loader,
    // which breaks template detection and forces us into the preview-page fallback.
    // Give the table a bit more time to appear before we start searching for the template row.
    try {
      await page
        .locator(
          'table[class*="caption-bottom"], table:has-text("Recent Resumes"), table:has-text("Resume Name")'
        )
        .first()
        .waitFor({ state: 'visible', timeout: 20000 });
    } catch (_) {
      // If there is no table (card view only), this is fine – the card-view fallback below will handle it.
    }
    await sleep(1000);

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      try {
        await page.locator('text=Loading resumes').waitFor({ state: 'hidden', timeout: 15000 });
      } catch (_) {}
      try {
        await page.locator('a[href*="/resumes/"]').first().waitFor({ state: 'visible', timeout: 10000 });
      } catch (_) {}
      await sleep(1000);
      currentUrl = page.url();
    }
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login')) {
      console.error('[Teal resume] Вход не прошёл. Проверьте TEAL_EMAIL/TEAL_PASSWORD в .env.');
      await context.close();
      process.exit(1);
    }

    // Duplicate only the specific template (by ID): find the EXACT row/card for the link that points to templateId, then its menu (never the first in list)
    // Teal has used slightly different aria-labels for the three-dots menu in different UI versions.
    // Support all known variants to make the selector resilient to minor changes.
    const menuSelector =
      'button[aria-label="Resume Menu"], ' +
      'button[aria-label*="resume menu" i], ' +
      'button[aria-label*="more options" i], ' +
      'button[aria-label*="options" i]';
    const linkSelector = 'a[href*="' + templateId.replace(/"/g, '') + '"]';

    // 1) Table: tr that contains the link to this templateId and the menu
    let container = page.locator('tr').filter({ has: page.locator(linkSelector) }).filter({ has: page.locator(menuSelector) }).first();
    if ((await container.count()) === 0 || !(await container.isVisible())) {
      // 2) Card view: innermost div that contains the link to templateId and the menu (closest ancestor of the link that has the menu — avoids matching a wrapper around the whole list)
      container = page.locator('xpath=//a[contains(@href, "' + templateId + '")]/ancestor::div[.//button[@aria-label="Resume Menu"]][1]').first();
    }
    // If not found, scroll the list and retry (template may be below the fold)
    for (let scrollAttempt = 0; scrollAttempt < 4 && ((await container.count()) === 0 || !(await container.isVisible())); scrollAttempt++) {
      await page.evaluate(() => {
        const list = document.querySelector('[data-testid="resume-list"]') || document.querySelector('main') || document.body;
        if (list) list.scrollBy(0, 400);
      });
      await sleep(800);
      container = page.locator('tr').filter({ has: page.locator(linkSelector) }).filter({ has: page.locator(menuSelector) }).first();
      if ((await container.count()) === 0 || !(await container.isVisible())) {
        container = page.locator('xpath=//a[contains(@href, "' + templateId + '")]/ancestor::div[.//button[@aria-label="Resume Menu"]][1]').first();
      }
    }
    let usedDirectLink = false;
    let idsBefore = new Set();
    let menuButton = null;

    if ((await container.count()) === 0 || !(await container.isVisible())) {
      console.log('[Teal resume] Template not in list; opening direct link.');
      const directUrl = 'https://app.tealhq.com/resume-builder/resumes/' + templateId;
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
      const directDup = page.locator('button:has-text("Duplicate")').first();
      if ((await directDup.count()) > 0 && (await directDup.isVisible())) {
        usedDirectLink = true;
        idsBefore = new Set([templateId]);
      } else {
        const directMenu = page.locator('button[aria-label="Resume Menu"], button[aria-label*="enu" i], button[aria-label*="ore" i]').first();
        if ((await directMenu.count()) > 0 && (await directMenu.isVisible())) {
          usedDirectLink = true;
          menuButton = directMenu;
          idsBefore = new Set([templateId]);
        }
      }
      if (!usedDirectLink) {
        console.error('[Teal resume] Template resume not found in list. ID:', templateId);
        console.error('[Teal resume] Override in .env: TEAL_TEMPLATE_AI=<your-resume-id> or TEAL_TEMPLATE_IGAMING=<id> (ID from Teal URL .../resumes/<id>).');
        console.error('[Teal resume] Open', listUrl, 'and ensure the resume is visible (scroll or switch view).');
        const htmlPath = path.join(TEAL_DIR, 'teal-resume-list-debug.html');
        fs.writeFileSync(htmlPath, await page.content(), 'utf8');
        console.error('[Teal resume] Page HTML saved to:', htmlPath);
        await context.close();
        process.exit(1);
      }
    }

    if (!usedDirectLink) {
      await container.scrollIntoViewIfNeeded();
      await sleep(400);
      menuButton = container.locator(menuSelector).first();
      if ((await menuButton.count()) === 0 || !(await menuButton.isVisible())) {
        console.error('[Teal resume] Could not find "Resume Menu" (three dots) in template row. Template ID:', templateId);
        console.error('[Teal resume] Expected: button[aria-label="Resume Menu"] in the same row/card as the resume link.');
        const htmlPath = path.join(TEAL_DIR, 'teal-resume-list-debug.html');
        fs.writeFileSync(htmlPath, await page.content(), 'utf8');
        console.error('[Teal resume] Page HTML saved to:', htmlPath);
        await context.close();
        process.exit(1);
      }
      const linksBeforeArr = await page.locator('a[href*="/resumes/"]').all();
      for (const link of linksBeforeArr) {
        const href = await link.getAttribute('href');
        const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
        if (id) idsBefore.add(id);
      }
    }

    // Optional: capture new resume ID from network when Duplicate is called
    let capturedNewResumeId = null;
    const captureResumeId = (response) => {
      if (capturedNewResumeId) return;
      const req = response.request();
      const url = response.url();
      if (!url || !url.includes('tealhq.com') || req.method() !== 'POST') return;
      if (!url.includes('resume') && !url.includes('duplicate') && !url.includes('copy')) return;
      response.body().then((body) => {
        try {
          const text = body.toString();
          const data = JSON.parse(text);
          const id = data?.id || data?.data?.id || data?.resume?.id || data?.resumeId;
          if (id && typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id) && id !== templateId) {
            capturedNewResumeId = id;
          }
        } catch (_) {
          const uuidRe = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
          const ids = text.match(uuidRe) || [];
          for (const id of ids) {
            if (id !== templateId) {
              capturedNewResumeId = id;
              return;
            }
          }
        }
      }).catch(() => {});
    };
    page.on('response', captureResumeId);

    console.log('[Teal resume] Duplicating template:', templateId);
    if (usedDirectLink && !menuButton) {
      const directDup = page.locator('button:has-text("Duplicate")').first();
      if ((await directDup.count()) > 0 && (await directDup.isVisible())) {
        await directDup.click();
        await sleep(2000);
      }
    } else if (menuButton && (await menuButton.count()) > 0 && (await menuButton.isVisible())) {
      await menuButton.click();
      await sleep(1200);
      const duplicateItem = page.locator('[role="menuitem"][aria-label="Duplicate resume"]').first();
      let clicked = false;
      if ((await duplicateItem.count()) > 0 && (await duplicateItem.isVisible())) {
        await duplicateItem.click();
        clicked = true;
      }
      if (!clicked) {
        const fallback = page.locator('[role="menuitem"]:has-text("Duplicate"), [role="menuitem"]:has-text("Copy")').first();
        if ((await fallback.count()) > 0 && (await fallback.isVisible())) {
          await fallback.click();
          clicked = true;
        }
      }
      if (!clicked) {
        const byText = page.getByRole('menuitem', { name: /Duplicate|Copy/i }).first();
        if ((await byText.count()) > 0 && (await byText.isVisible())) {
          await byText.click();
          clicked = true;
        }
      }
      if (!clicked) {
        console.error('[Teal resume] Menu opened but "Duplicate"/"Copy" item not found. Expected [role="menuitem"] with Duplicate or Copy.');
        const htmlPath = path.join(TEAL_DIR, 'teal-resume-menu-debug.html');
        fs.writeFileSync(htmlPath, await page.content(), 'utf8');
        console.error('[Teal resume] Page HTML saved to:', htmlPath);
        await context.close();
        process.exit(1);
      }
    } else if (!usedDirectLink) {
      console.error('[Teal resume] No menu button to duplicate. Template ID:', templateId);
      await context.close();
      process.exit(1);
    }

    // Wait for new tab (Teal often opens duplicate in new tab) or for list to update
    let newResumeId = capturedNewResumeId || null;
    try {
      const newPage = await Promise.race([
        context.waitForEvent('page', { timeout: 12000 }),
        sleep(5000).then(() => null)
      ]);
      if (newPage) {
        const u = newPage.url();
        const m = u.match(/\/resumes\/([a-f0-9-]+)(?:\/|$)/);
        if (m && m[1] !== templateId) {
          page = newPage;
          newResumeId = m[1];
          console.log('[Teal resume] Duplicate opened in new tab:', newResumeId);
          await sleep(3000);
        }
      }
    } catch (_) {}

    await sleep(newResumeId ? 1000 : 2500);
    page.off('response', captureResumeId);
    if (!newResumeId) newResumeId = capturedNewResumeId || null;

    // If still no id, check existing tabs (new tab may have been created before listener)
    if (!newResumeId) {
      const pagesAfter = context.pages();
      for (const p of pagesAfter) {
      if (p === page) continue;
      const u = p.url();
      const m = u.match(/\/resumes\/([a-f0-9-]+)(?:\/|$)/);
      if (m && m[1] !== templateId) {
        page = p;
        newResumeId = m[1];
        console.log('[Teal resume] Duplicate in existing tab:', newResumeId);
        await sleep(2000);
        break;
      }
    }
    }

    if (!newResumeId) {
      // Wait for the new duplicate to appear in the list (link with id not in idsBefore)
      const idsBeforeJson = JSON.stringify([...idsBefore]);
      try {
      const newIdFromPage = await page.waitForFunction(
        (json) => {
          const ids = new Set(JSON.parse(json));
          const links = document.querySelectorAll('a[href*="/resumes/"]');
          for (const a of links) {
            const m = (a.getAttribute('href') || '').match(/\/resumes\/([a-f0-9-]+)/);
            if (m && !ids.has(m[1])) return m[1];
          }
          return null;
        },
        idsBeforeJson,
        { timeout: 12000 }
      );
      const newId = await newIdFromPage.jsonValue();
      if (newId) capturedNewResumeId = newId;
      } catch (_) {}

      const urlAfter = page.url();
      newResumeId = capturedNewResumeId || newResumeId || null;
      if (capturedNewResumeId) {
      console.log('[Teal resume] Duplicate created (from network):', newResumeId);
    }
    const onResumePage = /\/resumes\/([a-f0-9-]+)(?:\/|$)/.test(urlAfter);
    if (onResumePage && !newResumeId) {
      const m = urlAfter.match(/\/resumes\/([a-f0-9-]+)(?:\/|$)/);
      newResumeId = m ? m[1] : null;
      if (newResumeId && newResumeId !== templateId) {
        console.log('[Teal resume] Duplicate opened in same tab:', newResumeId);
      }
    }

    // If we have the new ID from network, open it directly
    if (newResumeId && (!onResumePage || urlAfter.includes(templateId))) {
      const resumePageUrl = 'https://app.tealhq.com/resume-builder/resumes/' + newResumeId;
      await page.goto(resumePageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
      console.log('[Teal resume] Opened duplicate:', newResumeId);
    } else if (!onResumePage || urlAfter.includes(templateId)) {
      let duplicateLink = null;
      // First: link whose id was not on the page before duplicate (the new one)
      const linksAfter = await page.locator('a[href*="/resumes/"]').all();
      for (const link of linksAfter) {
        const href = await link.getAttribute('href');
        const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
        if (id && id !== templateId && !idsBefore.has(id)) {
          duplicateLink = link;
          newResumeId = id;
          break;
        }
      }
      if (!duplicateLink) {
      const nextRowLink = page.locator(
        'xpath=//tr[.//a[contains(@href, "/resumes/' + templateId + '")]]/following-sibling::tr[1]//a[contains(@href, "/resumes/")]'
      ).first();
      const nextCardLink = page.locator(
        'xpath=//*[.//a[contains(@href, "/resumes/' + templateId + '")]]/following-sibling::*[1]//a[contains(@href, "/resumes/")]'
      ).first();
      for (const link of [nextRowLink, nextCardLink]) {
        if ((await link.count()) === 0 || !(await link.isVisible())) continue;
        const href = await link.getAttribute('href');
        const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
        if (id && id !== templateId) {
          duplicateLink = link;
          newResumeId = id;
          break;
        }
      }
      }
      if (!duplicateLink) {
        // New duplicate often shows "Resume - Created on ..." or "Copy of ..."
        const createdOnRow = page.getByText(/Resume\s*-\s*Created on/i).locator('xpath=ancestor::tr[1]').first();
        const createdOnCard = page.getByText(/Resume\s*-\s*Created on/i).locator('xpath=ancestor::*[.//a[contains(@href,"/resumes/")]][1]').first();
        for (const row of [createdOnRow, createdOnCard]) {
          if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) {
            const link = row.locator('a[href*="/resumes/"]').first();
            if ((await link.count()) > 0) {
              const href = await link.getAttribute('href');
              const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
              if (id && id !== templateId) {
                duplicateLink = link;
                newResumeId = id;
                break;
              }
            }
          }
        }
      }
      if (!duplicateLink) {
        const copyOfRows = await page.getByText(/Copy of/i).locator('xpath=ancestor::tr[1]').all();
        const copyOfCards = await page.getByText(/Copy of/i).locator('xpath=ancestor::*[.//a[contains(@href,"/resumes/")]][1]').all();
        for (const row of [...copyOfRows, ...copyOfCards]) {
          const link = row.locator('a[href*="/resumes/"]').first();
          if ((await link.count()) === 0) continue;
          const href = await link.getAttribute('href');
          const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
          if (id && id !== templateId) {
            duplicateLink = link;
            newResumeId = id;
            break;
          }
        }
      }
      if (!duplicateLink) {
        const resumeLinks = await page.locator('a[href*="/resumes/"]').all();
        for (const link of resumeLinks) {
          const href = await link.getAttribute('href');
          const id = href ? href.match(/\/resumes\/([a-f0-9-]+)/)?.[1] : null;
          if (id && id !== templateId) {
            duplicateLink = link;
            newResumeId = id;
            console.error('[Teal resume] Opening first non-template (may be wrong resume).');
            break;
          }
        }
      }
      if (duplicateLink) {
        const href = await duplicateLink.getAttribute('href');
        if (href) newResumeId = (href.match(/\/resumes\/([a-f0-9-]+)/) || [])[1];
        // Do not rely on click to navigate — Teal may stay on list. We will goto detail page below.
      } else {
        console.error('[Teal resume] Could not find duplicate. Open it manually.');
      }
    }
    }

    // Always navigate to resume detail page (duplicate leaves us on list; rename must happen on detail page)
    if (newResumeId) {
      const currentUrl = page.url();
      if (!currentUrl.includes('/resumes/' + newResumeId + '/') && !currentUrl.endsWith('/resumes/' + newResumeId)) {
        console.log('[Teal resume] Navigating to resume detail page:', newResumeId);
        await page.goto('https://app.tealhq.com/resume-builder/resumes/' + newResumeId, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(4000);
      }
    } else {
      console.error('[Teal resume] No new resume ID; cannot open detail page to rename.');
      await context.close();
      process.exit(1);
    }

    // Must be on detail page to rename (URL contains this resume id)
    const urlBeforeRename = page.url();
    if (!urlBeforeRename.includes('/resumes/' + newResumeId)) {
      console.error('[Teal resume] Not on resume detail page; URL:', urlBeforeRename);
      await context.close();
      process.exit(1);
    }

    // Wait for resume detail page to fully render (title field may load after)
    await sleep(2000);

    // On resume page: find and fill the resume name. Teal may show "Resume - Created on ..." or "Copy of ...".
    // Strategy: try input by aria-label/placeholder first; then input that has default text; then contenteditable.
    const nameSelectors = [
      'input[aria-label="Resume Title"]',
      'input[aria-label*="Resume" i][aria-label*="Title" i]',
      'input[placeholder*="resume name" i]',
      'input[placeholder*="Resume name" i]',
      'input[aria-label*="resume name" i]',
      'input[placeholder*="name" i]',
      'header input',
      'input[type="text"]'
    ];
    let nameSet = false;
    for (const sel of nameSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0 && (await el.isVisible())) {
          await el.click();
          await sleep(300);
          await el.evaluate((node) => {
            node.focus();
            node.select && node.select();
            if (node.setSelectionRange) node.setSelectionRange(0, (node.value || '').length);
          });
          await page.keyboard.press('Backspace');
          await sleep(100);
          await el.fill(resumeName);
          await sleep(300);
          await el.evaluate((node) => {
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof node.blur === 'function') node.blur();
          });
          await sleep(500);
          const box = await el.boundingBox();
          if (box) await page.mouse.click(box.x + box.width + 30, box.y + box.height / 2);
          else await page.keyboard.press('Tab');
          await sleep(2000);
          nameSet = true;
          console.log('[Teal resume] Renamed to:', resumeName);
          break;
        }
      } catch (_) {}
    }
    if (!nameSet) {
      // Fallback: try contenteditable (e.g. title as editable span)
      const editables = await page.locator('[contenteditable="true"]').all();
      for (const el of editables) {
        try {
          const text = (await el.textContent().catch(() => '') || '').trim();
          const isLikelyTitle = /Resume|Copy of|Created on|Untitled|^$/.test(text) && text.length < 80;
          if (!isLikelyTitle) continue;
          if (!(await el.isVisible())) continue;
          await el.click();
          await sleep(200);
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
          await sleep(50);
          await page.keyboard.press('Backspace');
          await sleep(100);
          await page.evaluate((name) => navigator.clipboard.writeText(name), resumeName);
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
          await sleep(300);
          await el.evaluate((node) => {
            node.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof node.blur === 'function') node.blur();
          });
          await sleep(1500);
          nameSet = true;
          console.log('[Teal resume] Renamed to (contenteditable):', resumeName);
          break;
        } catch (_) {}
      }
    }
    if (!nameSet) {
      // Last resort: find any visible input whose value looks like default resume name
      try {
        const inputs = await page.locator('input[type="text"], input:not([type])').all();
        for (const el of inputs.slice(0, 10)) {
          if (!(await el.isVisible().catch(() => false))) continue;
          const val = (await el.inputValue().catch(() => '') || '').trim();
          if (!val || val === resumeName) continue;
          if (/Resume\s*-\s*Created on|Copy of|Untitled|^Resume\s*$/.test(val) && val.length < 100) {
            await el.click();
            await sleep(200);
            await el.fill(resumeName);
            await el.evaluate((n) => { n.dispatchEvent(new Event('input', { bubbles: true })); n.blur && n.blur(); });
            await sleep(1500);
            nameSet = true;
            console.log('[Teal resume] Renamed to (by value):', resumeName);
            break;
          }
        }
      } catch (_) {}
    }
    if (!nameSet) {
      console.error('[Teal resume] Could not find resume name field on detail page; rename manually in Teal.');
      await context.close();
      process.exit(1);
    }

    // Give Teal time to persist; optionally verify after reload
    await sleep(2000);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(3000);
      const checkInput = page.locator('input[aria-label="Resume Title"], input[placeholder*="resume" i], input[placeholder*="name" i]').first();
      if ((await checkInput.count()) > 0) {
        const valueAfter = (await checkInput.inputValue().catch(() => '') || '').trim();
        if (valueAfter === resumeName) console.log('[Teal resume] Title verified after reload.');
        else if (valueAfter && valueAfter.length > 0) console.log('[Teal resume] After reload title shows:', valueAfter.slice(0, 60) + (valueAfter.length > 60 ? '…' : ''));
      }
    } catch (_) {}

    // Save if there's a Save button
    const saveBtn = page.locator('button:has-text("Save")').first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
      await saveBtn.click();
      await sleep(1500);
    }

    const finalUrl = page.url();
    console.log('[Teal resume] Done. Resume:', finalUrl);
    if (newResumeId) {
      console.log('[Teal resume] Preview:', `https://app.tealhq.com/resume-builder/resumes/${newResumeId}/preview`);
      if (jobId) {
        const parts = jobTitle.split(/\s*[—\-|]\s*/).map((s) => s.trim());
        const title = parts[0] || 'Product Manager';
        const company = parts.length >= 2 ? parts[parts.length - 1] : '';
        saveResumeJobMapping(newResumeId, { jobId, company, title });
        saveCreatedResumeName(jobId, resumeName);
      }
    }
  } catch (e) {
    console.error('[Teal resume] Error:', e.message);
    process.exit(1);
  } finally {
    await context.close();
  }
}

main();
