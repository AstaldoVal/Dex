#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { launchTealContext, releaseTealProfile } = require('../teal-chrome-profile.cjs');
const { APPLIED_BASE, ensureDirs } = require('../job-search-paths.cjs');
const { sanitizeCompanyForPath, sanitizeVacancyForPath } = require('../teal-applied-paths.cjs');
const { applicatorResumeUrl } = require('./applicator-client.cjs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadApplicatorEnv() {
  const vault = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..', '..');
  dotenv.config({ path: path.join(vault, '.env') });
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}

async function ensureApplicatorAuthenticated(page, log) {
  const email = (process.env.APPLICATOR_EMAIL || '').trim();
  const password = process.env.APPLICATOR_PASSWORD || '';
  const loginVisible = await page
    .locator('[data-testid="login-page"], input[type="email"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (!loginVisible && !page.url().includes('/login')) return;
  if (!email || !password) {
    throw new Error('Applicator auth required: set APPLICATOR_EMAIL and APPLICATOR_PASSWORD in .env');
  }
  const loginTab = page.locator('button:has-text("Sign In")').first();
  if ((await loginTab.count()) > 0) {
    await loginTab.click({ timeout: 8000 }).catch(() => {});
  }
  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  await emailInput.waitFor({ timeout: 15000 });
  await passwordInput.waitFor({ timeout: 15000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const filledEmail = await emailInput.inputValue().catch(() => '');
  const filledPasswordLen = await passwordInput.inputValue().then((v) => v.length).catch(() => 0);
  log(`Applicator login filled: email=${filledEmail} password_len=${filledPasswordLen}`);
  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Login")')
    .first();
  await page
    .locator('form')
    .first()
    .evaluate((form) => {
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    })
    .catch(() => {});
  await submitBtn.click({ timeout: 12000 }).catch(async () => {
    await passwordInput.press('Enter').catch(() => {});
  });
  await passwordInput.press('Enter').catch(() => {});
  await Promise.race([
    page.locator('button:has-text("Signing in...")').first().waitFor({ timeout: 5000 }),
    page.locator('button:has-text("Sign in"), button:has-text("Sign In")').first().waitFor({ timeout: 5000 })
  ]).catch(() => {});
  const authResult = await Promise.race([
    page
      .waitForURL((url) => !String(url).includes('/login'), { timeout: 20000 })
      .then(() => ({ ok: true, kind: 'redirect' })),
    page
      .locator('div.bg-red-50, [data-testid="login-page"] .bg-red-50')
      .first()
      .waitFor({ timeout: 20000 })
      .then(async () => {
        const msg = (await page.locator('div.bg-red-50, [data-testid="login-page"] .bg-red-50').first().innerText().catch(() => '')).trim();
        return { ok: false, kind: 'error', message: msg };
      })
  ]).catch(() => ({ ok: false, kind: 'timeout', message: 'login wait timeout' }));
  if (!authResult.ok) {
    const debugDir = path.join(
      process.env.VAULT_PATH || process.cwd(),
      '00-Inbox',
      'Job_Search',
      'teal',
      'full-flow-v2',
      'debug'
    );
    fs.mkdirSync(debugDir, { recursive: true });
    const stamp = Date.now();
    const pngPath = path.join(debugDir, `applicator-login-failed-${stamp}.png`);
    const htmlPath = path.join(debugDir, `applicator-login-failed-${stamp}.html`);
    await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    if (html) fs.writeFileSync(htmlPath, html, 'utf8');
    const bodyText = await page
      .locator('[data-testid="login-page"]')
      .first()
      .innerText()
      .then((t) => t.replace(/\s+/g, ' ').slice(0, 400))
      .catch(() => '');
    log(`Applicator login debug screenshot: ${pngPath}`);
    log(`Applicator login debug html: ${htmlPath}`);
    log(`Applicator login debug text: ${bodyText}`);
    throw new Error(`Applicator login failed (${authResult.kind}): ${authResult.message || 'unknown'}`);
  }
  log(`Applicator auth OK: ${page.url()}`);
}

function resolveExportPaths(company, jobTitle, packageDir) {
  const companyDir = sanitizeCompanyForPath(company || 'Unknown_Company');
  const vacancyDir = sanitizeVacancyForPath(jobTitle || 'Unknown Role');
  const outDir = path.join(APPLIED_BASE, companyDir, vacancyDir);
  return {
    outDir,
    pdfPath: path.join(outDir, 'Roman Matsukatov - CV.pdf'),
    coverLetterPath: path.join(outDir, 'Roman Matsukatov - Cover Letter.docx'),
    packagePdfPath: path.join(packageDir, 'Roman Matsukatov - CV.pdf'),
    packageCoverLetterPath: path.join(packageDir, 'Roman Matsukatov - Cover Letter.docx')
  };
}

function resumeIdFromUrl(resumeUrl) {
  const m = String(resumeUrl || '').match(/\/resume\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

async function isApplicatorLoginVisible(page) {
  if (page.url().includes('/login')) return true;
  return page
    .locator('[data-testid="login-page"], input[type="email"]')
    .first()
    .isVisible()
    .catch(() => false);
}

async function openApplicatorResumePage(page, resumeUrl, log) {
  const resumeId = resumeIdFromUrl(resumeUrl);
  await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(1200);
  if (await isApplicatorLoginVisible(page)) {
    await ensureApplicatorAuthenticated(page, log);
  }
  if (resumeId && !page.url().includes(`/resume/${resumeId}`)) {
    log(`export: navigate to resume (current ${page.url()})`);
    await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1200);
  }
  if (await isApplicatorLoginVisible(page)) {
    await ensureApplicatorAuthenticated(page, log);
    await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1200);
  }
  await page.waitForURL(/\/resume\/[0-9a-f-]{36}/i, { timeout: 30000 }).catch(() => {});
  if (await isApplicatorLoginVisible(page)) {
    throw new Error('Applicator still on login after auth; check APPLICATOR_EMAIL/APPLICATOR_PASSWORD');
  }
}

async function waitForResumeExportToolbar(page, log) {
  await page.getByText('Loading resume...').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await page
    .locator('.resume-template-tabs, button[title="Download as PDF"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  const pdfBtn = page.locator('button[title="Download as PDF"]').first();
  await pdfBtn.waitFor({ state: 'visible', timeout: 30000 });
  return pdfBtn;
}

async function exportApplicatorPdf(resumeUrl, pdfPath, log) {
  loadApplicatorEnv();
  const playwright = require('playwright');
  const { context, profileHandle } = await launchTealContext(playwright, {
    runKey: `applicator-export-${Date.now()}`,
    log
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    // Applicator hides export toolbar below 1200px (preview-only mode).
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApplicatorResumePage(page, resumeUrl, log);
    const downloadBtn = await waitForResumeExportToolbar(page, log).catch(async () => {
      log('export: toolbar wait failed, retry navigation');
      await openApplicatorResumePage(page, resumeUrl, log);
      return waitForResumeExportToolbar(page, log);
    });
    if ((await downloadBtn.count()) === 0) {
      const debugDir = path.join(
        process.env.VAULT_PATH || process.cwd(),
        '00-Inbox',
        'Job_Search',
        'teal',
        'full-flow-v2',
        'debug'
      );
      fs.mkdirSync(debugDir, { recursive: true });
      const stamp = Date.now();
      const pngPath = path.join(debugDir, `applicator-export-missing-button-${stamp}.png`);
      const htmlPath = path.join(debugDir, `applicator-export-missing-button-${stamp}.html`);
      await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
      const html = await page.content().catch(() => '');
      if (html) fs.writeFileSync(htmlPath, html, 'utf8');
      log(`export debug url: ${page.url()}`);
      log(`export debug screenshot: ${pngPath}`);
      log(`export debug html: ${htmlPath}`);
      throw new Error('Download PDF button not found in Applicator UI');
    }
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (_) {}
    }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      downloadBtn.click({ force: true, timeout: 12000 })
    ]);
    await download.saveAs(pdfPath);
    return pdfPath;
  } finally {
    try {
      await context.close();
    } catch (_) {}
    releaseTealProfile(profileHandle);
  }
}

function generateCoverLetterParagraphs(meta, feedback) {
  const targetTitle = (((feedback || {}).apply || {}).target_title || {}).value || meta.jobTitle || 'Product role';
  const summary = ((((feedback || {}).apply || {}).professional_summary || {}).text || '').trim();
  const firstSummarySentence = summary.split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  return [
    `Dear Hiring Team at ${meta.company || 'your company'},`,
    `I am applying for the ${meta.jobTitle || targetTitle} role. My background includes product leadership in complex domains, and I can bring structured execution, stakeholder alignment, and measurable delivery outcomes.`,
    firstSummarySentence ||
      'I focus on turning strategy into shipped product increments, with clear scope, transparent trade-offs, and disciplined cross-functional collaboration.',
    'I would welcome the opportunity to discuss how I can contribute to your product goals.',
    'Best regards,',
    'Roman Matsukatov'
  ];
}

function writeCoverLetterDocx(outPath, paragraphs) {
  const script = path.join(__dirname, '..', 'write_cover_docx.py');
  const result = spawnSync('python3', [script, outPath, '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify(paragraphs)
  });
  if (result.status !== 0) {
    throw new Error(`write_cover_docx.py failed (${result.status}): ${(result.stderr || '').trim()}`);
  }
  return outPath;
}

async function exportApplicatorPackage(params) {
  const { packageDir, resumeId, company, jobTitle, feedback, resumeUrl, log = () => {} } = params;
  ensureDirs();
  const paths = resolveExportPaths(company, jobTitle, packageDir);
  fs.mkdirSync(paths.outDir, { recursive: true });

  const finalResumeUrl = resumeUrl || applicatorResumeUrl(resumeId);
  const exportedPdf = await exportApplicatorPdf(finalResumeUrl, paths.pdfPath, log);
  fs.copyFileSync(exportedPdf, paths.packagePdfPath);

  const paragraphs = generateCoverLetterParagraphs({ company, jobTitle }, feedback);
  writeCoverLetterDocx(paths.coverLetterPath, paragraphs);
  fs.copyFileSync(paths.coverLetterPath, paths.packageCoverLetterPath);

  return {
    resumeUrl: finalResumeUrl,
    pdfPath: paths.pdfPath,
    packagePdfPath: paths.packagePdfPath,
    coverLetterPath: paths.coverLetterPath,
    packageCoverLetterPath: paths.packageCoverLetterPath
  };
}

module.exports = {
  exportApplicatorPackage,
  resolveExportPaths,
  generateCoverLetterParagraphs
};

