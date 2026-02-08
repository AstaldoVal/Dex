#!/usr/bin/env node
/**
 * Scrape job listings from a LinkedIn jobs search URL and append new ones to the digest.
 * Uses saved LinkedIn session (same as filter-digest-remote-playwright).
 * Applies same rules: PM roles only, no "Jobs similar to", dedupe against existing digest.
 *
 * Usage:
 *   node scrape-linkedin-search-playwright.cjs "https://www.linkedin.com/jobs/search/?..."
 *   node scrape-linkedin-search-playwright.cjs "URL" [path-to-digest.md]
 *
 * If digest path omitted, uses today's linkedin-jobs-YYYY-MM-DD.md
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(VAULT, '00-Inbox', 'Job_Search');
const PROFILE_DIR = path.join(OUT_DIR, '.playwright-linkedin');
const DEFAULT_DIGEST = path.join(OUT_DIR, `linkedin-jobs-${new Date().toISOString().slice(0, 10)}.md`);

const SCROLL_PAUSE_MS = 10000;
const MAX_SCROLLS = 50; // LinkedIn shows ~25 jobs per page, so ~1250 jobs max

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJobId(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function getJobViewUrl(url) {
  const id = getJobId(url);
  return id ? `https://www.linkedin.com/comm/jobs/view/${id}` : null;
}

// Same rule as in parse-linkedin-job-emails.cjs — exclude non-PM roles
function isNonPmRole(title) {
  if (!title || typeof title !== 'string') return false;
  const t = title.toLowerCase();
  if (/product manager|product owner|head of product|cpo\b|chief product|compliance manager/.test(t)) return false;
  if (/\b(software engineer|c# engineer|\.net engineer|java engineer|r&d engineer|backend engineer|frontend engineer|fullstack?\s+engineer|devops engineer|qa engineer|data engineer|ml engineer|game engineer)\b/i.test(t)) return true;
  if (/\b(backend developer|frontend developer|fullstack?\s+developer|\.net developer|java developer|c# developer)\b/i.test(t)) return true;
  if (/\bdeveloper\b/i.test(t) && !/product/i.test(t)) return true;
  return false;
}

function isJobsSimilarLink(title) {
  return /^jobs similar to\s/i.test((title || '').trim());
}

// Normalize title: remove " with verification", dedupe repeated phrase
function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return 'View job';
  let t = title.replace(/\s+with verification\s*$/i, '').trim().replace(/\s+/g, ' ');
  const half = Math.floor(t.length / 2);
  if (half > 10 && t.slice(0, half) === t.slice(half, half + half)) t = t.slice(0, half);
  return t.length > 0 ? t.slice(0, 200) : 'View job';
}

// Collect job IDs already in the digest (from link URLs)
function getExistingJobIds(digestPath) {
  const ids = new Set();
  if (!fs.existsSync(digestPath)) return ids;
  const content = fs.readFileSync(digestPath, 'utf8');
  const re = /\]\((https?:[^)]*\/jobs\/view\/(\d+)[^)]*)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.add(m[2]);
  return ids;
}

// Parse digest: find "## Other" and the list after it; return { headerLines, otherSectionStart, otherLines }
function parseDigest(content) {
  const lines = content.split('\n');
  let otherStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '## Other (PM roles, check if relevant)') {
      otherStart = i;
      break;
    }
  }
  if (otherStart < 0) return null;
  const headerLines = lines.slice(0, otherStart + 2); // through blank after ## Other
  const otherLines = lines.slice(otherStart + 2);
  return { headerLines, otherStart, otherLines };
}

// Update "**Best match: X** | Other: Y" in header
function updateHeaderCount(headerLines, otherCount) {
  const bestMatch = headerLines.find(l => /^\*\*Best match:/.test(l));
  let bestNum = 0;
  if (bestMatch) {
    const b = bestMatch.match(/Best match:\s*(\d+)/);
    if (b) bestNum = parseInt(b[1], 10);
  }
  return headerLines.map(l =>
    /^\*\*Best match:.*Other:/.test(l)
      ? `**Best match: ${bestNum}** | Other: ${otherCount}`
      : l
  );
}

async function runScrape(searchUrl, digestPath) {
  if (!searchUrl || !searchUrl.includes('linkedin.com/jobs/search')) {
    console.error('Usage: node scrape-linkedin-search-playwright.cjs "https://www.linkedin.com/jobs/search/..." [digest.md]');
    process.exit(1);
  }

  const digestFile = digestPath || DEFAULT_DIGEST;
  if (!fs.existsSync(digestFile)) {
    console.error('Digest file not found:', digestFile);
    process.exit(1);
  }

  try {
    require.resolve('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install && npx playwright install chromium');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const existingIds = getExistingJobIds(digestFile);
  console.log('Existing job IDs in digest:', existingIds.size);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
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

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Store the expected URL pattern to detect if we've navigated away
  const expectedUrlPattern = /linkedin\.com\/jobs\/search/;
  
  // Helper function to check and return to search page if needed
  const ensureOnSearchPage = async () => {
    const currentUrl = page.url();
    if (!expectedUrlPattern.test(currentUrl)) {
      console.log(`  ⚠ Navigated away from search page (current: ${currentUrl}). Returning...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(10000);
      return true;
    }
    return false;
  };
  
  // Wait for initial job list to load - LinkedIn shows 25 jobs per page
  // Try scrolling to trigger loading of all 25 jobs
  console.log('Waiting for initial job list to load...');
  let initialLinksCount = 0;
  let maxLinksFound = 0;
  
  // First, wait a bit for initial load
  await sleep(10000);
  
  // Then try scrolling to trigger lazy loading
  for (let retry = 0; retry < 20; retry++) {
    const links = await page.$$('a[href*="/jobs/view/"]');
    const count = links.length;
    
    if (count > maxLinksFound) {
      maxLinksFound = count;
      console.log(`  Attempt ${retry + 1}: Found ${count} job links`);
      
      if (count >= 25) {
        console.log(`  ✓ Full first page loaded (25 jobs)`);
        break;
      }
    }
    
    // Try scrolling to trigger more loading
    if (retry > 2 && count < 25) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.5);
      });
      await page.keyboard.press('PageDown');
    }
    
    await sleep(10000);
  }
  
  if (maxLinksFound < 25) {
    console.log(`  ⚠ Only ${maxLinksFound} links found initially (expected 25). Will continue scrolling to load more...`);
  }
  
  // Small delay to ensure all links are ready
  await sleep(10000);

  const jobById = new Map(); // id -> { viewUrl, title } (keep best title per job)

  // Scroll and paginate to load all results
  let lastCount = 0;
  let noNewJobsCount = 0;
  for (let s = 0; s < MAX_SCROLLS; s++) {
    // Check if we're still on the search page
    const navigatedAway = await ensureOnSearchPage();
    if (navigatedAway) {
      console.log(`  Returned to search page, continuing...`);
    }
    
    // Extract current jobs
    const list = await page.$$eval(
      'a[href*="/jobs/view/"]',
      (links) => links.map((a) => ({
        href: a.href || a.getAttribute('href') || '',
        title: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200)
      }))
    );
    
    if (s === 0 || s % 3 === 0) {
      console.log(`Iteration ${s + 1}: Found ${list.length} job links on page`);
    }

    let processed = 0;
    let skippedExisting = 0;
    let skippedNonPm = 0;
    let skippedSimilar = 0;
    
    for (const item of list) {
      const viewUrl = getJobViewUrl(item.href);
      if (!viewUrl) continue;
      const id = getJobId(viewUrl);
      if (!id) continue;
      if (existingIds.has(id)) {
        skippedExisting++;
        continue;
      }
      if (isJobsSimilarLink(item.title)) {
        skippedSimilar++;
        continue;
      }
      const normalizedTitle = normalizeTitle(item.title);
      if (isNonPmRole(normalizedTitle)) {
        skippedNonPm++;
        continue;
      }
      const existing = jobById.get(id);
      if (!existing) {
        jobById.set(id, { viewUrl, title: normalizedTitle });
        processed++;
      } else if (normalizedTitle !== 'View job' && (existing.title === 'View job' || normalizedTitle.length > existing.title.length)) {
        existing.title = normalizedTitle;
      }
    }
    
    if (s < 3 || s % 5 === 0) {
      console.log(`  Processed: ${processed} new, skipped: ${skippedExisting} existing, ${skippedNonPm} non-PM, ${skippedSimilar} similar links`);
    }

    // After aggressive scrolling, do a final extraction before checking for new jobs
    const finalExtraction = await page.$$eval(
      'a[href*="/jobs/view/"]',
      (links) => links.map((a) => ({
        href: a.href || a.getAttribute('href') || '',
        title: (a.textContent || '').trim().slice(0, 200)
      }))
    );
    
    // Process final extraction
    for (const item of finalExtraction) {
      const viewUrl = getJobViewUrl(item.href);
      if (!viewUrl) continue;
      const id = getJobId(viewUrl);
      if (!id) continue;
      if (existingIds.has(id)) continue;
      if (isJobsSimilarLink(item.title)) continue;
      const normalizedTitle = normalizeTitle(item.title);
      if (isNonPmRole(normalizedTitle)) continue;
      const existing = jobById.get(id);
      if (!existing) {
        jobById.set(id, { viewUrl, title: normalizedTitle });
      } else if (normalizedTitle !== 'View job' && (existing.title === 'View job' || normalizedTitle.length > existing.title.length)) {
        existing.title = normalizedTitle;
      }
    }
    
    const currentCount = jobById.size;
    if (currentCount === lastCount) {
      noNewJobsCount++;
      // Increase threshold - need more iterations without new jobs before stopping
      if (noNewJobsCount >= 15) {
        console.log(`No new jobs for ${noNewJobsCount} iterations, stopping. Total found: ${currentCount}`);
        break;
      }
    } else {
      noNewJobsCount = 0;
      console.log(`Iteration ${s + 1}: Found ${currentCount} unique jobs so far (${finalExtraction.length} links on page)`);
    }
    lastCount = currentCount;

    // Try clicking "See more jobs" / "Show more results" button using text search
    let buttonClicked = false;
    try {
      // First, try to find button by visible text
      const buttonTexts = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button, a[role="button"]'));
        return allButtons.map(btn => ({
          element: btn,
          text: (btn.textContent || btn.innerText || '').trim().toLowerCase(),
          ariaLabel: (btn.getAttribute('aria-label') || '').toLowerCase()
        }));
      });
      
      for (const btnInfo of buttonTexts) {
        const text = btnInfo.text;
        const ariaLabel = btnInfo.ariaLabel;
        if (text.includes('see more jobs') || 
            text.includes('show more') || 
            text.includes('load more') ||
            text.includes('more results') ||
            ariaLabel.includes('more jobs') ||
            ariaLabel.includes('show more')) {
          try {
            const btn = await page.evaluateHandle((el) => el, btnInfo.element);
            if (btn && btn.asElement()) {
              const element = btn.asElement();
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.scrollIntoViewIfNeeded();
                await sleep(10000);
                await element.click({ force: true });
                console.log(`Clicked button: "${btnInfo.text.slice(0, 50)}"`);
                await sleep(SCROLL_PAUSE_MS * 4); // Wait longer for new content to load
                buttonClicked = true;
                break;
              }
            }
          } catch (e) {
            // Try next button
          }
        }
      }
    } catch (e) {
      // Button search failed, continue with scroll
    }
    
    if (buttonClicked) {
      // After clicking button, check if we're still on search page
      await sleep(10000);
      await ensureOnSearchPage();
      continue;
    }

    // Aggressive scrolling strategy: scroll page multiple ways to load all jobs
    console.log(`  Starting aggressive scroll to load all jobs (currently ${jobById.size} found)...`);
    
    let lastLinkCount = 0;
    let lastJobCount = jobById.size;
    let noProgressCount = 0;
    const maxNoProgress = 10; // Stop after 10 scrolls with no progress
    
    // Scroll aggressively using multiple methods
    for (let scrollStep = 0; scrollStep < 100; scrollStep++) {
      // Check URL before each scroll step
      if (scrollStep % 10 === 0) {
        await ensureOnSearchPage();
      }
      // Method 1: Scroll page using window.scrollBy
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.9);
      });
      await sleep(10000);
      
      // Method 2: Use keyboard Page Down (more natural for LinkedIn)
      await page.keyboard.press('PageDown');
      await sleep(10000);
      
      // Method 3: Scroll to specific job cards to trigger loading (but don't click!)
      const jobCards = await page.$$('a[href*="/jobs/view/"]');
      if (jobCards.length > 0) {
        // Scroll to last visible job card, but use evaluate to avoid accidental clicks
        try {
          await page.evaluate(() => {
            const links = document.querySelectorAll('a[href*="/jobs/view/"]');
            if (links.length > 0) {
              const lastLink = links[links.length - 1];
              lastLink.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
          });
          await sleep(10000);
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Method 4: Try scrolling the main content area
      await page.evaluate(() => {
        const main = document.querySelector('main') || document.querySelector('[role="main"]');
        if (main) {
          main.scrollTop += main.clientHeight * 0.8;
        }
      });
      await sleep(10000);
      
      // Re-extract all jobs after scrolling
      const allLinks = await page.$$eval(
        'a[href*="/jobs/view/"]',
        (links) => links.map((a) => ({
          href: a.href || a.getAttribute('href') || '',
          title: (a.textContent || '').trim().slice(0, 200)
        }))
      );
      
      const currentLinkCount = allLinks.length;
      
      // Process all links
      let newJobsThisStep = 0;
      for (const item of allLinks) {
        const viewUrl = getJobViewUrl(item.href);
        if (!viewUrl) continue;
        const id = getJobId(viewUrl);
        if (!id) continue;
        if (existingIds.has(id)) continue;
        if (isJobsSimilarLink(item.title)) continue;
        const normalizedTitle = normalizeTitle(item.title);
        if (isNonPmRole(normalizedTitle)) continue;
        if (!jobById.has(id)) {
          jobById.set(id, { viewUrl, title: normalizedTitle });
          newJobsThisStep++;
        }
      }
      
      const currentJobCount = jobById.size;
      
      // Log progress
      if (scrollStep % 3 === 0 || newJobsThisStep > 0 || currentLinkCount > lastLinkCount) {
        console.log(`  Step ${scrollStep + 1}: ${currentLinkCount} links on page, ${currentJobCount} unique jobs (+${newJobsThisStep} new)`);
      }
      
      // Check for progress
      if (currentLinkCount > lastLinkCount || newJobsThisStep > 0) {
        noProgressCount = 0;
        lastLinkCount = currentLinkCount;
        lastJobCount = currentJobCount;
      } else {
        noProgressCount++;
        
        // Try to find and click "See more jobs" button if no progress
        if (noProgressCount >= 3) {
          try {
            const seeMoreBtn = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button, a[role="button"], a'));
              return buttons.find(btn => {
                const text = (btn.textContent || btn.innerText || '').toLowerCase();
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const href = btn.getAttribute('href') || '';
                // Only click buttons that are clearly for loading more jobs, not navigation links
                return (text.includes('see more jobs') || 
                       text.includes('show more results') ||
                       text.includes('load more')) &&
                       !href.includes('/company/') && // Don't click company links
                       !href.includes('/jobs/view/'); // Don't click job links
              });
            });
            
            if (seeMoreBtn && seeMoreBtn.asElement()) {
              const btn = seeMoreBtn.asElement();
              const isVisible = await btn.isVisible().catch(() => false);
              if (isVisible) {
                // Check URL before clicking
                const urlBefore = page.url();
                await btn.scrollIntoViewIfNeeded();
                await sleep(10000);
                await btn.click({ force: true });
                await sleep(SCROLL_PAUSE_MS * 2);
                
                // Check if we navigated away
                const urlAfter = page.url();
                if (urlAfter !== urlBefore && !expectedUrlPattern.test(urlAfter)) {
                  console.log(`  ⚠ Button click navigated away. Returning to search page...`);
                  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await sleep(10000);
                } else {
                  console.log(`  ✓ Clicked "See more jobs" button`);
                }
                noProgressCount = 0; // Reset counter
                continue;
              }
            }
          } catch (e) {
            // Button not found or not clickable
          }
        }
        
        // Stop if no progress for too long
        if (noProgressCount >= maxNoProgress) {
          console.log(`  No progress after ${maxNoProgress} scrolls. Stopping. Final: ${currentLinkCount} links, ${currentJobCount} jobs`);
          break;
        }
      }
      
      // Check if we've reached the absolute bottom of the page
      const pageBottom = await page.evaluate(() => {
        return {
          scrollTop: window.pageYOffset || document.documentElement.scrollTop,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight
        };
      });
      
      const isAtPageBottom = pageBottom.scrollTop + pageBottom.clientHeight >= pageBottom.scrollHeight - 100;
      
      if (isAtPageBottom && noProgressCount >= 5) {
        console.log(`  Reached bottom of page. Final: ${currentLinkCount} links, ${currentJobCount} jobs`);
        break;
      }
    }
    
    // Final aggressive scroll to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await sleep(SCROLL_PAUSE_MS * 2);
    
    // One more extraction after final scroll
    const finalLinks = await page.$$eval(
      'a[href*="/jobs/view/"]',
      (links) => links.map((a) => ({
        href: a.href || a.getAttribute('href') || '',
        title: (a.textContent || '').trim().slice(0, 200)
      }))
    );
    
    for (const item of finalLinks) {
      const viewUrl = getJobViewUrl(item.href);
      if (!viewUrl) continue;
      const id = getJobId(viewUrl);
      if (!id) continue;
      if (existingIds.has(id)) continue;
      if (isJobsSimilarLink(item.title)) continue;
      const normalizedTitle = normalizeTitle(item.title);
      if (isNonPmRole(normalizedTitle)) continue;
      if (!jobById.has(id)) {
        jobById.set(id, { viewUrl, title: normalizedTitle });
      }
    }
    
    console.log(`  Final extraction: ${finalLinks.length} links found, ${jobById.size} unique jobs collected`);
  }

  await context.close();

  const newJobs = Array.from(jobById.entries())
    .filter(([id]) => !existingIds.has(id))
    .map(([id, data]) => ({ id, ...data }));
  console.log('New jobs to add (after dedupe and PM filter):', newJobs.length);

  if (newJobs.length === 0) {
    console.log('Nothing to add.');
    return;
  }

  const content = fs.readFileSync(digestFile, 'utf8');
  const parsed = parseDigest(content);
  if (!parsed) {
    console.error('Could not parse digest (no ## Other section).');
    process.exit(1);
  }

  const { headerLines, otherLines } = parsed;
  const existingOtherBullets = otherLines.filter((l) => /^-\s+\[[ x\-]\]\s+\[/.test(l));
  const currentOtherCount = existingOtherBullets.length;
  const newOtherCount = currentOtherCount + newJobs.length;

  const newBullets = newJobs.map(
    (j) => `- [ ] [${(j.title || 'View job').replace(/\|/g, ' ').slice(0, 120)} · — · Remote](${j.viewUrl})`
  );
  const newSection = newBullets.map((b) => b + '\n').join('');

  const headerUpdated = updateHeaderCount(headerLines, newOtherCount);
  const beforeOther = headerUpdated.join('\n');
  const afterOtherContent = otherLines.join('\n');
  const newContent = beforeOther + '\n' + newSection + (afterOtherContent ? afterOtherContent + '\n' : '');

  fs.writeFileSync(digestFile, newContent, 'utf8');
  console.log(`Added ${newJobs.length} jobs to ${path.relative(VAULT, digestFile)}. Other count: ${currentOtherCount} → ${newOtherCount}.`);
}

const args = process.argv.slice(2);
const searchUrl = args[0];
const digestPath = args[1];

runScrape(searchUrl, digestPath).catch((e) => {
  console.error(e);
  process.exit(1);
});
