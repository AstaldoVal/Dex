#!/usr/bin/env node
/**
 * Extract work experience bullets from one Teal resume (preview).
 * Usage: node teal-extract-resume-experience.cjs --resume-id <uuid> [--out path.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const {
  getTealProfileCandidates,
  launchPersistentContextGuarded,
  launchTealContext,
  cleanupAllTealProfileLocks
} = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { extractResumeExperienceFromPage } = require('./teal-resume-experience.cjs');
const { buildChronologyReport } = require('./teal-resume-experience-chronology.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function parseArgs() {
  let resumeId = '';
  let out = '';
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--resume-id' && a[i + 1]) resumeId = a[++i];
    else if (a[i] === '--out' && a[i + 1]) out = a[++i];
  }
  return { resumeId, out };
}

async function launchBrowser(playwright) {
  cleanupAllTealProfileLocks(() => {});
  try {
    const { context } = await launchTealContext(playwright, {
      headless: false,
      args: ['--no-first-run'],
      timeout: 60000,
      log: () => {}
    });
    const page = context.pages()[0] || (await context.newPage());
    return { context, page };
  } catch (_) {}
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 60000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

async function main() {
  const { resumeId, out } = parseArgs();
  if (!resumeId) {
    console.error('Usage: node teal-extract-resume-experience.cjs --resume-id <uuid> [--out file.json]');
    process.exit(1);
  }
  const outPath =
    out ||
    path.join(VAULT, '00-Inbox/Job_Search/Art_Home', `experience-extract-${resumeId.slice(0, 8)}.json`);

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }
  const { context, page } = launched;
  const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
    }
    const data = await extractResumeExperienceFromPage(page);
    data.resumeId = resumeId;
    data.extractedAt = new Date().toISOString();
    data.chronology = buildChronologyReport(data, {
      resumeId,
      extractedAt: data.extractedAt,
      minParseableDates: 3
    });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    const chronoPath = path.join(TEAL_DIR, `experience-chronology-${resumeId}.json`);
    fs.writeFileSync(
      chronoPath,
      JSON.stringify(
        { extractSummary: { companies: (data.companies || []).length }, chronology: data.chronology },
        null,
        2
      ),
      'utf8'
    );

    let total = 0;
    let included = 0;
    for (const c of data.companies || []) {
      for (const p of c.positions || []) {
        for (const b of p.bullets || []) {
          total++;
          if (b.included) included++;
        }
      }
    }
    console.log('Saved:', outPath);
    console.log('Chronology:', chronoPath);
    console.log(
      'Chronology dated positions:',
      data.chronology.stats.withParseableDates,
      '/',
      data.chronology.stats.totalPositions
    );
    console.log('Bullets total:', total, 'included:', included);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
