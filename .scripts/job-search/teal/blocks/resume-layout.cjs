'use strict';

const { applyLayoutFromFeedback, layoutWants } = require('../../teal-apply-layout.cjs');
const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, apply: true, verify: true },
    {
      async apply(page, ctx) {
        const { feedback, applied, failed, log, opts } = ctx;
        if (opts?.skillsOnly) return { ok: true, skipped: true };
        if (!layoutWants(feedback, 'skills_category_layout') &&
            !layoutWants(feedback, 'certifications') &&
            !layoutWants(feedback, 'projects') &&
            !(feedback.apply && feedback.apply.layout && feedback.apply.layout.interests)) {
          return { ok: true, skipped: true };
        }
        await applyLayoutFromFeedback(page, feedback, applied, failed, log);
        return { ok: true };
      }
    }
  );
}

module.exports = { create };
