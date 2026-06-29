#!/usr/bin/env node
'use strict';
/**
 * Eval: chronological work experience from Teal extract (live or JSON file).
 *
 * Usage:
 *   node eval-teal-resume-experience-chronology.cjs --resume-id <uuid>
 *   node eval-teal-resume-experience-chronology.cjs --from-json path/to/extract.json
 *
 * Writes: 00-Inbox/Job_Search/teal/experience-chronology-<resumeId>.json
 *         00-Inbox/Job_Search/teal/experience-chronology-latest.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const { extractResumeExperienceFromPage } = require('./teal-resume-experience.cjs');
const { buildChronologyReport, evaluateChronologyReport } = require('./teal-resume-experience-chronology.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

function parseArgs() {
  let resumeId = process.env.TEAL_RESUME_ID || '';
  let fromJson = '';
  let minDates = 3;
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--resume-id' && a[i + 1]) resumeId = a[++i];
    else if (a[i] === '--from-json' && a[i + 1]) fromJson = a[++i];
    else if (a[i] === '--min-parseable-dates' && a[i + 1]) minDates = parseInt(a[++i], 10);
  }
  return { resumeId, fromJson, minDates };
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        timeout: 45000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

async function loadExtract({ resumeId, fromJson }) {
  if (fromJson) {
    const raw = JSON.parse(fs.readFileSync(fromJson, 'utf8'));
    return raw;
  }
  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) throw new Error('Could not launch Chrome for Teal extract');
  const { context, page } = launched;
  const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(5000);
    }
    const data = await extractResumeExperienceFromPage(page);
    data.resumeId = resumeId;
    data.extractedAt = new Date().toISOString();
    return data;
  } finally {
    await context.close().catch(() => {});
  }
}

function writeReports(extract, chronology) {
  const id = chronology.resumeId || extract.resumeId || 'unknown';
  const base = path.join(TEAL_DIR, `experience-chronology-${id}.json`);
  const latest = path.join(TEAL_DIR, 'experience-chronology-latest.json');
  const payload = { extractSummary: { companies: (extract.companies || []).length }, chronology };
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(base, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(latest, JSON.stringify(payload, null, 2), 'utf8');
  return { base, latest };
}

function printHumanList(chronology) {
  console.log('\n--- sortedByEndDate (newest end first) ---');
  console.log(chronology.disclaimer.ru);
  console.log('');
  let n = 1;
  for (const row of chronology.sortedByEndDate) {
    console.log(
      `${n}. ${row.dates || '?'} | ${row.title || '?'} @ ${row.company}${row.positionIncluded === false ? ' [position off]' : ''}`
    );
    n += 1;
  }
  if (!chronology.editorMatchesChronologicalSort) {
    console.log('\n(note: order in left Teal editor differs from strict date sort — see editorOrder in JSON)');
  }
}

async function main() {
  const { resumeId, fromJson, minDates } = parseArgs();
  if (!fromJson && !resumeId) {
    console.error(
      'Usage: --resume-id <uuid> | --from-json <extract.json> [--min-parseable-dates 3]'
    );
    process.exit(1);
  }
  const extract = await loadExtract({ resumeId, fromJson });
  const chronology = buildChronologyReport(extract, {
    resumeId: resumeId || extract.resumeId,
    extractedAt: extract.extractedAt,
    minParseableDates: minDates
  });
  const evalResult = evaluateChronologyReport(chronology);
  const paths = writeReports(extract, chronology);
  printHumanList(chronology);
  console.log('\nStats:', JSON.stringify(chronology.stats));
  console.log('Written:', paths.base);
  console.log('Latest:', paths.latest);
  if (!evalResult.pass) {
    console.error('EVAL FAIL:', evalResult.errors.join('; '));
    process.exit(1);
  }
  console.log('EVAL PASS: chronology snapshot OK (dates are resume-variant; re-run after Teal edits)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
