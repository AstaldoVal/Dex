'use strict';

const path = require('path');
const { TEAL_DIR } = require('./job-search-paths.cjs');
const { sleep } = require('./teal-target-title.cjs');
const {
  layoutWants,
  certAllowlistPathForLayout
} = require('./resume-feedback-layout.cjs');
const {
  syncCertificationsOnPreview,
  verifyCertificationsInPdf,
  loadDataPmAllowlist,
  loadAllowlist
} = require('./teal-sync-certifications.cjs');
const { trimProjectsForDataProduct } = require('./teal-projects-trim.cjs');
const { removeAllInterestsOnPreview } = require('./teal-resume-interests.cjs');
const { applyDataProductSkillsCategoryLayout } = require('./teal-resume-skills.cjs');

function loadCertAllowlistFromLayout(layoutCert) {
  const filePath = certAllowlistPathForLayout(layoutCert);
  if (filePath && require('fs').existsSync(filePath)) {
    return JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
  }
  if (layoutCert.profile === 'data_product') return loadDataPmAllowlist();
  return loadAllowlist();
}

/**
 * Apply feedback.apply.layout on Teal preview (after skills_add/remove from apply).
 */
async function applyLayoutFromFeedback(page, feedback, applied, failed, log = () => {}) {
  const layout = (feedback.apply && feedback.apply.layout) || {};
  if (!Object.keys(layout).length) {
    return { skipped: true, reason: 'no apply.layout' };
  }

  const out = { skills: false, certs: false, projects: false, interests: false };

  if (layout.skills_category_layout) {
    const prof = (layout.skills_category_layout.profile || '').toLowerCase();
    if (prof === 'data_product' || prof === 'data_pm') {
      try {
        await applyDataProductSkillsCategoryLayout(page, applied, log);
        out.skills = true;
      } catch (e) {
        failed.push({ section: 'skills_reorder', message: e.message || String(e) });
      }
    } else {
      log(`layout: skip skills_category_layout (profile=${layout.skills_category_layout.profile || 'n/a'})`);
    }
  }

  if (layout.projects && layout.projects.mode === 'data_product_trim') {
    try {
      const r = await trimProjectsForDataProduct(page, log);
      applied.push(`projects: trimmed (on resume=${r.onResume})`);
      if (!r.ok) failed.push({ section: 'projects', message: `too many on resume: ${r.onResume}` });
      out.projects = true;
    } catch (e) {
      failed.push({ section: 'projects', message: e.message || String(e) });
    }
  }

  if (layout.certifications) {
    const allowlist = loadCertAllowlistFromLayout(layout.certifications);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await syncCertificationsOnPreview(page, log, { allowlist });
        if (r.ok) {
          applied.push(
            `certifications: trimmed to allowlist (${(r.enabled || []).length} on resume)`
          );
          out.certs = true;
          break;
        }
        if (attempt === 2) failed.push({ section: 'certifications', message: 'trim verify failed' });
        await sleep(800);
      } catch (e) {
        if (attempt === 2) failed.push({ section: 'certifications', message: e.message || String(e) });
      }
    }
  }

  if (layout.interests && layout.interests.remove_all) {
    try {
      const r = await removeAllInterestsOnPreview(page, log);
      applied.push(...(r.applied || []));
      if (!r.ok) failed.push({ section: 'interests', message: 'interests still on resume' });
      out.interests = true;
    } catch (e) {
      failed.push({ section: 'interests', message: e.message || String(e) });
    }
  }

  return out;
}

function verifyLayoutFromEvidence(feedback, applyEvidence, failures, applied, opts = {}) {
  const layout = (feedback.apply && feedback.apply.layout) || {};
  const blob = ((applyEvidence && applyEvidence.applied) || []).join(' | ').toLowerCase();
  const failedApply = (applyEvidence && applyEvidence.failed) || [];

  if (layout.skills_category_layout) {
    if (
      /safe.*product management|technologies & tools after product management|data-pm:.*product management|data-pm: technologies & tools after/.test(
        blob
      )
    ) {
      applied.push('apply.layout: skills categories reordered');
    } else {
      failures.push('apply.layout: skills category reorder not in apply log');
    }
  }
  if (layout.projects) {
    const compact = blob.replace(/\s/g, '');
    if (
      /projects:trimmed.*onresume=3|projects:trimmedon=3|on=3kept=3/.test(compact)
    ) {
      applied.push('apply.layout: projects condensed');
    } else {
      failures.push('apply.layout: projects trim not at target count');
    }
  }
  if (layout.interests && layout.interests.remove_all) {
    if (/interests: all removed from resume/.test(blob)) {
      applied.push('apply.layout: interests cleared');
    } else {
      failures.push('apply.layout: interests still on resume');
    }
  }
  if (layout.certifications) {
    if (failedApply.some((f) => f.section === 'certifications')) {
      failures.push('apply.layout: certifications trim failed');
    } else if (/certifications: trimmed to allowlist/.test(blob)) {
      applied.push('apply.layout: certifications trimmed');
      if (opts.pdfPath && require('fs').existsSync(opts.pdfPath)) {
        const allowlist = loadCertAllowlistFromLayout(layout.certifications);
        const pdfCert = verifyCertificationsInPdf(opts.pdfPath, allowlist);
        if (pdfCert.ok) applied.push('apply.layout: PDF certifications OK');
        else failures.push('apply.layout: PDF missing certs: ' + pdfCert.missing.join('; '));
      }
    } else {
      failures.push('apply.layout: certifications sync not evidenced');
    }
  }
}

module.exports = {
  applyLayoutFromFeedback,
  verifyLayoutFromEvidence,
  layoutWants,
  loadCertAllowlistFromLayout
};
