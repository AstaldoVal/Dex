#!/usr/bin/env node
/**
 * Sync certifications on Teal resume: hide 2016 PM / WebUX per Cowork F2; verify enabled set.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  normCertTitle,
  certTitleMatchesPattern,
  certTitleMatchesKeep,
  requiredKeepPatterns
} = require('./teal-certification-match.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const ALLOWLIST_PATH = path.join(TEAL_DIR, 'roman-certifications-allowlist.json');
const DATA_PM_ALLOWLIST_PATH = path.join(TEAL_DIR, 'roman-certifications-data-pm.json');

function log(m) {
  console.log('[cert-sync] ' + m);
}

function loadAllowlist() {
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
}

function loadDataPmAllowlist() {
  return JSON.parse(fs.readFileSync(DATA_PM_ALLOWLIST_PATH, 'utf8'));
}

async function launchBrowser(playwright) {
  for (const dir of getTealProfileCandidates()) {
    try {
      const context = await launchPersistentContextGuarded(playwright.chromium, dir, {
        channel: os.platform() === 'darwin' ? 'chrome' : undefined,
        headless: false,
        args: ['--no-first-run'],
        timeout: 30000
      });
      const page = context.pages()[0] || (await context.newPage());
      return { context, page };
    } catch (_) {}
  }
  return null;
}

/**
 * @param {import('playwright').Page} page
 */
async function expandCertifications(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#certifications');
    if (!root) return;
    const btn = root.querySelector('button[aria-expanded="false"]');
    if (btn) btn.click();
  });
  await sleep(800);
}

function isNoiseCertTitle(t) {
  if (!t || t.length < 5) return true;
  if (/^\d{2}\/\d{4}$/.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return /^(Go Practice|Udemy|E5|IAMPM|Growhorse|VMEdu|101 Blockchains|Product Mindset|Ivan Zamesin)$/i.test(
    t
  );
}

/** Scroll certifications panel and collect all rows (virtualized list). */
async function collectAllCertificationRows(page) {
  await expandCertifications(page);
  const seen = new Map();
  for (let pass = 0; pass < 12; pass++) {
    const frac = pass / 11;
    await page.evaluate((f) => {
      const root = document.querySelector('#certifications');
      const sc = root?.closest('[class*="overflow"]') || root;
      if (sc) sc.scrollTop = Math.floor(sc.scrollHeight * f);
    }, frac);
    await sleep(280);
    const batch = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('#certifications [data-testid="Certification"]').forEach((row) => {
        const label = row.querySelector('label.resume-label');
        const title = (label?.textContent || '').trim();
        if (!title) return;
        const cb = row.querySelector('button[role="checkbox"]');
        rows.push({ title, on: cb?.getAttribute('aria-checked') === 'true' });
      });
      return rows;
    });
    for (const r of batch) {
      if (isNoiseCertTitle(r.title)) continue;
      seen.set(r.title, r);
    }
  }
  return [...seen.values()];
}

/**
 * @returns {{ enabled: string[], disabled: string[] }}
 */
async function readCertificationState(page) {
  const rows = await collectAllCertificationRows(page);
  const enabled = [];
  const disabled = [];
  for (const r of rows) {
    (r.on ? enabled : disabled).push(r.title);
  }
  return { enabled, disabled };
}

async function setCertOnResume(page, title, wantOn, logFn = log) {
  const ok = await page.evaluate(
    ({ title, wantOn }) => {
      for (const row of document.querySelectorAll('#certifications [data-testid="Certification"]')) {
        const label = row.querySelector('label.resume-label');
        const t = (label?.textContent || '').trim();
        if (t !== title) continue;
        label?.scrollIntoView({ block: 'center' });
        const cb = row.querySelector('button[role="checkbox"]');
        if (!cb) return false;
        const on = cb.getAttribute('aria-checked') === 'true';
        if (on === wantOn) return true;
        cb.click();
        return true;
      }
      return false;
    },
    { title, wantOn }
  );
  if (ok) {
    logFn(`  cert ${wantOn ? 'on' : 'off'}: ${title.slice(0, 72)}`);
    await sleep(320);
  }
  return ok;
}

function findRowForRequired(rows, requiredPattern) {
  return rows.find((r) => certTitleMatchesPattern(r.title, requiredPattern));
}

/**
 * @param {import('playwright').Page} page
 */
async function syncCertificationsOnPreview(page, logFn = log, opts = {}) {
  const allow = opts.allowlist || loadAllowlist();
  const required = requiredKeepPatterns(allow);
  let rows = await collectAllCertificationRows(page);
  logFn(`catalog=${rows.length} required=${required.length}`);

  let hidden = 0;
  let turnedOff = 0;
  let enabledClicks = 0;

  for (const r of rows) {
    const hideHit = (allow.hide_patterns || []).some(
      (p) => certTitleMatchesPattern(r.title, p) && !certTitleMatchesKeep(r.title, allow)
    );
    if (hideHit && r.on) {
      if (await setCertOnResume(page, r.title, false, logFn)) hidden++;
    }
  }
  await sleep(500);
  rows = await collectAllCertificationRows(page);

  for (const req of required) {
    let row = findRowForRequired(rows, req);
    if (!row) {
      logFn(`WARN no catalog row for required: ${req}`);
      continue;
    }
    if (!row.on) {
      if (await setCertOnResume(page, row.title, true, logFn)) enabledClicks++;
    }
    await sleep(400);
    rows = await collectAllCertificationRows(page);
  }

  for (const r of rows) {
    if (!r.on) continue;
    if (certTitleMatchesKeep(r.title, allow)) continue;
    if (await setCertOnResume(page, r.title, false, logFn)) turnedOff++;
  }
  await sleep(500);

  const state = await readCertificationState(page);
  const wronglyOn = state.enabled.filter(
    (t) =>
      (allow.hide_patterns || []).some((p) => certTitleMatchesPattern(t, p)) &&
      !certTitleMatchesKeep(t, allow)
  );
  const missingKeep = required.filter(
    (p) => !state.enabled.some((t) => certTitleMatchesPattern(t, p))
  );

  const orderOk = required.every((p) => state.enabled.some((t) => certTitleMatchesPattern(t, p)));

  const wantCount = required.length;
  const countOk =
    state.enabled.length >= wantCount && state.enabled.length <= (allow.max_on_resume || wantCount + 1);

  logFn(
    `hidden=${hidden} enabled_clicks=${enabledClicks} disabled_extra=${turnedOff} total_on=${state.enabled.length} enabled=[${state.enabled.join(' | ')}]`
  );
  if (wronglyOn.length) logFn('FAIL still enabled: ' + wronglyOn.join('; '));
  if (missingKeep.length) logFn('FAIL missing: ' + missingKeep.join('; '));

  const ok = wronglyOn.length === 0 && missingKeep.length === 0 && orderOk && countOk;
  return {
    ok,
    hidden,
    turnedOff,
    enabledClicks,
    countOk,
    enabled: state.enabled,
    disabled: state.disabled,
    wronglyOn,
    missingKeep,
    orderOk,
    catalogSize: rows.length
  };
}

function verifyCertificationsInPdf(pdfPath, allowlist) {
  const { execSync } = require('child_process');
  const allow = allowlist || loadAllowlist();
  const required = requiredKeepPatterns(allow);
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const certStart = text.search(/\nCERTIFICATIONS\s*\n/i);
  const eduStart = certStart >= 0 ? text.indexOf('\nEDUCATION', certStart) : -1;
  const certBlock =
    certStart >= 0
      ? text.slice(certStart, eduStart > certStart ? eduStart : undefined)
      : text;

  const blockNorm = certBlock.toLowerCase().replace(/\s+/g, ' ');
  const mustHave = required;
  const mustNot = allow.hide_patterns || [];

  const missing = mustHave.filter((p) => {
    if (certTitleMatchesKeep(p, allow)) {
      const rules = allow.keep_match_rules || [];
      for (const rule of rules) {
        const needles = [rule.want, ...(rule.includes || [])].filter(Boolean);
        if (needles.some((n) => certTitleMatchesPattern(p, n) || certTitleMatchesPattern(p, rule.want))) {
          if ((rule.includes || []).some((inc) => blockNorm.includes(normCertTitle(inc)))) return false;
        }
      }
      for (const pat of allow.keep_title_patterns || []) {
        if (certTitleMatchesPattern(p, pat) && blockNorm.includes(normCertTitle(pat).slice(0, 24))) {
          return false;
        }
      }
    }
    const key = p.toLowerCase().slice(0, 20);
    return !blockNorm.includes(key);
  });
  const forbidden = mustNot.filter(
    (p) => blockNorm.includes(p.toLowerCase()) && !mustHave.some((k) => blockNorm.includes(k.toLowerCase().slice(0, 14)))
  );

  const lines = certBlock.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30);
  const firstTwo = lines.filter((l) => l.length > 15).slice(0, 2);

  return {
    ok: missing.length === 0 && forbidden.length === 0,
    missing,
    forbidden,
    firstTwo,
    certPreview: certBlock.slice(0, 600)
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const resumeId = argv.includes('--resume-id')
    ? argv[argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';
  const dataPm = argv.includes('--data-pm');
  const dumpTitles = argv.includes('--dump-titles');
  const allow = dataPm ? loadDataPmAllowlist() : loadAllowlist();

  loadTealEnv();
  const playwright = require('playwright');
  const launched = await launchBrowser(playwright);
  if (!launched) {
    console.error('Could not launch Chrome');
    process.exit(1);
  }
  const { context, page } = launched;
  try {
    const url = `https://app.tealhq.com/resume-builder/resumes/${resumeId}/preview`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(3000);
    if (/sign-in|login/i.test(page.url())) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(3000);
    }
    if (dumpTitles) {
      const rows = await collectAllCertificationRows(page);
      log('dump_titles=' + JSON.stringify(rows, null, 2));
      return;
    }
    const r = await syncCertificationsOnPreview(page, log, { allowlist: allow });
    log('result=' + JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  syncCertificationsOnPreview,
  verifyCertificationsInPdf,
  readCertificationState,
  collectAllCertificationRows,
  setCertOnResume,
  loadAllowlist,
  loadDataPmAllowlist,
  ALLOWLIST_PATH,
  DATA_PM_ALLOWLIST_PATH
};

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
