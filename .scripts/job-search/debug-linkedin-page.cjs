#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');
const { PROFILE_EXTENSION, DEBUG_DIR } = require('./job-search-paths.cjs');

async function debugPage(searchUrl) {
  const context = await chromium.launchPersistentContext(PROFILE_EXTENSION, {
    headless: false,
    args: ['--no-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  
  // Check login
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const afterFeed = page.url();
  if (afterFeed.includes('/login') || afterFeed.includes('/authwall') || afterFeed.includes('/checkpoint')) {
    await context.close();
    console.error('Session expired or not logged in. Run: npm run job-search:linkedin-login');
    process.exit(1);
  }
  await sleep(10000);

  // Go to search page
  console.log('Loading search page...');
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(10000);

  // Count job links
  const jobLinks = await page.$$eval(
    'a[href*="/jobs/view/"]',
    (links) => links.map((a) => ({
      href: a.href || a.getAttribute('href') || '',
      text: (a.textContent || '').trim().slice(0, 100),
      visible: a.offsetParent !== null
    }))
  );

  console.log(`\n=== RESULTS ===`);
  console.log(`Total job links found: ${jobLinks.length}`);
  console.log(`Visible job links: ${jobLinks.filter(l => l.visible).length}`);
  
  // Check for "See more" buttons
  const seeMoreButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    return buttons.map(btn => ({
      text: (btn.textContent || btn.innerText || '').trim(),
      ariaLabel: btn.getAttribute('aria-label') || '',
      visible: btn.offsetParent !== null,
      tagName: btn.tagName
    })).filter(btn => {
      const text = btn.text.toLowerCase();
      const aria = btn.ariaLabel.toLowerCase();
      return text.includes('more') || text.includes('show') || aria.includes('more');
    });
  });

  console.log(`\n"See more" buttons found: ${seeMoreButtons.length}`);
  seeMoreButtons.forEach((btn, i) => {
    console.log(`  ${i + 1}. [${btn.tagName}] "${btn.text}" (aria: "${btn.ariaLabel}") - visible: ${btn.visible}`);
  });

  // Show first 10 job links
  console.log(`\nFirst 10 job links:`);
  jobLinks.slice(0, 10).forEach((link, i) => {
    const jobId = link.href.match(/\/jobs\/view\/(\d+)/)?.[1] || 'no-id';
    console.log(`  ${i + 1}. [${jobId}] ${link.text.slice(0, 60)}... (visible: ${link.visible})`);
  });

  // Check page structure
  const structure = await page.evaluate(() => {
    const listContainer = document.querySelector('.scaffold-layout__list-container') || 
                         document.querySelector('[class*="jobs-search-results"]') ||
                         document.querySelector('.jobs-search-results-list');
    return {
      hasListContainer: !!listContainer,
      containerClass: listContainer ? listContainer.className : null,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      canScroll: document.documentElement.scrollHeight > window.innerHeight
    };
  });

  console.log(`\nPage structure:`);
  console.log(`  Has list container: ${structure.hasListContainer}`);
  console.log(`  Container class: ${structure.containerClass || 'none'}`);
  console.log(`  Page height: ${structure.pageHeight}px`);
  console.log(`  Viewport height: ${structure.viewportHeight}px`);
  console.log(`  Can scroll: ${structure.canScroll}`);

  console.log(`\nPage will stay open for 30 seconds for manual inspection...`);
  await sleep(30000);
  
  await context.close();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const searchUrl = process.argv[2] || 'https://www.linkedin.com/jobs/search/?currentJobId=4369495177&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=Senior%20Product%20Manager&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true';
debugPage(searchUrl).catch(console.error);
