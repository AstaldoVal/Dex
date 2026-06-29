'use strict';

/**
 * Step 10 — Target Title must appear on resume preview/PDF when job_title is known.
 * Fails with `target_title: missing or empty` when the dedicated title line is absent.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { normalizeJobTitleForTeal, stripCompanyFromTitle } = require('./teal-target-title.cjs');

const PREVIEW_EVIDENCE_FILENAME = 'teal-target-title-preview.json';

/**
 * @param {string} packageDir
 * @param {object} feedback
 * @returns {string|null}
 */
function resolveExpectedJobTitle(packageDir, feedback) {
  const meta = (feedback && feedback.meta) || {};
  const company = meta.company || '';
  const fromApplied =
    meta.target_title_applied && meta.target_title_applied.value
      ? String(meta.target_title_applied.value).trim()
      : '';
  if (fromApplied) {
    return normalizeJobTitleForTeal(stripCompanyFromTitle(fromApplied, company));
  }
  const fromMeta = String(meta.job_title || '').trim();
  if (fromMeta) {
    return normalizeJobTitleForTeal(stripCompanyFromTitle(fromMeta, company));
  }

  const ctxPath = path.join(packageDir, 'context.json');
  if (fs.existsSync(ctxPath)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      const fromCtx = String(ctx.jobTitle || ctx.job_title || '').trim();
      if (fromCtx) {
        return normalizeJobTitleForTeal(stripCompanyFromTitle(fromCtx, company || ctx.company || ''));
      }
    } catch (_) {}
  }

  const row = feedback && feedback.apply && feedback.apply.target_title;
  if (row && row.action !== 'skip') {
    const v = String(row.value || '').trim();
    if (v) return normalizeJobTitleForTeal(stripCompanyFromTitle(v, company));
  }

  return null;
}

/**
 * Dedicated Target Title line on PDF (under name), not a long summary paragraph.
 * @param {string} headerText — first ~15 lines of pdftotext
 * @param {string} expectedTitle
 */
function pdfHasDedicatedTargetTitleLine(headerText, expectedTitle) {
  const want = normalizeJobTitleForTeal(expectedTitle || '');
  if (!want) {
    return { ok: false, reason: 'target_title: missing or empty (no expected job title)' };
  }

  const lines = String(headerText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 14);

  const wantLower = want.toLowerCase();

  for (const line of lines) {
    if (line.length > 140) continue;
    if (/^(lisbon|kyiv|remote|phone|@|http|linkedin)/i.test(line)) continue;
    if (line.toLowerCase() === wantLower) {
      return { ok: true, matchedLine: line };
    }
    if (line.length <= want.length + 40 && line.toLowerCase().includes(wantLower)) {
      if (!/\bwith\b|\byears\b|\bexperience\b|\bincluding\b/i.test(line)) {
        return { ok: true, matchedLine: line };
      }
    }
  }

  return {
    ok: false,
    reason: `target_title: missing or empty (expected «${want}» as dedicated line on preview/PDF)`
  };
}

function readPdfHeaderText(pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return null;
  try {
    const text = execSync(`pdftotext "${pdfPath}" -`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    return text.split('\n').slice(0, 15).join('\n');
  } catch (_) {
    return null;
  }
}

function loadPreviewTitleEvidence(packageDir) {
  const p = path.join(packageDir, PREVIEW_EVIDENCE_FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {string} packageDir
 */
async function captureTargetTitlePreviewEvidence(page, packageDir) {
  const { getExistingTargetTitlesFromPage } = require('./teal-target-title.cjs');
  const data = await getExistingTargetTitlesFromPage(page);
  const enabled = Array.isArray(data.selectedTitles) ? data.selectedTitles.filter(Boolean) : [];
  const payload = {
    captured_at: new Date().toISOString(),
    enabled_titles: enabled,
    enabled_title: enabled[0] || null
  };
  fs.writeFileSync(
    path.join(packageDir, PREVIEW_EVIDENCE_FILENAME),
    JSON.stringify(payload, null, 2),
    'utf8'
  );
  return payload;
}

/**
 * @param {string} packageDir
 * @param {object} feedback
 * @param {{ pdfPath?: string|null, previewEvidence?: object|null }} input
 * @param {string[]} failures
 * @param {string[]} applied
 */
function verifyResumeTargetTitleRequired(packageDir, feedback, input, failures, applied) {
  const expected = resolveExpectedJobTitle(packageDir, feedback);
  if (!expected) {
    applied.push('target title check skipped (no job_title in meta/context)');
    return;
  }

  const preview =
    input.previewEvidence || loadPreviewTitleEvidence(packageDir);
  if (preview) {
    const enabled = String(preview.enabled_title || '').trim();
    if (!enabled) {
      failures.push(`target_title: missing or empty (Teal preview: no enabled Target Title; expected «${expected}»)`);
    } else {
      const normEnabled = normalizeJobTitleForTeal(enabled);
      if (normEnabled.toLowerCase() !== expected.toLowerCase() && !normEnabled.toLowerCase().includes(expected.toLowerCase())) {
        failures.push(
          `target_title: enabled «${normEnabled}» does not match expected «${expected}»`
        );
      } else {
        applied.push(`target title on preview: ${normEnabled}`);
      }
    }
  }

  const pdfPath = input.pdfPath;
  if (!pdfPath) {
    if (!preview) {
      failures.push('target_title: missing or empty (no PDF path and no preview evidence)');
    }
    return;
  }
  if (!fs.existsSync(pdfPath)) {
    failures.push('target_title: missing or empty (PDF not found for target title check)');
    return;
  }

  const header = readPdfHeaderText(pdfPath);
  if (!header) {
    failures.push('target_title: missing or empty (could not read PDF header)');
    return;
  }

  const pdfCheck = pdfHasDedicatedTargetTitleLine(header, expected);
  if (pdfCheck.ok) {
    applied.push(`target title on PDF: ${pdfCheck.matchedLine || expected}`);
  } else {
    failures.push(pdfCheck.reason || 'target_title: missing or empty');
  }
}

module.exports = {
  PREVIEW_EVIDENCE_FILENAME,
  resolveExpectedJobTitle,
  pdfHasDedicatedTargetTitleLine,
  readPdfHeaderText,
  loadPreviewTitleEvidence,
  captureTargetTitlePreviewEvidence,
  verifyResumeTargetTitleRequired
};
