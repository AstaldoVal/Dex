'use strict';

const { applyResumeSectionsFromFeedback } = require('../../teal-resume-sections.cjs');
const { feedbackIsDataProductRole } = require('../../resume-feedback-utils.cjs');
const { sleep } = require('../../teal-target-title.cjs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, apply: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts, previewUrl } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        const sections = (feedback.apply || {}).resume_sections || [];
        if (!sections.length || feedbackIsDataProductRole(feedback)) return { ok: true, skipped: true };
        try {
          const sec = await applyResumeSectionsFromFeedback(page, feedback, log);
          applied.push(...(sec.applied || []));
          failed.push(...(sec.failed || []));
          if (previewUrl) {
            await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
            await sleep(2000);
          }
          return { ok: !(sec.failed || []).length };
        } catch (e) {
          failed.push({ section: 'resume_sections', message: e.message || String(e) });
          return { ok: false };
        }
      }
    }
  );
}

module.exports = { create };
