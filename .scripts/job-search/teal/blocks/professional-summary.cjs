'use strict';

const { sleep } = require('../../teal-target-title.cjs');
const { defineBlock } = require('./factory.cjs');
const {
  applyProfessionalSummaryWithSelfHeal,
  recordProfessionalSummaryHealMeta,
  inspectProfessionalSummaryPreview,
  MIN_PREVIEW_SUMMARY_CHARS
} = require('../../professional-summary-self-heal.cjs');
const { verifyProfessionalSummaryAgainstExpected } = require('../../professional-summary-verify.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, expand: true, apply: true, verify: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts, resumeId, previewUrl } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        const row = (feedback.apply || {}).professional_summary;
        if (!row || row.action !== 'replace' || !row.text) return { ok: true, skipped: true };

        const result = await applyProfessionalSummaryWithSelfHeal(page, resumeId, row.text, {
          log: (m) => log(m),
          feedback
        });
        recordProfessionalSummaryHealMeta(feedback, result);
        ctx.feedbackDirty = true;

        if (result.ok) {
          applied.push('professional_summary');
        } else {
          failed.push({
            section: 'professional_summary',
            message: result.reason || 'summary_paste_empty',
            heal_log: result.healLog || [],
            verify: result.verify || null
          });
        }

        if (previewUrl) {
          await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await sleep(2500);
        }
        return { ok: result.ok };
      },

      async heal(page, ctx) {
        const { feedback, applied, failed, log, resumeId } = ctx;
        const row = (feedback.apply || {}).professional_summary;
        if (!row || row.action !== 'replace' || !row.text) return { ok: false, skipped: true };

        let needsHeal = failed.some((f) => f.section === 'professional_summary');
        if (!needsHeal) {
          const st = await inspectProfessionalSummaryPreview(page);
          needsHeal =
            st.charCount < MIN_PREVIEW_SUMMARY_CHARS ||
            !verifyProfessionalSummaryAgainstExpected(row.text, st.text || '', 'preview').pass;
        }
        if (!needsHeal) return { ok: true, skipped: true };

        log('[block heal] preview.professionalSummary retry paste');
        const fi = failed.findIndex((f) => f.section === 'professional_summary');
        if (fi >= 0) failed.splice(fi, 1);

        const result = await applyProfessionalSummaryWithSelfHeal(page, resumeId, row.text, {
          log: (m) => log(m),
          feedback
        });
        recordProfessionalSummaryHealMeta(feedback, result);
        ctx.feedbackDirty = true;

        if (result.ok) {
          applied.push('heal: professional_summary');
          return { ok: true };
        }
        failed.push({
          section: 'professional_summary',
          message: result.reason || 'summary_paste_empty',
          heal_log: result.healLog || []
        });
        return { ok: false };
      }
    }
  );
}

module.exports = { create };
