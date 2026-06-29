'use strict';

const {
  parseInterestsRemoveTargets,
  applyInterestsRemove,
  extractInterestsFromPage,
  removeAllInterestsOnPreview
} = require('../../teal-resume-interests.cjs');
const { buildSkillsPlanFromFeedback } = require('../../teal-resume-skills.cjs');
const { layoutWants } = require('../../teal-apply-layout.cjs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, ensureVisible: true, expand: true, apply: true, extract: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };

        if (feedback.apply && feedback.apply.layout && feedback.apply.layout.interests && feedback.apply.layout.interests.remove_all) {
          return { ok: true, skipped: true, reason: 'apply.layout.interests' };
        }

        if (opts?.skipSkills && !opts?.skillsOnly) return { ok: true, skipped: true };
        const skillsPlan = buildSkillsPlanFromFeedback(feedback);
        const interestTargets = [];
        for (const row of skillsPlan.remove || []) {
          if (row.type !== 'interest') continue;
          interestTargets.push(...parseInterestsRemoveTargets(row.match || row));
        }
        if (!interestTargets.length) return { ok: true, skipped: true };
        const intResult = await applyInterestsRemove(page, interestTargets, log);
        applied.push(...(intResult.applied || []));
        for (const f of intResult.failed || []) {
          failed.push({ section: 'interests', message: f.message || JSON.stringify(f) });
        }
        ctx.interestsExtract = await extractInterestsFromPage(page);
        return { ok: true, interestsExtract: ctx.interestsExtract };
      },
      async extract(page) {
        return extractInterestsFromPage(page);
      }
    }
  );
}

module.exports = { create };
