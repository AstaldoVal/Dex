'use strict';

const fs = require('fs');
const path = require('path');
const { APPLIED_BASE } = require('./job-search-paths.cjs');

const CV_FILENAME = 'Roman Matsukatov - CV.pdf';

/** Legacy: spaces kept (older exports). */
function sanitizeDirNameLegacy(s) {
  return String(s || 'Unknown')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Same as teal-resume-match-score export folders. */
function sanitizeCompanyForPath(company) {
  if (!company || typeof company !== 'string') return 'Unknown_Company';
  return (
    company
      .trim()
      .replace(/[\s/\\:*?"<>|]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'Unknown_Company'
  );
}

function sanitizeVacancyForPath(title) {
  if (!title || typeof title !== 'string') return 'Unknown Role';
  return (
    title
      .trim()
      .replace(/[\u2014\u2013\u2212]/g, '-')
      .replace(/[\/\\:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120) || 'Unknown Role'
  );
}

/** Canonical path where full-flow step 10 MUST write the latest CV PDF. */
function resolveAppliedWritePath(company, title) {
  return path.join(APPLIED_BASE, sanitizeCompanyForPath(company), sanitizeVacancyForPath(title), CV_FILENAME);
}

/** Human-visible job PDF name (matches manual Teal exports in Applied folders). */
function resolveAppliedJobPdfPath(company, title) {
  const role = sanitizeVacancyForPath(title).replace(/\//g, '_');
  const co = sanitizeCompanyForPath(company).replace(/_/g, ' ');
  const base = role + ' \u2014 ' + co + '.pdf';
  return path.join(APPLIED_BASE, sanitizeCompanyForPath(company), sanitizeVacancyForPath(title), base);
}

function appliedPdfCandidates(company, title) {
  return [
    resolveAppliedWritePath(company, title),
    path.join(APPLIED_BASE, sanitizeDirNameLegacy(company), sanitizeDirNameLegacy(title), CV_FILENAME)
  ];
}

/** Find an existing Applied PDF (read-only). Prefer canonical path if present. */
function resolveAppliedPdf(company, title) {
  for (const p of appliedPdfCandidates(company, title)) {
    if (fs.existsSync(p)) return p;
  }
  return resolveAppliedWritePath(company, title);
}

/**
 * After Teal export: write canonical Applied PDF and mirror to cowork package.
 * @returns {{ appliedPdf: string, packagePdf: string, ok: boolean }}
 */
function syncExportedPdf(appliedPdf, packagePdf, log = () => {}) {
  if (!appliedPdf || !fs.existsSync(appliedPdf)) {
    return { appliedPdf, packagePdf, ok: false };
  }
  if (packagePdf && packagePdf !== appliedPdf) {
    fs.mkdirSync(path.dirname(packagePdf), { recursive: true });
    fs.copyFileSync(appliedPdf, packagePdf);
    log('pdf mirrored to package: ' + packagePdf);
  }
  return { appliedPdf, packagePdf, ok: true };
}

function formatPdfMtime(pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return 'missing';
  const st = fs.statSync(pdfPath);
  return new Date(st.mtimeMs).toISOString().replace('T', ' ').slice(0, 19);
}

/** Read company + job title from cowork package feedback.json or context.json. */
function resolveJobMetaFromPackage(packageDir) {
  if (!packageDir) return { company: '', jobTitle: '' };
  const feedbackPath = path.join(packageDir, 'feedback.json');
  if (fs.existsSync(feedbackPath)) {
    try {
      const fb = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      return {
        company: (fb.meta && fb.meta.company) || '',
        jobTitle: (fb.meta && fb.meta.job_title) || ''
      };
    } catch (_) {}
  }
  const ctxPath = path.join(packageDir, 'context.json');
  if (fs.existsSync(ctxPath)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      return {
        company: ctx.company || '',
        jobTitle: ctx.jobTitle || ctx.title || ''
      };
    } catch (_) {}
  }
  return { company: '', jobTitle: '' };
}

/**
 * Export preview PDF to canonical Applied path and mirror into cowork package.
 * Call after any Teal edit so ~/Documents/Applied always has the latest CV.
 */
async function exportAndMirrorAppliedPdf(page, opts = {}, log = () => {}) {
  const { exportResumePdfFromPreview } = require('./teal-export-resume-pdf.cjs');
  const meta = opts.packageDir ? resolveJobMetaFromPackage(opts.packageDir) : {};
  const company = opts.company || meta.company || 'Unknown';
  const jobTitle = opts.jobTitle || meta.jobTitle || 'Unknown Role';
  const appliedPdf = resolveAppliedWritePath(company, jobTitle);
  fs.mkdirSync(path.dirname(appliedPdf), { recursive: true });
  const exp = await exportResumePdfFromPreview(page, appliedPdf, { force: true, log });
  if (!exp.ok) {
    return { ok: false, appliedPdf, error: exp.error || 'export failed' };
  }
  const packagePdf = opts.packageDir ? path.join(opts.packageDir, CV_FILENAME) : null;
  syncExportedPdf(appliedPdf, packagePdf, log);
  const jobPdf = resolveAppliedJobPdfPath(company, jobTitle);
  if (jobPdf !== appliedPdf && fs.existsSync(appliedPdf)) {
    if (fs.existsSync(jobPdf)) {
      try {
        fs.unlinkSync(jobPdf);
      } catch (_) {}
    }
    fs.copyFileSync(appliedPdf, jobPdf);
    log('Applied job PDF updated: ' + jobPdf + ' (' + formatPdfMtime(jobPdf) + ')');
  }
  if (opts.packageDir) {
    const ctxPath = path.join(opts.packageDir, 'context.json');
    if (fs.existsSync(ctxPath)) {
      try {
        const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
        ctx.pdfPath = appliedPdf;
        ctx.appliedPdfUpdatedAt = new Date().toISOString();
        fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), 'utf8');
      } catch (_) {}
    }
  }
  log('Applied CV updated: ' + appliedPdf + ' (' + formatPdfMtime(appliedPdf) + ')');
  return { ok: true, appliedPdf, packagePdf };
}

function verifyAppliedPdfReady(company, title, log = () => {}) {
  const appliedPdf = resolveAppliedWritePath(company, title);
  if (!fs.existsSync(appliedPdf)) {
    return { ok: false, appliedPdf, error: 'Applied CV PDF missing: ' + appliedPdf };
  }
  const st = fs.statSync(appliedPdf);
  if (st.size < 1000) {
    return { ok: false, appliedPdf, error: 'Applied CV PDF too small (' + st.size + ' bytes)' };
  }
  log('Applied CV ready: ' + appliedPdf + ' (' + formatPdfMtime(appliedPdf) + ', ' + st.size + ' bytes)');
  return { ok: true, appliedPdf, mtime: st.mtimeMs, size: st.size };
}

module.exports = {
  CV_FILENAME,
  APPLIED_BASE,
  sanitizeCompanyForPath,
  sanitizeVacancyForPath,
  sanitizeDirNameLegacy,
  resolveAppliedWritePath,
  resolveAppliedJobPdfPath,
  resolveAppliedPdf,
  syncExportedPdf,
  resolveJobMetaFromPackage,
  exportAndMirrorAppliedPdf,
  verifyAppliedPdfReady,
  formatPdfMtime
};
