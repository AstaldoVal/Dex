#!/usr/bin/env node
/**
 * Sync canonical contact header on any Teal resume preview.
 * Maps: LinkedIn slug, Substack → Twitter/X, GitHub → Website, City, Phone, Email.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { TEAL_DIR, VAULT, ensureDirs } = require('./job-search-paths.cjs');
const { getTealProfileCandidates, launchPersistentContextGuarded } = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { sleep } = require('./teal-target-title.cjs');

ensureDirs();
try {
  require('dotenv').config({ path: path.join(VAULT, '.env') });
} catch (_) {}

const PROFILE_PATH = path.join(TEAL_DIR, 'roman-contact-profile.json');

function log(m) {
  console.log('[contact-links] ' + m);
}

function loadProfile() {
  if (!fs.existsSync(PROFILE_PATH)) {
    throw new Error('Missing profile: ' + PROFILE_PATH);
  }
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
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
 * @param {Record<string, string>} profile
 */
async function setContactHeaderOnPreview(page, profile, logFn = log, opts = {}) {
  const omitPromo = Boolean(opts.omitSubstackGithub);
  const want = {
    'First Name': profile.first_name || 'Roman',
    'Last Name': profile.last_name || 'Matsukatov',
    Email: profile.email || 'r.matsukatov@gmail.com',
    'Phone Number': profile.phone || '+351919191596',
    LinkedIn: profile.linkedin_slug || 'roman-matsukatov',
    'Twitter / X': omitPromo ? '' : profile.substack || 'https://1percentaibetter.substack.com',
    City: profile.city || 'Lisbon',
    Website: omitPromo ? '' : profile.github || 'https://github.com/AstaldoVal'
  };

  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }

  const contact = page.locator('#contact-info');
  await contact.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(400);

  const editBtn = contact.getByRole('button', { name: 'Edit Contact Information' });
  if ((await editBtn.count()) === 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(2500);
    await contact.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
  }
  const editBtnRetry = contact.getByRole('button', { name: 'Edit Contact Information' });
  if ((await editBtnRetry.count()) === 0) {
    return { ok: false, reason: 'edit_button_missing' };
  }
  await editBtnRetry.click({ timeout: 30000, force: true });

  let linkedInVisible = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await page.locator('label').filter({ hasText: /LinkedIn/i }).count()) > 0) {
      linkedInVisible = true;
      break;
    }
    await sleep(500);
  }
  if (!linkedInVisible) {
    return { ok: false, reason: 'contact_form_not_open' };
  }
  await sleep(400);

  const filled = [];
  for (const [label, value] of Object.entries(want)) {
    const inp = page
      .locator('label')
      .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
      .locator('..')
      .locator('input')
      .first();
    if ((await inp.count()) === 0) continue;
    const cur = await inp.inputValue().catch(() => '');
    if (opts.forceFill || cur !== value) {
      await inp.fill(value);
      if (cur !== value) filled.push(label);
    }
  }
  await sleep(300);

  let save = page
    .locator('form')
    .filter({ has: page.locator('label').filter({ hasText: /LinkedIn/i }) })
    .getByRole('button', { name: 'Save', exact: true })
    .first();
  if ((await save.count()) === 0) {
    const saves = page.getByRole('button', { name: 'Save', exact: true });
    const n = await saves.count();
    for (let i = 0; i < n; i++) {
      const btn = saves.nth(i);
      const inContactForm = await btn.evaluate((el) => {
        const form = el.closest('form');
        if (!form) return false;
        return [...form.querySelectorAll('label')].some((l) => /LinkedIn/i.test((l.textContent || '').trim()));
      });
      if (inContactForm) {
        save = btn;
        break;
      }
    }
  }
  if ((await save.count()) === 0) {
    save = page.getByRole('button', { name: 'Save', exact: true }).first();
  }
  if ((await save.count()) === 0) {
    return { ok: false, reason: 'save_button_missing', filled };
  }
  await save.click({ timeout: 20000 });
  await sleep(2000);

  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  await contact.getByRole('button', { name: 'Edit Contact Information' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await sleep(400);

  const editForRead = contact.getByRole('button', { name: 'Edit Contact Information' });
  if ((await editForRead.count()) > 0) {
    await editForRead.click({ timeout: 15000, force: true }).catch(() => {});
    await sleep(1200);
  }

  const surface = await page.evaluate(() => {
    const chunks = [];
    const root = document.querySelector('#contact-info');
    if (root) {
      chunks.push(root.innerText || root.textContent || '');
      root.querySelectorAll('a[href]').forEach((a) => {
        const h = a.getAttribute('href') || '';
        if (h) chunks.push(h);
      });
    }
    document.querySelectorAll('label').forEach((l) => {
      const name = (l.textContent || '').trim();
      const inp = l.parentElement?.querySelector('input');
      if (!inp || !inp.value) return;
      if (/^(First Name|Last Name|Email|Phone Number|LinkedIn|Twitter \/ X|City|Website)$/.test(name)) {
        chunks.push(inp.value);
      }
    });
    return chunks.join('\n').slice(0, 4000);
  });
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  const surfaceCheck = verifyCanonicalContactSurface(surface, { omitSubstackGithub: omitPromo });
  if (!surfaceCheck.ok) {
    return {
      ok: false,
      reason: `surface_verify_failed: ${surfaceCheck.missing.join(', ')} (blobLen=${surface.length}, head=${JSON.stringify(surface.slice(0, 160))})`,
      filled
    };
  }
  logFn('contact header synced' + (filled.length ? ': ' + filled.join(', ') : ' (unchanged)'));
  return { ok: true, filled };
}

/** @deprecated alias */
async function setContactLinksOnPreview(page, profile, logFn = log) {
  const r = await setContactHeaderOnPreview(page, profile, logFn);
  return {
    github: r.ok ? 'synced' : r.reason || 'failed',
    ...r
  };
}

/**
 * Canonical contact header (roman-contact-profile.json / roman-contact-links.mdc).
 * omitSubstackGithub: true → core must remain; Substack + GitHub must be absent.
 */
function verifyCanonicalContactSurface(text, opts = {}) {
  const blob = String(text || '');
  const omitPromo = Boolean(opts.omitSubstackGithub);
  const missing = [];
  if (!/Matsukatov/i.test(blob)) missing.push('name');
  if (!/Lisbon/i.test(blob)) missing.push('city');
  if (!/\+351919191596/.test(blob)) missing.push('phone');
  if (!/r\.matsukatov@gmail\.com/i.test(blob)) missing.push('email');
  if (!/roman-matsukatov|linkedin\.com\/in\/roman-matsukatov/i.test(blob)) {
    missing.push('linkedin');
  }
  if (omitPromo) {
    if (/1percentaibetter\.substack\.com/i.test(blob)) missing.push('substack_should_be_absent');
    if (/github\.com\/AstaldoVal/i.test(blob)) missing.push('github_should_be_absent');
  } else {
    if (!/1percentaibetter\.substack\.com/i.test(blob)) missing.push('substack');
    if (!/github\.com\/AstaldoVal/i.test(blob)) missing.push('github');
  }
  return { ok: missing.length === 0, missing, omitPromo };
}

function verifyContactInPdf(pdfPath, opts = {}) {
  const { execSync } = require('child_process');
  const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const header = text.split('\n').slice(0, 8).join('\n');
  const omitPromo = Boolean(opts.omitSubstackGithub);
  const checks = {
    lisbon: /Lisbon/i.test(header),
    phone: /\+351919191596/.test(header),
    email: /r\.matsukatov@gmail\.com/i.test(header),
    linkedin: /linkedin\.com\/in\/roman-matsukatov/i.test(header)
  };
  if (!omitPromo) {
    checks.substack = /1percentaibetter\.substack\.com/i.test(header);
    checks.github = /github\.com\/AstaldoVal/i.test(header);
  } else {
    if (/1percentaibetter\.substack\.com/i.test(header)) {
      return { ok: false, missing: ['substack should be absent'], headerPreview: header.slice(0, 400) };
    }
    if (/github\.com\/AstaldoVal/i.test(header)) {
      return { ok: false, missing: ['github should be absent'], headerPreview: header.slice(0, 400) };
    }
  }
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { ok: missing.length === 0, missing, headerPreview: header.slice(0, 400) };
}

function feedbackWantsMinimalHeader(feedback) {
  const ch = feedback && feedback.apply && feedback.apply.contact_header;
  if (ch && ch.omit_substack_github === true) return true;
  const other = (feedback && feedback.deferred_v1 && feedback.deferred_v1.other) || [];
  const blob = other.join(' ').toLowerCase();
  return /drop the substack|drop.*github|substack and github/i.test(blob);
}

async function main() {
  const resumeId = process.argv.includes('--resume-id')
    ? process.argv[process.argv.indexOf('--resume-id') + 1]
    : '608d280d-0f27-4340-968a-19786d23ee3a';

  loadTealEnv();
  const profile = loadProfile();
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
    const r = await setContactHeaderOnPreview(page, profile, log);
    log('result=' + JSON.stringify(r));
    if (!r.ok) process.exit(1);
  } finally {
    await context.close().catch(() => {});
  }
}

module.exports = {
  setContactHeaderOnPreview,
  setContactLinksOnPreview,
  verifyCanonicalContactSurface,
  verifyContactInPdf,
  feedbackWantsMinimalHeader,
  PROFILE_PATH
};

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
